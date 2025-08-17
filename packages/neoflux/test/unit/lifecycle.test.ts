import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  setCurrentComponent,
  getCurrentComponent,
  onMount,
  onCleanup,
  onUpdate,
  createComponentContext,
  runMountHooks,
  runCleanupHooks,
  runUpdateHooks,
  addDisposable,
  runInComponentContext
} from '../../src/lifecycle.js';
import { createRoot } from '../../src/batch.js';

describe('Lifecycle', () => {
  beforeEach(() => {
    // Clear component context before each test
    setCurrentComponent(null);
  });

  afterEach(() => {
    // Ensure clean state after each test
    setCurrentComponent(null);
  });

  describe('Component context management', () => {
    it('should set and get current component', () => {
      expect(getCurrentComponent()).toBeNull();

      const context = createComponentContext('test-component');
      setCurrentComponent(context);

      expect(getCurrentComponent()).toBe(context);
      expect(getCurrentComponent()?.id).toBe('test-component');
    });

    it('should create component context with id', () => {
      const context = createComponentContext('my-component');

      expect(context.id).toBe('my-component');
      expect(context.mounted).toBe(false);
      expect(context.onMount).toBeInstanceOf(Set);
      expect(context.onCleanup).toBeInstanceOf(Set);
      expect(context.onUpdate).toBeInstanceOf(Set);
      expect(context.disposables).toBeInstanceOf(Set);
    });

    it('should run function in component context', () => {
      const context = createComponentContext('test');
      let capturedContext: any = null;

      const result = runInComponentContext(context, () => {
        capturedContext = getCurrentComponent();
        return 42;
      });

      expect(capturedContext).toBe(context);
      expect(result).toBe(42);
      expect(getCurrentComponent()).toBeNull(); // Should restore previous context
    });

    it('should restore previous context after runInComponentContext', () => {
      const context1 = createComponentContext('context1');
      const context2 = createComponentContext('context2');

      setCurrentComponent(context1);

      runInComponentContext(context2, () => {
        expect(getCurrentComponent()).toBe(context2);
      });

      expect(getCurrentComponent()).toBe(context1);
    });

    it('should handle errors in runInComponentContext', () => {
      const context = createComponentContext('test');
      const error = new Error('Test error');

      expect(() => {
        runInComponentContext(context, () => {
          throw error;
        });
      }).toThrow(error);

      // Context should be restored even after error
      expect(getCurrentComponent()).toBeNull();
    });
  });

  describe('Mount hooks', () => {
    it('should register mount hook', () => {
      const context = createComponentContext('test');
      const mountFn = vi.fn();

      setCurrentComponent(context);
      onMount(mountFn);

      expect(context.onMount.has(mountFn)).toBe(true);
      expect(mountFn).not.toHaveBeenCalled();
    });

    it('should throw when onMount called without context', () => {
      const mountFn = vi.fn();

      expect(() => onMount(mountFn)).toThrow('onMount can only be called during component initialization');
    });

    it('should run mount hooks', () => {
      const context = createComponentContext('test');
      const mount1 = vi.fn();
      const mount2 = vi.fn();

      context.onMount.add(mount1);
      context.onMount.add(mount2);

      runMountHooks(context);

      expect(mount1).toHaveBeenCalledTimes(1);
      expect(mount2).toHaveBeenCalledTimes(1);
      expect(context.mounted).toBe(true);
    });

    it('should only run mount hooks once', () => {
      const context = createComponentContext('test');
      const mountFn = vi.fn();

      context.onMount.add(mountFn);

      runMountHooks(context);
      runMountHooks(context); // Second call

      expect(mountFn).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in mount hooks', () => {
      const context = createComponentContext('test');
      const error = new Error('Mount error');
      const mount1 = vi.fn(() => { throw error; });
      const mount2 = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

      context.onMount.add(mount1);
      context.onMount.add(mount2);

      runMountHooks(context);

      expect(mount1).toHaveBeenCalled();
      expect(mount2).toHaveBeenCalled(); // Should continue after error
      expect(consoleError).toHaveBeenCalledWith(`Error in mount hook:`, error);

      consoleError.mockRestore();
    });

    it('should handle cleanup functions returned from mount hooks', () => {
      const context = createComponentContext('test');
      const cleanupFn = vi.fn();
      const mountFn = vi.fn(() => cleanupFn);

      context.onMount.add(mountFn);

      runMountHooks(context);

      expect(context.onCleanup.has(cleanupFn)).toBe(true);
    });
  });

  describe('Cleanup hooks', () => {
    it('should register cleanup hook', () => {
      const context = createComponentContext('test');
      const cleanupFn = vi.fn();

      setCurrentComponent(context);
      onCleanup(cleanupFn);

      expect(context.onCleanup.has(cleanupFn)).toBe(true);
      expect(cleanupFn).not.toHaveBeenCalled();
    });

    it('should fallback to reactive cleanup when called without context', () => {
      const cleanupFn = vi.fn();

      // Create a reactive context
      createRoot((dispose) => {
        // onCleanup without component context should use reactive cleanup
        expect(() => onCleanup(cleanupFn)).not.toThrow();

        // Cleanup function should be called when root is disposed
        dispose();
        expect(cleanupFn).toHaveBeenCalled();
      });
    });

    it('should run cleanup hooks', () => {
      const context = createComponentContext('test');
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      const cleanup3 = vi.fn();

      context.onCleanup.add(cleanup1);
      context.onCleanup.add(cleanup2);
      context.onCleanup.add(cleanup3);

      runCleanupHooks(context);

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
      expect(cleanup3).toHaveBeenCalled();
      expect(context.onCleanup.size).toBe(0);
    });

    it('should handle errors in cleanup hooks', () => {
      const context = createComponentContext('test');
      const error = new Error('Cleanup error');
      const cleanup1 = vi.fn(() => { throw error; });
      const cleanup2 = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

      context.onCleanup.add(cleanup1);
      context.onCleanup.add(cleanup2);

      runCleanupHooks(context);

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled(); // Should continue after error
      expect(consoleError).toHaveBeenCalledWith(`Error in cleanup hook:`, error);

      consoleError.mockRestore();
    });

    it('should dispose all disposables during cleanup', () => {
      const context = createComponentContext('test');
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();

      context.disposables.add({ dispose: dispose1 });
      context.disposables.add({ dispose: dispose2 });

      runCleanupHooks(context);

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
      expect(context.disposables.size).toBe(0);
    });
  });

  describe('Update hooks', () => {
    it('should register update hook', () => {
      const context = createComponentContext('test');
      const updateFn = vi.fn();

      setCurrentComponent(context);
      onUpdate(updateFn);

      expect(context.onUpdate.has(updateFn)).toBe(true);
      expect(updateFn).not.toHaveBeenCalled();
    });

    it('should throw when onUpdate called without context', () => {
      const updateFn = vi.fn();

      expect(() => onUpdate(updateFn)).toThrow('onUpdate can only be called during component initialization');
    });

    it('should run update hooks', () => {
      const context = createComponentContext('test');
      const update1 = vi.fn();
      const update2 = vi.fn();

      context.onUpdate.add(update1);
      context.onUpdate.add(update2);

      // Component must be mounted first
      context.mounted = true;

      runUpdateHooks(context);

      expect(update1).toHaveBeenCalledTimes(1);
      expect(update2).toHaveBeenCalledTimes(1);
    });

    it('should handle errors in update hooks', () => {
      const context = createComponentContext('test');
      const error = new Error('Update error');
      const update1 = vi.fn(() => { throw error; });
      const update2 = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

      context.onUpdate.add(update1);
      context.onUpdate.add(update2);

      // Component must be mounted first
      context.mounted = true;

      runUpdateHooks(context);

      expect(update1).toHaveBeenCalled();
      expect(update2).toHaveBeenCalled(); // Should continue after error
      expect(consoleError).toHaveBeenCalledWith(`Error in update hook:`, error);

      consoleError.mockRestore();
    });
  });

  describe('Disposables', () => {
    it('should add disposable to current component', () => {
      const context = createComponentContext('test');
      const disposable = { dispose: vi.fn() };

      setCurrentComponent(context);
      addDisposable(disposable);

      expect(context.disposables.has(disposable)).toBe(true);
    });

    it('should not add disposable when called without context', () => {
      const disposable = { dispose: vi.fn() };

      // Should not throw, just silently not add
      expect(() => addDisposable(disposable)).not.toThrow();
    });

    it('should dispose all disposables during cleanup', () => {
      const context = createComponentContext('test');
      const dispose1 = vi.fn();
      const dispose2 = vi.fn();
      const disposable1 = { dispose: dispose1 };
      const disposable2 = { dispose: dispose2 };

      setCurrentComponent(context);
      addDisposable(disposable1);
      addDisposable(disposable2);

      runCleanupHooks(context);

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled();
    });

    it('should handle errors in disposables', () => {
      const context = createComponentContext('test');
      const error = new Error('Dispose error');
      const dispose1 = vi.fn(() => { throw error; });
      const dispose2 = vi.fn();

      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => { });

      context.disposables.add({ dispose: dispose1 });
      context.disposables.add({ dispose: dispose2 });

      runCleanupHooks(context);

      expect(dispose1).toHaveBeenCalled();
      expect(dispose2).toHaveBeenCalled(); // Should continue after error
      expect(consoleError).toHaveBeenCalled();

      consoleError.mockRestore();
    });
  });

  describe('Integration', () => {
    it('should handle complete lifecycle', () => {
      const context = createComponentContext('full-lifecycle');
      const mountFn = vi.fn();
      const updateFn = vi.fn();
      const cleanupFn = vi.fn();
      const disposeFn = vi.fn();

      runInComponentContext(context, () => {
        onMount(mountFn);
        onUpdate(updateFn);
        onCleanup(cleanupFn);
        addDisposable({ dispose: disposeFn });
      });

      // Mount
      runMountHooks(context);
      expect(mountFn).toHaveBeenCalledTimes(1);
      expect(context.mounted).toBe(true);

      // Update
      runUpdateHooks(context);
      expect(updateFn).toHaveBeenCalledTimes(1);

      // Update again
      runUpdateHooks(context);
      expect(updateFn).toHaveBeenCalledTimes(2);

      // Cleanup
      runCleanupHooks(context);
      expect(cleanupFn).toHaveBeenCalledTimes(1);
      expect(disposeFn).toHaveBeenCalledTimes(1);
    });

    it('should handle nested component contexts', () => {
      const parent = createComponentContext('parent');
      const child = createComponentContext('child');

      let parentContext: any = null;
      let childContext: any = null;

      runInComponentContext(parent, () => {
        parentContext = getCurrentComponent();

        runInComponentContext(child, () => {
          childContext = getCurrentComponent();
        });

        expect(getCurrentComponent()).toBe(parent);
      });

      expect(parentContext).toBe(parent);
      expect(childContext).toBe(child);
      expect(getCurrentComponent()).toBeNull();
    });

    it('should handle complex hook registration', () => {
      const context = createComponentContext('complex');
      const mountOrder: string[] = [];
      const cleanupOrder: string[] = [];

      runInComponentContext(context, () => {
        onMount(() => {
          mountOrder.push('mount1');
          return () => cleanupOrder.push('cleanup1');
        });

        onCleanup(() => cleanupOrder.push('cleanup2'));

        onMount(() => {
          mountOrder.push('mount2');
          return () => cleanupOrder.push('cleanup3');
        });

        onCleanup(() => cleanupOrder.push('cleanup4'));
      });

      runMountHooks(context);
      expect(mountOrder).toEqual(['mount1', 'mount2']);

      runCleanupHooks(context);
      // Cleanup hooks run in the order they're added (Set maintains insertion order)
      expect(cleanupOrder.length).toBe(4);
      // Check that all cleanup functions were called
      expect(cleanupOrder).toContain('cleanup1');
      expect(cleanupOrder).toContain('cleanup2');
      expect(cleanupOrder).toContain('cleanup3');
      expect(cleanupOrder).toContain('cleanup4');
    });
  });
});