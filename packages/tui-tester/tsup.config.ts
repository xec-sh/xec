import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/index': 'src/adapters/index.ts',
    'helpers/test-runner': 'src/helpers/test-runner.ts',
    'helpers/interactions': 'src/helpers/interactions.ts',
    'snapshot/snapshot-manager': 'src/snapshot/snapshot-manager.ts',
    'tmux-tester': 'src/tmux-tester.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  shims: true,
  external: ['@xec-sh/trm', 'vitest'],
  treeshake: true,
  target: 'es2022',
  platform: 'node',
  outDir: 'dist',
  esbuildOptions(options) {
    options.footer = {
      js: '',
    };
  },
});