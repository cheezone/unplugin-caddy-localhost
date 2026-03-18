import { defineConfig } from 'vite-plus';
import Inspect from 'vite-plugin-inspect';
import Unplugin from '../../src/vite';

export default defineConfig({
  plugins: [Inspect(), Unplugin()],
});
