import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: [
      'test/**/*.test.ts',
      'test/**/*.spec.ts'
    ],
    exclude: [
      'node_modules',
      'dist',
      '.idea',
      '.git',
      '.cache'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/**/*.bench.ts',
        'src/test/**',
        'src/types/**',
        'src/**/*.d.ts'
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95
      }
    },
    benchmark: {
      include: ['test/**/*.bench.ts'],
      exclude: ['node_modules', 'dist']
    },
    testTimeout: 5000,
    hookTimeout: 10000,
    teardownTimeout: 1000,
    isolate: true,
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: false,
        isolate: true
      }
    },
    watch: false,
    watchExclude: ['**/node_modules/**', '**/dist/**'],
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@components': path.resolve(__dirname, './src/components'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@test': path.resolve(__dirname, './src/test')
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@core': path.resolve(__dirname, './src/core'),
      '@components': path.resolve(__dirname, './src/components'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@test': path.resolve(__dirname, './src/test')
    }
  }
});