import pkg from '../package.json'

/** 包名，与 package.json name 一致 */
export const PLUGIN_NAME = pkg.name as string

/** Nuxt 模块名：nuxt-${name} */
export const NUXT_MODULE_NAME = `nuxt-${PLUGIN_NAME}`

/** Nuxt configKey：将 name 转为 camelCase，如 unplugin-starter -> unpluginStarter */
export const NUXT_CONFIG_KEY = PLUGIN_NAME.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
