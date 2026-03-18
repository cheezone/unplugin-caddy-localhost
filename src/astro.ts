import type { Options } from './types';
import unplugin from '.';
import { PLUGIN_NAME } from './constants';

export default (options: Options): any => ({
  name: PLUGIN_NAME,
  hooks: {
    'astro:config:setup': async (astro: any) => {
      astro.config.vite.plugins ||= [];
      astro.config.vite.plugins.push(unplugin.vite(options));
    },
  },
});
