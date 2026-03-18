import { describe, expect, it } from 'vitest';
import { assertLocalhostHost, HOST_LOCALHOST_REGEX, toUpstreamDial } from '../src/caddy';

describe('assertLocalhostHost', () => {
  it('空字符串抛错', () => {
    expect(() => assertLocalhostHost('')).toThrow(/options\.host 必填/);
  });

  it('非 xxx.localhost 形式抛错', () => {
    expect(() => assertLocalhostHost('localhost')).toThrow(/须为 xxx\.localhost 形式/);
    expect(() => assertLocalhostHost('example.com')).toThrow(/须为 xxx\.localhost 形式/);
    expect(() => assertLocalhostHost('frontend')).toThrow(/须为 xxx\.localhost 形式/);
  });

  it('合法 host 不抛错', () => {
    expect(() => assertLocalhostHost('frontend.localhost')).not.toThrow();
    expect(() => assertLocalhostHost('novel.localhost')).not.toThrow();
    expect(() => assertLocalhostHost('a.b.localhost')).not.toThrow();
  });
});

describe('hOST_LOCALHOST_REGEX', () => {
  it('匹配合法 host', () => {
    expect(HOST_LOCALHOST_REGEX.test('frontend.localhost')).toBe(true);
    expect(HOST_LOCALHOST_REGEX.test('a.b.localhost')).toBe(true);
    expect(HOST_LOCALHOST_REGEX.test('my-app.localhost')).toBe(true);
  });

  it('不匹配非法 host', () => {
    expect(HOST_LOCALHOST_REGEX.test('localhost')).toBe(false);
    expect(HOST_LOCALHOST_REGEX.test('.localhost')).toBe(false);
    expect(HOST_LOCALHOST_REGEX.test('foo.bar')).toBe(false);
  });
});

describe('toUpstreamDial', () => {
  it('iPv4 返回 host:port', () => {
    expect(toUpstreamDial('127.0.0.1', 5173)).toBe('127.0.0.1:5173');
  });

  it('0.0.0.0 转为 127.0.0.1', () => {
    expect(toUpstreamDial('0.0.0.0', 3000)).toBe('127.0.0.1:3000');
  });

  it(':: 转为 127.0.0.1', () => {
    expect(toUpstreamDial('::', 3000)).toBe('127.0.0.1:3000');
  });

  it('iPv6 加方括号', () => {
    expect(toUpstreamDial('::1', 5173)).toBe('[::1]:5173');
  });
});

const mockMeta = { framework: 'vite' as const };

describe('unpluginFactory', () => {
  it('无 options.host 时抛错', async () => {
    const { unpluginFactory } = await import('../src/index');
    expect(() => unpluginFactory(undefined, mockMeta)).toThrow(/options\.host 必填/);
    expect(() => unpluginFactory({} as import('../src/types').Options, mockMeta)).toThrow(
      /options\.host 必填/,
    );
  });

  it('有 host 时返回带 name 和 vite 的插件', async () => {
    const { unpluginFactory } = await import('../src/index');
    const out = unpluginFactory({ host: 'frontend.localhost' }, mockMeta) as {
      name: string;
      vite?: { apply: string; configureServer: () => void };
    };
    expect(out.name).toBe('unplugin-caddy-localhost');
    expect(out.vite).toBeDefined();
    expect(out.vite?.apply).toBe('serve');
    expect(typeof out.vite?.configureServer).toBe('function');
  });
});
