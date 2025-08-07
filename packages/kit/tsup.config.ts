import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: false, // Temporarily disable DTS
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  external: ['picocolors', 'sisteransi'],
  platform: 'node',
  target: 'node14',
  shims: true,
  bundle: true,
  skipNodeModulesBundle: true,
  esbuildOptions(options) {
    options.banner = {
      js: '"use strict";'
    };
  },
  // Suppress warning about named and default exports
  cjsInterop: true
});