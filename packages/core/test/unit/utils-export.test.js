import { it, jest, expect, describe } from '@jest/globals';
import { retry, within, parallel, pipeUtils, withinSync, RetryError, ParallelEngine } from '../../src/index.js';
describe('Utility Exports', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    it('should export pipeUtils object with utility functions', () => {
        expect(pipeUtils).toBeDefined();
        expect(typeof pipeUtils).toBe('object');
        expect(typeof pipeUtils.toUpperCase).toBe('function');
        expect(typeof pipeUtils.grep).toBe('function');
        expect(typeof pipeUtils.replace).toBe('function');
        expect(typeof pipeUtils.tee).toBe('function');
        const utilKeys = Object.keys(pipeUtils);
        expect(utilKeys.length).toBeGreaterThan(0);
        expect(utilKeys).toContain('toUpperCase');
        expect(utilKeys).toContain('grep');
        expect(utilKeys).toContain('replace');
        expect(utilKeys).toContain('tee');
    });
    it('should export parallel function and ParallelEngine class', () => {
        expect(parallel).toBeDefined();
        expect(typeof parallel).toBe('function');
        expect(ParallelEngine).toBeDefined();
        expect(typeof ParallelEngine).toBe('function');
    });
    it('should export within and withinSync functions', () => {
        expect(within).toBeDefined();
        expect(typeof within).toBe('function');
        expect(withinSync).toBeDefined();
        expect(typeof withinSync).toBe('function');
    });
    it('should export retry function (withExecutionRetry)', () => {
        expect(retry).toBeDefined();
        expect(typeof retry).toBe('function');
    });
    it('should export RetryError class', () => {
        expect(RetryError).toBeDefined();
        expect(typeof RetryError).toBe('function');
        const mockResult = { exitCode: 1, stdout: '', stderr: 'error' };
        const error = new RetryError('Test error', 3, mockResult, [mockResult]);
        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(RetryError);
    });
    it('should have proper function signatures', () => {
        expect(parallel.length).toBe(2);
        expect(within.length).toBe(2);
        expect(withinSync.length).toBe(2);
        expect(retry.length).toBe(1);
        expect(pipeUtils.toUpperCase.length).toBe(0);
        expect(pipeUtils.grep.length).toBe(1);
        expect(pipeUtils.replace.length).toBe(2);
        expect(pipeUtils.tee.length).toBe(0);
    });
    it('should export utility types', () => {
        const testRetryOptions = {
            maxRetries: 3,
            initialDelay: 1000,
            maxDelay: 60000,
            backoffMultiplier: 2,
            jitter: true
        };
        expect(testRetryOptions).toBeDefined();
    });
    describe('Integration', () => {
        it('should test pipe utilities more comprehensively', () => {
            const availableUtils = Object.keys(pipeUtils);
            expect(availableUtils).toContain('toUpperCase');
            expect(availableUtils).toContain('grep');
            expect(availableUtils).toContain('replace');
            expect(availableUtils).toContain('tee');
            expect(availableUtils).toHaveLength(4);
            expect(availableUtils.sort()).toEqual(['grep', 'replace', 'tee', 'toUpperCase']);
            availableUtils.forEach(utilName => {
                const util = pipeUtils[utilName];
                expect(typeof util).toBe('function');
            });
        });
        it('should be able to create a ParallelEngine instance', () => {
            const mockEngine = {
                run: jest.fn(),
                with: jest.fn()
            };
            const parallelEngine = new ParallelEngine(mockEngine);
            expect(parallelEngine).toBeInstanceOf(ParallelEngine);
        });
        it('should use pipeUtils to create transforms', () => {
            const upperTransform = pipeUtils.toUpperCase();
            expect(upperTransform).toBeDefined();
            expect(upperTransform.writable).toBe(true);
            expect(upperTransform.readable).toBe(true);
            const grepTransform = pipeUtils.grep('test');
            expect(grepTransform).toBeDefined();
            expect(grepTransform.writable).toBe(true);
            expect(grepTransform.readable).toBe(true);
            const replaceTransform = pipeUtils.replace('old', 'new');
            expect(replaceTransform).toBeDefined();
            expect(replaceTransform.writable).toBe(true);
            expect(replaceTransform.readable).toBe(true);
            const mockWritable = { write: jest.fn() };
            const teeTransform = pipeUtils.tee(mockWritable);
            expect(teeTransform).toBeDefined();
            expect(teeTransform.writable).toBe(true);
            expect(teeTransform.readable).toBe(true);
        });
        it('should use within function correctly', async () => {
            const testConfig = { defaultTimeout: 5000 };
            const result = await within(testConfig, async () => 42);
            expect(result).toBe(42);
        });
        it('should use withinSync function correctly', () => {
            const testConfig = { defaultTimeout: 5000 };
            const result = withinSync(testConfig, () => 42);
            expect(result).toBe(42);
        });
        it('should handle retry function', async () => {
            let attempts = 0;
            const testFunction = jest.fn(async () => {
                attempts++;
                if (attempts < 2) {
                    return { exitCode: 1, stdout: '', stderr: 'Test error', command: 'test' };
                }
                return { exitCode: 0, stdout: 'success', stderr: '', command: 'test' };
            });
            const result = await retry(testFunction, {
                maxRetries: 3,
                initialDelay: 10
            });
            expect(result.stdout).toBe('success');
            expect(testFunction).toHaveBeenCalledTimes(2);
        });
        it('should handle retry exhaustion', async () => {
            const testFunction = jest.fn(async () => ({ exitCode: 1, stdout: '', stderr: 'Always fails', command: 'test' }));
            await expect(retry(testFunction, {
                maxRetries: 2,
                initialDelay: 10
            })).rejects.toThrow(RetryError);
            expect(testFunction).toHaveBeenCalledTimes(3);
        });
        it('should create parallel engine with proper interface', () => {
            const mockEngine = {
                execute: jest.fn(() => Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })),
                with: jest.fn()
            };
            const parallelEngine = new ParallelEngine(mockEngine);
            expect(typeof parallelEngine.all).toBe('function');
            expect(typeof parallelEngine.settled).toBe('function');
            expect(typeof parallelEngine.race).toBe('function');
            expect(typeof parallelEngine.map).toBe('function');
            expect(typeof parallelEngine.filter).toBe('function');
            expect(typeof parallelEngine.some).toBe('function');
            expect(typeof parallelEngine.every).toBe('function');
        });
        it('should test RetryError properties', () => {
            const mockResult = {
                exitCode: 1,
                stdout: 'out',
                stderr: 'error',
                command: 'test command'
            };
            const results = [mockResult, mockResult, mockResult];
            const error = new RetryError('Max retries exceeded', 3, mockResult, results);
            expect(error.message).toBe('Max retries exceeded');
            expect(error.name).toBe('RetryError');
            expect(error.attempts).toBe(3);
            expect(error.lastResult).toBe(mockResult);
            expect(error.results).toBe(results);
            expect(error.results.length).toBe(3);
        });
        it('should test retry with custom isRetryable function', async () => {
            let attempts = 0;
            const testFunction = jest.fn(async () => {
                attempts++;
                if (attempts === 1) {
                    return { exitCode: 2, stdout: '', stderr: 'Retryable error', command: 'test' };
                }
                return { exitCode: 0, stdout: 'success', stderr: '', command: 'test' };
            });
            const result = await retry(testFunction, {
                maxRetries: 3,
                initialDelay: 10,
                isRetryable: (result) => result.exitCode === 2
            });
            expect(result.stdout).toBe('success');
            expect(testFunction).toHaveBeenCalledTimes(2);
        });
        it('should test parallel execution with various options', async () => {
            const mockEngine = {
                execute: jest.fn((cmd) => new Promise(resolve => setTimeout(() => resolve({
                    exitCode: 0,
                    stdout: `output for ${cmd.command}`,
                    stderr: ''
                }), 1))),
                with: jest.fn()
            };
            const commands = ['echo 1', 'echo 2', 'echo 3'];
            const result = await parallel(commands, mockEngine, {
                maxConcurrency: 2,
                stopOnError: false
            });
            expect(result.succeeded.length).toBe(3);
            expect(result.failed.length).toBe(0);
            expect(result.duration).toBeGreaterThanOrEqual(0);
            expect(mockEngine.execute).toHaveBeenCalledTimes(3);
        });
        it('should test within with nested contexts', async () => {
            const outerConfig = { env: { OUTER: 'outer' } };
            const innerConfig = { env: { INNER: 'inner' } };
            const result = await within(outerConfig, async () => {
                const outerResult = 'outer';
                const innerResult = await within(innerConfig, async () => 'inner');
                return { outer: outerResult, inner: innerResult };
            });
            expect(result).toEqual({ outer: 'outer', inner: 'inner' });
        });
        it('should test parallel execution with error handling', async () => {
            let callCount = 0;
            const mockEngine = {
                execute: jest.fn((cmd) => {
                    callCount++;
                    if (cmd.command === 'echo 2') {
                        return Promise.reject(new Error('Command failed'));
                    }
                    return Promise.resolve({
                        exitCode: 0,
                        stdout: `output for ${cmd.command}`,
                        stderr: ''
                    });
                }),
                with: jest.fn()
            };
            const commands = ['echo 1', 'echo 2', 'echo 3'];
            const result = await parallel(commands, mockEngine, {
                stopOnError: false
            });
            expect(result.succeeded.length).toBe(2);
            expect(result.failed.length).toBe(1);
            expect(result.results.length).toBe(3);
            expect(mockEngine.execute).toHaveBeenCalledTimes(3);
        });
        it('should test parallel execution with stopOnError', async () => {
            let callCount = 0;
            const mockEngine = {
                execute: jest.fn((cmd) => {
                    callCount++;
                    if (callCount === 2) {
                        return Promise.reject(new Error('Command failed'));
                    }
                    return new Promise(resolve => setTimeout(() => resolve({
                        exitCode: 0,
                        stdout: `output for ${cmd.command}`,
                        stderr: ''
                    }), 10));
                }),
                with: jest.fn()
            };
            const commands = ['echo 1', 'echo 2', 'echo 3', 'echo 4'];
            const result = await parallel(commands, mockEngine, {
                stopOnError: true,
                maxConcurrency: 1
            });
            expect(result.succeeded.length).toBe(1);
            expect(result.failed.length).toBe(1);
            expect(mockEngine.execute).toHaveBeenCalledTimes(2);
        });
        it('should test retry with non-retryable errors', async () => {
            let attempts = 0;
            const testFunction = jest.fn(async () => {
                attempts++;
                return { exitCode: 255, stdout: '', stderr: 'Fatal error', command: 'test' };
            });
            await expect(retry(testFunction, {
                maxRetries: 3,
                initialDelay: 10,
                isRetryable: (result) => result.exitCode !== 255
            })).rejects.toThrow(RetryError);
            expect(testFunction).toHaveBeenCalledTimes(1);
        });
        it('should test ParallelEngine methods', async () => {
            const mockEngine = {
                execute: jest.fn((cmd) => {
                    const delay = cmd.command.includes('sleep') ? 50 : 1;
                    return new Promise(resolve => setTimeout(() => resolve({
                        exitCode: cmd.command.includes('fail') ? 1 : 0,
                        stdout: `output for ${cmd.command}`,
                        stderr: cmd.command.includes('fail') ? 'error' : ''
                    }), delay));
                }),
                with: jest.fn()
            };
            const parallelEngine = new ParallelEngine(mockEngine);
            const raceResult = await parallelEngine.race(['sleep 100', 'echo fast']);
            expect(raceResult.stdout).toContain('echo fast');
            const everyResult = await parallelEngine.every(['echo 1', 'echo 2']);
            expect(everyResult).toBe(true);
            try {
                const everyFailResult = await parallelEngine.every(['echo 1', 'fail']);
                expect(everyFailResult).toBe(false);
            }
            catch (error) {
                expect(error).toBeDefined();
            }
            const someResult = await parallelEngine.some(['fail', 'echo success']);
            expect(someResult).toBe(true);
            const items = ['a', 'b', 'c'];
            const mapResult = await parallelEngine.map(items, (item, index) => `echo ${item}${index}`);
            expect(mapResult.succeeded.length).toBe(3);
            const filterItems = ['good', 'fail', 'good2'];
            const filtered = await parallelEngine.filter(filterItems, (item) => item.includes('fail') ? 'fail' : `echo ${item}`);
            expect(filtered).toEqual(['good', 'good2']);
        });
    });
});
//# sourceMappingURL=utils-export.test.js.map