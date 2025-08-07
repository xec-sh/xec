import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'test/',
        'dist/',
        'examples/',
        'docs/',
        '**/*.d.ts',
        '**/*.config.*',
        '**/mockData.ts'
      ],
      thresholds: {
        branches: 90,
        functions: 90,
        lines: 90,
        statements: 90
      }
    },
    testTimeout: 5000,  // Default timeout for unit tests
    hookTimeout: 5000,
    pool: 'forks',  // Use forks for better isolation with stdin/stdout mocking
    poolOptions: {
      forks: {
        singleFork: true  // Run tests sequentially in the same worker
      }
    },
    // Longer timeout for integration tests
    sequence: {
      hooks: 'list'
    }
  }
});