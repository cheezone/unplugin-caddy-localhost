import { describe, expect, it } from 'vitest'
import { deriveNuxtNames } from '../src/constants'

describe('deriveNuxtNames', () => {
  it('普通包名', () => {
    const { moduleName, configKey } = deriveNuxtNames('my-plugin')
    expect(moduleName).toBe('nuxt-my-plugin')
    expect(configKey).toBe('myPlugin')
  })

  it('带 scope 的包名', () => {
    const { moduleName, configKey } = deriveNuxtNames('@scope/my-plugin')
    expect(moduleName).toBe('nuxt-my-plugin')
    expect(configKey).toBe('myPlugin')
  })
})
