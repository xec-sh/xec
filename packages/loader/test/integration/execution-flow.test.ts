import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import {
  CodeEvaluator,
  ScriptRuntime,
  ScriptExecutor,
  GlobalInjector,
  ExecutionContext,
} from '../../src/index.js';

describe('Integration: Full Execution Flow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'loader-integration-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Script Execution', () => {
    it('should execute a simple JavaScript script', async () => {
      const scriptPath = path.join(tempDir, 'simple.js');
      await fs.writeFile(scriptPath, 'export const result = 42;');

      const executor = new ScriptExecutor();
      const result = await executor.executeScript(scriptPath);

      expect(result.success).toBe(true);
    });

    it('should execute TypeScript script with transformation', async () => {
      const scriptPath = path.join(tempDir, 'typescript.ts');
      await fs.writeFile(scriptPath, `
        const greet = (name: string): string => {
          return \`Hello, \${name}!\`;
        };
        export { greet };
      `);

      const executor = new ScriptExecutor();
      const result = await executor.executeScript(scriptPath);

      expect(result.success).toBe(true);
    });

    it('should inject custom globals during execution', async () => {
      const scriptPath = path.join(tempDir, 'with-globals.js');
      await fs.writeFile(scriptPath, `
        if (typeof customGlobal === 'undefined') {
          throw new Error('customGlobal not found');
        }
        export const value = customGlobal;
      `);

      const executor = new ScriptExecutor();
      const result = await executor.executeScript(scriptPath, {
        customGlobals: { customGlobal: 'test-value' },
      });

      expect(result.success).toBe(true);
    });

    it('should handle script errors gracefully', async () => {
      const scriptPath = path.join(tempDir, 'error.js');
      await fs.writeFile(scriptPath, `
        throw new Error('Intentional error');
      `);

      const executor = new ScriptExecutor();
      const result = await executor.executeScript(scriptPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Code Evaluation', () => {
    it('should evaluate inline code', async () => {
      const evaluator = new CodeEvaluator();
      const result = await evaluator.evaluateCode('export const x = 1 + 1;');

      expect(result.success).toBe(true);
    });

    it('should evaluate code with async operations', async () => {
      const evaluator = new CodeEvaluator();
      const code = `
        const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        await wait(10);
        export const done = true;
      `;
      const result = await evaluator.evaluateCode(code);

      expect(result.success).toBe(true);
    });

    it('should evaluate code with top-level await', async () => {
      const evaluator = new CodeEvaluator();
      const value = await evaluator.eval<number>('return 2 + 2');

      expect(value).toBe(4);
    });

    it('should handle evaluation errors', async () => {
      const evaluator = new CodeEvaluator();
      const result = await evaluator.evaluateCode('throw new Error("eval error")');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('Context Management', () => {
    it('should inject and restore globals correctly', async () => {
      const testGlobal = (globalThis as any).testGlobal;
      expect(testGlobal).toBeUndefined();

      const context = new ExecutionContext({
        customGlobals: { testGlobal: 'test-value' },
      });

      await context.execute(async () => {
        expect((globalThis as any).testGlobal).toBe('test-value');
      });

      expect((globalThis as any).testGlobal).toBeUndefined();
    });

    it('should handle nested context execution', async () => {
      const context1 = new ExecutionContext({
        customGlobals: { level: 1 },
      });

      const context2 = new ExecutionContext({
        customGlobals: { level: 2 },
      });

      await context1.execute(async () => {
        expect((globalThis as any).level).toBe(1);

        await context2.execute(async () => {
          expect((globalThis as any).level).toBe(2);
        });

        expect((globalThis as any).level).toBe(1);
      });

      expect((globalThis as any).level).toBeUndefined();
    });
  });

  describe('Runtime Integration', () => {
    it('should integrate ScriptRuntime with execution', async () => {
      const runtime = new ScriptRuntime();

      // Use runtime utilities
      const tmpFile = runtime.tmpfile('test-', '.txt');
      expect(tmpFile).toContain('test-');

      const quoted = runtime.quote('has spaces');
      expect(quoted).toContain("'");

      // Test retry
      let attempts = 0;
      const result = await runtime.retry(async () => {
        attempts++;
        if (attempts < 2) throw new Error('retry');
        return 'success';
      }, { retries: 3, delay: 10 });

      expect(result).toBe('success');
      expect(attempts).toBe(2);
    });

    it('should use GlobalInjector with ScriptExecutor', async () => {
      const injector = new GlobalInjector({
        globals: { testVar: 'injected' },
      });

      const scriptPath = path.join(tempDir, 'injected.js');
      await fs.writeFile(scriptPath, `
        export const value = testVar;
      `);

      const result = await injector.execute(async () => {
        const executor = new ScriptExecutor();
        return executor.executeScript(scriptPath);
      });

      expect(result.success).toBe(true);
    });
  });

  describe('Error Handling Flow', () => {
    it('should propagate errors through execution chain', async () => {
      const scriptPath = path.join(tempDir, 'chain-error.js');
      await fs.writeFile(scriptPath, `
        const func = () => {
          throw new Error('Deep error');
        };
        func();
      `);

      const executor = new ScriptExecutor();
      const result = await executor.executeScript(scriptPath);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Deep error');
    });

    it('should clean up resources on error', async () => {
      const scriptPath = path.join(tempDir, 'cleanup-error.js');
      await fs.writeFile(scriptPath, 'throw new Error("test error")');

      const context = new ExecutionContext({
        customGlobals: { cleanupTest: 'value' },
      });

      const result = await context.execute(async () => {
        const executor = new ScriptExecutor();
        return await executor.executeScript(scriptPath);
      });

      // Script should have failed
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();

      // Globals should be cleaned up
      expect((globalThis as any).cleanupTest).toBeUndefined();
    });
  });

  describe('Complex Workflows', () => {
    it('should handle multi-step execution workflow', async () => {
      // Step 1: Evaluate some code
      const evaluator = new CodeEvaluator();
      const step1 = await evaluator.eval<number>('return 10 + 5');
      expect(step1).toBe(15);

      // Step 2: Create a script using that result
      const scriptPath = path.join(tempDir, 'workflow.js');
      await fs.writeFile(scriptPath, `
        export const doubled = ${step1} * 2;
      `);

      // Step 3: Execute the script
      const executor = new ScriptExecutor();
      const step3 = await executor.executeScript(scriptPath);
      expect(step3.success).toBe(true);
    });

    it('should support concurrent script execution', async () => {
      const scripts = ['script1.js', 'script2.js', 'script3.js'];

      for (const script of scripts) {
        const scriptPath = path.join(tempDir, script);
        await fs.writeFile(scriptPath, `
          export const name = '${script}';
          export const timestamp = Date.now();
        `);
      }

      const executor = new ScriptExecutor();
      const results = await Promise.all(
        scripts.map(script =>
          executor.executeScript(path.join(tempDir, script))
        )
      );

      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });
  });
});
