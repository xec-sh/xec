import * as os from 'node:os';
import * as path from 'node:path';
import { transform } from 'esbuild';
import { promisify } from 'node:util';
import * as fs from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
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

    it('uses the native CommonJS loader for builtin imports', async () => {
      const module = await executor.execute({
        specifier: 'native-cjs',
        content: 'module.exports = { value: require("node:path").basename("/a/file") };',
        type: 'cjs',
      });
      expect(module.default).toEqual({ value: 'file' });
    });

    it('preserves the native missing-dependency failure without repeating execution', async () => {
      await expect(executor.execute({
        specifier: 'missing-cjs-dependency',
        content: 'require("missing-xec-fixture-package");',
        type: 'cjs',
      })).rejects.toMatchObject({ code: 'MODULE_NOT_FOUND' });
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

  describe('Explicit formats', () => {
    it('defaults to ESM without guessing format from comments or strings', async () => {
      const module = await executor.execute({
        specifier: 'native-esm',
        content: '/* module.exports = 1 */ export const value = "require(opaque)";',
      });
      expect(module.value).toBe('require(opaque)');
    });

    it('preserves native format errors without the test runner translating modules', async () => {
      // Vitest can translate CommonJS-looking .mjs into valid code. Exercise the
      // compiled production executor in a plain Node process to observe the real contract.
      const source = await fs.readFile(new URL('../../../src/module/module-executor.ts', import.meta.url), 'utf8');
      const compiled = await transform(source, { loader: 'ts', format: 'esm', target: 'es2022' });
      const file = path.join(tempDir, 'executor.mjs');
      await fs.writeFile(file, compiled.code);
      const native = `
        import assert from 'node:assert/strict';
        import { ModuleExecutor } from ${JSON.stringify(pathToFileURL(file).href)};
        const executor = new ModuleExecutor(${JSON.stringify(tempDir)});
        await assert.rejects(executor.execute({
          specifier: 'requires-explicit-cjs',
          content: 'module.exports = { value: 1 };',
        }), /module is not defined/);
        for (const type of ['unknown', 'esm', 'cjs']) {
          globalThis.effects = 0;
          await assert.rejects(executor.execute({
            specifier: 'effect-before-failure', type,
            content: 'globalThis.effects += 1; throw new Error("after-effect");',
          }), /after-effect/);
          assert.equal(globalThis.effects, 1);
        }
        assert.equal((await executor.execute({
          specifier: 'explicit-cjs', type: 'cjs', content: 'module.exports = { value: 42 };',
        })).default.value, 42);
        await executor.cleanup();
      `;
      const scenario = path.join(tempDir, 'scenario.mjs');
      await fs.writeFile(scenario, native);
      await promisify(execFile)(process.execPath, [scenario], { timeout: 5000 });
    });

    it.each(['unknown', 'cjs'] as const)('never replays a failed %s module', async type => {
      const key = '__xec_module_effect_count';
      const shared = globalThis as unknown as Record<string, unknown>;
      shared[key] = 0;
      try {
        await expect(executor.execute({
          specifier: 'one-effect',
          type,
          content: 'globalThis.__xec_module_effect_count += 1; throw new Error("after-effect");',
        })).rejects.toThrow('after-effect');
        expect(shared[key]).toBe(1);
      } finally { delete shared[key]; }
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

  describe('Owned temporary modules', () => {
    it('preserves unrelated files in the caller directory', async () => {
      const sentinel = path.join(tempDir, 'caller-data');
      await fs.writeFile(sentinel, 'retain');
      await executor.execute({ specifier: 'owned', content: 'export const value = 1;' });
      await executor.cleanup();
      expect(await fs.readFile(sentinel, 'utf8')).toBe('retain');
    });

    it('keeps a private source alive for its callback and refuses cleanup while active', async () => {
      let file = '';
      await executor.withModule({ specifier: 'lifetime', content: 'export const file = import.meta.url;' }, async module => {
        file = fileURLToPath(module.file);
        expect(await fs.readFile(file, 'utf8')).toContain('import.meta.url');
        if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
        await expect(executor.cleanup()).rejects.toThrow('still active');
      });
      await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
    });

    it('preserves a replacement file rather than deleting a foreign identity', async () => {
      let file = '';
      await expect(executor.withModule({
        specifier: 'replacement',
        content: 'export const file = import.meta.url;',
      }, async module => {
        file = fileURLToPath(module.file);
        await fs.rename(file, file + '.owned');
        await fs.writeFile(file, 'foreign replacement');
      })).rejects.toThrow('identity changed');
      try {
        expect(await fs.readFile(file, 'utf8')).toBe('foreign replacement');
        await expect(executor.cleanup()).rejects.toThrow('cleanup is incomplete');
      } finally {
        await fs.unlink(file);
        await fs.rename(file + '.owned', file);
        await executor.cleanup();
      }
    });

    it('does not collapse throw undefined into a successful execution', async () => {
      const result = await Promise.allSettled([executor.execute({
        specifier: 'undefined-failure',
        content: 'throw undefined;',
      })]);
      expect(result[0]).toEqual({ status: 'rejected', reason: undefined });
    });

    it('does not reuse source paths for simultaneous executions', async () => {
      const values = await Promise.all(Array.from({ length: 8 }, (_, value) => executor.execute({
        specifier: 'same-specifier',
        content: 'export const value = ' + value,
      })));
      expect(values.map(module => module.value)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
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
