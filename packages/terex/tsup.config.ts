import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'core/index': 'src/core/index.ts',
    'test/index': 'src/test/index.ts',
    'utils/index': 'src/utils/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: true,
  sourcemap: true,
  clean: true,
  minify: false,
  treeshake: true,
  external: [],
  noExternal: [],
  platform: 'node',
  target: 'node18',
  esbuildOptions(options) {
    options.charset = 'utf8';
    options.legalComments = 'none';
    options.mangleProps = undefined;
    options.mangleCache = undefined;
  },
  // Ensure strict mode
  banner: {
    js: "'use strict';",
  },
});