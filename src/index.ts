import type { UnpluginFactory } from 'unplugin';
import type { Options } from './types';
import { createUnplugin } from 'unplugin';
import { PLUGIN_NAME } from './constants';

export const unpluginFactory: UnpluginFactory<Options | undefined> = (options) => ({
  name: PLUGIN_NAME,
  transformInclude(id) {
    return id.endsWith('main.ts');
  },
  transform(code) {
    return code.replace('__UNPLUGIN__', `Hello Unplugin! ${JSON.stringify(options ?? {})}`);
  },
});

export const unplugin = /* #__PURE__ */ createUnplugin(unpluginFactory);

export default unplugin;
