/**
 * Unplugin：通过 Caddy Admin API (localhost:2019) 动态注册当前 dev server，
 * 使 https://<host>.localhost 反向代理到本机端口。
 */
import type { UnpluginFactory } from 'unplugin'
import type { Options } from './types'
import process from 'node:process'
import pc from 'picocolors'
import { createUnplugin } from 'unplugin'
import {
  assertLocalhostHost,
  CADDY_ADMIN,
  DEV_LOCK_POLL_MS,
  DEV_LOCK_TIMEOUT_MS,
  dialFromConfigNoHttpServer,
  ensureCaddyServer,
  isCaddyReachable,
  readDevLockPort,
  removeRouteForHost,
  setRouteForHost,
  startCaddyInBackground,
  toUpstreamDial,
  waitForCaddy,
} from './caddy'
import { PLUGIN_NAME } from './constants'

const unpluginFactory: UnpluginFactory<Options | undefined> = (options = {}, _meta) => {
  if (!options?.host) {
    throw new Error('[unplugin-caddy-localhost] options.host 必填，例如 "frontend.localhost"')
  }
  const { host, caddyAdmin: caddyAdminOption, autoStartCaddy = true } = options
  assertLocalhostHost(host)
  const caddyAdmin = caddyAdminOption ?? CADDY_ADMIN

  return {
    name: PLUGIN_NAME,
    vite: {
      apply: 'serve',
      configureServer(server): void {
        const httpServer = server.httpServer
        const logger = server.config.logger
        let registeredServerName: string | null = null
        let caddyCheckInterval: ReturnType<typeof setInterval> | null = null

        const cleanup = (): void => {
          if (caddyCheckInterval)
            clearInterval(caddyCheckInterval)
          if (registeredServerName) {
            removeRouteForHost(caddyAdmin, registeredServerName, host).catch((err: unknown) => {
              logger.warn(pc.yellow(`  关闭时移除 Caddy route 失败: ${err instanceof Error ? err.message : err}`))
            })
          }
        }

        const url = `https://${host}`
        const caddyLine = `  ${pc.green('➜')}  ${pc.bold('Caddy')}:   ${pc.cyan(url)}`
        const origPrintUrls = server.printUrls
        if (typeof origPrintUrls === 'function') {
          server.printUrls = () => {
            origPrintUrls.call(server)
            logger.info(caddyLine)
          }
        }

        const runRegistration = async (dial: string): Promise<void> => {
          if (!(await isCaddyReachable(caddyAdmin)) && autoStartCaddy) {
            await startCaddyInBackground({ logger })
            await waitForCaddy(caddyAdmin)
          }
          try {
            const serverName = await ensureCaddyServer(caddyAdmin)
            registeredServerName = serverName
            await setRouteForHost(caddyAdmin, serverName, host, dial)
            let caddyDownWarned = false
            caddyCheckInterval = setInterval(async () => {
              if (await isCaddyReachable(caddyAdmin)) {
                if (caddyDownWarned) {
                  try {
                    const sn = await ensureCaddyServer(caddyAdmin)
                    registeredServerName = sn
                    await setRouteForHost(caddyAdmin, sn, host, dial)
                    server.config.logger.info(pc.green(`  Caddy 已恢复，https://${host} 已重新注册`))
                  }
                  catch {
                    // ignore
                  }
                }
                caddyDownWarned = false
                return
              }
              if (!caddyDownWarned) {
                caddyDownWarned = true
                server.config.logger.warn(pc.yellow(`  Caddy 已停止，https://${host} 将不可用。请重新运行 caddy run。`))
              }
            }, 10000)
          }
          catch {
            logger.warn(pc.yellow('  Caddy 不可用，已跳过注册。可用 http://localhost:端口 访问'))
          }
        }

        if (!httpServer) {
          const root = server.config.root
          let settled = false
          const start = Date.now()
          const id = setInterval((): void => {
            if (settled)
              return
            const port = readDevLockPort(root)
            if (port) {
              settled = true
              clearInterval(id)
              const dial = toUpstreamDial('127.0.0.1', port)
              runRegistration(dial).catch(() => {})
              return
            }
            if (Date.now() - start >= DEV_LOCK_TIMEOUT_MS) {
              settled = true
              clearInterval(id)
              const dial = dialFromConfigNoHttpServer(server.config as Parameters<typeof dialFromConfigNoHttpServer>[0])
              if (server.config?.server?.middlewareMode) {
                logger.warn(pc.yellow(`  未读到 .dev/dev.lock.json，使用回退端口。请在 nuxt.config 的 modules 中加入 "unplugin-singleton/nuxt" 以写入锁文件。`))
              }
              runRegistration(dial).catch(() => {})
            }
          }, DEV_LOCK_POLL_MS)
          process.once('SIGINT', cleanup)
          process.once('SIGTERM', cleanup)
          process.on('exit', cleanup)
          return
        }

        const onListening = async (): Promise<void> => {
          const addr = httpServer.address()
          if (!addr || typeof addr !== 'object' || typeof addr.port !== 'number' || typeof (addr as { address?: string }).address !== 'string')
            return
          const dial = toUpstreamDial((addr as { address: string }).address, addr.port)
          await runRegistration(dial)
        }

        if (httpServer.listening) {
          onListening().catch(() => {})
        }
        else {
          httpServer.once('listening', () => onListening().catch(() => {}))
        }

        httpServer.once('close', () => {
          cleanup()
        })
      },
    },
  }
}

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory)
export default unplugin
export { unpluginFactory }
export { assertLocalhostHost, dialFromConfigNoHttpServer, readDevLockPort, toUpstreamDial } from './caddy'
export type { Options } from './types'
