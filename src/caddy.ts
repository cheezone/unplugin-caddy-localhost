/**
 * Caddy Admin API 与反向代理注册逻辑（供 Vite configureServer 使用）。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';
import pc from 'picocolors';

const TRAILING_SLASH_REGEX = /\/+$/;
const HTTP_4XX_REGEX = /4\d{2}/;
const HTTP_500_REGEX = /500/;

export const CADDY_READY_POLL_MS = 200;
export const CADDY_READY_TIMEOUT_MS = 20000;

export const CADDY_ADMIN = 'http://127.0.0.1:2019';

/** 允许 xxx.localhost 或 a.b.localhost 等形式 */
export const HOST_LOCALHOST_REGEX = /^([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?\.)+localhost$/;

function normalizeProjectNameToHost(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/\//g, '-')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^\.+|\.+$/g, '')
    .replace(/^-+|-+$/g, '');
}

export function resolveDefaultHostFromProject(rootDir: string): `${string}.localhost` {
  const pkgPath = path.join(rootDir, 'package.json');
  let name = '';
  try {
    const raw = fs.readFileSync(pkgPath, 'utf8');
    const parsed = JSON.parse(raw) as { name?: string };
    if (typeof parsed.name === 'string') name = parsed.name;
  } catch {
    // ignore and fallback to error below
  }
  const normalized = normalizeProjectNameToHost(name);
  const host = `${normalized}.localhost`;
  if (normalized && HOST_LOCALHOST_REGEX.test(host)) return host;
  throw new Error(
    '[unplugin-caddy-localhost] 未传 options.host，且无法从 package.json 的 name 推导默认域名，请显式设置 host。',
  );
}

function desiredHttpsPort(): number {
  // Windows CI 不能保证具备绑定 443 的管理员权限；改用非特权端口跑 e2e
  return process.platform === 'win32' && process.env.CI ? 8443 : 443;
}

function desiredHttpPort(): number {
  // Windows CI 上绑定 :80 可能被拒绝（无管理员权限）
  return process.platform === 'win32' && process.env.CI ? 8080 : 80;
}

function httpsServerName(port: number): string {
  return port === 443 ? '_vite_443' : `_vite_${port}`;
}

export async function caddyApi(
  baseUrl: string,
  apiPath: string,
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
  body?: object,
): Promise<object | null> {
  const url = `${baseUrl}${apiPath}`;
  const opt: RequestInit = {
    method,
    headers: { Origin: baseUrl },
  };
  if (body !== undefined) {
    (opt.headers as Record<string, string>)['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(url, opt);
  if (res.status === 204 || res.status === 200) {
    const text = await res.text();
    return text === '' ? null : (JSON.parse(text) as object);
  }
  const errText = await res.text();
  throw new Error(`Caddy API ${method} ${apiPath}: ${res.status} ${errText}`);
}

export async function isCaddyReachable(baseUrl: string): Promise<boolean> {
  try {
    const url = `${baseUrl.replace(TRAILING_SLASH_REGEX, '')}/config/`;
    const res = await fetch(url, { method: 'GET', headers: { Origin: baseUrl } });
    return res.status === 200;
  } catch {
    return false;
  }
}

export async function waitForCaddy(
  baseUrl: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<boolean> {
  const { intervalMs = 500, maxAttempts = 20 } = opts;
  for (let i = 0; i < maxAttempts; i++) {
    if (await isCaddyReachable(baseUrl)) return true;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

function isPortInUse(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve: (value: boolean) => void): void => {
    const socket = new net.Socket();
    const onError = (): void => {
      socket.destroy();
      resolve(false);
    };
    socket.setTimeout(200);
    socket.once('error', onError);
    socket.once('timeout', onError);
    socket.connect(port, '127.0.0.1', () => {
      socket.destroy();
      resolve(true);
    });
  });
}

/** 仅监听一个 https 端口（默认 443），避免在 Windows 等环境绑定 :80 被拒绝（需管理员） */
function minimalCaddyConfig(httpsPort: number) {
  const httpPort = desiredHttpPort();
  const serverName = httpsServerName(httpsPort);
  return {
    admin: { listen: 'tcp/localhost:2019' },
    apps: {
      http: {
        http_port: httpPort,
        https_port: httpsPort,
        servers: {
          [serverName]: { listen: [`:${httpsPort}`], routes: [] },
        },
      },
    },
  };
}

export async function startCaddyInBackground(
  ctx: { logger?: { warn: (msg: string) => void } } = {},
): Promise<ReturnType<typeof spawn> | null> {
  const httpsPort = desiredHttpsPort();
  if (await isPortInUse(httpsPort)) {
    ctx.logger?.warn(
      pc.yellow(
        `  ${httpsPort} 已被占用但 Caddy Admin API 不可达，可能已有 Caddy 在运行。请确保只运行一个 Caddy（pkill -x caddy 后重新 caddy run），否则会 502。`,
      ),
    );
    return null;
  }
  try {
    const configPath = path.join(os.tmpdir(), 'caddy-unplugin-localhost.json');
    fs.writeFileSync(configPath, JSON.stringify(minimalCaddyConfig(httpsPort)), 'utf8');
    const child = spawn('caddy', ['run', '--config', configPath], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();
    return child;
  } catch {
    return null;
  }
}

export async function ensureCaddyServer(caddyAdmin: string): Promise<string> {
  const httpsPort = desiredHttpsPort();
  const desiredListen = `:${httpsPort}`;
  const serverName = httpsServerName(httpsPort);
  const config = (await caddyApi(caddyAdmin, '/config/')) as {
    apps?: { http?: { servers?: Record<string, { listen?: string[] }> } };
  } | null;
  const servers = config?.apps?.http?.servers;
  if (servers && typeof servers === 'object') {
    const name = Object.keys(servers).find(
      (k) => Array.isArray(servers[k].listen) && servers[k].listen!.includes(desiredListen),
    );
    if (name) return name;
  }
  const newServer = { listen: [desiredListen], routes: [] };
  try {
    await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}`, 'PATCH', newServer);
    return serverName;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '';
    if (HTTP_4XX_REGEX.test(msg)) {
      try {
        await caddyApi(caddyAdmin, '/config/apps', 'PATCH', {
          http: { servers: { [serverName]: newServer } },
        });
        return serverName;
      } catch (err2: unknown) {
        const msg2 = err2 instanceof Error ? err2.message : '';
        if (HTTP_500_REGEX.test(msg2)) {
          await caddyApi(caddyAdmin, '/config/', 'PATCH', {
            apps: { http: { servers: { [serverName]: newServer } } },
          });
          return serverName;
        }
        throw err2;
      }
    }
    throw err;
  }
}

export function toUpstreamDial(address: string, port: number): string {
  const host = address === '::' || address === '0.0.0.0' ? '127.0.0.1' : address;
  return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
}

function routeMatchesHost(route: { match?: Array<{ host?: string[] }> }, host: string): boolean {
  const matches = route?.match;
  if (!Array.isArray(matches)) return false;
  return matches.some((m) => Array.isArray(m?.host) && m.host!.includes(host));
}

type CaddyRouteLike = { match?: Array<{ host?: string[] }>; [k: string]: unknown };

export async function setRouteForHost(
  caddyAdmin: string,
  serverName: string,
  host: string,
  dial: string,
): Promise<void> {
  const raw = await caddyApi(caddyAdmin, '/config/');
  const config = raw as Record<string, unknown> | null;
  const servers = config?.apps as Record<string, unknown> | undefined;
  const httpServers = servers?.http as Record<string, unknown> | undefined;
  const serverMap = httpServers?.servers as
    | Record<string, { routes?: unknown[]; [k: string]: unknown }>
    | undefined;
  const server = serverName ? serverMap?.[serverName] : undefined;
  if (!server) {
    await appendRoute(caddyAdmin, serverName, host, dial);
    return;
  }
  const routes: CaddyRouteLike[] = Array.isArray(server.routes)
    ? (server.routes as CaddyRouteLike[])
    : [];
  const newRoutes = routes.filter((r) => !routeMatchesHost(r, host));
  newRoutes.push({
    match: [{ host: [host] }],
    handle: [
      {
        handler: 'reverse_proxy',
        upstreams: [{ dial }],
      },
    ],
  });
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}`, 'PATCH', {
    ...server,
    routes: newRoutes,
  });
}

async function appendRoute(
  caddyAdmin: string,
  serverName: string,
  host: string,
  dial: string,
): Promise<void> {
  const route = {
    match: [{ host: [host] }],
    handle: [{ handler: 'reverse_proxy', upstreams: [{ dial }] }],
  };
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}/routes`, 'POST', route);
}

export async function removeRouteForHost(
  caddyAdmin: string,
  serverName: string,
  host: string,
): Promise<void> {
  const raw = await caddyApi(caddyAdmin, '/config/');
  const config = raw as Record<string, unknown> | null;
  const httpApps = (config?.apps as Record<string, unknown>)?.http as
    | Record<string, Record<string, { routes?: unknown[]; [k: string]: unknown }>>
    | undefined;
  const server = serverName ? httpApps?.servers?.[serverName] : undefined;
  if (!server || !Array.isArray(server.routes)) return;
  const newRoutes = (server.routes as CaddyRouteLike[]).filter((r) => !routeMatchesHost(r, host));
  if (newRoutes.length === server.routes.length) return;
  await caddyApi(caddyAdmin, `/config/apps/http/servers/${serverName}`, 'PATCH', {
    ...server,
    routes: newRoutes,
  });
}

export function assertLocalhostHost(host: string): void {
  if (!host || typeof host !== 'string') {
    throw new Error(
      '[unplugin-caddy-localhost] options.host 为空或无效，允许 xxx.localhost 形式，例如 "frontend.localhost"',
    );
  }
  if (!HOST_LOCALHOST_REGEX.test(host)) {
    throw new Error(
      `[unplugin-caddy-localhost] options.host 须为 xxx.localhost 形式（如 novel.localhost、admin.localhost），当前为 "${host}"。`,
    );
  }
}
