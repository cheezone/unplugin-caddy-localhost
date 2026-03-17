import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import https from 'node:https'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import kill from 'tree-kill'

const rootDir = path.resolve(__dirname, '..')
const E2E_MAGIC = '8712'

async function fetchHttps(host: string, ms = 8000): Promise<{ statusCode: number, text: string }> {
  const opts: https.RequestOptions = {
    hostname: '127.0.0.1',
    port: 443,
    path: '/',
    method: 'GET',
    rejectUnauthorized: false,
    headers: { Host: host },
    servername: host,
  }
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms)
    const req = https.request(opts, (res) => {
      const chunks: Buffer[] = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => {
        clearTimeout(t)
        resolve({ statusCode: res.statusCode ?? 0, text: Buffer.concat(chunks).toString('utf8') })
      })
    })
    req.on('error', (e) => {
      clearTimeout(t)
      reject(e)
    })
    req.end()
  })
}

async function waitReady(host: string, timeout = 50_000, delay = 15_000): Promise<void> {
  await new Promise(r => setTimeout(r, delay))
  const end = Date.now() + timeout
  while (Date.now() < end) {
    try {
      const r = await fetchHttps(host, 6000)
      if (r.statusCode === 200 && r.text.includes(E2E_MAGIC))
        return
    }
    catch { /* noop */ }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error(`https://${host} 未在 ${timeout}ms 内返回 200 且含 "${E2E_MAGIC}"`)
}

describe('e2e', () => {
  const nuxtHost = `nuxt.${randomUUID()}.localhost`
  const viteHost = `vite.${randomUUID()}.localhost`
  let nuxtProc: ReturnType<typeof spawn>
  let viteProc: ReturnType<typeof spawn>

  beforeAll(async () => {
    nuxtProc = spawn('bun', ['run', 'dev'], {
      cwd: path.join(rootDir, 'playground/nuxt'),
      env: { ...process.env, CADDY_HOST: nuxtHost },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    viteProc = spawn('bun', ['x', 'vite'], {
      cwd: path.join(rootDir, 'playground/vite'),
      env: { ...process.env, CADDY_HOST: viteHost },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    await Promise.all([
      waitReady(nuxtHost, 55_000, 22_000),
      waitReady(viteHost, 55_000, 12_000),
    ])
  }, 70_000)

  afterAll(() => {
    nuxtProc.kill('SIGTERM')
    viteProc.kill('SIGTERM')
  })

  it('nuxt 域名反代到应用且内容含魔数', async () => {
    const { statusCode, text } = await fetchHttps(nuxtHost)
    expect(statusCode).toBe(200)
    expect(text).toContain(E2E_MAGIC)
  })

  it('vite 域名反代到应用且内容含魔数', async () => {
    const { statusCode, text } = await fetchHttps(viteHost)
    expect(statusCode).toBe(200)
    expect(text).toContain(E2E_MAGIC)
  })
})
