import { it, expect, describe } from '@jest/globals';
import { isDisposable } from '../../../src/types/disposable.js';
describe('Disposable', () => {
    describe('isDisposable type guard', () => {
        it('should return true for objects with dispose method', () => {
            const disposable = {
                dispose: async () => { }
            };
            expect(isDisposable(disposable)).toBe(true);
        });
        it('should return false for objects without dispose method', () => {
            const notDisposable = {
                cleanup: async () => { }
            };
            expect(isDisposable(notDisposable)).toBe(false);
        });
        it('should return false for null', () => {
            expect(isDisposable(null)).toBe(false);
        });
        it('should return false for undefined', () => {
            expect(isDisposable(undefined)).toBe(false);
        });
        it('should return false for primitives', () => {
            expect(isDisposable(123)).toBe(false);
            expect(isDisposable('string')).toBe(false);
            expect(isDisposable(true)).toBe(false);
        });
        it('should return false when dispose is not a function', () => {
            const invalidDisposable = {
                dispose: 'not a function'
            };
            expect(isDisposable(invalidDisposable)).toBe(false);
        });
        it('should handle Symbol-keyed dispose methods', () => {
            const disposeSymbol = Symbol('dispose');
            const objWithSymbol = {
                [disposeSymbol]: async () => { }
            };
            expect(isDisposable(objWithSymbol)).toBe(false);
        });
        it('should handle frozen and sealed objects', () => {
            const frozenDisposable = Object.freeze({
                dispose: async () => { }
            });
            expect(isDisposable(frozenDisposable)).toBe(true);
            const sealedDisposable = Object.seal({
                dispose: async () => { }
            });
            expect(isDisposable(sealedDisposable)).toBe(true);
        });
    });
    describe('Disposable implementation', () => {
        class TestDisposable {
            constructor() {
                this.disposed = false;
                this.disposeCount = 0;
            }
            async dispose() {
                this.disposed = true;
                this.disposeCount++;
            }
        }
        it('should be able to dispose resources', async () => {
            const disposable = new TestDisposable();
            expect(disposable.disposed).toBe(false);
            await disposable.dispose();
            expect(disposable.disposed).toBe(true);
            expect(disposable.disposeCount).toBe(1);
        });
        it('should handle multiple dispose calls', async () => {
            const disposable = new TestDisposable();
            await disposable.dispose();
            await disposable.dispose();
            expect(disposable.disposeCount).toBe(2);
        });
        it('should handle async dispose operations', async () => {
            class AsyncDisposable {
                constructor() {
                    this.disposed = false;
                }
                async dispose() {
                    await new Promise(resolve => setTimeout(resolve, 10));
                    this.disposed = true;
                }
            }
            const disposable = new AsyncDisposable();
            const disposePromise = disposable.dispose();
            expect(disposable.disposed).toBe(false);
            await disposePromise;
            expect(disposable.disposed).toBe(true);
        });
        it('should handle dispose errors', async () => {
            class ErrorDisposable {
                async dispose() {
                    throw new Error('Dispose failed');
                }
            }
            const disposable = new ErrorDisposable();
            await expect(disposable.dispose()).rejects.toThrow('Dispose failed');
        });
    });
    describe('DisposableContainer implementation', () => {
        class TestContainer {
            constructor() {
                this.disposables = new Set();
            }
            registerDisposable(disposable) {
                this.disposables.add(disposable);
            }
            unregisterDisposable(disposable) {
                this.disposables.delete(disposable);
            }
            async disposeAll() {
                const promises = Array.from(this.disposables).map(d => d.dispose());
                await Promise.all(promises);
                this.disposables.clear();
            }
            get size() {
                return this.disposables.size;
            }
        }
        class MockDisposable {
            constructor(id) {
                this.id = id;
                this.disposed = false;
            }
            async dispose() {
                this.disposed = true;
            }
        }
        it('should register and dispose resources', async () => {
            const container = new TestContainer();
            const disposable1 = new MockDisposable('1');
            const disposable2 = new MockDisposable('2');
            container.registerDisposable(disposable1);
            container.registerDisposable(disposable2);
            expect(container.size).toBe(2);
            await container.disposeAll();
            expect(disposable1.disposed).toBe(true);
            expect(disposable2.disposed).toBe(true);
            expect(container.size).toBe(0);
        });
        it('should unregister disposables', () => {
            const container = new TestContainer();
            const disposable = new MockDisposable('1');
            container.registerDisposable(disposable);
            expect(container.size).toBe(1);
            container.unregisterDisposable(disposable);
            expect(container.size).toBe(0);
        });
        it('should handle duplicate registrations', async () => {
            const container = new TestContainer();
            const disposable = new MockDisposable('1');
            container.registerDisposable(disposable);
            container.registerDisposable(disposable);
            expect(container.size).toBe(1);
            await container.disposeAll();
            expect(disposable.disposed).toBe(true);
        });
        it('should handle concurrent dispose operations', async () => {
            class SlowDisposable {
                constructor() {
                    this.disposeStarted = false;
                    this.disposeCompleted = false;
                }
                async dispose() {
                    this.disposeStarted = true;
                    await new Promise(resolve => setTimeout(resolve, 50));
                    this.disposeCompleted = true;
                }
            }
            const container = new TestContainer();
            const disposables = Array.from({ length: 5 }, (_, i) => new SlowDisposable());
            disposables.forEach(d => container.registerDisposable(d));
            const startTime = Date.now();
            await container.disposeAll();
            const endTime = Date.now();
            disposables.forEach(d => {
                expect(d.disposeCompleted).toBe(true);
            });
            expect(endTime - startTime).toBeLessThan(200);
        });
        it('should handle partial failures in disposeAll', async () => {
            class FailingDisposable {
                constructor(shouldFail) {
                    this.shouldFail = shouldFail;
                }
                async dispose() {
                    if (this.shouldFail) {
                        throw new Error('Dispose failed');
                    }
                }
            }
            const container = new TestContainer();
            const goodDisposable = new MockDisposable('good');
            const badDisposable = new FailingDisposable(true);
            container.registerDisposable(goodDisposable);
            container.registerDisposable(badDisposable);
            await expect(container.disposeAll()).rejects.toThrow();
            expect(goodDisposable.disposed).toBe(true);
        });
    });
    describe('Real-world Disposable implementations', () => {
        it('should work with ExecutionEngine as Disposable', async () => {
            const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
            const engine = new ExecutionEngine();
            expect(isDisposable(engine)).toBe(true);
            await expect(engine.dispose()).resolves.toBeUndefined();
        });
        it('should work with BaseAdapter implementations', async () => {
            const { MockAdapter } = await import('../../../src/adapters/mock-adapter.js');
            const adapter = new MockAdapter();
            expect(isDisposable(adapter)).toBe(true);
            await expect(adapter.dispose()).resolves.toBeUndefined();
        });
        it('should work with SecurePasswordHandler as Disposable', async () => {
            const { SecurePasswordHandler } = await import('../../../src/utils/secure-password.js');
            const handler = new SecurePasswordHandler();
            expect(isDisposable(handler)).toBe(true);
            await expect(handler.dispose()).resolves.toBeUndefined();
        });
    });
    describe('Edge cases', () => {
        it('should handle objects with non-function dispose property', () => {
            const invalidCases = [
                { dispose: null },
                { dispose: undefined },
                { dispose: 42 },
                { dispose: 'dispose' },
                { dispose: [] },
                { dispose: {} },
                { dispose: true }
            ];
            invalidCases.forEach(obj => {
                expect(isDisposable(obj)).toBe(false);
            });
        });
        it('should handle objects that inherit dispose method', () => {
            class BaseDisposable {
                async dispose() { }
            }
            class DerivedDisposable extends BaseDisposable {
            }
            const derived = new DerivedDisposable();
            expect(isDisposable(derived)).toBe(true);
        });
        it('should handle objects with dispose getter', () => {
            const objWithGetter = {
                get dispose() {
                    return async () => { };
                }
            };
            expect(isDisposable(objWithGetter)).toBe(true);
        });
        it('should handle arrays and other non-plain objects', () => {
            expect(isDisposable([])).toBe(false);
            expect(isDisposable(new Date())).toBe(false);
            expect(isDisposable(/regex/)).toBe(false);
            expect(isDisposable(new Map())).toBe(false);
            expect(isDisposable(new Set())).toBe(false);
        });
        it('should handle functions with dispose method', () => {
            const fn = () => { };
            fn.dispose = async () => { };
            expect(isDisposable(fn)).toBe(true);
        });
    });
    describe('Disposable patterns', () => {
        it('should support using pattern', async () => {
            class Resource {
                constructor() {
                    this.used = false;
                    this.disposed = false;
                }
                use() {
                    if (this.disposed) {
                        throw new Error('Cannot use disposed resource');
                    }
                    this.used = true;
                }
                async dispose() {
                    this.disposed = true;
                }
            }
            async function withResource(resourceFactory, callback) {
                const resource = resourceFactory();
                try {
                    return await callback(resource);
                }
                finally {
                    await resource.dispose();
                }
            }
            let resourceUsed = false;
            let resourceDisposed = false;
            await withResource(() => new Resource(), async (resource) => {
                resource.use();
                resourceUsed = resource.used;
                resourceDisposed = resource.disposed;
            });
            expect(resourceUsed).toBe(true);
            expect(resourceDisposed).toBe(false);
        });
        it('should support chained disposables', async () => {
            class ChainedDisposable {
                constructor() {
                    this.dependencies = [];
                    this.disposed = false;
                }
                addDependency(disposable) {
                    this.dependencies.push(disposable);
                }
                async dispose() {
                    for (let i = this.dependencies.length - 1; i >= 0; i--) {
                        const dep = this.dependencies[i];
                        if (dep) {
                            await dep.dispose();
                        }
                    }
                    this.disposed = true;
                }
            }
            const disposeOrder = [];
            class OrderedDisposable {
                constructor(name) {
                    this.name = name;
                }
                async dispose() {
                    disposeOrder.push(this.name);
                }
            }
            const parent = new ChainedDisposable();
            parent.addDependency(new OrderedDisposable('child1'));
            parent.addDependency(new OrderedDisposable('child2'));
            parent.addDependency(new OrderedDisposable('child3'));
            await parent.dispose();
            expect(disposeOrder).toEqual(['child3', 'child2', 'child1']);
            expect(parent.disposed).toBe(true);
        });
        it('should support disposable resource pools', async () => {
            class ResourcePool {
                constructor() {
                    this.resources = new Map();
                    this.disposed = false;
                }
                registerDisposable(disposable, id) {
                    if (this.disposed) {
                        throw new Error('Cannot register disposable on disposed pool');
                    }
                    const resourceId = id || Math.random().toString(36);
                    this.resources.set(resourceId, disposable);
                }
                unregisterDisposable(disposable) {
                    for (const [id, resource] of this.resources.entries()) {
                        if (resource === disposable) {
                            this.resources.delete(id);
                            break;
                        }
                    }
                }
                async disposeAll() {
                    const errors = [];
                    for (const [id, resource] of this.resources.entries()) {
                        try {
                            await resource.dispose();
                        }
                        catch (error) {
                            errors.push(new Error(`Failed to dispose resource ${id}: ${error}`));
                        }
                    }
                    this.resources.clear();
                    this.disposed = true;
                    if (errors.length > 0) {
                        throw new AggregateError(errors, 'Some resources failed to dispose');
                    }
                }
                get size() {
                    return this.resources.size;
                }
            }
            const pool = new ResourcePool();
            const disposables = Array.from({ length: 3 }, (_, i) => ({
                id: `resource-${i}`,
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            }));
            disposables.forEach(d => pool.registerDisposable(d));
            expect(pool.size).toBe(3);
            await pool.disposeAll();
            disposables.forEach(d => expect(d.disposed).toBe(true));
            expect(pool.size).toBe(0);
        });
        it('should support weak reference disposables', async () => {
            class WeakDisposableContainer {
                constructor() {
                    this.disposables = new WeakSet();
                    this.strongRefs = [];
                }
                addWeak(disposable) {
                    this.disposables.add(disposable);
                }
                addStrong(disposable) {
                    this.strongRefs.push(disposable);
                    this.disposables.add(disposable);
                }
                async disposeAll() {
                    for (const disposable of this.strongRefs) {
                        if (this.disposables.has(disposable)) {
                            await disposable.dispose();
                        }
                    }
                    this.strongRefs = [];
                }
            }
            const container = new WeakDisposableContainer();
            const strongDisposable = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            const weakDisposable = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            container.addStrong(strongDisposable);
            container.addWeak(weakDisposable);
            await container.disposeAll();
            expect(strongDisposable.disposed).toBe(true);
        });
        it('should support disposable with timeout', async () => {
            class TimeoutDisposable {
                constructor() {
                    this.disposed = false;
                }
                async dispose(timeout = 1000) {
                    const disposePromise = new Promise((resolve) => {
                        setTimeout(() => {
                            this.disposed = true;
                            resolve();
                        }, 50);
                    });
                    const timeoutPromise = new Promise((_, reject) => {
                        setTimeout(() => reject(new Error('Dispose timeout')), timeout);
                    });
                    await Promise.race([disposePromise, timeoutPromise]);
                }
                get isDisposed() {
                    return this.disposed;
                }
            }
            const disposable = new TimeoutDisposable();
            await disposable.dispose(100);
            expect(disposable.isDisposed).toBe(true);
            const fastTimeout = new TimeoutDisposable();
            await expect(fastTimeout.dispose(10)).rejects.toThrow('Dispose timeout');
        });
    });
    describe('DisposableContainer advanced patterns', () => {
        it('should support hierarchical disposal', async () => {
            class HierarchicalContainer {
                constructor() {
                    this.children = new Set();
                    this.resources = new Set();
                    this.disposed = false;
                }
                registerDisposable(disposable) {
                    this.resources.add(disposable);
                }
                unregisterDisposable(disposable) {
                    this.resources.delete(disposable);
                }
                addChild(child) {
                    this.children.add(child);
                }
                async disposeAll() {
                    for (const child of this.children) {
                        await child.disposeAll();
                    }
                    for (const resource of this.resources) {
                        await resource.dispose();
                    }
                    this.children.clear();
                    this.resources.clear();
                }
                async dispose() {
                    await this.disposeAll();
                    this.disposed = true;
                }
            }
            const root = new HierarchicalContainer();
            const child1 = new HierarchicalContainer();
            const child2 = new HierarchicalContainer();
            const rootResource = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            const child1Resource = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            const child2Resource = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            root.registerDisposable(rootResource);
            child1.registerDisposable(child1Resource);
            child2.registerDisposable(child2Resource);
            root.addChild(child1);
            root.addChild(child2);
            await root.dispose();
            expect(rootResource.disposed).toBe(true);
            expect(child1Resource.disposed).toBe(true);
            expect(child2Resource.disposed).toBe(true);
            expect(root.disposed).toBe(true);
        });
        it('should support transactional disposal', async () => {
            class TransactionalContainer {
                constructor() {
                    this.resources = new Map();
                    this.disposeLog = [];
                }
                registerDisposable(disposable) {
                    const id = Math.random().toString(36);
                    this.resources.set(id, disposable);
                }
                unregisterDisposable(disposable) {
                    for (const [id, resource] of this.resources.entries()) {
                        if (resource === disposable) {
                            this.resources.delete(id);
                            break;
                        }
                    }
                }
                async disposeAll() {
                    const snapshot = new Map(this.resources);
                    const disposed = new Set();
                    try {
                        for (const [id, resource] of snapshot.entries()) {
                            await resource.dispose();
                            disposed.add(id);
                            this.disposeLog.push(`Disposed: ${id}`);
                        }
                        this.resources.clear();
                    }
                    catch (error) {
                        this.disposeLog.push(`Error during disposal: ${error}`);
                        this.disposeLog.push('Rolling back...');
                        throw error;
                    }
                }
                getLog() {
                    return [...this.disposeLog];
                }
            }
            const container = new TransactionalContainer();
            const goodResource = {
                disposed: false,
                async dispose() {
                    this.disposed = true;
                }
            };
            const badResource = {
                async dispose() {
                    throw new Error('Disposal failed');
                }
            };
            container.registerDisposable(goodResource);
            container.registerDisposable(badResource);
            await expect(container.disposeAll()).rejects.toThrow('Disposal failed');
            const log = container.getLog();
            expect(log.some(entry => entry.startsWith('Disposed:'))).toBe(true);
            expect(log).toContain('Error during disposal: Error: Disposal failed');
            expect(log).toContain('Rolling back...');
        });
    });
});
//# sourceMappingURL=disposable.test.js.map