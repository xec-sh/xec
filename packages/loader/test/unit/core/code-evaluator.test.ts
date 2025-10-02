/**
 * Tests for CodeEvaluator
 */

import { it, expect, describe } from 'vitest';

import { CodeEvaluator } from '../../../src/core/code-evaluator.js';

describe('CodeEvaluator', () => {
  let evaluator: CodeEvaluator;

  beforeEach(() => {
    evaluator = new CodeEvaluator();
  });

  describe('evaluateCode', () => {
    it('should evaluate simple JavaScript code', async () => {
      const code = `globalThis.__evalTest = 'success';`;
      const result = await evaluator.evaluateCode(code);

      expect(result.success).toBe(true);
      expect((globalThis as any).__evalTest).toBe('success');

      delete (globalThis as any).__evalTest;
    });

    it('should evaluate code with custom globals', async () => {
      const code = `globalThis.__evalResult = globalThis.customVar * 2;`;
      const result = await evaluator.evaluateCode(code, {
        customGlobals: { customVar: 21 }
      });

      expect(result.success).toBe(true);
      expect((globalThis as any).__evalResult).toBe(42);

      delete (globalThis as any).__evalResult;
    });

    it('should return error for invalid code', async () => {
      const code = `this is invalid JavaScript`;
      const result = await evaluator.evaluateCode(code);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should handle async code', async () => {
      const code = `
        await new Promise(resolve => setTimeout(resolve, 10));
        globalThis.__asyncTest = 'done';
      `;
      const result = await evaluator.evaluateCode(code);

      expect(result.success).toBe(true);
      expect((globalThis as any).__asyncTest).toBe('done');

      delete (globalThis as any).__asyncTest;
    });
  });

  describe('eval', () => {
    it('should evaluate and return result value', async () => {
      const code = `return 40 + 2;`;
      const result = await evaluator.eval<number>(code);

      expect(result).toBe(42);
    });

    it('should evaluate async code and return result', async () => {
      const code = `
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'async result';
      `;
      const result = await evaluator.eval<string>(code);

      expect(result).toBe('async result');
    });

    it('should have access to custom globals', async () => {
      const code = `return globalThis.myValue * 3;`;
      const result = await evaluator.eval<number>(code, {
        customGlobals: { myValue: 7 }
      });

      expect(result).toBe(21);
    });

    it('should return object results', async () => {
      const code = `
        return { name: 'test', value: 123 };
      `;
      const result = await evaluator.eval<{ name: string; value: number }>(code);

      expect(result).toEqual({ name: 'test', value: 123 });
    });
  });
});
