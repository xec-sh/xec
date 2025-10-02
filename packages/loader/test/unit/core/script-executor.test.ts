/**
 * Tests for ScriptExecutor
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { it, expect, describe, afterAll, beforeAll } from 'vitest';

import { ScriptExecutor } from '../../../src/core/script-executor.js';

describe('ScriptExecutor', () => {
  let executor: ScriptExecutor;
  let tempDir: string;

  beforeAll(async () => {
    executor = new ScriptExecutor();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'loader-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('executeScript', () => {
    it('should execute a simple JavaScript file', async () => {
      const scriptPath = path.join(tempDir, 'simple.js');
      await fs.writeFile(scriptPath, `
        globalThis.__testResult = 'success';
      `);

      const result = await executor.executeScript(scriptPath);
      expect(result.success).toBe(true);
      expect((globalThis as any).__testResult).toBe('success');

      delete (globalThis as any).__testResult;
    });

    it('should return error for non-existent file', async () => {
      const result = await executor.executeScript('/non/existent/file.js');
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Script file not found');
    });

    it('should inject script context', async () => {
      const scriptPath = path.join(tempDir, 'context.js');
      await fs.writeFile(scriptPath, `
        const ctx = globalThis.__xecScriptContext;
        globalThis.__testContext = {
          args: ctx.args,
          filename: ctx.__filename,
          dirname: ctx.__dirname
        };
      `);

      const result = await executor.executeScript(scriptPath, {
        context: {
          args: ['arg1', 'arg2'],
          argv: ['node', scriptPath, 'arg1', 'arg2'],
          __filename: scriptPath,
          __dirname: path.dirname(scriptPath)
        }
      });

      expect(result.success).toBe(true);
      const testContext = (globalThis as any).__testContext;
      expect(testContext.args).toEqual(['arg1', 'arg2']);
      expect(testContext.filename).toBe(scriptPath);
      expect(testContext.dirname).toBe(path.dirname(scriptPath));

      delete (globalThis as any).__testContext;
    });

    it('should inject custom globals', async () => {
      const scriptPath = path.join(tempDir, 'globals.js');
      await fs.writeFile(scriptPath, `
        globalThis.__testCustom = globalThis.customValue;
      `);

      const result = await executor.executeScript(scriptPath, {
        customGlobals: {
          customValue: 'injected'
        }
      });

      expect(result.success).toBe(true);
      expect((globalThis as any).__testCustom).toBe('injected');

      delete (globalThis as any).__testCustom;
    });

    it('should handle script errors', async () => {
      const scriptPath = path.join(tempDir, 'error.js');
      await fs.writeFile(scriptPath, `
        throw new Error('Script error');
      `);

      const result = await executor.executeScript(scriptPath);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Script error');
    });
  });

  describe('loadScript', () => {
    it('should load a module and return exports', async () => {
      const scriptPath = path.join(tempDir, 'module.js');
      await fs.writeFile(scriptPath, `
        export default { value: 'test' };
        export const namedExport = 'named';
      `);

      const module = await executor.loadScript(scriptPath);
      expect(module.default).toEqual({ value: 'test' });
      expect(module.namedExport).toBe('named');
    });

    it('should throw for non-existent file', async () => {
      await expect(
        executor.loadScript('/non/existent/module.js')
      ).rejects.toThrow('Script file not found');
    });
  });
});
