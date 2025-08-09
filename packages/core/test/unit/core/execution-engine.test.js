import { Writable } from 'node:stream';
import { it, jest, expect, describe, beforeEach } from '@jest/globals';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { CommandError, TimeoutError } from '../../../src/core/error.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
describe('ExecutionEngine', () => {
    let engine;
    let mockAdapter;
    beforeEach(() => {
        jest.clearAllMocks();
        engine = new ExecutionEngine({
            defaultTimeout: 5000,
            throwOnNonZeroExit: true
        });
        mockAdapter = new MockAdapter();
        mockAdapter.clearMocks();
        engine.registerAdapter('mock', mockAdapter);
    });
    afterEach(() => {
        if (mockAdapter) {
            mockAdapter.clearMocks();
        }
    });
    describe('Initialization and configuration', () => {
        it('should create with default settings', () => {
            const engine = new ExecutionEngine();
            expect(engine.config.get()).toEqual({
                defaultTimeout: 30000,
                throwOnNonZeroExit: true,
                encoding: 'utf8',
                maxBuffer: 10 * 1024 * 1024
            });
        });
        it('should accept custom configuration', () => {
            const customConfig = {
                defaultTimeout: 60000,
                defaultCwd: '/home/user',
                defaultEnv: { NODE_ENV: 'test' },
                adapters: {
                    ssh: {
                        connectionPool: {
                            enabled: true,
                            maxConnections: 5,
                            idleTimeout: 60000,
                            keepAlive: true
                        }
                    }
                }
            };
            const engine = new ExecutionEngine(customConfig);
            expect(engine.config.get()).toMatchObject(customConfig);
        });
        it('should validate configuration', () => {
            expect(() => new ExecutionEngine({ defaultTimeout: -1000 }))
                .toThrow('Invalid timeout value: -1000');
            expect(() => new ExecutionEngine({ encoding: 'invalid' }))
                .toThrow('Unsupported encoding: invalid');
        });
    });
    describe('Adapter selection', () => {
        it('should use LocalAdapter by default', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo test"', 'test output');
            await testEngine.execute({ command: 'echo test' });
            expect(mockAdapter.wasCommandExecuted('sh -c "echo test"')).toBe(true);
        });
        it('should select adapter based on command', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "ls -la"', 'file list');
            await testEngine.execute({
                command: 'ls -la',
                adapter: 'mock'
            });
            expect(mockAdapter.wasCommandExecuted('sh -c "ls -la"')).toBe(true);
        });
    });
    describe('Template literal API', () => {
        it('should parse simple commands correctly', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo "Hello, World!""', 'Hello, World!');
            const result = await testEngine.tag `echo "Hello, World!"`;
            expect(mockAdapter.wasCommandExecuted('sh -c "echo "Hello, World!""')).toBe(true);
            expect(result.stdout).toBe('Hello, World!');
        });
        it('should interpolate and escape values correctly', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const filename = 'my file with spaces.txt';
            const content = 'Hello; rm -rf /';
            mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
            await testEngine.tag `echo ${content} > ${filename}`;
            const commands = mockAdapter.getExecutedCommands();
            expect(commands.length).toBe(1);
            expect(commands[0]).toContain('Hello; rm -rf /');
        });
        it('should support arrays in interpolation', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const files = ['file1.txt', 'file2.txt', 'file with spaces.txt'];
            mockAdapter.mockDefault({ stdout: '', stderr: '', exitCode: 0 });
            await testEngine.tag `rm ${files}`;
            const commands = mockAdapter.getExecutedCommands();
            expect(commands.length).toBe(1);
            expect(commands[0]).toContain('file1.txt');
            expect(commands[0]).toContain('file2.txt');
            expect(commands[0]).toContain('file with spaces.txt');
        });
    });
    describe('Error handling', () => {
        it('should throw error on non-zero exit code when throwOnNonZeroExit = true', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockFailure('sh -c "nonexistent-command"', 'Command not found', 127);
            await expect(testEngine.execute({ command: 'nonexistent-command' }))
                .rejects.toThrow(CommandError);
        });
        it('should not throw error on non-zero exit code when throwOnNonZeroExit = false', async () => {
            const nonThrowingEngine = new ExecutionEngine({ throwOnNonZeroExit: false });
            const nonThrowingMockAdapter = new MockAdapter({ throwOnNonZeroExit: false });
            nonThrowingEngine.registerAdapter('mock', nonThrowingMockAdapter);
            const testEngine = nonThrowingEngine.with({ adapter: 'mock' });
            nonThrowingMockAdapter.mockFailure('sh -c "cat /etc/shadow"', 'Permission denied', 1);
            const result = await testEngine.execute({ command: 'cat /etc/shadow' });
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe('Permission denied');
        });
        it('should handle timeouts', async () => {
            const timeoutAdapter = new MockAdapter();
            const timeoutEngine = new ExecutionEngine({ defaultTimeout: 10000 });
            timeoutEngine.registerAdapter('mock', timeoutAdapter);
            const testEngine = timeoutEngine.with({ adapter: 'mock' });
            timeoutAdapter.mockCommand('sh -c "timeout-test"', {
                error: new TimeoutError('sh -c "timeout-test"', 5000)
            });
            await expect(testEngine.execute({
                command: 'timeout-test',
                timeout: 5000
            })).rejects.toThrow(TimeoutError);
            timeoutAdapter.clearMocks();
        });
    });
    describe('Configuration chaining', () => {
        it('should create new instance with changed config via with()', () => {
            const newEngine = engine.with({
                env: { NODE_ENV: 'production' },
                cwd: '/app'
            });
            expect(newEngine).not.toBe(engine);
            expect(engine.config.get().defaultEnv).toBeUndefined();
        });
        it('should support multiple chains', async () => {
            const prod = engine
                .env({ NODE_ENV: 'production' })
                .cd('/app')
                .timeout(60000)
                .with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "pwd"', '/app');
            await prod.execute({ command: 'pwd' });
            const commands = mockAdapter.getExecutedCommands();
            expect(commands).toContain('sh -c "pwd"');
        });
    });
    describe('Utility methods', () => {
        it('should check command availability with which()', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "which git"', '/usr/bin/git\n');
            const path = await testEngine.which('git');
            expect(path).toBe('/usr/bin/git');
        });
        it('should return null for unavailable commands', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockFailure('sh -c "which nonexistent"', '', 1);
            const path = await testEngine.which('nonexistent');
            expect(path).toBeNull();
        });
        it('should check command availability with isCommandAvailable()', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "which node"', '/usr/bin/node\n');
            const available = await testEngine.isCommandAvailable('node');
            expect(available).toBe(true);
        });
    });
    describe('Adapter management', () => {
        it('should register custom adapters', () => {
            const customAdapter = new MockAdapter();
            engine.registerAdapter('custom', customAdapter);
            const retrieved = engine.getAdapter('custom');
            expect(retrieved).toBe(customAdapter);
        });
        it('should return undefined for non-existent adapters', () => {
            const adapter = engine.getAdapter('nonexistent');
            expect(adapter).toBeUndefined();
        });
    });
    describe('run vs tag methods', () => {
        it('should have tag as alias for run', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo test"', 'test');
            const runResult = await testEngine.run `echo test`;
            const tagResult = await testEngine.tag `echo test`;
            expect(mockAdapter.getCommandExecutionCount('sh -c "echo test"')).toBe(2);
            expect(runResult.stdout).toBe('test');
            expect(tagResult.stdout).toBe('test');
        });
    });
    describe('stdin support', () => {
        it('should pass string stdin via with()', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "cat"', 'Hello, World!');
            const result = await testEngine.with({ stdin: 'Hello, World!' }).run `cat`;
            expect(result.stdout).toBe('Hello, World!');
            expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
        });
        it('should pass Buffer stdin via with()', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const buffer = Buffer.from('binary data');
            mockAdapter.mockSuccess('sh -c "cat"', 'binary data');
            const result = await testEngine.with({ stdin: buffer }).run `cat`;
            expect(result.stdout).toBe('binary data');
            expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
        });
        it('should pass stdin with other options', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('/bin/bash -c "process-data"', 'processed');
            const result = await testEngine.with({
                stdin: 'input data',
                cwd: '/tmp',
                timeout: 5000,
                shell: '/bin/bash'
            }).run `process-data`;
            expect(result.stdout).toBe('processed');
            expect(mockAdapter.wasCommandExecuted('/bin/bash -c "process-data"')).toBe(true);
        });
        it('should handle piping between commands', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo \\"Line 1\\\\nLine 2\\\\nLine 3\\""', 'Line 1\nLine 2\nLine 3');
            mockAdapter.mockSuccess('sh -c "sort"', 'Line 1\nLine 2\nLine 3');
            const data = await testEngine.run `echo "Line 1\nLine 2\nLine 3"`;
            const sorted = await testEngine.with({ stdin: data.stdout }).run `sort`;
            expect(sorted.stdout).toBe('Line 1\nLine 2\nLine 3');
            expect(mockAdapter.wasCommandExecuted('sh -c "sort"')).toBe(true);
        });
        it('should support chaining with() calls', async () => {
            const testEngine = engine
                .with({ adapter: 'mock' })
                .with({ stdin: 'test input' })
                .with({ cwd: '/tmp' });
            mockAdapter.mockSuccess('sh -c "cat"', 'test input');
            const result = await testEngine.run `cat`;
            expect(result.stdout).toBe('test input');
            expect(mockAdapter.wasCommandExecuted('sh -c "cat"')).toBe(true);
        });
    });
    describe('ProcessPromise methods', () => {
        it('should support nothrow() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockFailure('sh -c "exit 42"', 'Failed', 42);
            const promise = testEngine.run `exit 42`;
            const result = await promise.nothrow();
            expect(result.exitCode).toBe(42);
            expect(result.ok).toBe(false);
        });
        it('should support quiet() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo test"', 'test');
            const promise = testEngine.run `echo test`;
            const result = await promise.quiet();
            expect(result.stdout).toBe('test');
        });
        it('should support timeout() method on ProcessPromise', async () => {
            const isolatedEngine = new ExecutionEngine({ defaultTimeout: 10000 });
            const isolatedAdapter = new MockAdapter();
            isolatedEngine.registerAdapter('mock', isolatedAdapter);
            const testEngine = isolatedEngine.with({ adapter: 'mock' });
            isolatedAdapter.mockCommand('sh -c "timeout-promise-test"', {
                stdout: 'success',
                stderr: '',
                exitCode: 0,
                delay: 10
            });
            const promise = testEngine.run `timeout-promise-test`;
            expect(typeof promise.timeout).toBe('function');
            const result = await promise.timeout(1000);
            expect(result.stdout).toBe('success');
            isolatedAdapter.clearMocks();
        });
        it('should support env() method on ProcessPromise', async () => {
            const isolatedEngine = new ExecutionEngine();
            const isolatedAdapter = new MockAdapter();
            isolatedEngine.registerAdapter('mock', isolatedAdapter);
            const testEngine = isolatedEngine.with({ adapter: 'mock' });
            isolatedAdapter.mockSuccess('sh -c "echo $TEST_VAR"', 'test_value');
            const promise = testEngine.run `echo $TEST_VAR`;
            const result = await promise.env({ TEST_VAR: 'test_value' });
            expect(result.stdout).toBe('test_value');
            isolatedAdapter.clearMocks();
        });
        it('should support cwd() method on ProcessPromise', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "pwd"', '/tmp');
            const promise = testEngine.run `pwd`;
            const result = await promise.cwd('/tmp');
            expect(result.stdout).toBe('/tmp');
        });
        it('should support shell() method on ProcessPromise', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('/bin/bash -c "echo $BASH_VERSION"', '5.0');
            const promise = testEngine.run `echo $BASH_VERSION`;
            const result = await promise.shell('/bin/bash');
            expect(result.stdout).toBe('5.0');
        });
        it('should support interactive() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "read input && echo $input"', 'user input');
            const promise = testEngine.run `read input && echo $input`;
            const result = await promise.interactive();
            expect(result.stdout).toBe('user input');
        });
        it('should support signal() method for abort', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const controller = new AbortController();
            mockAdapter.mockSuccess('sh -c "sleep 1"', '');
            const promise = testEngine.run `sleep 1`;
            const resultPromise = promise.signal(controller.signal);
            const result = await resultPromise;
            expect(result.exitCode).toBe(0);
        });
    });
    describe('shell configuration', () => {
        it('should use specific shell when configured', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('/bin/bash -c "echo $0"', '/bin/bash');
            const result = await testEngine.shell('/bin/bash').run `echo $0`;
            expect(mockAdapter.wasCommandExecuted('/bin/bash -c "echo $0"')).toBe(true);
            expect(result.stdout).toBe('/bin/bash');
        });
        it('should disable shell when shell(false) is used', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('/usr/bin/node --version', 'v18.0.0');
            const $noshell = testEngine.shell(false);
            const result = await $noshell.run `/usr/bin/node --version`;
            expect(mockAdapter.wasCommandExecuted('/usr/bin/node --version')).toBe(true);
            expect(result.stdout).toBe('v18.0.0');
        });
        it('should allow using execute() with shell(false) for separate command and args', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('node --version', 'v18.0.0');
            const result = await testEngine.shell(false).execute({
                command: 'node',
                args: ['--version']
            });
            expect(mockAdapter.wasCommandExecuted('node --version')).toBe(true);
            expect(result.stdout).toBe('v18.0.0');
        });
        it('should not perform shell interpolation when shell(false)', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('echo $HOME', '$HOME');
            const $noshell = testEngine.shell(false);
            const result = await $noshell.run `echo $HOME`;
            expect(mockAdapter.wasCommandExecuted('echo $HOME')).toBe(true);
            expect(result.stdout).toBe('$HOME');
        });
        it('should support chaining shell() with other methods', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('/bin/zsh -c "echo $ZSH_VERSION"', '5.8');
            const result = await testEngine
                .shell('/bin/zsh')
                .env({ CUSTOM_VAR: 'test' })
                .cd('/tmp')
                .run `echo $ZSH_VERSION`;
            expect(mockAdapter.wasCommandExecuted('/bin/zsh -c "echo $ZSH_VERSION"')).toBe(true);
            expect(result.stdout).toBe('5.8');
        });
        it('should not have .args() method on command result', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "node"', '');
            const commandPromise = testEngine.run `node`;
            expect(typeof commandPromise.args).toBe('undefined');
            expect(typeof commandPromise.shell).toBe('function');
            expect(typeof commandPromise.args).toBe('undefined');
        });
        it('should work with secure configuration pattern', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const $secure = testEngine.with({
                shell: false,
                timeout: 30000
            });
            mockAdapter.mockSuccess('rm -rf /tmp/test', '');
            const result = await $secure.execute({
                command: 'rm',
                args: ['-rf', '/tmp/test']
            });
            expect(mockAdapter.wasCommandExecuted('rm -rf /tmp/test')).toBe(true);
            expect(result.exitCode).toBe(0);
        });
    });
    describe('Additional ExecutionEngine methods', () => {
        it('should support pwd() method', () => {
            const cwd = engine.pwd();
            expect(cwd).toBe(process.cwd());
            const engineWithCwd = engine.cd('/tmp');
            expect(engineWithCwd.pwd()).toBe('/tmp');
        });
        it('should support timeout() method', async () => {
            const isolatedEngine = new ExecutionEngine({ defaultTimeout: 5000 });
            const testEngine = isolatedEngine.timeout(100);
            expect(testEngine).toBeDefined();
            expect(testEngine).not.toBe(isolatedEngine);
            expect(testEngine).toBeInstanceOf(ExecutionEngine);
        });
        it('should support retry() method', async () => {
            const testEngine = engine.retry({ maxRetries: 2 }).with({ adapter: 'mock' });
            expect(testEngine).toBeDefined();
            expect(testEngine).not.toBe(engine);
        });
        it('should support defaults() method', async () => {
            const isolatedEngine = new ExecutionEngine();
            const customEngine = isolatedEngine.defaults({
                defaultEnv: { CUSTOM_VAR: 'custom_value' }
            });
            const newMockAdapter = new MockAdapter();
            customEngine.registerAdapter('mock', newMockAdapter);
            const testEngine = customEngine.with({ adapter: 'mock' });
            newMockAdapter.mockDefault({ stdout: 'custom_value', stderr: '', exitCode: 0 });
            const result = await testEngine.run `echo $CUSTOM_VAR`;
            expect(result.stdout).toBe('custom_value');
            newMockAdapter.clearMocks();
        });
        it('should support raw() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            const value = "test'value";
            mockAdapter.mockSuccess("sh -c \"echo test'value\"", "test'value");
            const result = await testEngine.raw `echo ${value}`;
            expect(result.stdout).toBe("test'value");
        });
        it('should support ssh() method', () => {
            const sshEngine = engine.ssh({ host: 'example.com', username: 'user' });
            expect(sshEngine).toBeDefined();
            expect(typeof sshEngine).toBe('function');
        });
        it('should support docker() method for existing container', () => {
            const dockerEngine = engine.docker({ container: 'my-container' });
            expect(dockerEngine).toBeDefined();
            expect(dockerEngine).toBeInstanceOf(ExecutionEngine);
        });
        it('should support docker() method with image for new container', () => {
            const dockerAdapter = new MockAdapter();
            engine.registerAdapter('docker', dockerAdapter);
            const dockerEngine = engine.docker({ image: 'node:18' });
            expect(dockerEngine).toBeDefined();
            expect(dockerEngine).toBeInstanceOf(ExecutionEngine);
        });
        it('should support k8s() method', () => {
            const k8sContext = engine.k8s();
            expect(k8sContext).toBeDefined();
            expect(typeof k8sContext.pod).toBe('function');
        });
        it('should support remoteDocker() method', () => {
            const remoteEngine = engine.remoteDocker({
                ssh: { host: 'example.com', username: 'user' },
                docker: { container: 'my-container' }
            });
            expect(remoteEngine).toBeDefined();
            expect(remoteEngine).toBeInstanceOf(ExecutionEngine);
        });
        it('should support local() method', () => {
            const localEngine = engine.local();
            expect(localEngine).toBeDefined();
            expect(localEngine).toBeInstanceOf(ExecutionEngine);
        });
        it('should support parallel property', () => {
            expect(engine.parallel).toBeDefined();
            expect(typeof engine.parallel.all).toBe('function');
            expect(typeof engine.parallel.settled).toBe('function');
        });
        it('should support transfer property', () => {
            expect(engine.transfer).toBeDefined();
            expect(typeof engine.transfer.copy).toBe('function');
        });
        it('should support batch() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo 1"', '1');
            mockAdapter.mockSuccess('sh -c "echo 2"', '2');
            mockAdapter.mockSuccess('sh -c "echo 3"', '3');
            const results = await testEngine.batch(['echo 1', 'echo 2', 'echo 3'], { concurrency: 2 });
            expect(results.results).toHaveLength(3);
            expect(results.succeeded.length).toBe(3);
        });
        it('should support config.set() method', () => {
            const testEngine = new ExecutionEngine();
            testEngine.config.set({ defaultTimeout: 60000 });
            expect(testEngine.config.get().defaultTimeout).toBe(60000);
            testEngine.config.set({ defaultEnv: { TEST: 'value' } });
            expect(testEngine.config.get().defaultEnv).toEqual({ TEST: 'value' });
        });
        it('should support dispose() method', async () => {
            const testEngine = new ExecutionEngine();
            await expect(testEngine.dispose()).resolves.toBeUndefined();
        });
        it('should emit events when enabled', async () => {
            const testEngine = new ExecutionEngine({ enableEvents: true });
            const mockAdapter = new MockAdapter();
            testEngine.registerAdapter('mock', mockAdapter);
            const events = [];
            testEngine.on('command:start', (event) => {
                events.push({ type: 'start', event });
            });
            testEngine.on('command:complete', (event) => {
                events.push({ type: 'complete', event });
            });
            testEngine.on('command:error', (event) => {
                events.push({ type: 'error', event });
            });
            mockAdapter.mockSuccess('sh -c "echo test"', 'test');
            const result = await testEngine.execute({ command: 'echo test', adapter: 'mock' });
            expect(result.stdout).toBe('test');
            expect(result.exitCode).toBe(0);
            expect(events.length).toBeGreaterThanOrEqual(2);
            expect(events.some(e => e.type === 'start')).toBe(true);
            expect(events.some(e => e.type === 'complete')).toBe(true);
        });
        it('should disable events when enableEvents is false', async () => {
            const testEngine = new ExecutionEngine({ enableEvents: false });
            const mockAdapter = new MockAdapter();
            testEngine.registerAdapter('mock', mockAdapter);
            const events = [];
            testEngine.on('command:start', (event) => events.push(event));
            mockAdapter.mockSuccess('sh -c "echo test"', 'test');
            await testEngine.with({ adapter: 'mock' }).run `echo test`;
            expect(events).toHaveLength(0);
        });
        it('should handle cd with ~ expansion', () => {
            const homeEngine = engine.cd('~');
            expect(homeEngine.pwd()).toBe(process.env['HOME'] || process.env['USERPROFILE'] || '~');
        });
        it('should handle cd with relative paths', () => {
            const relativeEngine = engine.cd('./test');
            expect(relativeEngine.pwd()).toBe(path.resolve(process.cwd(), './test'));
        });
        it('should support interactive utilities', () => {
            expect(typeof engine.question).toBe('function');
            expect(typeof engine.prompt).toBe('function');
            expect(typeof engine.password).toBe('function');
            expect(typeof engine.confirm).toBe('function');
            expect(typeof engine.select).toBe('function');
            expect(typeof engine.spinner).toBe('function');
        });
        it('should support within utilities', () => {
            expect(typeof engine.within).toBe('function');
            expect(typeof engine.withinSync).toBe('function');
        });
        it('should handle validateConfig with edge cases', () => {
            expect(() => new ExecutionEngine({ maxBuffer: -1 }))
                .toThrow('Invalid buffer size: -1');
            expect(() => new ExecutionEngine({ maxEventListeners: 0 }))
                .toThrow('Invalid max event listeners: 0');
        });
        it('should support templates', () => {
            const templates = engine.templates;
            expect(templates).toBeDefined();
            expect(typeof templates.register).toBe('function');
            expect(typeof templates.get).toBe('function');
            expect(typeof templates.render).toBe('function');
            expect(typeof templates.create).toBe('function');
            expect(typeof templates.parse).toBe('function');
        });
        it('should handle ProcessPromise pipe() to writable stream', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "echo test"', 'test');
            const promise = testEngine.run `echo test`;
            const chunks = [];
            const mockStream = new Writable({
                write(chunk, encoding, callback) {
                    chunks.push(chunk.toString());
                    callback();
                }
            });
            const result = await promise.pipe(mockStream);
            expect(result.stdout).toBe('test');
            expect(chunks.join('')).toBe('test');
        });
        it('should support ProcessPromise kill() method', async () => {
            const testEngine = engine.with({ adapter: 'mock' });
            mockAdapter.mockSuccess('sh -c "sleep 10"', '');
            const promise = testEngine.run `sleep 10`;
            expect(typeof promise.kill).toBe('function');
        });
    });
});
import * as path from 'node:path';
describe('ExecutionEngine - Isolated Tests', () => {
    it('should support env() method on ProcessPromise', async () => {
        const envMockAdapter = new MockAdapter();
        const envEngine = new ExecutionEngine({
            defaultTimeout: 5000,
            throwOnNonZeroExit: true
        });
        envEngine.registerAdapter('mock', envMockAdapter);
        const testEngine = envEngine.with({ adapter: 'mock' });
        envMockAdapter.mockDefault({ stdout: 'test_value', stderr: '', exitCode: 0 });
        const promise = testEngine.run `echo $TEST_VAR`;
        const result = await promise.env({ TEST_VAR: 'test_value' });
        expect(result.stdout).toBe('test_value');
    });
    it('should support defaults() method', async () => {
        const engine = new ExecutionEngine({
            defaultTimeout: 5000,
            throwOnNonZeroExit: true
        });
        const customEngine = engine.defaults({
            defaultEnv: { CUSTOM_VAR: 'custom_value' }
        });
        const newMockAdapter = new MockAdapter();
        customEngine.registerAdapter('mock', newMockAdapter);
        const testEngine = customEngine.with({ adapter: 'mock' });
        newMockAdapter.mockDefault({ stdout: 'custom_value', stderr: '', exitCode: 0 });
        const result = await testEngine.run `echo $CUSTOM_VAR`;
        expect(result.stdout).toBe('custom_value');
    });
});
//# sourceMappingURL=execution-engine.test.js.map