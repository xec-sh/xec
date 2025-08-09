import { it, expect, describe, beforeEach } from '@jest/globals';
import { within } from '../../src/utils/within.js';
import { CommandError } from '../../src/core/error.js';
import { MockAdapter } from '../../src/adapters/mock/index.js';
import { ExecutionEngine, createCallableEngine } from '../../src/index.js';
describe('Unified Execution Engine - Integration Tests', () => {
    describe('Basic functionality', () => {
        it('should support nothrow mode', async () => {
            const engine = new ExecutionEngine();
            const localCallable$ = createCallableEngine(engine);
            const promise = localCallable$ `exit 1`;
            const result = await promise.nothrow();
            expect(result.exitCode).toBe(1);
            expect(result.ok).toBe(false);
        });
        it('should execute simple commands', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const result = await $ `echo "Hello, World!"`;
            expect(result.stdout.trim()).toBe('Hello, World!');
            expect(result.exitCode).toBe(0);
            expect(result.adapter).toBe('local');
        });
        it('should support template literal interpolation', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const filename = 'test file.txt';
            const result = await $ `echo ${filename}`;
            expect(result.stdout.trim()).toBe('test file.txt');
        });
        it('should handle command failure', async () => {
            const engine = new ExecutionEngine({ throwOnNonZeroExit: true });
            const $ = createCallableEngine(engine);
            let error = null;
            try {
                await $ `exit 1`;
            }
            catch (e) {
                error = e;
            }
            expect(error).toBeInstanceOf(CommandError);
            expect(error?.message).toContain('exit code 1');
        });
        it.skip('should respect global throwOnNonZeroExit configuration', async () => {
            const engine = new ExecutionEngine({ throwOnNonZeroExit: false });
            const local$ = createCallableEngine(engine);
            const result = await local$ `exit 1`;
            expect(result.exitCode).toBe(1);
            expect(result.ok).toBe(false);
        });
    });
    describe('Configuration chaining', () => {
        it('should support method chaining', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const custom$ = $
                .env({ CUSTOM_VAR: 'test' })
                .timeout(5000)
                .shell('bash');
            const result = await custom$.run `echo $CUSTOM_VAR`;
            expect(result.stdout.trim()).toBe('test');
        });
        it('should support cd() for changing directory', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const tmp$ = $.cd('/tmp');
            const result = await tmp$.run `pwd`;
            const expected = result.stdout.trim();
            expect(['/tmp', '/private/tmp']).toContain(expected);
        });
    });
    describe('Mock adapter', () => {
        let mockAdapter;
        let engine;
        let $;
        beforeEach(() => {
            mockAdapter = new MockAdapter();
            engine = new ExecutionEngine();
            engine.registerAdapter('mock', mockAdapter);
            $ = createCallableEngine(engine);
        });
        it('should use mock responses', async () => {
            mockAdapter.mockSuccess('sh -c "ls -la"', 'file1.txt\nfile2.txt');
            const mockEngine = $.with({ adapter: 'mock' });
            const result = await mockEngine.run `ls -la`;
            expect(result.stdout).toBe('file1.txt\nfile2.txt');
            expect(result.exitCode).toBe(0);
            mockAdapter.assertCommandExecuted('sh -c "ls -la"');
        });
        it('should track executed commands', async () => {
            mockAdapter.mockDefault({ stdout: 'ok', exitCode: 0 });
            const mockEngine = $.with({ adapter: 'mock' });
            await mockEngine.run `npm install`;
            await mockEngine.run `npm test`;
            await mockEngine.run `npm build`;
            const commands = mockAdapter.getExecutedCommands();
            expect(commands).toEqual(['sh -c "npm install"', 'sh -c "npm test"', 'sh -c "npm build"']);
        });
        it('should support regex patterns', async () => {
            mockAdapter.mockCommand(/^sh -c "git/, { stdout: 'git output', exitCode: 0 });
            const mockEngine = $.with({ adapter: 'mock' });
            const result1 = await mockEngine.run `git status`;
            const result2 = await mockEngine.run `git pull`;
            expect(result1.stdout).toBe('git output');
            expect(result2.stdout).toBe('git output');
        });
    });
    describe('Adapter selection', () => {
        it('should auto-detect adapter from options', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const sshEngine = $.ssh({
                host: 'example.com',
                username: 'test'
            });
            expect(sshEngine).toBeDefined();
        });
    });
    describe('Utility methods', () => {
        it('should check command availability', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const isAvailable = await engine.isCommandAvailable('echo');
            expect(isAvailable).toBe(true);
            const randomCmd = 'cmd-that-does-not-exist-' + Math.random().toString(36);
            const path = await engine.which(randomCmd);
            expect(path).toBeFalsy();
            const notAvailable = await engine.isCommandAvailable(randomCmd);
            expect(notAvailable).toBe(false);
        });
        it('should find command path with which()', async () => {
            const engine = new ExecutionEngine();
            const echoPath = await engine.which('echo');
            expect(echoPath).toBeTruthy();
            expect(echoPath).toContain('echo');
        });
    });
    describe('Global $ export', () => {
        it('should work with global $ export', async () => {
            const { $ } = await import('../../src/index.js');
            const result = await $ `echo "test"`;
            expect(result.stdout.trim()).toBe('test');
        });
        it('should support chaining with global $', async () => {
            const { $ } = await import('../../src/index.js');
            const custom$ = $.env({ TEST: 'value' });
            const result = await custom$.run `echo $TEST`;
            expect(result.stdout.trim()).toBe('value');
        });
    });
    describe('Shell configuration', () => {
        it('should execute commands with shell', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const result = await $.execute({ command: 'echo "Hello, Shell!"', shell: true });
            expect(result.stdout.trim()).toBe('Hello, Shell!');
        });
        it('should use custom shell', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const $bash = $.shell('/bin/bash');
            const result = await $bash `echo $BASH_VERSION | cut -d. -f1`;
            expect(result.exitCode).toBe(0);
        });
        it('should disable shell', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const $noshell = $.shell(false);
            const result = await $noshell.execute({
                command: 'echo',
                args: ['no shell interpolation: $HOME']
            });
            expect(result.stdout.trim()).toBe('no shell interpolation: $HOME');
        });
    });
    describe('Environment and working directory', () => {
        it('should support environment variables', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const $env = $.env({ MY_VAR: 'hello' });
            const result = await $env `echo $MY_VAR`;
            expect(result.stdout.trim()).toBe('hello');
        });
        it('should chain configurations', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const $configured = $.cd('/tmp').env({ TEST: 'value' }).timeout(5000);
            const result = await $configured `echo "$TEST in $(pwd)"`;
            const output = result.stdout.trim();
            expect(output).toMatch(/^value in \/(private\/)?tmp$/);
        });
    });
    describe('Error handling', () => {
        it('should capture stderr', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const result = await $.execute({
                command: 'echo "error" >&2; exit 0',
                shell: true
            });
            expect(result.stderr.trim()).toBe('error');
            expect(result.exitCode).toBe(0);
        });
    });
    describe('Adapter switching', () => {
        it('should support local adapter explicitly', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const $local = $.local();
            const result = await $local `echo "local test"`;
            expect(result.stdout.trim()).toBe('local test');
        });
    });
    describe('Retry functionality', () => {
        it('should retry failed commands using retry', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            let attempts = 0;
            const $retry = $.retry({
                maxRetries: 2,
                isRetryable: () => true,
                onRetry: (attempt) => {
                    attempts = attempt;
                },
                initialDelay: 10
            });
            const result = await $retry `echo "Success"`;
            expect(result.stdout).toContain('Success');
            expect(attempts).toBe(0);
        });
    });
    describe('Within context integration', () => {
        it('should execute with local context', async () => {
            const engine = new ExecutionEngine();
            const result = await within({ env: { TEST_VAR: 'test-value' } }, async () => engine.execute({ command: 'echo $TEST_VAR', shell: true }));
            expect(result.stdout.trim()).toBe('test-value');
        });
    });
    describe('Parallel execution', () => {
        it('should support parallel execution', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const start = Date.now();
            const results = await Promise.all([
                $ `sleep 0.1 && echo "1"`,
                $ `sleep 0.1 && echo "2"`,
                $ `sleep 0.1 && echo "3"`
            ]);
            const duration = Date.now() - start;
            expect(results[0].stdout.trim()).toBe('1');
            expect(results[1].stdout.trim()).toBe('2');
            expect(results[2].stdout.trim()).toBe('3');
            expect(duration).toBeLessThan(350);
        });
    });
    describe('CI/CD pipeline scenario', () => {
        it('should support CI/CD pipeline scenario', async () => {
            const engine = new ExecutionEngine();
            const mockAdapter = new MockAdapter();
            engine.registerAdapter('mock', mockAdapter);
            const $ciEngine = createCallableEngine(engine);
            mockAdapter.mockSuccess('sh -c "npm test -- --json"', JSON.stringify({
                numFailedTests: 0,
                numPassedTests: 10
            }));
            mockAdapter.mockSuccess('sh -c "git describe --tags --always"', 'v1.2.3');
            mockAdapter.mockSuccess(/^sh -c "docker build/, '');
            mockAdapter.mockSuccess(/^sh -c "docker run/, 'container-id');
            mockAdapter.mockSuccess(/^sh -c "docker rm/, '');
            mockAdapter.mockSuccess(/^sh -c "docker push/, '');
            const $ci = $ciEngine.with({
                env: { NODE_ENV: 'test', CI: 'true' },
                adapter: 'mock'
            });
            const testResults = await $ci `npm test -- --json`;
            const tests = JSON.parse(testResults.stdout);
            expect(tests.numFailedTests).toBe(0);
            const version = await $ci `git describe --tags --always`;
            const tag = `myapp:${version.stdout.trim()}`;
            expect(tag).toBe('myapp:v1.2.3');
            await $ci `docker build -t ${tag} .`;
            const containerName = `test-${Date.now()}`;
            await $ci `docker run -d --name ${containerName} ${tag}`;
            await $ci `docker rm -f ${containerName}`;
            await $ci `docker push ${tag}`;
            const executedCommands = mockAdapter.getExecutedCommands();
            expect(executedCommands).toContain('sh -c "npm test -- --json"');
            expect(executedCommands).toContain('sh -c "git describe --tags --always"');
            expect(executedCommands.some((cmd) => cmd.includes('docker build'))).toBe(true);
            expect(executedCommands.some((cmd) => cmd.includes('docker push'))).toBe(true);
        });
    });
    describe('Runtime detection', () => {
        it('should automatically detect runtime', async () => {
            const engine = new ExecutionEngine();
            const $runtimeEngine = createCallableEngine(engine);
            const result = await $runtimeEngine `echo "Works in any runtime"`;
            expect(result.stdout.trim()).toBe('Works in any runtime');
        });
    });
    describe('Security - automatic escaping', () => {
        it('should automatically escape interpolated values', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const dangerous = "'; rm -rf /; echo '";
            const result = await $ `echo ${dangerous}`;
            expect(result.stdout.trim()).toBe(dangerous);
            expect(result.exitCode).toBe(0);
        });
        it('should properly escape special characters', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const specialChars = '$`"\\';
            const result = await $ `echo ${specialChars}`;
            expect(result.stdout.trim()).toBe(specialChars);
        });
    });
    describe('Process exit behavior', () => {
        it('should handle promises in template interpolation without hanging', async () => {
            const engine = new ExecutionEngine();
            const $ = createCallableEngine(engine);
            const a1 = $ `echo foo`;
            const a2 = new Promise((resolve) => setTimeout(resolve, 20, ['bar', 'baz']));
            const result = await $ `echo ${a1} ${a2}`;
            expect(result.stdout.trim()).toBe('foo bar baz');
            expect(result.exitCode).toBe(0);
        });
    });
});
//# sourceMappingURL=execution-engine.integration.test.js.map