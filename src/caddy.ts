/**
 * Caddy Admin API 与反向代理注册逻辑（供 Vite configureServer 使用）。
 */
import { spawn } from 'node:child_process'
import net from 'node:net'
import process from 'node:process'
import pc from 'picocolors'

const TRAILING_SLASH_REGEX = /\/+$/
const HTTP_4XX_REGEX = /4\d{2}/
const HTTP_500_REGEX = /500/

export const DEV_LOCK_POLL_MS = 200
export const DEV_LOCK_TIMEOUT_MS = 20000

export const CADDY_ADMIN = 'http://127.0.0.1:2019'

/** 允许 xxx.localhost 或 a.b.localhost 等形式 */
export const HOST_LOCALHOST_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.)+localhost$/

const VITE_443_SERVER_NAME = '_vite_443'

export async function caddyApi(
  baseUrl: string,
  apiPath: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: object,
): Promise<object | null> {
  const url = `${baseUrl}${apiPath}`
  const opt: RequestInit = {
    method,
    headers: { Origin: baseUrl },
  }
  if (body !== undefined) {
    ;(opt.headers as Record<string, string>)['Content-Type'] = 'application/json'
    opt.body = JSON.stringify(body)
  }
  const res = await fetch(url, opt)
  if (res.status === 204 || res.status === 200) {
    const text = await res.text()
    return text === '' ? null : JSON.parse(text) as object
  }
  const errText = await res.text()
  throw new Error(`Caddy API ${method} ${apiPath}: ${res.status} ${errText}`)
}

export async function isCaddyReachable(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(TRAILING_SLASH_REGEX, '')}/config/`
    const res = await fetch(url, { method: 'GET', headers: { Origin: baseUrl } })
    return res.status === 200
  }
  catch {
    return false
  }
}

export async function waitForCaddy(
  baseUrl: string,
  opts: { intervalMs?: number, maxAttempts?: number } = {},
): Promise<boolean> {
  const { intervalMs = 500, maxAttempts = 20 } = opts
  for (let i = 0; i < maxAttempts; i++) {
    if (await isCaddyReachable(baseUrl))
      return true
    await new Promise(r => setTimeout(r, intervalMs))
  }
  return false
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve: (value: boolean) => void): void => {
    const socket = new net.Socket()
    const onError = (): void => {
      socket.destroy()
      resolve(false)
    }
    socket.setTimeout(200)
    socket.once('error', onError)
    socket.once('timeout', onError)
    socket.connect(port, '127.0.0.1', () => {
      socket.destroy()
      resolve(true)
    })
  })
}

export async function startCaddyInBackground(ctx: { logger?: { warn: (msg: string) => void } } = {}): Promise<ReturnType<typeof spawn> | null> {
  if (await isPortInUse(443)) {
    ctx.logger?.warn(pc.yellow('  443 已被占用但 Caddy Admin API 不可达，可能已有 Caddy 在运行。请确保只运行一个 Caddy（pkill -x caddy 后重新 caddy run），否则会 502。'))
    return null
  }
  try {
    const child = spawn('caddy', ['run'], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    })
    child.unref()
    return child
  }
  catch {
    return null
  }
}

export async function ensureCaddyServer(caddyAdmin: string): Promise<string> {
  const config = (await caddyApi(caddyAdmin, '/config/')) as { apps?: { http?: { servers?: Record<string, { listen?: string[] }> } } } | null
  const servers = config?.apps?.http?.servers
  if (servers && typeof servers === 'object') {
    const name = Object.keys(servers).find(
      k => Array.isArray(servers[k].listen) && servers[k].listen!.includes(':443'),
    )
    if (name)
      return name
  }
  const newServer = { listen: [':443'], routes: [] }
  try {
    await caddyApi(caddyAdmin, `/config/apps/http/servers/${VITE_443_SERVER_NAME}`, 'PATCH', newServer)
    return VITE_443_SERVER_NAME
  }
  catch (err: unknown) {
    const msg = err instanceof Error ? err.message : ''
    if (HTTP_4XX_REGEX.test(msg)) {
      try {
        await caddyApi(caddyAdmin, '/config/apps', 'PATCH', {
          http: { servers: { [VITE_443_SERVER_NAME]: newServer } },
        })
        return VITE_443_SERVER_NAME
      }
      catch (err2: unknown) {
        const msg2 = err2 instanceof Error ? err2.message : ''
        if (HTTP_500_REGEX.test(msg2)) {
          await caddyApi(caddyAdmin, '/config/', 'PATCH', {
            apps: { http: { servers: { [VITE_443_SERVER_NAME]: newServer } } },
          })
          return VITE_443_SERVER_NAME
        }
        throw err2
      }
    }
    throw err
  }
}

export function toUpstreamDial(address: string, port: number): string {
  const host = (address === '::' || address === '0.0.0.0') ? '127.0.0.1' : address
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`
}

