import { defineConfig, configDefaults } from 'vitest/config';

// Mutation-testing profile: only the suites that exercise the mutated files
// (see stryker.config.json). Everything else matches vitest.config.ts so a
// test behaves identically under Stryker and under a plain `vitest run`.
export default defineConfig({
  test: {
    include: [
      'test/unit/utils/**/*.test.ts',
      'test/unit/core/**/*.test.ts',
      'test/property/**/*.test.ts',
      // The dialect-aware escaping functions are exercised here, not under
      // test/unit/utils; without these two the survey misreads shell-escape
      // as uncovered.
      'test/unit/raw-function.test.ts',
      'test/unit/security/**/*.test.ts',
    ],
    exclude: [...configDefaults.exclude, '**/.stryker-tmp/**'],
    testTimeout: 60000,
    hookTimeout: 120000,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
