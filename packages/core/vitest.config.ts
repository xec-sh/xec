import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    testTimeout: 30000,
    hookTimeout: 120000,
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
  },
});
