import pkg from '../package.json'

const BARE_NAME_REGEX = /-([a-z])/g

export function deriveNuxtNames(name: string): {
  moduleName: string
  configKey: string
} {
  // 去掉 scope
  const bare = name.startsWith('@') ? (name.split('/')[1] || name) : name
  const moduleName = `nuxt-${bare}`
  const configKey = bare.replace(BARE_NAME_REGEX, (_, c: string) => c.toUpperCase())
  return {
    moduleName,
    configKey,
  }
}

/** 包名，与 package.json name 一致 */
export const PLUGIN_NAME = pkg.name

/** Nuxt 模块名：基于包名派生 */
export const NUXT_MODULE_NAME = deriveNuxtNames(PLUGIN_NAME).moduleName

/** Nuxt configKey：基于包名派生 */
export const NUXT_CONFIG_KEY = deriveNuxtNames(PLUGIN_NAME).configKey
