import type { Options } from './types'
import { addVitePlugin, addWebpackPlugin, defineNuxtModule } from '@nuxt/kit'
import { NUXT_CONFIG_KEY, NUXT_MODULE_NAME } from './constants'
import vite from './vite'
import webpack from './webpack'

export interface ModuleOptions extends Options {

}

export default defineNuxtModule<ModuleOptions>({
  meta: {
    name: NUXT_MODULE_NAME,
    configKey: NUXT_CONFIG_KEY,
  },
  defaults: {
    autoStartCaddy: true,
  },
  setup(options, _nuxt) {
    addVitePlugin(() => vite(options as import('./types').Options))
    addWebpackPlugin(() => webpack(options))

    // ...
  },
})
