/**
 * Tests for ExecutionContext
 */

import { it, expect, describe, afterEach } from 'vitest';

import { ExecutionContext } from '../../../src/core/execution-context.js';

import type { ExecutionContextOptions } from '../../../src/types/index.js';

describe('ExecutionContext', () => {
  let context: ExecutionContext;

  afterEach(async () => {
    if (context) {
      await context.dispose();
    }
  });

  describe('constructor', () => {
    it('should create context with default options', () => {
      context = new ExecutionContext();
      expect(context).toBeDefined();
    });

    it('should create context with custom options', () => {
      const options: ExecutionContextOptions = {
        verbose: true,
        quiet: false,
        target: {
          type: 'local',
          name: 'test',
          config: {}
        }
      };

      context = new ExecutionContext(options);
      expect(context).toBeDefined();
      expect(context.getTargetInfo()).toEqual(options.target);
    });
  });

  describe('getTargetInfo', () => {
    it('should return undefined when no target provided', () => {
      context = new ExecutionContext();
      expect(context.getTargetInfo()).toBeUndefined();
    });

    it('should return target info when provided', () => {
      const targetInfo = {
        type: 'docker' as const,
        name: 'mycontainer',
        container: 'mycontainer',
        config: { image: 'node:20' }
      };

      context = new ExecutionContext({ target: targetInfo });
      expect(context.getTargetInfo()).toEqual(targetInfo);
    });
  });

  describe('getTargetEngine', () => {
    it('should return undefined when no engine provided', () => {
      context = new ExecutionContext();
      expect(context.getTargetEngine()).toBeUndefined();
    });

    it('should return target engine when provided', () => {
      const mockEngine = { exec: () => {} };
      context = new ExecutionContext({ targetEngine: mockEngine });
      expect(context.getTargetEngine()).toBe(mockEngine);
    });
  });

  describe('getScriptContext', () => {
    it('should return undefined when no context provided', () => {
      context = new ExecutionContext();
      expect(context.getScriptContext()).toBeUndefined();
    });

    it('should return script context when provided', () => {
      const scriptContext = {
        args: ['arg1', 'arg2'],
        argv: ['node', 'script.js', 'arg1', 'arg2'],
        __filename: '/path/to/script.js',
        __dirname: '/path/to'
      };

      context = new ExecutionContext({ context: scriptContext });
      expect(context.getScriptContext()).toEqual(scriptContext);
    });
  });

  describe('getCustomGlobals', () => {
    it('should return empty object when no custom globals provided', () => {
      context = new ExecutionContext();
      expect(context.getCustomGlobals()).toEqual({});
    });

    it('should return custom globals when provided', () => {
      const customGlobals = { myVar: 'value', myFunc: () => {} };
      context = new ExecutionContext({ customGlobals });
      expect(context.getCustomGlobals()).toEqual(customGlobals);
    });
  });

  describe('injectGlobals and restoreGlobals', () => {
    it('should inject and restore globals', async () => {
      const customGlobals = { testVar: 'testValue' };
      context = new ExecutionContext({ customGlobals });

      // Before injection
      expect((globalThis as any).testVar).toBeUndefined();

      // Inject
      await context.injectGlobals();
      expect((globalThis as any).testVar).toBe('testValue');

      // Restore
      await context.restoreGlobals();
      expect((globalThis as any).testVar).toBeUndefined();
    });

    it('should preserve existing globals', async () => {
      (globalThis as any).existingVar = 'original';

      const customGlobals = { existingVar: 'modified' };
      context = new ExecutionContext({ customGlobals });

      await context.injectGlobals();
      expect((globalThis as any).existingVar).toBe('modified');

      await context.restoreGlobals();
      expect((globalThis as any).existingVar).toBe('original');

      delete (globalThis as any).existingVar;
    });

    it('should inject target context globals', async () => {
      const mockEngine = { exec: () => {} };
      const targetInfo = {
        type: 'docker' as const,
        name: 'test',
        config: {}
      };

      context = new ExecutionContext({
        target: targetInfo,
        targetEngine: mockEngine
      });

      await context.injectGlobals();
      expect((globalThis as any).$target).toBe(mockEngine);
      expect((globalThis as any).$targetInfo).toEqual(targetInfo);

      await context.restoreGlobals();
      expect((globalThis as any).$target).toBeUndefined();
      expect((globalThis as any).$targetInfo).toBeUndefined();
    });
  });

  describe('execute', () => {
    it('should execute function with injected globals', async () => {
      const customGlobals = { testValue: 42 };
      context = new ExecutionContext({ customGlobals });

      const result = await context.execute(async () => (globalThis as any).testValue * 2);

      expect(result).toBe(84);
      expect((globalThis as any).testValue).toBeUndefined();
    });

    it('should restore globals even if function throws', async () => {
      const customGlobals = { testValue: 42 };
      context = new ExecutionContext({ customGlobals });

      await expect(async () => {
        await context.execute(async () => {
          throw new Error('Test error');
        });
      }).rejects.toThrow('Test error');

      expect((globalThis as any).testValue).toBeUndefined();
    });
  });

  describe('dispose', () => {
    it('should clean up all injected globals', async () => {
      const customGlobals = { var1: 'value1', var2: 'value2' };
      context = new ExecutionContext({ customGlobals });

      await context.injectGlobals();
      expect((globalThis as any).var1).toBe('value1');
      expect((globalThis as any).var2).toBe('value2');

      await context.dispose();
      expect((globalThis as any).var1).toBeUndefined();
      expect((globalThis as any).var2).toBeUndefined();
    });
  });
});
