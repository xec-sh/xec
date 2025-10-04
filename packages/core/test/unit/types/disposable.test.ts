import { it, expect, describe } from '@jest/globals';

import { isDisposable } from '../../../src/types/disposable.js';

import type { Disposable, DisposableContainer } from '../../../src/types/disposable.js';

describe('Disposable', () => {
  describe('isDisposable type guard', () => {
    it('should return true for objects with dispose method', () => {
      const disposable = {
        dispose: async () => {}
      };
      expect(isDisposable(disposable)).toBe(true);
    });

    it('should return false for objects without dispose method', () => {
      const notDisposable = {
        cleanup: async () => {}
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
        [disposeSymbol]: async () => {}
      };
      // Should be false as we check for 'dispose' string key
      expect(isDisposable(objWithSymbol)).toBe(false);
    });

    it('should handle frozen and sealed objects', () => {
      const frozenDisposable = Object.freeze({
        dispose: async () => {}
      });
      expect(isDisposable(frozenDisposable)).toBe(true);

      const sealedDisposable = Object.seal({
        dispose: async () => {}
      });
      expect(isDisposable(sealedDisposable)).toBe(true);
    });
  });

  describe('Disposable implementation', () => {
    class TestDisposable implements Disposable {
      public disposed = false;
      public disposeCount = 0;

      async dispose(): Promise<void> {
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
      class AsyncDisposable implements Disposable {
        public disposed = false;
        
        async dispose(): Promise<void> {
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
      class ErrorDisposable implements Disposable {
        async dispose(): Promise<void> {
          throw new Error('Dispose failed');
        }
      }

      const disposable = new ErrorDisposable();
      await expect(disposable.dispose()).rejects.toThrow('Dispose failed');
    });
  });

  describe('DisposableContainer implementation', () => {
    class TestContainer implements DisposableContainer {
      private disposables = new Set<Disposable>();

      registerDisposable(disposable: Disposable): void {
        this.disposables.add(disposable);
      }

      unregisterDisposable(disposable: Disposable): void {
        this.disposables.delete(disposable);
      }

      async disposeAll(): Promise<void> {
        const promises = Array.from(this.disposables).map(d => d.dispose());
        await Promise.all(promises);
        this.disposables.clear();
      }

      get size(): number {
        return this.disposables.size;
      }
    }

    class MockDisposable implements Disposable {
      public disposed = false;
      constructor(public id: string) {}

      async dispose(): Promise<void> {
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
      class SlowDisposable implements Disposable {
        public disposeStarted = false;
        public disposeCompleted = false;

        async dispose(): Promise<void> {
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

      // All should be disposed
      disposables.forEach(d => {
        expect(d.disposeCompleted).toBe(true);
      });

      // Should have run in parallel (less than 5 * 50ms)
      expect(endTime - startTime).toBeLessThan(200);
    });

    it('should handle partial failures in disposeAll', async () => {
      class FailingDisposable implements Disposable {
        constructor(public shouldFail: boolean) {}

        async dispose(): Promise<void> {
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

      // Should throw but still dispose the good one
      await expect(container.disposeAll()).rejects.toThrow();
      expect(goodDisposable.disposed).toBe(true);
    });
  });

  describe('Real-world Disposable implementations', () => {
    it('should work with ExecutionEngine as Disposable', async () => {
      const { ExecutionEngine } = await import('../../../src/core/execution-engine.js');
      const engine = new ExecutionEngine();
      
      expect(isDisposable(engine)).toBe(true);
      
      // Should be able to dispose without errors
      await expect(engine.dispose()).resolves.toBeUndefined();
    });

    it('should work with BaseAdapter implementations', async () => {
      const { MockAdapter } = await import('../../../src/adapters/mock/index.js');
      const adapter = new MockAdapter();

      expect(isDisposable(adapter)).toBe(true);

      // Should be able to dispose without errors
      await expect(adapter.dispose()).resolves.toBeUndefined();
    });

    it('should work with SecurePasswordHandler as Disposable', async () => {
      const { SecurePasswordHandler } = await import('../../../src/adapters/ssh/secure-password.js');
      const handler = new SecurePasswordHandler();
      
      expect(isDisposable(handler)).toBe(true);
      
      // Should be able to dispose without errors
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
        async dispose(): Promise<void> {}
      }

      class DerivedDisposable extends BaseDisposable {}

      const derived = new DerivedDisposable();
      expect(isDisposable(derived)).toBe(true);
    });

    it('should handle objects with dispose getter', () => {
      const objWithGetter = {
        get dispose() {
          return async () => {};
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
      const fn = () => {};
      fn.dispose = async () => {};
      
      expect(isDisposable(fn)).toBe(true);
    });
  });

  describe('Disposable patterns', () => {
    it('should support using pattern', async () => {
      class Resource implements Disposable {
        public used = false;
        public disposed = false;

        use(): void {
          if (this.disposed) {
            throw new Error('Cannot use disposed resource');
          }
          this.used = true;
        }

        async dispose(): Promise<void> {
          this.disposed = true;
        }
      }

      async function withResource<T>(
        resourceFactory: () => Resource,
        callback: (resource: Resource) => Promise<T>
      ): Promise<T> {
        const resource = resourceFactory();
        try {
          return await callback(resource);
        } finally {
          await resource.dispose();
        }
      }

      let resourceUsed = false;
      let resourceDisposed = false;

      await withResource(
        () => new Resource(),
        async (resource) => {
          resource.use();
          resourceUsed = resource.used;
          resourceDisposed = resource.disposed;
        }
      );

      expect(resourceUsed).toBe(true);
      expect(resourceDisposed).toBe(false); // During callback
    });

    it('should support chained disposables', async () => {
      class ChainedDisposable implements Disposable {
        private dependencies: Disposable[] = [];
        public disposed = false;

        addDependency(disposable: Disposable): void {
          this.dependencies.push(disposable);
        }

        async dispose(): Promise<void> {
          // Dispose in reverse order
          for (let i = this.dependencies.length - 1; i >= 0; i--) {
            const dep = this.dependencies[i];
            if (dep) {
              await dep.dispose();
            }
          }
          this.disposed = true;
        }
      }

      const disposeOrder: string[] = [];

      class OrderedDisposable implements Disposable {
        constructor(private name: string) {}

        async dispose(): Promise<void> {
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
      class ResourcePool implements DisposableContainer {
        private resources = new Map<string, Disposable>();
        private disposed = false;

        registerDisposable(disposable: Disposable, id?: string): void {
          if (this.disposed) {
            throw new Error('Cannot register disposable on disposed pool');
          }
          const resourceId = id || Math.random().toString(36);
          this.resources.set(resourceId, disposable);
        }

        unregisterDisposable(disposable: Disposable): void {
          for (const [id, resource] of this.resources.entries()) {
            if (resource === disposable) {
              this.resources.delete(id);
              break;
            }
          }
        }

        async disposeAll(): Promise<void> {
          const errors: Error[] = [];
          
          for (const [id, resource] of this.resources.entries()) {
            try {
              await resource.dispose();
            } catch (error) {
              errors.push(new Error(`Failed to dispose resource ${id}: ${error}`));
            }
          }
          
          this.resources.clear();
          this.disposed = true;
          
          if (errors.length > 0) {
            throw new AggregateError(errors, 'Some resources failed to dispose');
          }
        }

        get size(): number {
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
      // Simulated weak reference handling
      class WeakDisposableContainer {
        private disposables = new WeakSet<Disposable>();
        private strongRefs: Disposable[] = [];

        addWeak(disposable: Disposable): void {
          this.disposables.add(disposable);
        }

        addStrong(disposable: Disposable): void {
          this.strongRefs.push(disposable);
          this.disposables.add(disposable);
        }

        async disposeAll(): Promise<void> {
          // Only dispose strong references
          // Weak references may have been garbage collected
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
      // Weak disposable is not guaranteed to be disposed
    });

    it('should support disposable with timeout', async () => {
      class TimeoutDisposable implements Disposable {
        private disposed = false;

        async dispose(timeout = 1000): Promise<void> {
          const disposePromise = new Promise<void>((resolve) => {
            setTimeout(() => {
              this.disposed = true;
              resolve();
            }, 50);
          });

          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Dispose timeout')), timeout);
          });

          await Promise.race([disposePromise, timeoutPromise]);
        }

        get isDisposed(): boolean {
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
      class HierarchicalContainer implements DisposableContainer, Disposable {
        private children = new Set<DisposableContainer>();
        private resources = new Set<Disposable>();
        public disposed = false;

        registerDisposable(disposable: Disposable): void {
          this.resources.add(disposable);
        }

        unregisterDisposable(disposable: Disposable): void {
          this.resources.delete(disposable);
        }

        addChild(child: DisposableContainer): void {
          this.children.add(child);
        }

        async disposeAll(): Promise<void> {
          // Dispose children first
          for (const child of this.children) {
            await child.disposeAll();
          }
          
          // Then dispose own resources
          for (const resource of this.resources) {
            await resource.dispose();
          }
          
          this.children.clear();
          this.resources.clear();
        }

        async dispose(): Promise<void> {
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
      class TransactionalContainer implements DisposableContainer {
        private resources = new Map<string, Disposable>();
        private disposeLog: string[] = [];

        registerDisposable(disposable: Disposable): void {
          const id = Math.random().toString(36);
          this.resources.set(id, disposable);
        }

        unregisterDisposable(disposable: Disposable): void {
          for (const [id, resource] of this.resources.entries()) {
            if (resource === disposable) {
              this.resources.delete(id);
              break;
            }
          }
        }

        async disposeAll(): Promise<void> {
          const snapshot = new Map(this.resources);
          const disposed = new Set<string>();

          try {
            for (const [id, resource] of snapshot.entries()) {
              await resource.dispose();
              disposed.add(id);
              this.disposeLog.push(`Disposed: ${id}`);
            }
            this.resources.clear();
          } catch (error) {
            // Rollback: try to recreate disposed resources
            this.disposeLog.push(`Error during disposal: ${error}`);
            this.disposeLog.push('Rolling back...');
            // In real implementation, you might recreate resources
            throw error;
          }
        }

        getLog(): string[] {
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