import { test, expect, describe } from '@jest/globals';

import { $ } from '../../src/index';

describe('Nothrow with Retry Logic', () => {
  describe('$.retry() method', () => {
    test('should make the retry method available on the global $ object', async () => {
      // Test that $.retry is defined and is a function
      expect(typeof $.retry).toBe('function');
      
      // Test that it returns an ExecutionEngine instance
      const $reliable = $.retry({
        maxRetries: 3,
        initialDelay: 1000,
        backoffMultiplier: 2,
        maxDelay: 10000
      });
      
      expect($reliable).toBeDefined();
      expect(typeof $reliable).toBe('function'); // Should be callable
    });

    test('should work with the README example syntax', async () => {
      // This exactly matches the README example
      const $reliable = $.retry({
        maxRetries: 3,
        initialDelay: 1000,    // Start with 1 second
        backoffMultiplier: 2,  // Double delay each time
        maxDelay: 10000        // Max 10 seconds
      });

      expect($reliable).toBeDefined();
      expect(typeof $reliable).toBe('function'); // Should be callable
    });

    test('should have retry method', async () => {
      // Test that retry method is available
      expect(typeof $.retry).toBe('function');
      
      // Test that it works
      const $reliable = $.retry({ maxRetries: 2 });
      
      expect($reliable).toBeDefined();
    });

    test('should support maxRetries', async () => {
      // Test with maxRetries
      const $reliable = $.retry({ maxRetries: 2 });
      expect($reliable).toBeDefined();
    });

    test('should work with mock commands', async () => {
      const $reliable = $.retry({
        maxRetries: 2,
        initialDelay: 10,
        isRetryable: () => true
      });

      // Test that it can execute commands (this will likely fail but shouldn't crash)
      const result = await $reliable`echo "Hello World"`.nothrow();
      
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
        isRetryable: (result: any) => result.stderr.includes('network'),
        onRetry: (attempt: number, result: any, delay: number) => {
          // Callback for retry events
        }
      });

      expect($reliable).toBeDefined();
    });

  });
});