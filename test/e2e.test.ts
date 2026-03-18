import { spawn } from 'node:child_process';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test';

const rootDir = path.resolve(__dirname, '..');

const NUXT_DEV_PORT = 30555;
const VITE_DEV_PORT = 30556;

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    const r = await fetch(url, { signal: c.signal });
    return r;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function waitForServer(url: string, timeout = 10_000, fallbackUrl?: string): Promise<string> {
  const start = Date.now();
  const urls = [url, ...(fallbackUrl ? [fallbackUrl] : [])];
  while (Date.now() - start < timeout) {
    for (const u of urls) {
      const r = await fetchWithTimeout(u, 2000);
      if (r?.ok) return u;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

function spawnVp(args: string[], cwd: string) {
  return spawn('vp', args, {
    cwd,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

describe('e2e', () => {
  describe('nuxt 环境', () => {
    let proc: ReturnType<typeof spawn>;
    let baseUrl: string;

    beforeAll(async () => {
      const cwd = path.join(rootDir, 'playground/nuxt');
      proc = spawnVp(
        ['exec', 'nuxt', 'dev', '--host', '127.0.0.1', '--port', String(NUXT_DEV_PORT)],
        cwd,
      );
      baseUrl = await waitForServer(`http://127.0.0.1:${NUXT_DEV_PORT}`, 30_000);
    }, 35_000);

    afterAll(() => proc.kill('SIGTERM'));

    it('首页有内容（含插件输出）', async () => {
      const res = await fetch(baseUrl);
      const html = await res.text();
      expect(res.ok).toBe(true);
      expect(html).toContain('Mini Nuxt');
      expect(html).toContain('插件输出');
    });
  });

  describe('vite 环境', () => {
    let proc: ReturnType<typeof spawn>;

    beforeAll(async () => {
      proc = spawnVp(
        ['dev', '--host', '127.0.0.1', '--port', String(VITE_DEV_PORT)],
        path.join(rootDir, 'playground/vite'),
      );
      await waitForServer(`http://127.0.0.1:${VITE_DEV_PORT}`, 20_000);
    }, 25_000);

    afterAll(() => proc.kill('SIGTERM'));

    it('首页有内容（含 app 挂载点）', async () => {
      const res = await fetch(`http://127.0.0.1:${VITE_DEV_PORT}`);
      const html = await res.text();
      expect(res.ok).toBe(true);
      expect(html).toContain('id="app"');
      expect(html).toMatch(/<script[^>]*src=.*main\.ts/);
    });
  });
});
