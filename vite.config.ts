import { defineConfig } from 'vite-plus';

export default defineConfig({
  staged: {
    '*.{js,ts,mjs,cjs,tsx,vue,svelte,md,json,yml,yaml}': 'vp check --fix',
  },
  pack: {
    entry: ['src/*.ts'],
  },
  lint: {
    ignorePatterns: ['dist/**', '**/node_modules/**'],
    options: {
      typeAware: true,
      typeCheck: true,
    },
  },
  fmt: {
    singleQuote: true,
  },
});
