import { test, jest, expect, describe, beforeEach } from '@jest/globals';
import { $, ExecutionEngine } from '../../src/index';
import { RetryError } from '../../src/utils/retry-adapter';
import { ExecutionResultImpl } from '../../src/core/result';
function createResult(options) {
    return new ExecutionResultImpl(options.stdout, options.stderr, options.exitCode, undefined, options.command, options.duration || 100, new Date(), new Date(), 'local');
}
describe('Comprehensive Retry Functionality Tests', () => {
    let engine;
    beforeEach(() => {
        engine = new ExecutionEngine();
    });
    describe('Basic retry with ExecutionResult', () => {
        test('should retry on non-zero exit code by default', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts < 3) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'Connection refused'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Success!',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'test-command',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 10
                }
            });
            expect(attempts).toBe(3);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Success!');
        });
    });
    describe('Custom isRetryable logic', () => {
        test('should use custom isRetryable function with ExecutionResult', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts === 1) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'Connection timeout'
                        });
                    }
                    else if (attempts === 2) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'Permission denied'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Never reached',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'test-command',
                adapter: 'local',
                retry: {
                    maxRetries: 3,
                    initialDelay: 10,
                    isRetryable: (result) => result.stderr.includes('timeout')
                },
                nothrow: true
            });
            expect(attempts).toBe(2);
            expect(result.exitCode).toBe(1);
            expect(result.stderr).toBe('Permission denied');
        });
        test('should analyze stdout and stderr in isRetryable', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts === 1) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: 'HTTP 503 Service Unavailable',
                            stderr: ''
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'HTTP 200 OK',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'curl http://api.example.com',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 10,
                    isRetryable: (result) => result.stdout.includes('503') || result.stderr.includes('503')
                }
            });
            expect(attempts).toBe(2);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('HTTP 200 OK');
        });
    });
    describe('Retry with nothrow', () => {
        test('should retry even with nothrow and return last result on failure', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    return createResult({
                        command: cmd.command,
                        exitCode: attempts,
                        stdout: `Attempt ${attempts}`,
                        stderr: 'Always fails'
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'always-fails',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 10
                },
                nothrow: true
            });
            expect(attempts).toBe(3);
            expect(result.exitCode).toBe(3);
            expect(result.stdout).toBe('Attempt 3');
        });
    });
    describe('Retry callbacks', () => {
        test('should call onRetry with ExecutionResult', async () => {
            let attempts = 0;
            const retryCallbacks = [];
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts < 3) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: `Error attempt ${attempts}`
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Success',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'test-command',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 100,
                    backoffMultiplier: 2,
                    jitter: false,
                    onRetry: (attempt, result, delay) => {
                        retryCallbacks.push({ attempt, result, delay });
                    }
                }
            });
            expect(retryCallbacks).toHaveLength(2);
            expect(retryCallbacks[0]?.attempt).toBe(1);
            expect(retryCallbacks[0]?.result.stderr).toBe('Error attempt 1');
            expect(retryCallbacks[0]?.delay).toBe(100);
            expect(retryCallbacks[1]?.attempt).toBe(2);
            expect(retryCallbacks[1]?.result.stderr).toBe('Error attempt 2');
            expect(retryCallbacks[1]?.delay).toBe(200);
        });
    });
    describe('Retry with $.retry() helper', () => {
        test('should create retry-enabled engine with ExecutionResult', async () => {
            const $retry = $.retry({
                maxRetries: 2,
                initialDelay: 10,
                isRetryable: (result) => result.stderr.includes('network') || result.stderr.includes('connection')
            });
            expect($retry).toBeDefined();
            expect($retry).not.toBe($);
            expect(typeof $retry.execute).toBe('function');
        });
        test('should apply retry logic through $.retry() helper', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts === 1) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 1,
                            stdout: '',
                            stderr: 'network unreachable'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Connected',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            const $reliable = $.retry({
                maxRetries: 3,
                initialDelay: 10,
                isRetryable: (result) => result.stderr.includes('network')
            });
            $reliable.registerAdapter('local', mockAdapter);
            const result = await $reliable.execute({
                command: 'ping server',
                adapter: 'local'
            });
            expect(attempts).toBe(2);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toBe('Connected');
        });
    });
    describe('Complex retry scenarios', () => {
        test('should handle memory pressure retry pattern', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    if (attempts === 1) {
                        return createResult({
                            command: cmd.command,
                            exitCode: 137,
                            stdout: '',
                            stderr: 'Killed'
                        });
                    }
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Memory available',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'memory-intensive-task',
                adapter: 'local',
                retry: {
                    maxRetries: 2,
                    initialDelay: 5000,
                    isRetryable: (result) => result.exitCode === 137 || result.stderr.toLowerCase().includes('out of memory')
                }
            });
            expect(attempts).toBe(2);
            expect(result.exitCode).toBe(0);
        });
        test('should handle HTTP status code patterns', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    const responses = [
                        { stdout: '< HTTP/1.1 503 Service Unavailable', stderr: '', exitCode: 22 },
                        { stdout: '< HTTP/1.1 429 Too Many Requests', stderr: '', exitCode: 22 },
                        { stdout: '< HTTP/1.1 200 OK\n{"data": "success"}', stderr: '', exitCode: 0 }
                    ];
                    const response = responses[Math.min(attempts - 1, responses.length - 1)];
                    return createResult({
                        command: cmd.command,
                        exitCode: response.exitCode,
                        stdout: response.stdout,
                        stderr: response.stderr
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'curl -i https://api.example.com',
                adapter: 'local',
                retry: {
                    maxRetries: 5,
                    initialDelay: 1000,
                    backoffMultiplier: 2,
                    isRetryable: (result) => {
                        const statusMatch = result.stdout.match(/HTTP\/\d\.\d (\d{3})/);
                        if (statusMatch) {
                            const status = parseInt(statusMatch[1]);
                            return status >= 500 || status === 429;
                        }
                        return result.exitCode === 22;
                    }
                }
            });
            expect(attempts).toBe(3);
            expect(result.exitCode).toBe(0);
            expect(result.stdout).toContain('200 OK');
        });
    });
    describe('RetryError details', () => {
        test('should include all results in RetryError', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    return createResult({
                        command: cmd.command,
                        exitCode: attempts,
                        stdout: `Stdout ${attempts}`,
                        stderr: `Stderr ${attempts}`
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            try {
                await engine.execute({
                    command: 'always-fails',
                    adapter: 'local',
                    retry: {
                        maxRetries: 2,
                        initialDelay: 10
                    }
                });
                fail('Should have thrown RetryError');
            }
            catch (error) {
                expect(error).toBeInstanceOf(RetryError);
                const retryError = error;
                expect(retryError.attempts).toBe(3);
                expect(retryError.results).toHaveLength(3);
                expect(retryError.lastResult.exitCode).toBe(3);
                expect(retryError.lastResult.stderr).toBe('Stderr 3');
                expect(retryError.results[0]?.stdout).toBe('Stdout 1');
                expect(retryError.results[1]?.stdout).toBe('Stdout 2');
                expect(retryError.results[2]?.stdout).toBe('Stdout 3');
            }
        });
    });
    describe('Edge cases', () => {
        test('should handle zero maxRetries', async () => {
            let attempts = 0;
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    return createResult({
                        command: cmd.command,
                        exitCode: 1,
                        stdout: '',
                        stderr: 'Error'
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'test',
                adapter: 'local',
                retry: {
                    maxRetries: 0
                },
                nothrow: true
            });
            expect(attempts).toBe(1);
            expect(result.exitCode).toBe(1);
        });
        test('should handle immediate success', async () => {
            let attempts = 0;
            const onRetry = jest.fn();
            const mockAdapter = {
                async execute(cmd) {
                    attempts++;
                    return createResult({
                        command: cmd.command,
                        exitCode: 0,
                        stdout: 'Immediate success',
                        stderr: ''
                    });
                },
                async isAvailable() { return true; }
            };
            engine.registerAdapter('local', mockAdapter);
            const result = await engine.execute({
                command: 'test',
                adapter: 'local',
                retry: {
                    maxRetries: 5,
                    onRetry
                }
            });
            expect(attempts).toBe(1);
            expect(onRetry).not.toHaveBeenCalled();
            expect(result.exitCode).toBe(0);
        });
    });
});
//# sourceMappingURL=retry-comprehensive.test.js.map