import { test, expect, describe } from '@jest/globals';
import { $ } from '../../src/index';
describe('Nothrow with Retry Logic', () => {
    describe('$.retry() method', () => {
        test('should make the retry method available on the global $ object', async () => {
            expect(typeof $.retry).toBe('function');
            const $reliable = $.retry({
                maxRetries: 3,
                initialDelay: 1000,
                backoffMultiplier: 2,
                maxDelay: 10000
            });
            expect($reliable).toBeDefined();
            expect(typeof $reliable).toBe('function');
        });
        test('should work with the README example syntax', async () => {
            const $reliable = $.retry({
                maxRetries: 3,
                initialDelay: 1000,
                backoffMultiplier: 2,
                maxDelay: 10000
            });
            expect($reliable).toBeDefined();
            expect(typeof $reliable).toBe('function');
        });
        test('should have retry method', async () => {
            expect(typeof $.retry).toBe('function');
            const $reliable = $.retry({ maxRetries: 2 });
            expect($reliable).toBeDefined();
        });
        test('should support maxRetries', async () => {
            const $reliable = $.retry({ maxRetries: 2 });
            expect($reliable).toBeDefined();
        });
        test('should work with mock commands', async () => {
            const $reliable = $.retry({
                maxRetries: 2,
                initialDelay: 10,
                isRetryable: () => true
            });
            const result = await $reliable `echo "Hello World"`.nothrow();
            expect(result).toBeDefined();
            expect(result.exitCode).toBeDefined();
        });
    });
    describe('RetryOptions compatibility', () => {
        test('should accept all retry options from README example', async () => {
            const $reliable = $.retry({
                maxRetries: 3,
                initialDelay: 1000,
                backoffMultiplier: 2,
                maxDelay: 10000,
                jitter: true,
                isRetryable: (result) => result.stderr.includes('network'),
                onRetry: (attempt, result, delay) => {
                }
            });
            expect($reliable).toBeDefined();
        });
    });
});
//# sourceMappingURL=nothrow-retry.test.js.map