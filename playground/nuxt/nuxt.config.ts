export default defineNuxtConfig({
  compatibilityDate: '2026-03-16',
  devServer: {
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
  },
  modules: ['unplugin-starter/nuxt'],
})
