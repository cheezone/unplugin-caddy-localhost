import { env } from 'node:process'
import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import caddyLocalhost from '../../src/vite'

export default defineConfig({
  plugins: [
    Inspect(),
    caddyLocalhost({ host: env.CADDY_HOST || 'frontend.localhost' }),
  ],
})
