import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    name: 'trm-integration',
    include: ['test/integration/**/*.test.ts'],
    globals: true,
    environment: 'node',
    testTimeout: 30000,
    hookTimeout: 10000,
    isolate: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true // Run tests sequentially for terminal operations
      }
    },
    coverage: {
      enabled: true,
      provider: 'v8',
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage-integration',
      include: [
        'src/**/*.ts',
        '!src/**/*.d.ts',
        '!src/types.ts',
        '!src/**/index.ts'
      ],
      exclude: [
        'node_modules',
        'test',
        'dist',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/types.ts',
        '**/test/**'
      ],
      // Temporarily disabled to debug test issues
      // thresholds: {
      //   lines: 90,
      //   functions: 90,
      //   branches: 85,
      //   statements: 90
      // },
      all: true,
      clean: true
    },
    setupFiles: ['./test/setup-integration.ts']
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
});