# unplugin-starter

[![NPM version](https://img.shields.io/npm/v/unplugin-starter?color=a1b858&label=)](https://www.npmjs.com/package/unplugin-starter)

基于 [unplugin](https://github.com/unjs/unplugin) 的 unplugin 模板，fork 自 [unplugin/unplugin-starter](https://github.com/unplugin/unplugin-starter)。

## 用本仓库做模板

从当前仓库拉取模板创建新项目：

```bash
npx degit cheezone/unplugin-starter my-unplugin
cd my-unplugin
bun install
```

若需要改成自己的插件名，在项目里全局把 `unplugin-starter` 替换成你的包名即可。

## Git 提交钩子

使用 Vite+ 管理钩子，不再依赖 simple-git-hooks：

- 安装依赖时会执行 `prepare` → `vp config`（写入 `.vite-hooks` 并指向 Git hooks）
- 提交前会对暂存文件执行 `vp staged`（见 `vite.config.ts` 里的 `staged`）
- CI 下 `vp config` 会自动识别环境，不会误装本地 Git 钩子

## 开发与发布

- 本地开发 / 监听构建：`bun run dev`
- 运行测试：`bun test`
- 构建产物：`bun run build`
- 发布新版本：`bun run release`

## Playground

- Vite：`bun play:vite`
- Nuxt：`bun play:nuxt`

## 安装

```bash
npm i unplugin-starter
```

<details>
<summary>Vite</summary><br>

```ts
// vite.config.ts
import Starter from 'unplugin-starter/vite';

export default defineConfig({
  plugins: [
    Starter({
      /* options */
    }),
  ],
});
```

<br></details>

<details>
<summary>Rollup</summary><br>

```ts
// rollup.config.js
import Starter from 'unplugin-starter/rollup';

export default {
  plugins: [
    Starter({
      /* options */
    }),
  ],
};
```

<br></details>

<details>
<summary>Webpack</summary><br>

```ts
// webpack.config.js
module.exports = {
  plugins: [
    require('unplugin-starter/webpack')({
      /* options */
    }),
  ],
};
```

<br></details>

<details>
<summary>Nuxt</summary><br>

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['unplugin-starter/nuxt'],
});
```

<br></details>

<details>
<summary>esbuild</summary><br>

```ts
// esbuild.config.js
import { build } from 'esbuild';
import Starter from 'unplugin-starter/esbuild';

build({
  plugins: [Starter()],
});
```

<br></details>
