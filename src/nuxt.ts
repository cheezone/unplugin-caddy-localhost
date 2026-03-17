import type { Nuxt } from '@nuxt/schema'
import type { Options } from './types'
import { defineNuxtModule } from '@nuxt/kit'
import {
  assertLocalhostHost,
  CADDY_ADMIN,
  DEV_LOCK_POLL_MS,
  DEV_LOCK_TIMEOUT_MS,
  ensureCaddyServer,
  setRouteForHost,
  startCaddyInBackground,
  waitForCaddy,
} from './caddy'
import { NUXT_CONFIG_KEY, NUXT_MODULE_NAME } from './constants'

const TRAILING_SLASH_REGEX = /\/+$/

export interface ModuleOptions extends Options {}

interface LoggerShape {
  info: (msg: string) => void
  warn: (msg: string) => void
}

function getLoggerFromNuxt(nuxt: Nuxt): LoggerShape | undefined {
  if (typeof nuxt !== 'object' || nuxt === null || !('logger' in nuxt))
    return undefined
  const l = (nuxt as Record<string, unknown>).logger
  if (!l || typeof l !== 'object')
    return undefined
  const lo = l as Record<string, unknown>
  if (typeof lo.info !== 'function' || typeof lo.warn !== 'function')
    return undefined
  return {
    info: (msg: string) => { (lo.info as (m: string) => void)(msg) },
    warn: (msg: string) => { (lo.warn as (m: string) => void)(msg) },
  }
}

/** 从 listen 的 listener 取 url，得到 host:port 作为 Caddy upstream dial */
function dialFromListenListener(listener: unknown): string | null {
  if (listener === null || typeof listener !== 'object')
    return null
  const l = listener as Record<string, unknown>
  const url = typeof l.url === 'string' ? l.url : Array.isArray(l.urls) && typeof l.urls[0] === 'string' ? l.urls[0] : undefined
  if (!url)
    return null
  try {
    const u = new URL(url.startsWith('http') ? url : `http://${url}`)
    const port = u.port ? Number(u.port) : (u.protocol === 'https:' ? 443 : 80)
    if (!port || port <= 0 || port > 65535)
      return null
    const host = u.hostname || '127.0.0.1'
    return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
  }
  catch {
    return null
  }
}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NUXT_MODULE_NAME,
    configKey: NUXT_CONFIG_KEY,
  },
  defaults: {
    autoStartCaddy: true,
  },
  setup(rawOptions, nuxt: Nuxt) {
    const logger = getLoggerFromNuxt(nuxt)
    const options: ModuleOptions = {
      autoStartCaddy: true,
      ...rawOptions,
    }

    assertLocalhostHost(options.host)
    const log = (msg: string): void => {
      if (logger)
        logger.info(msg)
    }
    const warn = (msg: string): void => {
      if (logger)
        logger.warn(msg)
      else
        console.warn(msg)
    }
    log(`[unplugin-caddy-localhost] 已加载，host=${options.host}`)

    const caddyAdmin = (options.caddyAdmin ?? CADDY_ADMIN).replace(TRAILING_SLASH_REGEX, '')

    const ensureCaddyReady = async (): Promise<boolean> => {
      if (await waitForCaddy(caddyAdmin))
        return true
      if (options.autoStartCaddy !== false) {
        await startCaddyInBackground({ logger })
        return waitForCaddy(caddyAdmin, {
          intervalMs: DEV_LOCK_POLL_MS,
          maxAttempts: Math.ceil(DEV_LOCK_TIMEOUT_MS / DEV_LOCK_POLL_MS),
        })
      }
      return false
    }

    const registerRoute = async (dial: string): Promise<void> => {
      const ok = await ensureCaddyReady()
      if (!ok) {
        warn('[unplugin-caddy-localhost] Caddy 未就绪，跳过 HTTPS 反代注册。')
        return
      }
      const serverName = await ensureCaddyServer(caddyAdmin)
      await setRouteForHost(caddyAdmin, serverName, options.host, dial)
      log(`[unplugin-caddy-localhost] 已将 https://${options.host} 反代到 ${dial}`)
    }

    let isRegistering = false
    nuxt.hook('listen', (first: unknown, second?: unknown) => {
      const listener = second ?? first
      const dial = dialFromListenListener(listener)
      if (!dial) {
        warn('[unplugin-caddy-localhost] 无法推导开发服务器地址，跳过 HTTPS 反代注册。')
        return
      }
      if (isRegistering) {
        return
      }
      isRegistering = true
      const run = (): void => {
        registerRoute(dial)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err)
            warn(`[unplugin-caddy-localhost] 注册 https://${options.host} 失败: ${msg}`)
          })
          .finally(() => {
            isRegistering = false
          })
      }
      if (typeof setImmediate !== 'undefined') {
        setImmediate(run)
      }
      else {
        setTimeout(run, 0)
      }
    })
  },
})
