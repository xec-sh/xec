import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  minify: false,
  splitting: false,
  treeshake: true,
  external: [],
  target: 'es2022',
  platform: 'neutral',
  shims: false,
  bundle: true,
  skipNodeModulesBundle: true,
  metafile: true,
  tsconfig: './tsconfig.json'
});