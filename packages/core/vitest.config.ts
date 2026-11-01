import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
  resolve: { alias: { '@xec-sh/testing': fileURLToPath(new URL('../testing/src/index.ts', import.meta.url)) } },
  test: {
    // A crashed Stryker run leaves sandbox copies of the whole test tree
    // behind; without this a plain `vitest run` picks them up as real tests.
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    testTimeout: 60000,
    hookTimeout: 120000,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
