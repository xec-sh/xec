import { test, jest, expect, describe, afterEach, beforeEach } from '@jest/globals';
import { globalCache } from '../../../src/utils/cache.js';
import { $, dispose, configure, ExecutionEngine, createCallableEngine } from '../../../src/index.js';
describe('Simplified API', () => {
    let originalConfig;
    beforeEach(async () => {
        await dispose();
        globalCache.clear();
        await new Promise(resolve => setTimeout(resolve, 10));
        configure({
            throwOnNonZeroExit: true,
            defaultTimeout: 30000,
            encoding: 'utf8',
            maxBuffer: 10 * 1024 * 1024
        });
        originalConfig = $.config.get();
    });
    afterEach(async () => {
        await dispose();
        globalCache.clear();
        await new Promise(resolve => setTimeout(resolve, 10));
    });
    describe('$ function', () => {
        test('should execute commands with template literals', async () => {
            const result = await $ `echo "Hello World"`;
            expect(result.stdout.trim()).toBe('Hello World');
            expect(result.exitCode).toBe(0);
        });
        test('should interpolate values in template literals', async () => {
            const name = 'USH';
            const result = await $ `echo "Hello ${name}"`;
            expect(result.stdout.trim()).toBe('Hello USH');
        });
        test.skip('should handle command failure', async () => {
            const config = $.config.get();
            expect(config.throwOnNonZeroExit).toBe(true);
            const result = await $ `exit 42`.nothrow();
            expect(result.exitCode).toBe(42);
            expect(result.ok).toBe(false);
            const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
            const local$ = createCallableEngine(engine);
            const { CommandError } = await import('../../../src/index.js');
            let error;
            try {
                await local$ `exit 42`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(CommandError);
            expect(error.exitCode).toBe(42);
            expect(error.command).toContain('exit 42');
        });
        test('should support method chaining', async () => {
            const result = await $.env({ MY_TEST_VAR: 'my_test_value' }) `sh -c "echo $MY_TEST_VAR"`;
            expect(result.stdout.trim()).toBe('my_test_value');
            expect(result.exitCode).toBe(0);
        });
        test.skip('should support timeout', async () => {
            const engine = new ExecutionEngine();
            const local$ = createCallableEngine(engine);
            const { AdapterError } = await import('../../../src/index.js');
            let error;
            try {
                await local$.timeout(50) `sh -c "while true; do echo waiting; sleep 0.1; done"`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(AdapterError);
            expect(error.message).toMatch(/timed out|timeout/i);
        });
        test('should support cd', async () => {
            const tempDir = '/tmp';
            const cdEngine = $.cd(tempDir);
            const result = await cdEngine `pwd`;
            const expectedPath = result.stdout.trim();
            expect([tempDir, '/private/tmp']).toContain(expectedPath);
        });
    });
    describe('configure function', () => {
        test('should update default configuration', async () => {
            configure({ throwOnNonZeroExit: false });
            const result = await $ `exit 1`;
            expect(result.exitCode).toBe(1);
        });
        test.skip('should apply timeout configuration', async () => {
            const engine = new ExecutionEngine({ defaultTimeout: 50 });
            const local$ = createCallableEngine(engine);
            const { AdapterError } = await import('../../../src/index.js');
            let error;
            try {
                await local$ `sh -c "while true; do echo waiting; sleep 0.1; done"`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(AdapterError);
            expect(error.message).toMatch(/timed out|timeout/i);
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
            const { withTempFile, withTempDir, parallel, pipeUtils } = await import('../../../src/index.js');
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
            const { CommandError, TimeoutError, ConnectionError, AdapterError, ExecutionError, DockerError, KubernetesError } = await import('../../../src/index.js');
            expect(CommandError).toBeDefined();
            expect(TimeoutError).toBeDefined();
            expect(ConnectionError).toBeDefined();
            expect(AdapterError).toBeDefined();
            expect(ExecutionError).toBeDefined();
            expect(DockerError).toBeDefined();
            expect(KubernetesError).toBeDefined();
        });
        test('should export adapters for advanced users', async () => {
            const { ExecutionEngine, LocalAdapter, SSHAdapter, DockerAdapter, KubernetesAdapter, RemoteDockerAdapter } = await import('../../../src/index.js');
            expect(ExecutionEngine).toBeDefined();
            expect(LocalAdapter).toBeDefined();
            expect(SSHAdapter).toBeDefined();
            expect(DockerAdapter).toBeDefined();
            expect(KubernetesAdapter).toBeDefined();
            expect(RemoteDockerAdapter).toBeDefined();
        });
        test('should export advanced types', async () => {
            const { DockerContainer, SecurePasswordHandler, SSHKeyValidator } = await import('../../../src/index.js');
            expect(DockerContainer).toBeDefined();
            expect(SecurePasswordHandler).toBeDefined();
            expect(SSHKeyValidator).toBeDefined();
        });
        test('should export helper functions', async () => {
            const { within, withinSync, isDisposable } = await import('../../../src/index.js');
            expect(typeof within).toBe('function');
            expect(typeof withinSync).toBe('function');
            expect(typeof isDisposable).toBe('function');
        });
    });
    describe('additional API methods', () => {
        test('should support raw method', async () => {
            const value = "test_value";
            const result = await $.raw `echo ${value}`;
            expect(result.stdout.trim()).toBe("test_value");
        });
        test('should support retry method', async () => {
            const retryEngine = $.retry({ maxRetries: 2, initialDelay: 10 });
            const testFile = `/tmp/retry-test-${Date.now()}`;
            const result = await retryEngine `sh -c "if [ ! -f ${testFile} ]; then touch ${testFile} && exit 1; else echo success && rm ${testFile}; fi"`.nothrow();
            expect(result.stdout.trim()).toBe('success');
            expect(result.exitCode).toBe(0);
        });
        test('should support shell method', async () => {
            const result = await $.shell('/bin/sh') `echo "Shell test"`;
            expect(result.stdout.trim()).toBe('Shell test');
            expect(result.exitCode).toBe(0);
        });
        test('should support defaults method', async () => {
            const customEngine = $.defaults({
                defaultEnv: { MY_CUSTOM_VAR: 'my_custom_value' }
            });
            const result = await customEngine `sh -c "echo $MY_CUSTOM_VAR"`;
            expect(result.stdout.trim()).toBe('my_custom_value');
            expect(result.exitCode).toBe(0);
        });
        test('should support nothrow method', async () => {
            const result = await $ `exit 123`.nothrow();
            expect(result.exitCode).toBe(123);
            expect(result.ok).toBe(false);
        });
        test('should support quiet method', async () => {
            const result = await $ `echo "quiet test"`.quiet();
            expect(result.stdout.trim()).toBe('quiet test');
        });
        test('should support pipe method', async () => {
            const firstCommand = $ `echo "hello world"`;
            expect(typeof firstCommand.pipe).toBe('function');
            const pipedResult = await $ `echo "hello world"`.pipe `grep world`;
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
        test.skip('should handle CommandError properly', async () => {
            const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
            const local$ = createCallableEngine(engine);
            const { CommandError } = await import('../../../src/index.js');
            let error;
            try {
                await local$ `exit 123`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(CommandError);
            expect(error.exitCode).toBe(123);
            expect(error.command).toContain('exit 123');
        });
        test.skip('should handle TimeoutError properly', async () => {
            const engine = new ExecutionEngine();
            const local$ = createCallableEngine(engine);
            const { TimeoutError, AdapterError } = await import('../../../src/index.js');
            let error;
            try {
                await local$.timeout(50) `sh -c "while true; do echo waiting; sleep 0.1; done"`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(AdapterError);
            expect(error.message).toMatch(/timed out|timeout/i);
            if (error.cause) {
                expect(error.cause).toBeInstanceOf(TimeoutError);
            }
        });
        test.skip('should work with try-catch for error handling', async () => {
            const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
            const local$ = createCallableEngine(engine);
            let caught = false;
            let caughtError;
            try {
                await local$ `sh -c "exit 1"`;
            }
            catch (e) {
                caught = true;
                caughtError = e;
            }
            expect(caught).toBe(true);
            expect(caughtError).toBeDefined();
            expect(caughtError.exitCode).toBe(1);
        });
    });
    describe('advanced features', () => {
        test('should support command interpolation', async () => {
            const filename = 'README.md';
            const result = await $ `echo ${filename}`;
            expect(result.stdout.trim()).toBe('README.md');
        });
        test('should support array interpolation', async () => {
            const files = ['file1.txt', 'file2.txt'];
            const result = await $ `echo ${files}`;
            expect(result.stdout.trim()).toBe('file1.txt file2.txt');
        });
        test('should support multiple environment variables', async () => {
            const result = await $.env({
                VAR1: 'value1',
                VAR2: 'value2'
            }) `sh -c "echo $VAR1 $VAR2"`;
            expect(result.stdout.trim()).toBe('value1 value2');
        });
        test('should chain multiple operations', async () => {
            const result = await $
                .env({ CHAIN_TEST: 'chained' })
                .timeout(5000)
                .cd('/tmp') `sh -c "pwd && echo $CHAIN_TEST"`;
            const lines = result.stdout.trim().split('\n');
            expect(['/tmp', '/private/tmp']).toContain(lines[0]);
            expect(lines[1]).toBe('chained');
        });
        test('should support within for temporary context', async () => {
            const { within } = await import('../../../src/index.js');
            let innerEnv = '';
            let outerEnv = '';
            await within({ defaultEnv: { WITHIN_TEST: 'inside' } }, async () => {
                const result = await $ `sh -c "echo $WITHIN_TEST"`;
                innerEnv = result.stdout.trim();
            });
            const outerResult = await $ `sh -c "echo $WITHIN_TEST"`;
            outerEnv = outerResult.stdout.trim();
            expect(innerEnv).toBe('inside');
            expect(outerEnv).toBe('');
        });
    });
    describe('proxy behavior', () => {
        test('should lazily initialize engine', async () => {
            await dispose();
            jest.resetModules();
            const freshModule = await import('../../../src/index.js');
            const fresh$ = freshModule.$;
            const result = await fresh$ `echo "initialized"`;
            expect(result.stdout.trim()).toBe('initialized');
        });
        test('should handle unknown properties gracefully', () => {
            const unknownProp = $.nonExistentMethod;
            expect(unknownProp).toBeUndefined();
        });
        test('should bind methods correctly', async () => {
            const { execute } = $;
            const result = await execute({ command: 'echo', args: ['bound method'] });
            expect(result.stdout.trim()).toBe('bound method');
        });
    });
});
//# sourceMappingURL=simplified-api.test.js.map