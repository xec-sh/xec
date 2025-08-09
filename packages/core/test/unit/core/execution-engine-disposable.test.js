import { it, jest, expect, describe } from '@jest/globals';
import { $ } from '../../../src/index.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
describe('ExecutionEngine Disposable functionality', () => {
    describe('Adapter disposal', () => {
        it('should dispose all adapters when engine is disposed', async () => {
            const engine = new ExecutionEngine();
            const mockAdapter = new MockAdapter();
            const disposeSpy = jest.spyOn(mockAdapter, 'dispose');
            engine.registerAdapter('mock', mockAdapter);
            await engine.dispose();
            expect(disposeSpy).toHaveBeenCalled();
        });
        it('should handle adapters without dispose method gracefully', async () => {
            const engine = new ExecutionEngine();
            const adapterWithoutDispose = {
                execute: jest.fn(),
                validateConfig: jest.fn()
            };
            engine.registerAdapter('custom', adapterWithoutDispose);
            await expect(engine.dispose()).resolves.toBeUndefined();
        });
        it('should dispose SSH connections', async () => {
            const engine = new ExecutionEngine({
                adapters: {
                    ssh: {
                        defaultConnectOptions: {
                            host: 'test.example.com',
                            username: 'test'
                        }
                    }
                }
            });
            const sshAdapter = engine.adapters.get('ssh');
            const disposeSpy = jest.spyOn(sshAdapter, 'dispose');
            await engine.dispose();
            expect(disposeSpy).toHaveBeenCalled();
        });
        it('should continue disposing other adapters if one fails', async () => {
            const engine = new ExecutionEngine();
            const failingAdapter = {
                dispose: jest.fn().mockRejectedValue(new Error('Dispose failed')),
                execute: jest.fn(),
                validateConfig: jest.fn()
            };
            const successAdapter = new MockAdapter();
            const successSpy = jest.spyOn(successAdapter, 'dispose');
            engine.registerAdapter('failing', failingAdapter);
            engine.registerAdapter('success', successAdapter);
            await expect(engine.dispose()).resolves.toBeUndefined();
            expect(failingAdapter.dispose).toHaveBeenCalled();
            expect(successSpy).toHaveBeenCalled();
        });
    });
    describe('Resource cleanup', () => {
        it('should clean up temporary resources', async () => {
            const engine = new ExecutionEngine();
            const tempFile = await engine.tempFile();
            const tempFilePath = tempFile.path;
            const existsBefore = await engine.execute({
                command: 'test',
                args: ['-f', tempFilePath],
                shell: false
            }).then(() => true).catch(() => false);
            expect(existsBefore).toBe(true);
            await engine.dispose();
            const existsAfter = await engine.execute({
                command: 'test',
                args: ['-f', tempFilePath],
                shell: false
            }).then(() => true).catch(() => false);
            expect(existsAfter).toBe(false);
        });
        it('should clean up event listeners', async () => {
            const engine = new ExecutionEngine();
            const listener = jest.fn();
            engine.on('command:start', listener);
            expect(engine.listenerCount('command:start')).toBe(1);
            await engine.dispose();
            expect(engine.listenerCount('command:start')).toBe(0);
        });
        it('should cancel active processes', async () => {
            const engine = new ExecutionEngine();
            const longProcess = engine.run `sleep 10`;
            await new Promise(resolve => setTimeout(resolve, 100));
            await engine.dispose();
            const result = await longProcess;
            expect(result.signal).toBe('SIGTERM');
            expect(result.duration).toBeLessThan(5000);
        });
    });
    describe('Global $ disposal', () => {
        it('should dispose global $ instance', async () => {
            await $ `echo "test"`;
            const { dispose } = await import('../../../src/index.js');
            await expect(dispose()).resolves.toBeUndefined();
        });
        it('should handle multiple dispose calls', async () => {
            const { dispose } = await import('../../../src/index.js');
            await dispose();
            await dispose();
            await dispose();
        });
        it('should recreate engine after disposal', async () => {
            const { dispose } = await import('../../../src/index.js');
            const result1 = await $ `echo "before dispose"`;
            expect(result1.stdout).toContain('before dispose');
            await dispose();
            const result2 = await $ `echo "after dispose"`;
            expect(result2.stdout).toContain('after dispose');
        });
    });
    describe('Disposable pattern implementation', () => {
        it('should prevent usage after disposal', async () => {
            class DisposableEngine extends ExecutionEngine {
                constructor() {
                    super(...arguments);
                    this._disposed = false;
                }
                async dispose() {
                    if (this._disposed) {
                        throw new Error('Already disposed');
                    }
                    this._disposed = true;
                }
                async execute(command) {
                    if (this._disposed) {
                        throw new Error('Cannot execute on disposed engine');
                    }
                    return super.execute(command);
                }
            }
            const engine = new DisposableEngine();
            await engine.dispose();
            await expect(engine.execute({ command: 'echo test' }))
                .rejects.toThrow('Cannot execute on disposed engine');
        });
        it('should support async resource management', async () => {
            async function withEngine(config, callback) {
                const engine = new ExecutionEngine(config);
                try {
                    return await callback(engine);
                }
                finally {
                    if ('dispose' in engine && typeof engine.dispose === 'function') {
                        await engine.dispose();
                    }
                }
            }
            let engineUsed = false;
            const result = await withEngine({}, async (engine) => {
                engineUsed = true;
                const res = await engine.execute({ command: 'echo', args: ['test'] });
                return res.stdout;
            });
            expect(engineUsed).toBe(true);
            expect(result).toContain('test');
        });
    });
    describe('Memory leak prevention', () => {
        it('should clear adapter references on disposal', async () => {
            const engine = new ExecutionEngine();
            const adapters = Array.from({ length: 10 }, (_, i) => new MockAdapter());
            adapters.forEach((adapter, i) => {
                engine.registerAdapter(`mock-${i}`, adapter);
            });
            expect(engine.adapters.size).toBeGreaterThan(10);
            await engine.dispose();
            expect(engine.adapters.size).toBe(0);
        });
        it('should clear temporary file tracking', async () => {
            const engine = new ExecutionEngine();
            const tempFiles = await Promise.all(Array.from({ length: 5 }, () => engine.tempFile()));
            const trackingSize = engine._tempTracker?.size || 0;
            expect(trackingSize).toBeGreaterThan(0);
            await engine.dispose();
            const afterSize = engine._tempTracker?.size || 0;
            expect(afterSize).toBe(0);
        });
        it('should clean up temp directories on disposal', async () => {
            const engine = new ExecutionEngine();
            const tempDirs = await Promise.all(Array.from({ length: 3 }, () => engine.tempDir()));
            expect(engine._tempTracker.size).toBe(3);
            await engine.dispose();
            expect(engine._tempTracker.size).toBe(0);
        });
        it('should clear active processes tracking', async () => {
            const engine = new ExecutionEngine();
            const processes = [
                engine.run `echo "test1"`,
                engine.run `echo "test2"`,
                engine.run `echo "test3"`
            ];
            expect(engine._activeProcesses.size).toBe(3);
            await Promise.all(processes);
            expect(engine._activeProcesses.size).toBe(0);
        });
    });
    describe('Edge cases', () => {
        it('should handle disposal with no resources', async () => {
            const engine = new ExecutionEngine();
            await expect(engine.dispose()).resolves.toBeUndefined();
        });
        it('should handle multiple simultaneous process cancellations', async () => {
            const engine = new ExecutionEngine();
            const processes = Array.from({ length: 5 }, (_, i) => engine.run `sleep ${i + 1}`);
            await new Promise(resolve => setTimeout(resolve, 100));
            await engine.dispose();
            const results = await Promise.all(processes);
            results.forEach(result => {
                expect(result.signal).toBe('SIGTERM');
            });
        });
        it('should handle temp file cleanup errors gracefully', async () => {
            const engine = new ExecutionEngine();
            const tempFile = await engine.tempFile();
            tempFile.cleanup = jest.fn(() => Promise.reject(new Error('Cleanup failed')));
            await expect(engine.dispose()).resolves.toBeUndefined();
        });
        it('should dispose parallel and transfer utilities', async () => {
            const engine = new ExecutionEngine();
            const parallel = engine.parallel;
            const transfer = engine.transfer;
            expect(engine._parallel).toBeDefined();
            expect(engine._transfer).toBeDefined();
            await engine.dispose();
            expect(engine._parallel).toBeUndefined();
            expect(engine._transfer).toBeUndefined();
        });
    });
});
//# sourceMappingURL=execution-engine-disposable.test.js.map