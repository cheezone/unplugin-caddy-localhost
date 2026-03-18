import { Buffer } from 'node:buffer';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import https from 'node:https';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(__dirname, '..');
const E2E_MAGIC = '8712';
const vpBin = process.platform === 'win32' ? 'vp.cmd' : 'vp';
const HTTPS_PORT = process.platform === 'win32' && process.env.CI ? 8443 : 443;

async function fetchHttps(host: string, ms = 8000): Promise<{ statusCode: number; text: string }> {
  const opts: https.RequestOptions = {
    hostname: '127.0.0.1',
    port: HTTPS_PORT,
    path: '/',
    method: 'GET',
    rejectUnauthorized: false,
    headers: { Host: host },
    servername: host,
  };
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        clearTimeout(t);
        resolve({ statusCode: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') });
      });
    });
    req.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
    req.end();
  });
}

async function waitReady(host: string, timeout = 50_000, delay = 15_000): Promise<void> {
  await new Promise((r) => setTimeout(r, delay));
  const end = Date.now() + timeout;
  let lastErr: Error | null = null;
  let lastRes: { statusCode: number; text: string } | null = null;
  while (Date.now() < end) {
    try {
      const r = await fetchHttps(host, 6000);
      lastRes = r;
      if (r.statusCode === 200 && r.text.includes(E2E_MAGIC)) return;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  const details: string[] = [];
  if (lastErr)
    details.push(`最近错误: ${(lastErr as NodeJS.ErrnoException).code ?? ''} ${lastErr.message}`);
  if (lastRes)
    details.push(
      `最近响应: status=${lastRes.statusCode} body前200字=${lastRes.text.slice(0, 200)}`,
    );
  throw new Error(
    `https://${host} 未在 ${timeout}ms 内返回 200 且含 "${E2E_MAGIC}"。${details.length ? ` ${details.join(' ')}` : ''}`,
  );
}

function spawnVp(args: string[], cwd: string, env?: NodeJS.ProcessEnv) {
  return spawn(vpBin, args, {
    cwd,
    env: env ?? process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Windows 上直接 spawn .cmd 偶发 EINVAL；走 shell 更稳
    shell: process.platform === 'win32',
  });
}

describe('e2e', () => {
  const nuxtHost = `nuxt.${randomUUID()}.localhost`;
  const viteHost = `vite.${randomUUID()}.localhost`;
  let nuxtProc: ReturnType<typeof spawn>;
  let viteProc: ReturnType<typeof spawn>;

  beforeAll(async () => {
    if (process.env.CI) {
      const dns = await import('node:dns').then((d) => d.promises);
      try {
        const nuxtIp = await dns.lookup(nuxtHost.split(':')[0]);
        const viteIp = await dns.lookup(viteHost.split(':')[0]);
        console.warn(
          '[e2e CI] .localhost 解析:',
          nuxtHost,
          '->',
          nuxtIp.address,
          ',',
          viteHost,
          '->',
          viteIp.address,
        );
      } catch (e) {
        console.warn('[e2e CI] .localhost 解析失败:', e);
      }
      console.warn(
        `[e2e CI] 请求使用 127.0.0.1:${HTTPS_PORT} + Host，不依赖 DNS；rejectUnauthorized=false`,
      );
    }

    nuxtProc = spawnVp(['exec', 'nuxt', 'dev'], path.join(rootDir, 'playground/nuxt'), {
      ...process.env,
      CADDY_HOST: nuxtHost,
    });

    viteProc = spawnVp(['dev'], path.join(rootDir, 'playground/vite'), {
      ...process.env,
      CADDY_HOST: viteHost,
    });

    const nuxtStderr: Buffer[] = [];
    const viteStderr: Buffer[] = [];
    nuxtProc.stderr?.on('data', (c: Buffer) => nuxtStderr.push(c));
    viteProc.stderr?.on('data', (c: Buffer) => viteStderr.push(c));

    try {
      await Promise.all([waitReady(nuxtHost, 55_000, 22_000), waitReady(viteHost, 55_000, 12_000)]);
    } catch (e) {
      if (process.env.CI && (nuxtStderr.length || viteStderr.length)) {
        console.error(
          '[e2e CI] Nuxt stderr:',
          Buffer.concat(nuxtStderr).toString('utf8').slice(-1500),
        );
        console.error(
          '[e2e CI] Vite stderr:',
          Buffer.concat(viteStderr).toString('utf8').slice(-1500),
        );
      }
      throw e;
    }
  }, 70_000);

  afterAll(() => {
    nuxtProc?.kill('SIGTERM');
    viteProc?.kill('SIGTERM');
  });

  it('nuxt 域名反代到应用且内容含魔数', async () => {
    const { statusCode, text } = await fetchHttps(nuxtHost);
    expect(statusCode).toBe(200);
    expect(text).toContain(E2E_MAGIC);
  });

  it('vite 域名反代到应用且内容含魔数', async () => {
    const { statusCode, text } = await fetchHttps(viteHost);
    expect(statusCode).toBe(200);
    expect(text).toContain(E2E_MAGIC);
  });
});