function routeMatchesHost(route: { match?: Array<{ host?: string[] }> }, host: string): boolean {
  const matches = route?.match
  if (!Array.isArray(matches))
    return false
  return matches.some(m => Array.isArray(m?.host) && m.host!.includes(host))
}

export async function setRouteForHost(
  caddyAdmin: string,
  serverName: string,
  host: string,
  dial: string,
): Promise<void> {
  const raw = await caddyApi(caddyAdmin, '/config/')
  const config = raw as Record<string, unknown> | null
  const servers = config?.apps as Record<string, unknown> | undefined
  const httpServers = servers?.http as Record<string, unknown> | undefined
  const serverMap = httpServers?.servers as Record<string, { routes?: unknown[], [k: string]: unknown }> | undefined
  const server = serverName ? serverMap?.[serverName] : undefined
  if (!server) {
    await appendRoute(caddyAdmin, serverName, host, dial)
    return
  }
  const routes = Array.isArray(server.routes) ? [...server.routes] : []
  const newRoutes = routes.filter((r: { match?: Array<{ host?: string[] }> }) => !routeMatchesHost(r, host))
  newRoutes.push({
    match: [{ host: [host] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial }],
      },
    ],
  })
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}`, 'PATCH', { ...server, routes: newRoutes })
}

async function appendRoute(caddyAdmin: string, serverName: string, host: string, dial: string): Promise<void> {
  const route = {
    match: [{ host: [host] }],
    handle: [
      { handler: 'reverse_proxy', upstreams: [{ dial }] },
    ],
  }
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}/routes`, 'POST', route)
}

export async function removeRouteForHost(caddyAdmin: string, serverName: string, host: string): Promise<void> {
  const raw = await caddyApi(caddyAdmin, '/config/')
  const config = raw as Record<string, unknown> | null
  const httpApps = (config?.apps as Record<string, unknown>)?.http as Record<string, Record<string, { routes?: unknown[], [k: string]: unknown }>> | undefined
  const server = serverName ? httpApps?.servers?.[serverName] : undefined
  if (!server || !Array.isArray(server.routes))
    return
  const newRoutes = server.routes.filter((r: { match?: Array<{ host?: string[] }> }) => !routeMatchesHost(r, host))
  if (newRoutes.length === server.routes.length)
    return
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}`, 'PATCH', { ...server, routes: newRoutes })
}

export function assertLocalhostHost(host: string): void {
  if (!host || typeof host !== 'string') {
    throw new Error(
      '[unplugin-caddy-localhost] options.host 必填，允许 xxx.localhost 形式，例如 "frontend.localhost"',
    )
  }
  if (!HOST_LOCALHOST_REGEX.test(host)) {
    throw new Error(
      `[unplugin-caddy-localhost] options.host 须为 xxx.localhost 形式（如 novel.localhost、admin.localhost），当前为 "${host}"。`,
    )
  }
}
