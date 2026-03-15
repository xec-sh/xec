import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 60000,
    hookTimeout: 120000,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
