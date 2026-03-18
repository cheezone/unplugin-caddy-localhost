import { env } from 'node:process';

export default defineNuxtConfig({
  compatibilityDate: '2026-03-16',
  devServer: {
    port: env.PORT ? Number(env.PORT) : 3000,
  },
  modules: [
    // 模块
    [
      '../../dist/nuxt.mjs',
      {
        /* options */
      },
    ],
  ],
});
