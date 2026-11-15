
import { globalCache } from '../../../src/utils/cache.js';
import { $, dispose, configure, ExecutionEngine, createCallableEngine } from '../../../src/index.js';
import { cwdOf, argEcho, readEnv, runNode, joinArgs, tempRoot, posixShellPath } from '../../helpers/platform.js';

describe('Simplified API', () => {
  // Store original config to restore after each test
  
  beforeEach(async () => {
    // Clean up before each test
    await dispose();
    // Clear the global cache to prevent command interference
    globalCache.clear();
    // Reset to default configuration
    configure({ 
      throwOnNonZeroExit: true, 
      defaultTimeout: 30000,
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });
    // Store current config
  });
  
  afterEach(async () => {
    // Clean up any remaining resources
    await dispose();
    // Clear the global cache
    globalCache.clear();
  });
  describe('$ function', () => {
    test('should execute commands with template literals', async () => {
      const result = await $`echo Hello World`;
      expect(result.stdout.trim()).toBe('Hello World');
      expect(result.exitCode).toBe(0);
    });

    test('should interpolate values in template literals', async () => {
      // Read back as an argument. cmd's echo prints the quotes, so it
       // cannot show what the interpolation produced.
      const name = 'USH';

      expect(await argEcho($, `Hello ${name}`)).toBe('Hello USH');
    });

    test('should handle command failure', async () => {
      const run = createCallableEngine(new ExecutionEngine({ throwOnNonZeroExit: true }));
      try {
        const result = await run.with({ shell: false, nothrow: true }).exec(process.execPath, { args: ['-e', 'process.exit(42)'] });
        expect(result).toMatchObject({ exitCode: 42, ok: false });
        await expect(run.with({ shell: false }).exec(process.execPath, { args: ['-e', 'process.exit(42)'] }))
          .rejects.toMatchObject({ name: 'CommandError', exitCode: 42 });
      } finally { await run.dispose(); }
    });

    test('should support method chaining', async () => {
      // Use echo with env var to check if environment variable is set
      const result = await $.env({ MY_TEST_VAR: 'my_test_value' })`sh -c "echo $MY_TEST_VAR"`;
      expect(result.stdout.trim()).toBe('my_test_value');
      expect(result.exitCode).toBe(0);
    });

    test('should support timeout', async () => {
      const run = createCallableEngine(new ExecutionEngine());
      try {
        await expect(run.with({ shell: false, timeout: 50 }).exec(process.execPath, { args: ['-e', 'setInterval(() => {}, 1000)'] }))
          .rejects.toMatchObject({ name: 'TimeoutError', timeout: 50 });
      } finally { await run.dispose(); }
    });

    test('should support cd', async () => {
      const tempDir = tempRoot();
      const cdEngine = $.cd(tempDir);
      expect(await cwdOf(cdEngine)).toBe(tempDir);
    });
  });

  describe('configure function', () => {
    test('should update default configuration', async () => {
      // Configure to not throw on non-zero exit
      configure({ throwOnNonZeroExit: false });
      
      const result = await $`exit 1`;
      expect(result.exitCode).toBe(1);
    });

    test('should apply timeout configuration', async () => {
      const run = createCallableEngine(new ExecutionEngine({ defaultTimeout: 50 }));
      try {
        await expect(run.with({ shell: false }).exec(process.execPath, { args: ['-e', 'setInterval(() => {}, 1000)'] }))
          .rejects.toMatchObject({ name: 'TimeoutError', timeout: 50 });
      } finally { await run.dispose(); }
    });
  });

  describe('adapter methods', () => {
    test('should have ssh method', () => {
      expect(typeof $.ssh).toBe('function');
    });

    test('should have docker method', () => {
      expect(typeof $.docker).toBe('function');
    });

    test('should have k8s method', () => {
      expect(typeof $.k8s).toBe('function');
    });

    test('should have local method', () => {
      expect(typeof $.local).toBe('function');
    });

    test('should return chainable instance from adapter methods', () => {
      const sshEngine = $.ssh({ host: 'example.com', username: 'user' });
      expect(typeof sshEngine).toBe('function');
      expect(typeof sshEngine.cd).toBe('function');
      expect(typeof sshEngine.env).toBe('function');
    });
  });

  describe('exported types and utilities', () => {
    test('should export essential utilities', async () => {
      const { 
        withTempFile, 
        withTempDir, 
        parallel,
        pipeUtils
      } = await import('../../../src/index.js');
      
      expect(typeof withTempFile).toBe('function');
      expect(typeof withTempDir).toBe('function');
      expect(typeof parallel).toBe('function');
      expect(typeof pipeUtils).toBe('object');
      expect(typeof pipeUtils.toUpperCase).toBe('function');
      expect(typeof pipeUtils.grep).toBe('function');
      expect(typeof pipeUtils.replace).toBe('function');
      expect(typeof pipeUtils.tee).toBe('function');
    });

    test('should export core errors', async () => {
      const { 
        CommandError, 
        TimeoutError, 
        ConnectionError,
        AdapterError,
        ExecutionError,
        DockerError,
        KubernetesError
      } = await import('../../../src/index.js');
      
      expect(CommandError).toBeDefined();
      expect(TimeoutError).toBeDefined();
      expect(ConnectionError).toBeDefined();
      expect(AdapterError).toBeDefined();
      expect(ExecutionError).toBeDefined();
      expect(DockerError).toBeDefined();
      expect(KubernetesError).toBeDefined();
    });

    test('should export adapters for advanced users', async () => {
      const {
        ExecutionEngine: Engine,
        LocalAdapter,
        SSHAdapter,
        DockerAdapter,
        KubernetesAdapter
      } = await import('../../../src/index.js');

      expect(Engine).toBeDefined();
      expect(LocalAdapter).toBeDefined();
      expect(SSHAdapter).toBeDefined();
      expect(DockerAdapter).toBeDefined();
      expect(KubernetesAdapter).toBeDefined();
    });

    test('should export advanced types', async () => {
      const {
        DockerContainer,
        SecurePasswordHandler
      } = await import('../../../src/index.js');
      
      expect(DockerContainer).toBeDefined();
      expect(SecurePasswordHandler).toBeDefined();
      const ssh = await import('@xec-sh/ssh');
      expect(ssh.SSHKeyValidator.validatePrivateKey).toBeTypeOf('function');
      expect(await import('../../../src/index.js')).not.toHaveProperty('SSHKeyValidator');
    });

    test('should export helper functions', async () => {
      const {
        within,
        withinSync,
        isDisposable
      } = await import('../../../src/index.js');
      
      expect(typeof within).toBe('function');
      expect(typeof withinSync).toBe('function');
      expect(typeof isDisposable).toBe('function');
    });
  });

  describe('additional API methods', () => {
    test('should support raw method', async () => {
      // raw() should preserve literal strings without shell escaping
      const value = "test_value";
      const result = await $.raw`echo ${value}`;
      // raw should output the value as-is
      expect(result.stdout.trim()).toBe("test_value");
    });

    test('should support retry method', async () => {
      // Configure to not throw so we can use nothrow() for retry logic
      const retryEngine = $.retry({ maxRetries: 2, initialDelay: 10 });
      
      // Create a command that fails once then succeeds
      const testFile = `/tmp/retry-test-${Date.now()}`;
      const result = await retryEngine`sh -c "if [ ! -f ${testFile} ]; then touch ${testFile} && exit 1; else echo success && rm ${testFile}; fi"`.nothrow();
      
      expect(result.stdout.trim()).toBe('success');
      expect(result.exitCode).toBe(0);
    });

    test('should support shell method', async () => {
      // Test shell method with specific shell
      const result = await $.shell(posixShellPath())`echo Shell test`;
      expect(result.stdout.trim()).toBe('Shell test');
      expect(result.exitCode).toBe(0);
    });

    test('should support defaults method', async () => {
      const customEngine = $.defaults({ 
        defaultEnv: { MY_CUSTOM_VAR: 'my_custom_value' }
      });
      
      const result = await customEngine`sh -c "echo $MY_CUSTOM_VAR"`;
      expect(result.stdout.trim()).toBe('my_custom_value');
      expect(result.exitCode).toBe(0);
    });

    test('should support nothrow method', async () => {
      const result = await $`exit 123`.nothrow();
      expect(result.exitCode).toBe(123);
      expect(result.ok).toBe(false);
    });

    test('should support quiet method', async () => {
      // Quiet suppresses output but should still work
      const result = await $`echo quiet test`.quiet();
      expect(result.stdout.trim()).toBe('quiet test');
    });

    test('should support pipe method', async () => {
      // ProcessPromise has a pipe method
      const firstCommand = $`echo hello world`;
      expect(typeof firstCommand.pipe).toBe('function');
      
      // Test actual piping
      const pipedResult = await $`echo hello world`.pipe`grep world`;
      expect(pipedResult.stdout.trim()).toBe('hello world');
      expect(pipedResult.exitCode).toBe(0);
    });
  });

  describe('config property', () => {
    test('should get and set configuration', () => {
      const initialConfig = $.config.get();
      expect(initialConfig).toBeDefined();
      expect(initialConfig.throwOnNonZeroExit).toBe(true);
      expect(initialConfig.defaultTimeout).toBe(30000);
      
      // Set new config
      $.config.set({ defaultTimeout: 60000 });
      const updatedConfig = $.config.get();
      expect(updatedConfig.defaultTimeout).toBe(60000);
    });

    test('should support pwd method', () => {
      const cwd = $.pwd();
      expect(cwd).toBe(process.cwd());
    });
  });

  describe('error handling', () => {
    test('should handle CommandError properly', async () => {
      const run = createCallableEngine(new ExecutionEngine());
      try {
        await expect(run.with({ shell: false }).exec(process.execPath, { args: ['-e', 'process.stderr.write("failure"); process.exit(123)'] }))
          .rejects.toMatchObject({ name: 'CommandError', exitCode: 123, stderr: 'failure' });
      } finally { await run.dispose(); }
    });

    test('should handle TimeoutError properly', async () => {
      const run = createCallableEngine(new ExecutionEngine());
      try {
        const { TimeoutError } = await import('../../../src/index.js');
        await expect(run.with({ shell: false, timeout: '50ms' }).exec(process.execPath, { args: ['-e', 'setInterval(() => {}, 1000)'] }))
          .rejects.toBeInstanceOf(TimeoutError);
      } finally { await run.dispose(); }
    });

    test('should work with try-catch for error handling', async () => {
      const run = createCallableEngine(new ExecutionEngine());
      let caught: unknown;
      try {
        await run.with({ shell: false }).exec(process.execPath, { args: ['-e', 'process.exit(1)'] });
      } catch (error) { caught = error; }
      finally { await run.dispose(); }
      expect(caught).toMatchObject({ name: 'CommandError', exitCode: 1 });
    });
  });

  describe('advanced features', () => {
    test('should support command interpolation', async () => {
      const filename = 'README.md';
      const result = await $`echo ${filename}`;
      expect(result.stdout.trim()).toBe('README.md');
    });

    test('should support array interpolation', async () => {
      const files = ['file1.txt', 'file2.txt'];
      const result = await $`echo ${files}`;
      expect(result.stdout.trim()).toBe('file1.txt file2.txt');
    });

    test('should support multiple environment variables', async () => {
      const result = await $.env({ 
        VAR1: 'value1',
        VAR2: 'value2' 
      })`sh -c "echo $VAR1 $VAR2"`;
      expect(result.stdout.trim()).toBe('value1 value2');
    });

    test('should chain multiple operations', async () => {
      const chained = $
        .env({ CHAIN_TEST: 'chained' })
        .timeout(5000)
        .cd(tempRoot());
      // Directory and variable read from the runtime: `pwd` is absent from
      // cmd, `&&` and `$VAR` are POSIX, and none of that is what chaining
      // is being asked about.
      const result = await chained`node -e ${joinArgs()} ${'x'}`;
      const cwd = await cwdOf(chained);

      expect(cwd).toBe(tempRoot());
      expect(result.exitCode).toBe(0);
      expect(await runNode(chained, readEnv('CHAIN_TEST'))).toBe('chained');
    });

    test('should support within for temporary context', async () => {
      const { within } = await import('../../../src/index.js');
      
      let innerEnv = '';

      // Test that within changes environment context
      await within({ defaultEnv: { WITHIN_TEST: 'inside' } }, async () => {
        const result = await $`sh -c "echo $WITHIN_TEST"`;
        innerEnv = result.stdout.trim();
      });

      // Outside of within, env var should not exist
      const outerResult = await $`sh -c "echo $WITHIN_TEST"`;
      const outerEnv = outerResult.stdout.trim();
      
      expect(innerEnv).toBe('inside');
      expect(outerEnv).toBe('');
    });
  });

  describe('proxy behavior', () => {
    test('should lazily initialize engine', async () => {
      // Clean up current engine first
      await dispose();
      
      // Import fresh $ to test lazy initialization
      vi.resetModules();
      const freshModule = await import('../../../src/index.js');
      const fresh$ = freshModule.$;
      
      // First access should initialize
      const result = await fresh$`echo initialized`;
      expect(result.stdout.trim()).toBe('initialized');
    });

    test('should handle unknown properties gracefully', () => {
      const unknownProp = ($ as any).nonExistentMethod;
      expect(unknownProp).toBeUndefined();
    });

    test('should bind methods correctly', async () => {
      const { execute } = $;
      const result = await execute({ command: 'echo', args: ['bound method'] });
      expect(result.stdout.trim()).toBe('bound method');
    });
  });
});