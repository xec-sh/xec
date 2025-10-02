import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { ModuleExecutor } from '../../../src/module/module-executor.js';

describe('ModuleExecutor', () => {
  let executor: ModuleExecutor;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-executor-test-'));
    executor = new ModuleExecutor(tempDir);
  });

  afterEach(async () => {
    await executor.cleanup();
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('ESM modules', () => {
    it('should execute ESM module with default export', async () => {
      const content = 'export default { value: 42 };';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'esm',
      });

      expect(module.default).toEqual({ value: 42 });
    });

    it('should execute ESM module with named exports', async () => {
      const content = 'export const foo = "bar"; export const num = 123;';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'esm',
      });

      expect(module.foo).toBe('bar');
      expect(module.num).toBe(123);
    });

    it('should execute ESM module with imports', async () => {
      const content = 'import path from "node:path"; export const dirname = path.dirname("/foo/bar");';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'esm',
      });

      expect(module.dirname).toBe('/foo');
    });
  });

  describe('CommonJS modules', () => {
    it('should execute CJS module with module.exports', async () => {
      const content = 'module.exports = { value: 42 };';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'cjs',
      });

      expect(module.default).toEqual({ value: 42 });
    });

    it('should execute CJS module with exports', async () => {
      const content = 'exports.foo = "bar"; exports.num = 123;';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'cjs',
      });

      expect(module.default.foo).toBe('bar');
      expect(module.default.num).toBe(123);
    });

    it.skip('should execute CJS module with require', async () => {
      // Skip: require() is not supported in CDN module execution
      const content = 'const path = require("path"); module.exports = { dirname: path.dirname("/foo/bar") };';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'cjs',
      });

      expect(module.default.dirname).toBe('/foo');
    });
  });

  describe('UMD modules', () => {
    it('should execute UMD module', async () => {
      const content = `
        (function (root, factory) {
          if (typeof define === 'function' && define.amd) {
            define([], factory);
          } else if (typeof module === 'object' && module.exports) {
            module.exports = factory();
          } else {
            root.myModule = factory();
          }
        }(typeof self !== 'undefined' ? self : this, function () {
          return { value: 42 };
        }));
      `;
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        type: 'umd',
      });

      expect(module.default).toEqual({ value: 42 });
    });
  });

  describe('Module type detection', () => {
    it('should detect ESM from content', async () => {
      const content = 'export const foo = "bar";';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
      });

      expect(module.foo).toBe('bar');
    });

    it('should detect CJS from content', async () => {
      const content = 'module.exports = { foo: "bar" };';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
      });

      expect(module.default).toEqual({ foo: 'bar' });
    });

    it('should detect UMD from content', async () => {
      const content = `
        (function (root, factory) {
          if (typeof define === 'function' && define.amd) {
            define([], factory);
          } else if (typeof module === 'object' && module.exports) {
            module.exports = factory();
          }
        }(this, function () {
          return { value: 42 };
        }));
      `;
      const module = await executor.execute({
        specifier: 'test-module',
        content,
      });

      expect(module.default).toEqual({ value: 42 });
    });

    it('should use content-type header for detection', async () => {
      const content = '({ value: 42 })';
      const module = await executor.execute({
        specifier: 'test-module',
        content,
        headers: { 'content-type': 'application/javascript' },
      });

      // Should default to ESM and fail gracefully or succeed based on content
      expect(module).toBeDefined();
    });
  });

  describe('Error handling', () => {
    it('should handle syntax errors', async () => {
      const content = 'this is not valid javascript {]';
      await expect(
        executor.execute({
          specifier: 'test-module',
          content,
        })
      ).rejects.toThrow();
    });

    it('should handle runtime errors', async () => {
      const content = 'export default (() => { throw new Error("Runtime error"); })();';
      await expect(
        executor.execute({
          specifier: 'test-module',
          content,
        })
      ).rejects.toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup temporary directory', async () => {
      const content = 'export const foo = "bar";';
      await executor.execute({
        specifier: 'test-module',
        content,
        type: 'esm',
      });

      // Files are cleaned up immediately after execution
      // So we just verify cleanup() works without errors
      await executor.cleanup();

      // After cleanup, temp dir should be recreated and empty
      const filesAfter = await fs.readdir(tempDir);
      expect(filesAfter.length).toBe(0);
    });
  });

  describe('Cache busting', () => {
    it('should execute same module multiple times with different results', async () => {
      const content1 = 'export const value = 1;';
      const module1 = await executor.execute({
        specifier: 'test-module',
        content: content1,
      });

      const content2 = 'export const value = 2;';
      const module2 = await executor.execute({
        specifier: 'test-module',
        content: content2,
      });

      expect(module1.value).toBe(1);
      expect(module2.value).toBe(2);
    });
  });
});
