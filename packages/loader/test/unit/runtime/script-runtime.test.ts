import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ScriptRuntime, createRuntime } from '../../../src/runtime/script-runtime.js';

describe('ScriptRuntime', () => {
  let runtime: ScriptRuntime;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    runtime = new ScriptRuntime();
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    // Restore original environment (skip chdir as it's not supported in workers)
    process.env = originalEnv;
  });

  describe('createRuntime', () => {
    it('should create a new ScriptRuntime instance', () => {
      const rt = createRuntime();
      expect(rt).toBeInstanceOf(ScriptRuntime);
    });
  });

  describe('cd and pwd', () => {
    it('should return current directory when called without arguments', () => {
      const currentDir = runtime.cd();
      expect(currentDir).toBe(process.cwd());
    });

    it('should change directory and return new path', () => {
      const newDir = runtime.cd('..');
      expect(newDir).toContain('/');
      expect(runtime.pwd()).toBe(newDir);
    });

    it('should handle absolute paths', () => {
      const tmpDir = runtime.tmpdir();
      const newDir = runtime.cd(tmpDir);
      expect(newDir).toBe(tmpDir);
    });

    it('should track directory internally', () => {
      const initial = runtime.pwd();
      runtime.cd('..');
      const changed = runtime.pwd();
      expect(changed).not.toBe(initial);
    });
  });

  describe('env and setEnv', () => {
    it('should get environment variable', () => {
      process.env.TEST_VAR = 'test-value';
      expect(runtime.env('TEST_VAR')).toBe('test-value');
    });

    it('should return default value for missing variable', () => {
      expect(runtime.env('NONEXISTENT_VAR', 'default')).toBe('default');
    });

    it('should set environment variable', () => {
      runtime.setEnv('NEW_VAR', 'new-value');
      expect(process.env.NEW_VAR).toBe('new-value');
    });
  });

  describe('sleep', () => {
    it('should sleep for specified milliseconds', async () => {
      const start = Date.now();
      await runtime.sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('retry', () => {
    it('should retry failed operations', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Not yet');
        }
        return 'success';
      };

      const result = await runtime.retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('success');
      expect(attempts).toBe(3);
    });

    it('should throw after max retries', async () => {
      const fn = async () => {
        throw new Error('Always fails');
      };

      await expect(
        runtime.retry(fn, { retries: 2, delay: 10 })
      ).rejects.toThrow('Always fails');
    });

    it('should call onRetry callback', async () => {
      const retries: number[] = [];
      let attempts = 0;

      const fn = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('Retry');
        }
        return 'success';
      };

      await runtime.retry(fn, {
        retries: 3,
        delay: 10,
        onRetry: (_error, attempt) => {
          retries.push(attempt);
        },
      });

      expect(retries).toEqual([1]);
    });

    it('should apply exponential backoff', async () => {
      const timestamps: number[] = [];
      let attempts = 0;

      const fn = async () => {
        timestamps.push(Date.now());
        attempts++;
        if (attempts < 3) {
          throw new Error('Retry');
        }
        return 'success';
      };

      await runtime.retry(fn, { retries: 3, delay: 50, backoff: 2 });

      // Check that delays increase exponentially
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should succeed on first try with no retries needed', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        return 'immediate success';
      };

      const result = await runtime.retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('immediate success');
      expect(attempts).toBe(1);
    });

    it('should work with zero retries', async () => {
      const fn = async () => {
        throw new Error('Fails immediately');
      };

      await expect(
        runtime.retry(fn, { retries: 0, delay: 10 })
      ).rejects.toThrow('Fails immediately');
    });

    it('should succeed on last retry attempt', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts <= 3) {
          throw new Error('Not yet');
        }
        return 'success on last try';
      };

      const result = await runtime.retry(fn, { retries: 3, delay: 10 });
      expect(result).toBe('success on last try');
      expect(attempts).toBe(4); // Initial + 3 retries
    });

    it('should use default values when options not provided', async () => {
      let attempts = 0;
      const fn = async () => {
        attempts++;
        if (attempts < 2) {
          throw new Error('First fail');
        }
        return 'success';
      };

      const result = await runtime.retry(fn);
      expect(result).toBe('success');
    });
  });

  describe('within', () => {
    it('should execute function within specific context', async () => {
      const originalDir = runtime.pwd();
      const tmpDir = runtime.tmpdir();

      const result = await runtime.within({ cwd: tmpDir }, async () => runtime.pwd());

      expect(result).toBe(tmpDir);
      expect(runtime.pwd()).toBe(originalDir);
    });

    it('should restore environment after execution', async () => {
      const originalValue = process.env.TEST_WITHIN;

      await runtime.within({ env: { TEST_WITHIN: 'modified' } }, async () => {
        expect(process.env.TEST_WITHIN).toBe('modified');
      });

      expect(process.env.TEST_WITHIN).toBe(originalValue);
    });

    it('should restore context even on error', async () => {
      const originalDir = runtime.pwd();
      const tmpDir = runtime.tmpdir();

      await expect(
        runtime.within({ cwd: tmpDir }, async () => {
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect(runtime.pwd()).toBe(originalDir);
    });

    it('should handle both cwd and env changes together', async () => {
      const originalDir = runtime.pwd();
      const originalEnv = process.env.TEST_BOTH;
      const tmpDir = runtime.tmpdir();

      const result = await runtime.within(
        { cwd: tmpDir, env: { TEST_BOTH: 'combined' } },
        async () => {
          expect(runtime.pwd()).toBe(tmpDir);
          expect(process.env.TEST_BOTH).toBe('combined');
          return 'combined result';
        }
      );

      expect(result).toBe('combined result');
      expect(runtime.pwd()).toBe(originalDir);
      expect(process.env.TEST_BOTH).toBe(originalEnv);
    });

    it('should handle empty options', async () => {
      const originalDir = runtime.pwd();
      const result = await runtime.within({}, async () => 'no changes');

      expect(result).toBe('no changes');
      expect(runtime.pwd()).toBe(originalDir);
    });

    it('should handle nested within calls', async () => {
      const originalDir = runtime.pwd();
      const tmpDir = runtime.tmpdir();

      const result = await runtime.within({ cwd: tmpDir }, async () => {
        const innerDir = runtime.pwd();
        expect(innerDir).toBe(tmpDir);

        return runtime.within({ env: { NESTED: 'yes' } }, async () => {
          expect(process.env.NESTED).toBe('yes');
          expect(runtime.pwd()).toBe(tmpDir);
          return 'nested result';
        });
      });

      expect(result).toBe('nested result');
      expect(runtime.pwd()).toBe(originalDir);
      expect(process.env.NESTED).toBeUndefined();
    });

    it('should preserve return value from async function', async () => {
      const result = await runtime.within({}, async () => {
        await runtime.sleep(10);
        return { data: [1, 2, 3] };
      });

      expect(result).toEqual({ data: [1, 2, 3] });
    });
  });

  describe('quote', () => {
    it('should not quote simple strings', () => {
      expect(runtime.quote('simple')).toBe('simple');
      expect(runtime.quote('with-dash')).toBe('with-dash');
    });

    it('should quote strings with spaces', () => {
      const quoted = runtime.quote('has spaces');
      expect(quoted).toBe("'has spaces'");
    });

    it('should quote strings with special characters', () => {
      expect(runtime.quote('has$dollar')).toContain("'");
      expect(runtime.quote('has`backtick')).toContain("'");
    });

    it('should handle quotes in input', () => {
      const result = runtime.quote("has'quote");
      expect(result).toContain("'");
    });

    it('should handle empty string', () => {
      expect(runtime.quote('')).toBe('');
    });

    it('should handle strings with backslashes', () => {
      const result = runtime.quote('path\\to\\file');
      expect(result).toContain("'");
    });

    it('should handle strings with double quotes', () => {
      const result = runtime.quote('say "hello"');
      expect(result).toContain("'");
    });

    it('should handle numeric strings', () => {
      expect(runtime.quote('12345')).toBe('12345');
    });

    it('should handle paths with special chars', () => {
      const result = runtime.quote('/path/to/file with spaces');
      expect(result).toBe("'/path/to/file with spaces'");
    });
  });

  describe('tmpdir and tmpfile', () => {
    it('should return system temp directory', () => {
      const tmpDir = runtime.tmpdir();
      expect(tmpDir).toBeTruthy();
      expect(tmpDir.length).toBeGreaterThan(0);
    });

    it('should generate unique temp file paths', () => {
      const file1 = runtime.tmpfile();
      const file2 = runtime.tmpfile();
      expect(file1).not.toBe(file2);
      expect(file1).toContain('xec-loader-');
    });

    it('should use custom prefix and suffix', () => {
      const file = runtime.tmpfile('myprefix-', '.txt');
      expect(file).toContain('myprefix-');
      expect(file.endsWith('.txt')).toBe(true);
    });
  });

  describe('template', () => {
    it('should interpolate template strings', () => {
      const name = 'World';
      const result = runtime.template`Hello ${name}!`;
      expect(result).toBe('Hello World!');
    });

    it('should handle multiple substitutions', () => {
      const first = 'John';
      const last = 'Doe';
      const result = runtime.template`Name: ${first} ${last}`;
      expect(result).toBe('Name: John Doe');
    });

    it('should handle undefined values', () => {
      const value = undefined;
      const result = runtime.template`Value: ${value}`;
      expect(result).toBe('Value: ');
    });
  });

  describe('getCwd and chdir', () => {
    it('should get process working directory', () => {
      expect(runtime.getCwd()).toBe(process.cwd());
    });

    it('should change process working directory', () => {
      // Mock process.chdir since it's not supported in worker threads
      const originalChdir = process.chdir;
      const originalCwd = process.cwd;
      let mockedCwd = process.cwd();

      process.chdir = vi.fn((dir: string) => {
        mockedCwd = dir;
      });
      process.cwd = vi.fn(() => mockedCwd);

      try {
        const tmpDir = runtime.tmpdir();
        runtime.chdir(tmpDir);

        expect(process.chdir).toHaveBeenCalledWith(tmpDir);
        expect(runtime.pwd()).toBe(tmpDir);
      } finally {
        // Restore original functions
        process.chdir = originalChdir;
        process.cwd = originalCwd;
      }
    });

    it('should sync internal state with process.cwd after chdir', () => {
      // Mock process.chdir
      const originalChdir = process.chdir;
      const originalCwd = process.cwd;
      let mockedCwd = '/initial/path';

      process.chdir = vi.fn((dir: string) => {
        mockedCwd = dir;
      });
      process.cwd = vi.fn(() => mockedCwd);

      try {
        const newRuntime = new ScriptRuntime();
        newRuntime.chdir('/new/path');

        expect(newRuntime.pwd()).toBe('/new/path');
        expect(process.chdir).toHaveBeenCalledWith('/new/path');
      } finally {
        process.chdir = originalChdir;
        process.cwd = originalCwd;
      }
    });
  });

  describe('resetEnv', () => {
    it('should reset environment to original state', () => {
      runtime.setEnv('TEST_RESET', 'value');
      expect(process.env.TEST_RESET).toBe('value');

      runtime.resetEnv();
      expect(process.env.TEST_RESET).toBeUndefined();
    });
  });

  describe('kill', () => {
    it('should call process.kill with correct arguments', () => {
      const originalKill = process.kill;
      const mockKill = vi.fn();
      process.kill = mockKill as unknown as typeof process.kill;

      try {
        runtime.kill(12345);
        expect(mockKill).toHaveBeenCalledWith(12345, 'SIGTERM');
      } finally {
        process.kill = originalKill;
      }
    });

    it('should support custom signals', () => {
      const originalKill = process.kill;
      const mockKill = vi.fn();
      process.kill = mockKill as unknown as typeof process.kill;

      try {
        runtime.kill(12345, 'SIGKILL');
        expect(mockKill).toHaveBeenCalledWith(12345, 'SIGKILL');
      } finally {
        process.kill = originalKill;
      }
    });

    it('should support SIGINT signal', () => {
      const originalKill = process.kill;
      const mockKill = vi.fn();
      process.kill = mockKill as unknown as typeof process.kill;

      try {
        runtime.kill(999, 'SIGINT');
        expect(mockKill).toHaveBeenCalledWith(999, 'SIGINT');
      } finally {
        process.kill = originalKill;
      }
    });
  });

  describe('exit', () => {
    it('should call process.exit with default code 0', () => {
      const originalExit = process.exit;
      const mockExit = vi.fn();
      process.exit = mockExit as unknown as typeof process.exit;

      try {
        runtime.exit();
        expect(mockExit).toHaveBeenCalledWith(0);
      } finally {
        process.exit = originalExit;
      }
    });

    it('should call process.exit with custom code', () => {
      const originalExit = process.exit;
      const mockExit = vi.fn();
      process.exit = mockExit as unknown as typeof process.exit;

      try {
        runtime.exit(1);
        expect(mockExit).toHaveBeenCalledWith(1);
      } finally {
        process.exit = originalExit;
      }
    });

    it('should support various exit codes', () => {
      const originalExit = process.exit;
      const mockExit = vi.fn();
      process.exit = mockExit as unknown as typeof process.exit;

      try {
        runtime.exit(42);
        expect(mockExit).toHaveBeenCalledWith(42);

        runtime.exit(127);
        expect(mockExit).toHaveBeenCalledWith(127);
      } finally {
        process.exit = originalExit;
      }
    });
  });
});
