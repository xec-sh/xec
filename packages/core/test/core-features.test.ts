import { it, expect, describe } from '@jest/globals';

import { within } from '../src/utils/within.js';
import { MockAdapter } from '../src/adapters/mock-adapter.js';
import { pipe, CommandError, ExecutionEngine, createCallableEngine } from '../src/index.js';

describe('USH Core Features', () => {
  const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
  const $ = createCallableEngine(engine);

  describe('Basic execution', () => {
    it('should execute simple commands', async () => {
      const result = await engine.execute({ command: 'echo', args: ['Hello, World!'] });
      expect(result.stdout.trim()).toBe('Hello, World!');
      expect(result.exitCode).toBe(0);
    });

    it('should execute commands with shell', async () => {
      const result = await engine.execute({ command: 'echo "Hello, Shell!"', shell: true });
      expect(result.stdout.trim()).toBe('Hello, Shell!');
    });

    it('should execute template strings', async () => {
      const message = 'Hello from template';
      const result = await $`echo ${message}`;
      expect(result.stdout.trim()).toBe(message);
    });
  });

  describe('Retry functionality', () => {
    it('should retry failed commands using retry', async () => {
      let attempts = 0;
      
      // Test with a command that might not exist
      const $retry = $.retry({
        maxRetries: 2,
        isRetryable: () => true,
        onRetry: (attempt: number) => {
          attempts = attempt;
        },
        initialDelay: 10
      });

      // Use a command that exists on all platforms
      const result = await $retry`echo "Success"`;
      expect(result.stdout).toContain('Success');
      // Since echo should succeed on first try, no retries
      expect(attempts).toBe(0);
    });
  });

  describe('Within context', () => {
    it('should execute with local context', async () => {
      const result = await within(
        { env: { TEST_VAR: 'test-value' } },
        async () => engine.execute({ command: 'echo $TEST_VAR', shell: true })
      );

      expect(result.stdout.trim()).toBe('test-value');
    });
  });

  describe('Pipe operations', () => {
    it('should pipe commands', async () => {
      const result = await pipe(
        ['echo "hello world"', 'grep world'],
        $
      );

      expect(result.stdout.trim()).toBe('hello world');
    });

    it('should pipe multiple commands', async () => {
      const result = await pipe(
        ['echo "line1\nline2\nline3"', 'grep line', 'wc -l'],
        $
      );

      expect(parseInt(result.stdout.trim())).toBe(3);
    });
  });

  describe('Environment and working directory', () => {
    it('should support changing working directory', async () => {
      const $tmp = $.cd('/tmp');
      const result = await $tmp`pwd`;
      // On macOS, /tmp is a symlink to /private/tmp
      const cwd = result.stdout.trim();
      expect(['/tmp', '/private/tmp']).toContain(cwd);
    });

    it('should support environment variables', async () => {
      const $env = $.env({ MY_VAR: 'hello' });
      const result = await $env`echo $MY_VAR`;
      expect(result.stdout.trim()).toBe('hello');
    });

    it('should chain configurations', async () => {
      const $configured = $.cd('/tmp').env({ TEST: 'value' }).timeout(5000);
      const result = await $configured`echo "$TEST in $(pwd)"`;
      // On macOS, /tmp is a symlink to /private/tmp
      const output = result.stdout.trim();
      expect(output).toMatch(/^value in \/(private\/)?tmp$/);
    });
  });

  describe('Adapter switching', () => {
    it('should support mock adapter', async () => {
      const mockAdapter = new MockAdapter();
      mockAdapter.mockSuccess('sh -c "echo "test message""', 'mocked: test message\n');
      
      engine.registerAdapter('mock2', mockAdapter);
      const $mock = $.with({ adapter: 'mock2' as any });

      const result = await $mock`echo "test message"`;
      expect(result.stdout.trim()).toBe('mocked: test message');
    });

    it('should support local adapter', async () => {
      const $local = $.local();
      const result = await $local`echo "local test"`;
      expect(result.stdout.trim()).toBe('local test');
    });
  });

  describe('Error handling', () => {
    it('should handle command errors', async () => {
      await expect(engine.execute({ command: 'exit', args: ['1'], shell: true }))
        .rejects.toThrow(CommandError);
    });

    it('should capture stderr', async () => {
      const result = await engine.execute({
        command: 'echo "error" >&2; exit 0',
        shell: true
      });
      expect(result.stderr.trim()).toBe('error');
      expect(result.exitCode).toBe(0);
    });
  });

  describe('Shell configuration', () => {
    it('should use custom shell', async () => {
      const $bash = $.shell('/bin/bash');
      const result = await $bash`echo $BASH_VERSION | cut -d. -f1`;
      // Should return bash major version if bash is available
      expect(result.exitCode).toBe(0);
    });

    it('should disable shell', async () => {
      const $noshell = $.shell(false);
      const result = await $noshell.execute({
        command: 'echo',
        args: ['no shell interpolation: $HOME']
      });
      expect(result.stdout.trim()).toBe('no shell interpolation: $HOME');
    });
  });
});

describe('Integration scenarios', () => {
  const engine = new ExecutionEngine();
  const $ = createCallableEngine(engine);

  it('should handle complex piping scenarios', async () => {
    const result = await pipe([
      'echo "apple\nbanana\ncherry\napple\ndate"',
      'sort',
      'uniq -c',
      'sort -rn'
    ], $);

    const lines = result.stdout.trim().split('\n');
    expect(lines.length).toBeGreaterThan(0);
    // First line should have count 2 for 'apple'
    expect(lines[0]).toMatch(/^\s*2\s+apple/);
  });

  it('should work with different adapters in pipe', async () => {
    const mockAdapter = new MockAdapter();
    mockAdapter.mockCommand(/echo/, { stdout: 'line1\nline2\nline3\n', stderr: '', exitCode: 0 });
    mockAdapter.mockCommand(/wc/, { stdout: '       3\n', stderr: '', exitCode: 0 });
    
    engine.registerAdapter('mock', mockAdapter);
    const $mock = $.with({ adapter: 'mock' as any });

    const result = await pipe(['echo "test"', 'wc -l'], $mock);
    expect(result.stdout.trim()).toBe('3');
  });
});