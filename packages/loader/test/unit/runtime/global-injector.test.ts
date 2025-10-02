import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { GlobalInjector, createInjector } from '../../../src/runtime/global-injector.js';

describe('GlobalInjector', () => {
  let injector: GlobalInjector;
  let originalGlobalKeys: string[];

  beforeEach(() => {
    // Save original global keys
    originalGlobalKeys = Object.keys(globalThis);
  });

  afterEach(() => {
    // Clean up any injected globals
    if (injector) {
      try {
        injector.restore();
      } catch {
        // Already restored
      }
    }

    // Remove any test globals
    for (const key of Object.keys(globalThis)) {
      if (!originalGlobalKeys.includes(key)) {
        delete (globalThis as any)[key];
      }
    }
  });

  describe('createInjector', () => {
    it('should create a new GlobalInjector instance', () => {
      const inj = createInjector();
      expect(inj).toBeInstanceOf(GlobalInjector);
    });

    it('should accept options', () => {
      const inj = createInjector({ globals: { test: 'value' } });
      expect(inj.getGlobals()).toEqual({ test: 'value' });
    });
  });

  describe('inject and restore', () => {
    beforeEach(() => {
      injector = new GlobalInjector({
        globals: {
          testVar: 'testValue',
          testFunc: () => 'test',
        },
      });
    });

    it('should inject globals', () => {
      expect((globalThis as any).testVar).toBeUndefined();

      injector.inject();

      expect((globalThis as any).testVar).toBe('testValue');
      expect(typeof (globalThis as any).testFunc).toBe('function');
      expect((globalThis as any).testFunc()).toBe('test');
    });

    it('should restore original globals', () => {
      injector.inject();
      expect((globalThis as any).testVar).toBe('testValue');

      injector.restore();
      expect((globalThis as any).testVar).toBeUndefined();
    });

    it('should preserve original values', () => {
      (globalThis as any).existing = 'original';

      const inj = new GlobalInjector({
        globals: { existing: 'modified' },
      });

      inj.inject();
      expect((globalThis as any).existing).toBe('modified');

      inj.restore();
      expect((globalThis as any).existing).toBe('original');

      delete (globalThis as any).existing;
    });

    it('should throw when trying to inject twice', () => {
      injector.inject();
      expect(() => injector.inject()).toThrow('already injected');
    });

    it('should not throw when restoring uninjected globals', () => {
      expect(() => injector.restore()).not.toThrow();
    });

    it('should track injected state', () => {
      expect(injector.isActive).toBe(false);
      injector.inject();
      expect(injector.isActive).toBe(true);
      injector.restore();
      expect(injector.isActive).toBe(false);
    });
  });

  describe('execute', () => {
    beforeEach(() => {
      injector = new GlobalInjector({
        globals: {
          injectedValue: 42,
          injectedFunc: (x: number) => x * 2,
        },
      });
    });

    it('should execute async function with injected globals', async () => {
      const result = await injector.execute(async () => (globalThis as any).injectedValue);

      expect(result).toBe(42);
    });

    it('should restore globals after execution', async () => {
      await injector.execute(async () => {
        expect((globalThis as any).injectedValue).toBe(42);
      });

      expect((globalThis as any).injectedValue).toBeUndefined();
    });

    it('should restore globals even on error', async () => {
      await expect(
        injector.execute(async () => {
          expect((globalThis as any).injectedValue).toBe(42);
          throw new Error('Test error');
        })
      ).rejects.toThrow('Test error');

      expect((globalThis as any).injectedValue).toBeUndefined();
    });

    it('should pass through return value', async () => {
      const result = await injector.execute(async () => {
        const val = (globalThis as any).injectedValue;
        const func = (globalThis as any).injectedFunc;
        return func(val);
      });

      expect(result).toBe(84);
    });
  });

  describe('executeSync', () => {
    beforeEach(() => {
      injector = new GlobalInjector({
        globals: { syncValue: 'test' },
      });
    });

    it('should execute sync function with injected globals', () => {
      const result = injector.executeSync(() => (globalThis as any).syncValue);

      expect(result).toBe('test');
      expect((globalThis as any).syncValue).toBeUndefined();
    });

    it('should restore globals even on sync error', () => {
      expect(() => {
        injector.executeSync(() => {
          expect((globalThis as any).syncValue).toBe('test');
          throw new Error('Sync error');
        });
      }).toThrow('Sync error');

      expect((globalThis as any).syncValue).toBeUndefined();
    });
  });

  describe('addGlobal and removeGlobal', () => {
    beforeEach(() => {
      injector = new GlobalInjector();
    });

    it('should add global to injection list', () => {
      injector.addGlobal('newVar', 'newValue');
      expect(injector.getGlobals()).toEqual({ newVar: 'newValue' });
    });

    it('should remove global from injection list', () => {
      injector.addGlobal('tempVar', 'tempValue');
      injector.removeGlobal('tempVar');
      expect(injector.getGlobals()).toEqual({});
    });

    it('should throw when adding global while injected', () => {
      injector.addGlobal('var1', 'value1');
      injector.inject();
      expect(() => injector.addGlobal('var2', 'value2')).toThrow();
    });

    it('should throw when removing global while injected', () => {
      injector.addGlobal('var1', 'value1');
      injector.inject();
      expect(() => injector.removeGlobal('var1')).toThrow();
    });
  });

  describe('safety checks', () => {
    it('should skip reserved Node.js globals', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const inj = new GlobalInjector({
        globals: {
          process: 'fake-process',
          console: 'fake-console',
          Buffer: 'fake-buffer',
        },
      });

      inj.inject();

      expect(typeof (globalThis as any).process).toBe('object');
      expect(typeof (globalThis as any).console).toBe('object');
      expect(typeof (globalThis as any).Buffer).toBe('function');

      expect(consoleSpy).toHaveBeenCalledTimes(3);

      inj.restore();
      consoleSpy.mockRestore();
    });

    it('should skip globals in skipGlobals option', () => {
      const inj = new GlobalInjector({
        globals: {
          skipMe: 'value',
          keepMe: 'value',
        },
        skipGlobals: ['skipMe'],
      });

      inj.inject();

      expect((globalThis as any).skipMe).toBeUndefined();
      expect((globalThis as any).keepMe).toBe('value');

      inj.restore();
    });

    it('should preserve originals when option is true', () => {
      (globalThis as any).existingVar = 'original';

      const inj = new GlobalInjector({
        globals: { existingVar: 'modified' },
        preserveOriginals: true,
      });

      inj.inject();
      expect((globalThis as any).existingVar).toBe('modified');

      inj.restore();
      expect((globalThis as any).existingVar).toBe('original');

      delete (globalThis as any).existingVar;
    });

    it('should not preserve originals when option is false', () => {
      (globalThis as any).existingVar = 'original';

      const inj = new GlobalInjector({
        globals: { existingVar: 'modified' },
        preserveOriginals: false,
      });

      inj.inject();
      inj.restore();

      expect((globalThis as any).existingVar).toBeUndefined();
      delete (globalThis as any).existingVar;
    });
  });

  describe('getInjectedKeys', () => {
    it('should return list of injected keys', () => {
      injector = new GlobalInjector({
        globals: {
          key1: 'value1',
          key2: 'value2',
        },
      });

      expect(injector.getInjectedKeys()).toEqual([]);

      injector.inject();
      expect(injector.getInjectedKeys()).toEqual(['key1', 'key2']);

      injector.restore();
      expect(injector.getInjectedKeys()).toEqual([]);
    });
  });

  describe('clear', () => {
    it('should clear all globals', () => {
      injector = new GlobalInjector({
        globals: { var1: 'value1', var2: 'value2' },
      });

      injector.clear();
      expect(injector.getGlobals()).toEqual({});
    });

    it('should restore before clearing if injected', () => {
      injector = new GlobalInjector({
        globals: { testVar: 'testValue' },
      });

      injector.inject();
      expect((globalThis as any).testVar).toBe('testValue');

      injector.clear();
      expect((globalThis as any).testVar).toBeUndefined();
      expect(injector.isActive).toBe(false);
    });
  });
});
