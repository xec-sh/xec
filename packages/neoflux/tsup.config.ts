import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: false, // Generate types separately with tsc
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'node18',
  external: [],
  noExternal: [],
  esbuildOptions(options) {
    options.footer = {
      js: '',
    };
  },
});