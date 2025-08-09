import { test, expect, describe } from '@jest/globals';
import { $, ExecutionEngine } from '../../src/index';
import { ExecutionResultImpl } from '../../src/core/result';
import { MockAdapter } from '../../../src/adapters/mock/index';
function createResult(options) {
    return new ExecutionResultImpl(options.stdout, options.stderr, options.exitCode, undefined, options.command, options.duration || 100, new Date(), new Date(), options.adapter || 'local');
}
describe('Retry with Different Adapters', () => {
    describe('MockAdapter with retry', () => {
        test('should retry with MockAdapter', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts < 3) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'Service temporarily unavailable',
                            adapter: 'mock'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Service is up!',
                        stderr: '',
                        adapter: 'mock'
                    });
                },
                async isAvailable() { return true; }
            };
            const engine = new ExecutionEngine();
            engine.registerAdapter('mock', mockAdapter);
            const result = await engine.execute({
                command: 'flaky-service',
                adapter: 'mock',
                retry: {
                    maxRetries: 3,
                    initialDelay: 10,
                    isRetryable: (result) => result.stderr.includes('temporarily unavailable')
                }
            });
            expect(attempts).toBe(3);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Service is up!');
        });
        test('should respect MockAdapter error configuration', async () => {
            const mockAdapter = new MockAdapter();
            mockAdapter.mockFailure(/.*/, 'Mock network error', 1);
            const engine = new ExecutionEngine();
            engine.registerAdapter('mock', mockAdapter);
            const result = await engine.execute({
                command: 'test-command',
                adapter: 'mock',
                retry: {
                    maxRetries: 2,
                    initialDelay: 10
                },
                nothrow: true
            });
            expect(result.exitCode).not.toBe(0);
        });
    });
    describe('Adapter-specific retry patterns', () => {
        test('SSH adapter retry pattern', async () => {
            const sshAdapter = {
                async execute(cmd) {
                    const sshErrors = [
                        { stderr: 'ssh: connect to host server.com port 22: Connection refused', exitCode: 255 },
                        { stderr: 'ssh: connect to host server.com port 22: Connection timed out', exitCode: 255 },
                        { stderr: '', stdout: 'Connected successfully', exitCode: 0 }
                    ];
                    const attemptIndex = Math.min(this.attempts || 0, sshErrors.length - 1);
                    this.attempts = (this.attempts || 0) + 1;
                    const error = sshErrors[attemptIndex];
                    return createResult({
                        command: cmd.command,
                        exitCode: error.exitCode,
                        stdout: error.stdout || '',
                        stderr: error.stderr || '',
                        adapter: 'ssh'
                    });
                },
                async isAvailable() { return true; },
                attempts: 0
            };
            const engine = new ExecutionEngine();
            engine.registerAdapter('ssh', sshAdapter);
            const result = await engine.execute({
                command: 'echo "Hello from SSH"',
                adapter: 'ssh',
                retry: {
                    maxRetries: 5,
                    initialDelay: 1000,
                    isRetryable: (result) => {
                        const sshRetryableErrors = [
                            'connection refused',
                            'connection timed out',
                            'connection reset by peer',
                            'no route to host',
                            'host key verification failed'
                        ];
                        const stderr = result.stderr.toLowerCase();
                        return result.exitCode === 255 &&
                            sshRetryableErrors.some(error => stderr.includes(error));
                    }
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Connected successfully');
            expect(sshAdapter.attempts).toBe(3);
        });
        test('Docker adapter retry pattern', async () => {
            const dockerAdapter = {
                async execute(cmd) {
                    const dockerErrors = [
                        { stderr: 'docker: Error response from daemon: conflict: container name already in use', exitCode: 125 },
                        { stderr: 'docker: Cannot connect to the Docker daemon. Is the docker daemon running?', exitCode: 1 },
                        { stderr: '', stdout: 'Container started successfully', exitCode: 0 }
                    ];
                    const attemptIndex = Math.min(this.attempts || 0, dockerErrors.length - 1);
                    this.attempts = (this.attempts || 0) + 1;
                    const error = dockerErrors[attemptIndex];
                    return createResult({
                        command: cmd.command,
                        exitCode: error.exitCode,
                        stdout: error.stdout || '',
                        stderr: error.stderr || '',
                        adapter: 'docker'
                    });
                },
                async isAvailable() { return true; },
                attempts: 0
            };
            const engine = new ExecutionEngine();
            engine.registerAdapter('docker', dockerAdapter);
            const result = await engine.execute({
                command: 'docker run myapp',
                adapter: 'docker',
                retry: {
                    maxRetries: 3,
                    initialDelay: 2000,
                    isRetryable: (result) => {
                        const stderr = result.stderr.toLowerCase();
                        if (stderr.includes('image not found') || stderr.includes('no such image')) {
                            return false;
                        }
                        if (stderr.includes('cannot connect to the docker daemon')) {
                            return true;
                        }
                        if (stderr.includes('container name already in use')) {
                            return true;
                        }
                        return result.exitCode === 125;
                    }
                }
            });
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Container started successfully');
            expect(dockerAdapter.attempts).toBe(3);
        });
    });
    describe('Retry with adapter switching', () => {
        test('should retry with fallback adapter', async () => {
            let primaryAttempts = 0;
            let fallbackUsed = false;
            const primaryAdapter = {
                async execute(cmd) {
                    primaryAttempts++;
                    return createResult({
                        command: cmd.command,
                        exitCode: 1,
                        stdout: '',
                        stderr: 'Primary adapter failed',
                        adapter: 'primary'
                    });
                },
                async isAvailable() { return true; }
            };
            const fallbackAdapter = {
                async execute(cmd) {
                    fallbackUsed = true;
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Fallback succeeded',
                        stderr: '',
                        adapter: 'fallback'
                    });
                },
                async isAvailable() { return true; }
            };
            const engine = new ExecutionEngine();
            engine.registerAdapter('local', primaryAdapter);
            engine.registerAdapter('mock', fallbackAdapter);
            const result1 = await engine.execute({
                command: 'test-command',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 10
                },
                nothrow: true
            });
            expect(primaryAttempts).toBe(3);
            expect(result1.exitCode).toBe(1);
            const result2 = await engine.execute({
                command: 'test-command',
                adapter: 'mock'
            });
            expect(fallbackUsed).toBe(true);
            expect(result2.exitCode).toBe(0);
            expect(result2.stdout).toBe('Fallback succeeded');
        });
    });
    describe('Retry with template literals', () => {
        test('should work with template literal syntax', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts === 1) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'Temporary failure'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Hello, World!',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            const $reliable = $.retry({
                maxRetries: 2,
                initialDelay: 10
            });
            $reliable.registerAdapter('local', mockAdapter);
            const name = 'World';
            const result = await $reliable `echo "Hello, ${name}!"`;
            expect(attempts).toBe(2);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Hello, World!');
        });
    });
    describe('Performance and timing', () => {
        test('should respect delay timing', async () => {
            const attempts = [];
            let attemptCount = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts.push(Date.now());
                    attemptCount++;
                    return createResult({
                        command: cmd.command,
                        exitCode: 1,
                        stdout: '',
                        stderr: 'Error'
                    });
                },
                async isAvailable() { return true; }
            };
            const engine = new ExecutionEngine();
            engine.registerAdapter('local', mockAdapter);
            await engine.execute({
                command: 'test',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 50,
                    backoffMultiplier: 2,
                    jitter: false
                },
                nothrow: true
            });
            expect(attemptCount).toBe(3);
            expect(attempts).toHaveLength(3);
            if (attempts.length >= 3) {
                const delay1 = attempts[1] - attempts[0];
                const delay2 = attempts[2] - attempts[1];
                expect(delay1).toBeGreaterThanOrEqual(45);
                expect(delay1).toBeLessThan(100);
                expect(delay2).toBeGreaterThanOrEqual(90);
                expect(delay2).toBeLessThan(150);
            }
        });
    });
});
//# sourceMappingURL=retry-adapters.test.js.map