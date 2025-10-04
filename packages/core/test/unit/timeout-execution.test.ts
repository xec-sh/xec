import { it, expect, describe, beforeEach, afterEach } from '@jest/globals';

import { $, AdapterError, dispose, configure } from '../../src/index.js';
import { globalCache } from '../../src/utils/cache.js';

describe('Timeout execution test', () => {
  beforeEach(async () => {
    // Clean up before each test
    await dispose();
    globalCache.clear();
    // Reset configuration to defaults
    configure({
      throwOnNonZeroExit: true,
      defaultTimeout: 30000
    });
    // Add a small delay to ensure all processes are cleaned up
    await new Promise(resolve => setTimeout(resolve, 10));
  });

  afterEach(async () => {
    // Clean up after each test
    await dispose();
    globalCache.clear();
    // Add a small delay to ensure all processes are cleaned up
    await new Promise(resolve => setTimeout(resolve, 10));
  });
  describe('Basic timeout functionality', () => {
    it('should execute command with timeout successfully', async () => {
      const result = await $`echo "test"`.timeout(5000);

      expect(result.stdout.trim()).toBe('test');
      expect(result.exitCode).toBe(0);
    });

    it('should work with nothrow', async () => {
      const result = await $`exit 1`.timeout(1000).nothrow();

      expect(result.exitCode).toBe(1);
    });

    it('should work with text() method', async () => {
      const text = await $`echo "hello"`.timeout(1000).text();

      expect(text).toBe('hello');
    });

    it('should work with json() method', async () => {
      const json = await $`echo '{"key": "value"}'`.timeout(1000).json();

      expect(json).toEqual({ key: 'value' });
    });

    it('should work with lines() method', async () => {
      const lines = await $`printf "line1\\nline2\\nline3"`.timeout(1000).lines();

      expect(lines).toEqual(['line1', 'line2', 'line3']);
    });

    it('should work with buffer() method', async () => {
      const buffer = await $`echo "test"`.timeout(1000).buffer();

      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.toString().trim()).toBe('test');
    });

    it('should work with method chaining', async () => {
      const result = await $`echo "test"`.timeout(1000).quiet().nothrow();

      expect(result.stdout.trim()).toBe('test');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Timeout enforcement', () => {
    it('should timeout long-running command with nothrow', async () => {
      const result = await $`sleep 10`.timeout(100).nothrow();

      expect(result.ok).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, 5000);

    it('should include timeout info in error message with nothrow', async () => {
      const result = await $`sleep 10`.timeout(100).nothrow();

      expect(result.ok).toBe(false);
      expect(result.stderr).toMatch(/timed? ?out|timeout/i);
    }, 5000);

    it('should work with nothrow on timeout', async () => {
      const result = await $`sleep 10`.timeout(100).nothrow();

      // Command should be interrupted and return non-zero exit code
      expect(result.ok).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, 5000);

    it('should not timeout fast commands', async () => {
      const result = await $`echo "fast"`.timeout(5000);

      expect(result.stdout.trim()).toBe('fast');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Timeout with different command types', () => {
    it('should timeout with env variables', async () => {
      const result = await $`sh -c "echo $TEST_VAR && sleep 10"`.env({ TEST_VAR: 'test' }).timeout(100).nothrow();

      expect(result.ok).toBe(false);
    }, 5000);

    it('should timeout with cwd', async () => {
      const result = await $`sleep 10`.cwd('/tmp').timeout(100).nothrow();

      expect(result.ok).toBe(false);
    }, 5000);

    it('should work with shell option', async () => {
      const result = await $`echo "shell test"`.shell('/bin/sh').timeout(1000);

      expect(result.stdout.trim()).toBe('shell test');
    });
  });

  describe('Multiple timeout calls', () => {
    it('should use last timeout value', async () => {
      // First timeout is long, second is short - should use short one
      const result = await $`sleep 10`.timeout(10000).timeout(100).nothrow();

      expect(result.ok).toBe(false);
      expect(result.exitCode).not.toBe(0);
    }, 5000);

    it('should allow overriding timeout', async () => {
      // Both timeouts are generous for this fast command
      const result = await $`echo "test"`.timeout(1000).timeout(5000);

      expect(result.stdout.trim()).toBe('test');
    });
  });

  describe('Timeout edge cases', () => {
    it('should handle very small timeout', async () => {
      // Even fast commands might not complete in 1ms
      const result = await $`echo "test"`.timeout(1).nothrow();

      // Might succeed or timeout depending on system load
      // Just verify it completes without throwing
      expect(result).toBeDefined();
      if (result.ok) {
        expect(result.stdout.trim()).toBe('test');
      } else {
        expect(result.exitCode).not.toBe(0);
      }
    }, 5000);

    it('should handle large timeout', async () => {
      const result = await $`echo "test"`.timeout(60000);

      expect(result.stdout.trim()).toBe('test');
    });
  });
});