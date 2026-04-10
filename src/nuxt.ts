import type { Nuxt } from '@nuxt/schema';
import type { Options } from './types';
import { defineNuxtModule } from '@nuxt/kit';
import pc from 'picocolors';
import {
  assertLocalhostHost,
  CADDY_ADMIN,
  CADDY_READY_POLL_MS,
  CADDY_READY_TIMEOUT_MS,
  ensureCaddyServer,
  resolveDefaultHostFromProject,
  setRouteForHost,
  startCaddyInBackground,
  waitForCaddy,
} from './caddy';
import { NUXT_CONFIG_KEY, NUXT_MODULE_NAME } from './constants';

const TRAILING_SLASH_REGEX = /\/+$/;

export interface ModuleOptions extends Options {}

interface LoggerShape {
  info: (msg: string) => void;
  warn: (msg: string) => void;
}

function getLoggerFromNuxt(nuxt: Nuxt): LoggerShape | undefined {
  if (typeof nuxt !== 'object' || nuxt === null || !('logger' in nuxt)) return undefined;
  const l = (nuxt as Record<string, unknown>).logger;
  if (!l || typeof l !== 'object') return undefined;
  const lo = l as Record<string, unknown>;
  if (typeof lo.info !== 'function' || typeof lo.warn !== 'function') return undefined;
  return {
    info: (msg: string) => {
      (lo.info as (m: string) => void)(msg);
    },
    warn: (msg: string) => {
      (lo.warn as (m: string) => void)(msg);
    },
  };
}

function logInfo(logger: LoggerShape | undefined, msg: string): void {
  if (logger) {
    logger.info(msg);
    return;
  }
  console.info(msg);
}

function logWarn(logger: LoggerShape | undefined, msg: string): void {
  if (logger) {
    logger.warn(msg);
    return;
  }
  console.warn(msg);
}

/** 从 listen 的 listener 取 url，得到 host:port 作为 Caddy upstream dial */
function dialFromListenListener(listener: unknown): string | null {
  if (listener === null || typeof listener !== 'object') return null;
  const l = listener as Record<string, unknown>;
  const url =
    typeof l.url === 'string'
      ? l.url
      : Array.isArray(l.urls) && typeof l.urls[0] === 'string'
        ? l.urls[0]
        : undefined;
  if (!url) return null;
  try {
    const u = new URL(url.startsWith('http') ? url : `http://${url}`);
    const port = u.port ? Number(u.port) : u.protocol === 'https:' ? 443 : 80;
    if (!port || port <= 0 || port > 65535) return null;
    const host = u.hostname || 'localhost';
    return host.includes(':') ? `[${host}]:${port}` : `${host}:${port}`;
  } catch {
    return null;
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
    const rootDir = nuxt.options.rootDir;
    const logger = getLoggerFromNuxt(nuxt);
    const options: ModuleOptions = {
      autoStartCaddy: true,
      ...rawOptions,
    };
    const host = options.host ?? resolveDefaultHostFromProject(rootDir);
    assertLocalhostHost(host);
    const log = (msg: string): void => logInfo(logger, msg);
    const warn = (msg: string): void => logWarn(logger, msg);
    const caddyUrl = `https://${host}`;
    const caddyLine = `  ${pc.green('➜')}  ${pc.bold('Caddy')}:   ${pc.cyan(caddyUrl)}`;

    const caddyAdmin = (options.caddyAdmin ?? CADDY_ADMIN).replace(TRAILING_SLASH_REGEX, '');

    const ensureCaddyReady = async (): Promise<boolean> => {
      if (await waitForCaddy(caddyAdmin)) return true;
      if (options.autoStartCaddy !== false) {
        await startCaddyInBackground({ logger });
        return waitForCaddy(caddyAdmin, {
          intervalMs: CADDY_READY_POLL_MS,
          maxAttempts: Math.ceil(CADDY_READY_TIMEOUT_MS / CADDY_READY_POLL_MS),
        });
      }
      return false;
    };

    const registerRoute = async (dial: string): Promise<void> => {
      const ok = await ensureCaddyReady();
      if (!ok) {
        warn('[unplugin-caddy-localhost] Caddy 未就绪，跳过 HTTPS 反代注册。');
        return;
      }
      const serverName = await ensureCaddyServer(caddyAdmin);
      await setRouteForHost(caddyAdmin, serverName, host, dial);
    };

    let isRegistering = false;
    let caddyLinePrinted = false;
    nuxt.hook('listen', (first: unknown, second?: unknown) => {
      const listener = second ?? first;
      const dial = dialFromListenListener(listener);
      if (!dial) {
        warn('[unplugin-caddy-localhost] 无法推导开发服务器地址，跳过 HTTPS 反代注册。');
        return;
      }
      if (isRegistering) {
        return;
      }
      if (!caddyLinePrinted) {
        caddyLinePrinted = true;
        log(caddyLine);
      }
      isRegistering = true;
      const run = (): void => {
        registerRoute(dial)
          .catch((err: unknown) => {
            const msg = err instanceof Error ? err.message : String(err);
            warn(`[unplugin-caddy-localhost] 注册 https://${host} 失败: ${msg}`);
          })
          .finally(() => {
            isRegistering = false;
          });
      };
      if (typeof setImmediate !== 'undefined') {
        setImmediate(run);
      } else {
        setTimeout(run, 0);
      }
    });
  },
});
