import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 15000,     // Increased timeout for integration tests
    hookTimeout: 15000,     // Increased hook timeout
    isolate: true,
    clearMocks: true,
    restoreMocks: true,
    setupFiles: ['./test/setup.ts'],
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true  // Run tests sequentially to avoid tmux conflicts
      }
    },
    maxConcurrency: 1,      // Ensure tests don't run in parallel
    bail: 0,                // Continue running tests even if some fail
    teardownTimeout: 5000,  // More cleanup time for tmux sessions
    exclude: [
      'node_modules/**',
      'dist/**',
      // Exclude runtime-specific tests that must run in their native environments
      'test/runtimes/bun.test.ts',
      'test/runtimes/deno.test.ts'
    ],
    include: [
      'test/**/*.test.ts',
      '!test/runtimes/**'   // Explicitly exclude runtime tests
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
        'test/**',
        'examples/**'
      ]
    }
  }
});