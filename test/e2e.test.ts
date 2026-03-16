import { spawn } from 'node:child_process'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const rootDir = path.resolve(__dirname, '..')

const NUXT_DEV_PORT = 30555
const VITE_DEV_PORT = 30556

async function fetchWithTimeout(url: string, ms: number): Promise<Response | null> {
  const c = new AbortController()
  const t = setTimeout(() => c.abort(), ms)
  try {
    const r = await fetch(url, { signal: c.signal })
    return r
  }
  catch {
    return null
  }
  finally {
    clearTimeout(t)
  }
}

async function waitForServer(
  url: string,
  timeout = 10_000,
  fallbackUrl?: string,
): Promise<string> {
  const start = Date.now()
  const urls = [url, ...(fallbackUrl ? [fallbackUrl] : [])]
  while (Date.now() - start < timeout) {
    for (const u of urls) {
      const r = await fetchWithTimeout(u, 2000)
      if (r?.ok)
        return u
    }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error(`Server did not become ready: ${url}`)
}

describe('e2e', () => {
  describe('nuxt 环境', () => {
    let proc: ReturnType<typeof spawn>
    let baseUrl: string

    beforeAll(async () => {
      const cwd = path.join(rootDir, 'playground/nuxt')
      proc = spawn('bun', ['run', 'dev'], {
        cwd,
        env: { ...process.env, PORT: String(NUXT_DEV_PORT), NUXT_PORT: String(NUXT_DEV_PORT) },
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      baseUrl = await waitForServer(`http://localhost:${NUXT_DEV_PORT}`, 10_000)
    }, 12_000)

    afterAll(() => proc.kill('SIGTERM'))

    it('首页有内容（含插件输出）', async () => {
      const res = await fetch(baseUrl)
      const html = await res.text()
      expect(res.ok).toBe(true)
      expect(html).toContain('Mini Nuxt')
      expect(html).toContain('插件输出')
    })
  })

  describe('vite 环境', () => {
    let proc: ReturnType<typeof spawn>

    beforeAll(async () => {
      proc = spawn('bun', ['x', 'vite', '--port', String(VITE_DEV_PORT)], {
        cwd: path.join(rootDir, 'playground/vite'),
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      await waitForServer(`http://localhost:${VITE_DEV_PORT}`)
    }, 12_000)

    afterAll(() => proc.kill('SIGTERM'))

    it('首页有内容（含 app 挂载点）', async () => {
      const res = await fetch(`http://localhost:${VITE_DEV_PORT}`)
      const html = await res.text()
      expect(res.ok).toBe(true)
      expect(html).toContain('id="app"')
      expect(html).toMatch(/<script[^>]*src=.*main\.ts/)
    })
  })
})
