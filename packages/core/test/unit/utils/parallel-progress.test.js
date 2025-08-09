import { it, jest, expect, describe, beforeEach } from '@jest/globals';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { parallel, ParallelEngine } from '../../../src/utils/parallel.js';
class MockExecutionEngine {
    constructor(delay = 10, shouldFail = false) {
        this.delay = delay;
        this.shouldFail = shouldFail;
    }
    async execute(command) {
        if (command.signal) {
            const abortPromise = new Promise((_, reject) => {
                command.signal.addEventListener('abort', () => {
                    reject(new Error('Command aborted due to timeout'));
                });
            });
            const delayPromise = new Promise(resolve => setTimeout(resolve, this.delay));
            await Promise.race([delayPromise, abortPromise]);
        }
        else {
            await new Promise(resolve => setTimeout(resolve, this.delay));
        }
        if (this.shouldFail && command.command?.includes('fail')) {
            throw new Error(`Command failed: ${command.command}`);
        }
        return {
            stdout: `Output: ${command.command}`,
            stderr: '',
            exitCode: 0,
            signal: undefined,
            command: command.command || '',
            duration: this.delay,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'mock',
            toString: () => `Output: ${command.command}`,
            toJSON: () => ({ stdout: `Output: ${command.command}`, stderr: '', exitCode: 0 }),
            throwIfFailed: () => { },
            ok: true
        };
    }
}
describe('Parallel Execution with Progress', () => {
    let mockEngine;
    beforeEach(() => {
        mockEngine = new MockExecutionEngine(10);
    });
    describe('onProgress callback', () => {
        it('should call onProgress for each completed command', async () => {
            const progressUpdates = [];
            const commands = ['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'];
            await parallel(commands, mockEngine, {
                onProgress: (completed, total, succeeded, failed) => {
                    progressUpdates.push({ completed, total, succeeded, failed });
                }
            });
            expect(progressUpdates.length).toBe(commands.length);
            progressUpdates.forEach((update, index) => {
                expect(update.completed).toBe(index + 1);
                expect(update.total).toBe(commands.length);
                expect(update.succeeded).toBe(index + 1);
                expect(update.failed).toBe(0);
            });
        });
        it('should track failed commands in progress', async () => {
            const failEngine = new MockExecutionEngine(10, true);
            const progressUpdates = [];
            const commands = ['cmd1', 'fail1', 'cmd2', 'fail2', 'cmd3'];
            await parallel(commands, failEngine, {
                stopOnError: false,
                onProgress: (completed, total, succeeded, failed) => {
                    progressUpdates.push({ completed, succeeded, failed });
                }
            });
            const lastUpdate = progressUpdates[progressUpdates.length - 1];
            expect(lastUpdate).toBeDefined();
            expect(lastUpdate?.completed).toBe(5);
            expect(lastUpdate?.succeeded).toBe(3);
            expect(lastUpdate?.failed).toBe(2);
        });
        it('should call onProgress with limited concurrency', async () => {
            const progressUpdates = [];
            const commands = Array(10).fill(null).map((_, i) => `cmd${i}`);
            await parallel(commands, mockEngine, {
                maxConcurrency: 2,
                onProgress: (completed) => {
                    progressUpdates.push(completed);
                }
            });
            expect(progressUpdates.length).toBe(10);
            progressUpdates.forEach((completed, index) => {
                expect(completed).toBe(index + 1);
            });
        });
        it('should not call onProgress if not provided', async () => {
            const result = await parallel(['cmd1', 'cmd2', 'cmd3'], mockEngine, { maxConcurrency: 2 });
            expect(result.succeeded.length).toBe(3);
        });
    });
    describe('batch method', () => {
        it('should execute commands with batch method', async () => {
            const engine = new ExecutionEngine();
            const progressUpdates = [];
            const mockSettled = jest.fn().mockImplementation(async (commands, options) => {
                const total = commands.length;
                for (let i = 1; i <= total; i++) {
                    if (options?.onProgress) {
                        options.onProgress(i, total, i, 0);
                    }
                }
                return {
                    results: commands.map((cmd) => ({
                        stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
                        stderr: '',
                        exitCode: 0,
                        signal: undefined,
                        command: typeof cmd === 'string' ? cmd : cmd.command || '',
                        duration: 10,
                        startedAt: new Date(),
                        finishedAt: new Date(),
                        adapter: 'mock',
                        toString: () => `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
                        toJSON: () => ({ stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`, stderr: '', exitCode: 0 }),
                        throwIfFailed: () => { },
                        ok: true
                    })),
                    succeeded: commands.map((cmd) => ({
                        stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
                        stderr: '',
                        exitCode: 0,
                        signal: undefined,
                        command: typeof cmd === 'string' ? cmd : cmd.command || '',
                        duration: 10,
                        startedAt: new Date(),
                        finishedAt: new Date(),
                        adapter: 'mock',
                        toString: () => `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`,
                        toJSON: () => ({ stdout: `Output: ${typeof cmd === 'string' ? cmd : cmd.command}`, stderr: '', exitCode: 0 }),
                        throwIfFailed: () => { },
                        ok: true
                    })),
                    failed: [],
                    duration: 100
                };
            });
            engine.parallel.settled = mockSettled;
            const result = await engine.batch(['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'], {
                concurrency: 2,
                onProgress: (completed) => {
                    progressUpdates.push(completed);
                }
            });
            expect(mockSettled).toHaveBeenCalledWith(['cmd1', 'cmd2', 'cmd3', 'cmd4', 'cmd5'], expect.objectContaining({
                maxConcurrency: 2
            }));
            expect(result.succeeded.length).toBe(5);
            expect(progressUpdates).toEqual([1, 2, 3, 4, 5]);
        });
        it('should use default concurrency if not specified', async () => {
            const engine = new ExecutionEngine();
            const mockSettled = jest.fn().mockResolvedValue({
                results: [],
                succeeded: [],
                failed: [],
                duration: 0
            });
            engine.parallel.settled = mockSettled;
            await engine.batch(['cmd1', 'cmd2']);
            expect(mockSettled).toHaveBeenCalledWith(['cmd1', 'cmd2'], expect.objectContaining({
                maxConcurrency: 5
            }));
        });
    });
    describe('Progress tracking with different scenarios', () => {
        it('should handle empty command list', async () => {
            const progressCalls = [];
            const result = await parallel([], mockEngine, {
                onProgress: (completed) => {
                    progressCalls.push(completed);
                }
            });
            expect(progressCalls.length).toBe(0);
            expect(result.succeeded.length).toBe(0);
        });
        it('should handle single command', async () => {
            let progressCalled = false;
            await parallel(['single-cmd'], mockEngine, {
                onProgress: (completed, total, succeeded, failed) => {
                    progressCalled = true;
                    expect(completed).toBe(1);
                    expect(total).toBe(1);
                    expect(succeeded).toBe(1);
                    expect(failed).toBe(0);
                }
            });
            expect(progressCalled).toBe(true);
        });
        it('should stop reporting progress on stopOnError', async () => {
            const failEngine = new MockExecutionEngine(10, true);
            const progressUpdates = [];
            const commands = ['cmd1', 'cmd2', 'fail1', 'cmd3', 'cmd4'];
            await parallel(commands, failEngine, {
                stopOnError: true,
                onProgress: (completed) => {
                    progressUpdates.push(completed);
                }
            });
            expect(progressUpdates.length).toBeLessThanOrEqual(3);
        });
        it('should handle timeout with progress tracking', async () => {
            const slowEngine = new MockExecutionEngine(100);
            const progressData = [];
            const result = await parallel(['cmd1', 'cmd2', 'cmd3'], slowEngine, {
                timeout: 50,
                stopOnError: false,
                onProgress: (completed, total, succeeded, failed) => {
                    progressData.push({ completed, total, succeeded, failed });
                }
            });
            expect(progressData.length).toBeGreaterThan(0);
            expect(result.failed.length).toBe(3);
            expect(result.succeeded.length).toBe(0);
            const lastUpdate = progressData[progressData.length - 1];
            expect(lastUpdate).toBeDefined();
            expect(lastUpdate?.completed).toBe(3);
            expect(lastUpdate?.failed).toBe(3);
        });
    });
    describe('ParallelEngine with progress', () => {
        it('should support progress in ParallelEngine.map', async () => {
            const parallelEngine = new ParallelEngine(mockEngine);
            const items = [1, 2, 3, 4, 5];
            const progressUpdates = [];
            const result = await parallelEngine.map(items, (item) => `process-${item}`, {
                maxConcurrency: 2,
                onProgress: (completed) => {
                    progressUpdates.push(completed);
                }
            });
            expect(result.succeeded.length).toBe(5);
            expect(progressUpdates).toEqual([1, 2, 3, 4, 5]);
        });
        it('should support progress in ParallelEngine.settled', async () => {
            const parallelEngine = new ParallelEngine(mockEngine);
            let finalProgress = { completed: 0, total: 0 };
            const result = await parallelEngine.settled(['task1', 'task2', 'task3'], {
                onProgress: (completed, total) => {
                    finalProgress = { completed, total };
                }
            });
            expect(result.succeeded.length).toBe(3);
            expect(finalProgress.completed).toBe(3);
            expect(finalProgress.total).toBe(3);
        });
    });
    describe('ParallelEngine additional methods', () => {
        it('should handle errors in ParallelEngine.all', async () => {
            const failEngine = new MockExecutionEngine(10, true);
            const parallelEngine = new ParallelEngine(failEngine);
            await expect(parallelEngine.all(['cmd1', 'fail1', 'cmd2'])).rejects.toThrow('Command failed: fail1');
        });
        it('should execute race correctly', async () => {
            const varyingDelayEngine = {
                async execute(command) {
                    const delay = command.command === 'fast' ? 10 : 100;
                    await new Promise(resolve => setTimeout(resolve, delay));
                    return {
                        stdout: `Output: ${command.command}`,
                        stderr: '',
                        exitCode: 0,
                        signal: undefined,
                        command: command.command || '',
                        duration: delay,
                        startedAt: new Date(),
                        finishedAt: new Date(),
                        adapter: 'mock',
                        toString: () => `Output: ${command.command}`,
                        toJSON: () => ({ stdout: `Output: ${command.command}`, stderr: '', exitCode: 0 }),
                        throwIfFailed: () => { },
                        ok: true
                    };
                }
            };
            const parallelEngine = new ParallelEngine(varyingDelayEngine);
            const result = await parallelEngine.race(['slow', 'fast', 'slower']);
            expect(result.stdout).toBe('Output: fast');
        });
        it('should filter items based on command success', async () => {
            const filterEngine = {
                async execute(command) {
                    const shouldSucceed = command.command?.includes('pass');
                    if (!shouldSucceed) {
                        throw new Error('Command failed');
                    }
                    return {
                        stdout: 'passed',
                        stderr: '',
                        exitCode: 0,
                        signal: undefined,
                        command: command.command || '',
                        duration: 10,
                        startedAt: new Date(),
                        finishedAt: new Date(),
                        adapter: 'mock',
                        toString: () => 'passed',
                        toJSON: () => ({ stdout: 'passed', stderr: '', exitCode: 0 }),
                        throwIfFailed: () => { },
                        ok: true
                    };
                }
            };
            const parallelEngine = new ParallelEngine(filterEngine);
            const items = ['item1', 'item2', 'item3', 'item4'];
            const filtered = await parallelEngine.filter(items, (item) => item.includes('2') || item.includes('4') ? 'pass' : 'fail');
            expect(filtered).toEqual(['item2', 'item4']);
        });
        it('should check if some commands succeed', async () => {
            const mixedEngine = new MockExecutionEngine(10, true);
            const parallelEngine = new ParallelEngine(mixedEngine);
            const result = await parallelEngine.some(['fail1', 'cmd1', 'fail2']);
            expect(result).toBe(true);
            const allFail = await parallelEngine.some(['fail1', 'fail2', 'fail3']);
            expect(allFail).toBe(false);
        });
        it('should check if every command succeeds', async () => {
            const mixedEngine = new MockExecutionEngine(10, true);
            const parallelEngine = new ParallelEngine(mixedEngine);
            const allSucceed = await parallelEngine.every(['cmd1', 'cmd2', 'cmd3']);
            expect(allSucceed).toBe(true);
            const someFail = await parallelEngine.every(['cmd1', 'fail1', 'cmd2']);
            expect(someFail).toBe(false);
        });
    });
    describe('Edge cases and error handling', () => {
        it('should handle errors with limited concurrency and progress', async () => {
            const failEngine = new MockExecutionEngine(10, true);
            const progressData = [];
            const result = await parallel(['cmd1', 'fail1', 'cmd2', 'fail2', 'cmd3'], failEngine, {
                maxConcurrency: 2,
                stopOnError: false,
                onProgress: (completed, total, succeeded, failed) => {
                    progressData.push({ failed });
                }
            });
            expect(result.failed.length).toBe(2);
            expect(result.succeeded.length).toBe(3);
            expect(progressData.length).toBeGreaterThan(0);
        });
        it('should handle non-throwing errors in commands', async () => {
            const customEngine = {
                async execute(command) {
                    return {
                        stdout: '',
                        stderr: 'Error occurred',
                        exitCode: 1,
                        signal: undefined,
                        command: command.command || '',
                        duration: 10,
                        startedAt: new Date(),
                        finishedAt: new Date(),
                        adapter: 'mock',
                        toString: () => 'Error occurred',
                        toJSON: () => ({ stdout: '', stderr: 'Error occurred', exitCode: 1 }),
                        throwIfFailed: () => { throw new Error('Command failed'); },
                        ok: false
                    };
                }
            };
            const result = await parallel(['cmd1', 'cmd2'], customEngine, { stopOnError: false });
            expect(result.succeeded.length).toBe(2);
            expect(result.failed.length).toBe(0);
            result.results.forEach(r => {
                expect(r.exitCode).toBe(1);
            });
        });
    });
});
//# sourceMappingURL=parallel-progress.test.js.map