import { env } from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2026-03-16',
  devServer: {
    port: env.PORT ? Number(env.PORT) : 3000,
  },
  modules: [['../../dist/nuxt.mjs', { host: env.CADDY_HOST || 'frontend.localhost' }]],
})
