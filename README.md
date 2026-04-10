# unplugin-caddy-localhost

[![NPM version](https://img.shields.io/npm/v/unplugin-caddy-localhost?color=a1b858&label=)](https://www.npmjs.com/package/unplugin-caddy-localhost)

[Unplugin](https://unplugin.unjs.io/) 约定：用 Caddy 把 dev 映射到 `https://xxx.localhost`。`host` 可省略（默认从项目名推导），显式传入时须为 `xxx.localhost` 形式（如 `frontend.localhost`）。

## 前置条件

**macOS 下三步（必做）：**

1. 安装 Caddy：`brew install caddy`
2. 启动 Caddy：`caddy run`（监听 443 需权限时可 `sudo caddy run` 或 `sudo setcap 'cap_net_bind_service=+ep' $(which caddy)`）
3. 浏览器显示「安全」：执行一次 `caddy trust`

## 安装

```bash
pnpm add -D unplugin-caddy-localhost
npm i -D unplugin-caddy-localhost
```

## 使用（Vite）

```ts
// vite.config.ts
import caddyLocalhost from 'unplugin-caddy-localhost/vite';

export default defineConfig({
  plugins: [caddyLocalhost()],
});
```

- **host**（可选）：不传时自动读取项目 `package.json` 的 `name`，推导为 `<name>.localhost`（例如 `cheez-tech` → `cheez-tech.localhost`）；传入时须为 `xxx.localhost`。
- **caddyAdmin**（可选）：Admin API 地址，默认 `http://127.0.0.1:2019`。
- **autoStartCaddy**（可选）：API 不可达时是否自动执行 `caddy run`，默认 true。若 443 已被占用会提示可能已有 Caddy 在跑，请只保留一个实例。

Caddy 被关掉后插件会提示；用户再次 `caddy run` 后会自动重新注册，无需重启 Vite。

## Nuxt

Nuxt 模块在 `listen` 时从开发服务器 listener 解析地址，再向 Caddy 注册反代，与 Vite 下基于 `httpServer` 的行为一致，**不**读取 `.dev` 或锁文件。

## 开发

- 监听构建：`vp run dev`
- 测试：`vp test`
- 构建：`vp run build`
- Vite playground：`vp run play:vite`
- Nuxt playground：`vp run play:nuxt`
