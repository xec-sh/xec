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
        testTimeout: 5000,
        hookTimeout: 5000,
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true
            }
        },
        sequence: {
            hooks: 'list'
        }
    }
});
//# sourceMappingURL=vitest.config.js.map