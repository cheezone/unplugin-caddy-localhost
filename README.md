# unplugin-caddy-localhost

[Unplugin](https://unplugin.unjs.io/) 约定：用 Caddy 把 dev 映射到 `https://xxx.localhost`，host 须为 `xxx.localhost` 形式（如 `frontend.localhost`）。

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
import caddyLocalhost from 'unplugin-caddy-localhost/vite'

export default defineConfig({
  plugins: [
    caddyLocalhost({ host: 'frontend.localhost' }),
  ],
})
```

- **host**（必填）：须为 `xxx.localhost`。
- **caddyAdmin**（可选）：Admin API 地址，默认 `http://127.0.0.1:2019`。
- **autoStartCaddy**（可选）：API 不可达时是否自动执行 `caddy run`，默认 true。若 443 已被占用会提示可能已有 Caddy 在跑，请只保留一个实例。

Caddy 被关掉后插件会提示；用户再次 `caddy run` 后会自动重新注册，无需重启 Vite。

## Nuxt / Vite middleware 模式

在 Nuxt 下没有 `httpServer`，端口来自统一的锁文件。请在 `nuxt.config` 的 `modules` 里加上 `'unplugin-singleton/nuxt'`，该模块会写入 `.dev/dev.lock.json`（与 Vite 下格式一致），本插件会轮询该文件拿到端口再向 Caddy 注册。未加模块时会用回退端口并打警告。

## 开发

- 监听构建：`bun run dev`
- 测试：`bun test`
- 构建：`bun run build`
- Vite playground：`bun play:vite`
- Nuxt playground：`bun play:nuxt`
