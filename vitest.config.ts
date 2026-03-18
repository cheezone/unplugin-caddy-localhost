import { defineConfig } from 'vite-plus';

export default defineConfig({
  test: {
    testTimeout: 15_000,
    hookTimeout: 12_000,
  },
});
