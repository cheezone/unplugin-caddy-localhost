import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'
import { afterEach, describe, expect, it } from 'vitest'
import {
  assertLocalhostHost,
  toUpstreamDial,
  readDevLockPort,
  dialFromConfigNoHttpServer,
  HOST_LOCALHOST_REGEX,
} from '../src/caddy'

describe('assertLocalhostHost', () => {
  it('空字符串抛错', () => {
    expect(() => assertLocalhostHost('')).toThrow(/options\.host 必填/)
  })

  it('非 xxx.localhost 形式抛错', () => {
    expect(() => assertLocalhostHost('localhost')).toThrow(/须为 xxx\.localhost 形式/)
    expect(() => assertLocalhostHost('example.com')).toThrow(/须为 xxx\.localhost 形式/)
    expect(() => assertLocalhostHost('frontend')).toThrow(/须为 xxx\.localhost 形式/)
  })

  it('合法 host 不抛错', () => {
    expect(() => assertLocalhostHost('frontend.localhost')).not.toThrow()
    expect(() => assertLocalhostHost('novel.localhost')).not.toThrow()
    expect(() => assertLocalhostHost('a.b.localhost')).not.toThrow()
  })
})

describe('HOST_LOCALHOST_REGEX', () => {
  it('匹配合法 host', () => {
    expect(HOST_LOCALHOST_REGEX.test('frontend.localhost')).toBe(true)
    expect(HOST_LOCALHOST_REGEX.test('a.b.localhost')).toBe(true)
    expect(HOST_LOCALHOST_REGEX.test('my-app.localhost')).toBe(true)
  })

  it('不匹配非法 host', () => {
    expect(HOST_LOCALHOST_REGEX.test('localhost')).toBe(false)
    expect(HOST_LOCALHOST_REGEX.test('.localhost')).toBe(false)
    expect(HOST_LOCALHOST_REGEX.test('foo.bar')).toBe(false)
  })
})

describe('toUpstreamDial', () => {
  it('IPv4 返回 host:port', () => {
    expect(toUpstreamDial('127.0.0.1', 5173)).toBe('127.0.0.1:5173')
  })

  it('0.0.0.0 转为 127.0.0.1', () => {
    expect(toUpstreamDial('0.0.0.0', 3000)).toBe('127.0.0.1:3000')
  })

  it(':: 转为 127.0.0.1', () => {
    expect(toUpstreamDial('::', 3000)).toBe('127.0.0.1:3000')
  })

  it('IPv6 加方括号', () => {
    expect(toUpstreamDial('::1', 5173)).toBe('[::1]:5173')
  })
})

describe('readDevLockPort', () => {
  const root = path.join(os.tmpdir(), `caddy-test-${Date.now()}`)
  const devDir = path.join(root, '.dev')
  const devLockPath = path.join(devDir, 'dev.lock.json')

  afterEach(() => {
    try { fs.rmSync(root, { recursive: true }) } catch { /* ignore */ }
  })

  it('文件不存在返回 null', () => {
    expect(readDevLockPort(root)).toBeNull()
  })

  it('有效锁文件返回端口号', () => {
    fs.mkdirSync(devDir, { recursive: true })
    fs.writeFileSync(devLockPath, JSON.stringify({ pid: 1, port: 3200, baseUrl: 'http://localhost:3200' }), 'utf8')
    expect(readDevLockPort(root)).toBe(3200)
  })

  it('无效 port 返回 null', () => {
    fs.mkdirSync(devDir, { recursive: true })
    fs.writeFileSync(devLockPath, JSON.stringify({ pid: 1, port: 0, baseUrl: 'http://localhost:0' }), 'utf8')
    expect(readDevLockPort(root)).toBeNull()
    fs.writeFileSync(devLockPath, JSON.stringify({ pid: 1, port: 99999, baseUrl: 'http://localhost:99999' }), 'utf8')
    expect(readDevLockPort(root)).toBeNull()
  })
})

describe('dialFromConfigNoHttpServer', () => {
  it('无 config 用 3000', () => {
    const prev = process.env.PORT
    delete process.env.PORT
    try {
      expect(dialFromConfigNoHttpServer({})).toBe('127.0.0.1:3000')
    }
    finally {
      if (prev !== undefined) process.env.PORT = prev
    }
  })

  it('config.server.port 生效', () => {
    expect(dialFromConfigNoHttpServer({ server: { port: 5173 } })).toBe('127.0.0.1:5173')
  })

  it('PORT 环境变量优先', () => {
    const prev = process.env.PORT
    process.env.PORT = '4000'
    try {
      expect(dialFromConfigNoHttpServer({ server: { port: 5173 } })).toBe('127.0.0.1:4000')
    }
    finally {
      if (prev !== undefined) process.env.PORT = prev
      else delete process.env.PORT
    }
  })

  it('middlewareMode 无 port 用 3000', () => {
    expect(dialFromConfigNoHttpServer({ server: { middlewareMode: true } })).toBe('127.0.0.1:3000')
  })
})

const mockMeta = { framework: 'vite' as const }

describe('unpluginFactory', () => {
  it('无 options.host 时抛错', async () => {
    const { unpluginFactory } = await import('../src/index')
    expect(() => unpluginFactory(undefined, mockMeta)).toThrow(/options\.host 必填/)
    expect(() => unpluginFactory({} as import('../src/types').Options, mockMeta)).toThrow(/options\.host 必填/)
  })

  it('有 host 时返回带 name 和 vite 的插件', async () => {
    const { unpluginFactory } = await import('../src/index')
    const out = unpluginFactory({ host: 'frontend.localhost' }, mockMeta) as { name: string; vite?: { apply: string; configureServer: () => void } }
    expect(out.name).toBe('unplugin-caddy-localhost')
    expect(out.vite).toBeDefined()
    expect(out.vite?.apply).toBe('serve')
    expect(typeof out.vite?.configureServer).toBe('function')
  })
})
