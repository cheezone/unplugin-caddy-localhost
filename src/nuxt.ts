import type { Nuxt } from '@nuxt/schema'
import type { Options } from './types'
import { defineNuxtModule } from '@nuxt/kit'
import {
  CADDY_ADMIN,
  DEV_LOCK_POLL_MS,
  DEV_LOCK_TIMEOUT_MS,
  assertLocalhostHost,
  dialFromConfigNoHttpServer,
  ensureCaddyServer,
  readDevLockPort,
  setRouteForHost,
  startCaddyInBackground,
  waitForCaddy,
} from './caddy'
import { NUXT_CONFIG_KEY, NUXT_MODULE_NAME } from './constants'

export interface ModuleOptions extends Options {}

interface DevServerShape {
  port?: number
  host?: string
  url?: string
}

interface LoggerShape {
  info: (msg: string) => void
  warn: (msg: string) => void
}

function getDevServerFromOptions(options: Nuxt['options']): DevServerShape | undefined {
  if (!options || typeof options !== 'object' || !('devServer' in options)) return undefined
  const d = (options as { devServer?: DevServerShape }).devServer
  return d
}

function getLoggerFromNuxt(nuxt: Nuxt): LoggerShape | undefined {
  if (typeof nuxt !== 'object' || nuxt === null || !('logger' in nuxt)) return undefined
  const l = (nuxt as Record<string, unknown>).logger
  if (!l || typeof l !== 'object') return undefined
  const lo = l as Record<string, unknown>
  if (typeof lo.info !== 'function' || typeof lo.warn !== 'function') return undefined
  return {
    info: (msg: string) => { (lo.info as (m: string) => void)(msg) },
    warn: (msg: string) => { (lo.warn as (m: string) => void)(msg) },
  }
}

/** 从 listen 的 listener 形参推导 upstream dial，无则返回 null */
function dialFromListenListener(listener: unknown): string | null {
  if (listener === null || typeof listener !== 'object') return null
  const l = listener as Record<string, unknown>

  const fromAddress = (): string | null => {
    const addr = l.address
    if (!addr || typeof addr !== 'object' || typeof (addr as { port?: unknown }).port !== 'number') return null
    const { port, address } = addr as { port: number; address?: string }
    if (port <= 0 || port > 65535) return null
    const host = address && address !== '::' && address !== '0.0.0.0' ? address : '127.0.0.1'
    const h = host.includes(':') ? `[${host}]` : host
    return `${h}:${port}`
  }

  const fromUrl = (): string | null => {
    const url = typeof l.url === 'string' ? l.url : Array.isArray(l.urls) && typeof l.urls[0] === 'string' ? l.urls[0] : undefined
    if (!url) return null
    try {
      const u = new URL(url.startsWith('http') ? url : `http://${url}`)
      const port = Number(u.port || '0')
      if (!port || port <= 0 || port > 65535) return null
      const host = u.hostname && u.hostname !== '::' && u.hostname !== '0.0.0.0' ? u.hostname : '127.0.0.1'
      const h = host.includes(':') ? `[${host}]` : host
      return `${h}:${port}`
    }
    catch {
      return null
    }
  }

  return fromAddress() ?? fromUrl()
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

    const caddyAdmin = (options.caddyAdmin ?? CADDY_ADMIN).replace(/\/+$/, '')

    const ensureCaddyReady = async (): Promise<boolean> => {
      if (await waitForCaddy(caddyAdmin)) return true
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
        logger?.warn('[unplugin-caddy-localhost] Caddy 未就绪，跳过 HTTPS 反代注册。')
        return
      }
      const serverName = await ensureCaddyServer(caddyAdmin)
      await setRouteForHost(caddyAdmin, serverName, options.host, dial)
      logger?.info(`[unplugin-caddy-localhost] 已将 https://${options.host} 反代到 ${dial}`)
    }

    const resolveDialFromNuxt = (): string | null => {
      const dev = getDevServerFromOptions(nuxt.options)
      if (dev?.port != null && dev.port > 0 && dev.port <= 65535) {
        const host = dev.host && dev.host !== '0.0.0.0' && dev.host !== '::' ? dev.host : '127.0.0.1'
        const h = host.includes(':') ? `[${host}]` : host
        return `${h}:${dev.port}`
      }
      const portFromLock = readDevLockPort(nuxt.options.rootDir)
      if (portFromLock != null) {
        const host = dev?.host && dev.host !== '0.0.0.0' && dev.host !== '::' ? dev.host : '127.0.0.1'
        const h = host.includes(':') ? `[${host}]` : host
        return `${h}:${portFromLock}`
      }
      try {
        return dialFromConfigNoHttpServer({
          server: {
            port: dev?.port,
            host: dev?.host,
          },
        })
      }
      catch {
        return null
      }
    }

    nuxt.hook('listen', (_server: unknown, listener: unknown) => {
      const dial = dialFromListenListener(listener) ?? resolveDialFromNuxt()
      if (!dial) {
        logger?.warn('[unplugin-caddy-localhost] 无法推导开发服务器地址，跳过 HTTPS 反代注册。')
        return
      }
      registerRoute(dial).catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err)
        logger?.warn(`[unplugin-caddy-localhost] 注册 https://${options.host} 失败: ${msg}`)
      })
    })
  },
})
