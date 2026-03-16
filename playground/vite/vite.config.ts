import { defineConfig } from 'vite'
import Inspect from 'vite-plugin-inspect'
import caddyLocalhost from '../../src/vite'

export default defineConfig({
  plugins: [
    Inspect(),
    caddyLocalhost({ host: 'frontend.localhost' }),
  ],
})
