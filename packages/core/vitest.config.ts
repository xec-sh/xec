import { defineConfig, configDefaults } from 'vitest/config';

export default defineConfig({
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
