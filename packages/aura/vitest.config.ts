import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    testTimeout: 5000, // 5 second timeout for each test
    hookTimeout: 10000, // 10 second timeout for hooks
    teardownTimeout: 5000, // 5 second timeout for teardown
    pool: 'threads', // Use threads pool to isolate tests
    poolOptions: {
      threads: {
        singleThread: true, // Run tests sequentially to avoid memory issues
        isolate: true // Isolate each test file
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
        'vitest.config.ts',
        'examples/**'
      ],
      include: [
        'src/**/*.ts'
      ],
      all: true,
      lines: 96,
      functions: 96,
      branches: 96,
      statements: 96
    },
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'build/**'
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});