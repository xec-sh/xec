import { join } from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./jest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/types/**',
        'src/index.ts',
        'src/cli/**'
      ],
      all: true,
      lines: 90,
      functions: 90,
      branches: 90,
      statements: 90
    }
  },
  resolve: {
    alias: {
      '@': join(__dirname, './src')
    }
  }
});