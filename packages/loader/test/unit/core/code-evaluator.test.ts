import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs, existsSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs';

import { CodeEvaluator } from '../../../src/core/code-evaluator.js';

/**
 * The evaluator imports inline code as a transient dot-file in the working
 * directory (not a `data:` URL) so bare specifiers resolve the way they would
 * for a real script. These tests pin that behaviour against the real
 * filesystem — no fs mocks — because the whole point is what Node's resolver
 * and the OS actually do.
 *
 * The eval'd code cannot return values to the test directly, so a probe object
 * is passed through `customGlobals`; the code writes what it observed (its own
 * filename via `import.meta.url`, an imported marker) onto the probe, which the
 * test holds a reference to and inspects afterwards.
 */
describe('CodeEvaluator', () => {
  const evaluator = new CodeEvaluator();
  const NAME_MASK = /^\.xec-eval-[0-9a-f]{16}\.mjs$/;

  let originalCwd: string;

  beforeEach(() => {
    originalCwd = process.cwd();
  });

  afterEach(() => {
    // Any test that chdir'd must not leak the change to the next one.
    process.chdir(originalCwd);
  });

  describe('evaluateCode: transient file lifecycle', () => {
    it('runs the code and removes the transient file it created', async () => {
      const probe: Record<string, unknown> = {};

      const result = await evaluator.evaluateCode(
        `import { statSync } from 'node:fs';
         import { fileURLToPath } from 'node:url';
         const self = fileURLToPath(import.meta.url);
         const p = globalThis.__xecEvalProbe;
         p.ran = true;
         p.file = self;
         p.mode = statSync(self).mode & 0o777;`,
        { customGlobals: { __xecEvalProbe: probe } }
      );

      expect(result.success).toBe(true);
      expect(probe.ran).toBe(true);

      // Created in the working directory, under the documented name mask.
      const file = probe.file as string;
      expect(path.dirname(file)).toBe(process.cwd());
      expect(NAME_MASK.test(path.basename(file))).toBe(true);

      // Written owner-only, and gone once evaluation returned.
      expect(probe.mode).toBe(0o600);
      expect(existsSync(file)).toBe(false);
    });

    it('removes the transient file even when the code throws', async () => {
      const probe: Record<string, unknown> = {};

      const result = await evaluator.evaluateCode(
        `import { fileURLToPath } from 'node:url';
         globalThis.__xecEvalProbe.file = fileURLToPath(import.meta.url);
         throw new Error('boom');`,
        { customGlobals: { __xecEvalProbe: probe } }
      );

      expect(result.success).toBe(false);
      expect(result.error?.message).toContain('boom');

      // The file was named before the throw; the finally path still unlinked it.
      expect(typeof probe.file).toBe('string');
      expect(existsSync(probe.file as string)).toBe(false);
    });

    it('names each file from fresh randomBytes, so two runs never collide', async () => {
      const first: Record<string, unknown> = {};
      const second: Record<string, unknown> = {};
      const capture =
        `import { fileURLToPath } from 'node:url';
         globalThis.__xecEvalProbe.file = fileURLToPath(import.meta.url);`;

      await evaluator.evaluateCode(capture, { customGlobals: { __xecEvalProbe: first } });
      await evaluator.evaluateCode(capture, { customGlobals: { __xecEvalProbe: second } });

      expect(NAME_MASK.test(path.basename(first.file as string))).toBe(true);
      expect(first.file).not.toBe(second.file);
    });
  });

  describe('evaluateCode: errors and async', () => {
    it('returns an error result for code that fails to parse', async () => {
      const result = await evaluator.evaluateCode(`this is not valid JavaScript`);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
    });

    it('awaits async code to completion', async () => {
      const probe: Record<string, unknown> = {};

      const result = await evaluator.evaluateCode(
        `await new Promise(resolve => setTimeout(resolve, 10));
         globalThis.__xecEvalProbe.done = true;`,
        { customGlobals: { __xecEvalProbe: probe } }
      );

      expect(result.success).toBe(true);
      expect(probe.done).toBe(true);
    });
  });

  describe('evaluateCode: import resolution from the working directory', () => {
    it('resolves a bare specifier against cwd/node_modules', async () => {
      const project = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-eval-cwd-'));
      const pkgDir = path.join(project, 'node_modules', 'fake-pkg');

      try {
        mkdirSync(pkgDir, { recursive: true });
        writeFileSync(
          path.join(pkgDir, 'package.json'),
          JSON.stringify({ name: 'fake-pkg', version: '1.0.0', type: 'module', exports: './index.js' })
        );
        writeFileSync(path.join(pkgDir, 'index.js'), `export const MARKER = 'fake-pkg-marker-42';`);

        process.chdir(project);
        const probe: Record<string, unknown> = {};

        const result = await evaluator.evaluateCode(
          `import { MARKER } from 'fake-pkg';
           globalThis.__xecEvalProbe.marker = MARKER;`,
          { customGlobals: { __xecEvalProbe: probe } }
        );

        expect(result.success).toBe(true);
        expect(probe.marker).toBe('fake-pkg-marker-42');
      } finally {
        process.chdir(originalCwd);
        await fs.rm(project, { recursive: true, force: true });
      }
    });
  });

  describe('evaluateCode: fallback when the working directory is not writable', () => {
    const isRoot = typeof process.getuid === 'function' && process.getuid() === 0;

    it.skipIf(isRoot)('still runs import-free code via the data: URL path', async (ctx) => {
      const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-eval-ro-'));

      try {
        await fs.chmod(dir, 0o500); // r-x: enterable, not writable

        // Some filesystems (and any superuser) ignore the mode; without real
        // enforcement the fallback cannot be exercised, so skip rather than
        // assert something that never had to hold.
        try {
          const sentinel = path.join(dir, '.writable-probe');
          writeFileSync(sentinel, 'x');
          unlinkSync(sentinel);
          ctx.skip();
          return;
        } catch {
          // Good: the directory really is read-only.
        }

        process.chdir(dir);
        const probe: Record<string, unknown> = {};

        const result = await evaluator.evaluateCode(
          `globalThis.__xecEvalProbe.ran = true;`,
          { customGlobals: { __xecEvalProbe: probe } }
        );

        expect(result.success).toBe(true);
        expect(probe.ran).toBe(true);

        // The failed write must not leave a partial transient file behind.
        const leftovers = (await fs.readdir(dir)).filter(name => NAME_MASK.test(name));
        expect(leftovers).toEqual([]);
      } finally {
        process.chdir(originalCwd);
        await fs.chmod(dir, 0o700).catch(() => {});
        await fs.rm(dir, { recursive: true, force: true });
      }
    });
  });

  describe('eval: returns the value', () => {
    it('returns the value from multi-line code that uses `return`', async () => {
      const value = await evaluator.eval<number>(
        `const a = 40;
         const b = 2;
         return a + b;`
      );

      expect(value).toBe(42);
    });

    it('returns objects and preserves shape', async () => {
      const value = await evaluator.eval<{ ok: boolean; list: number[] }>(
        `return { ok: true, list: [1, 2, 3] };`
      );

      expect(value).toEqual({ ok: true, list: [1, 2, 3] });
    });

    it('resolves the awaited value of async code', async () => {
      const value = await evaluator.eval<string>(
        `await new Promise(resolve => setTimeout(resolve, 10));
         return 'async result';`
      );

      expect(value).toBe('async result');
    });
  });

  describe('ExecutionContext: custom globals', () => {
    it('exposes a custom global to the code by bare name', async () => {
      const probe = { touched: false };

      await evaluator.evaluateCode(`__xecEvalProbe.touched = true;`, {
        customGlobals: { __xecEvalProbe: probe }
      });

      expect(probe.touched).toBe(true);
    });

    it('deletes an injected global that did not exist before', async () => {
      expect('__xecEvalOnlyDuring' in globalThis).toBe(false);

      await evaluator.evaluateCode(`void 0;`, {
        customGlobals: { __xecEvalOnlyDuring: { a: 1 } }
      });

      expect('__xecEvalOnlyDuring' in globalThis).toBe(false);
    });

    it('restores a global that existed before, to its original value', async () => {
      const g = globalThis as Record<string, unknown>;
      g['__xecEvalPreExisting'] = 'original';

      try {
        const probe: Record<string, unknown> = {};
        await evaluator.evaluateCode(
          `globalThis.__xecEvalProbe.seen = globalThis.__xecEvalPreExisting;`,
          { customGlobals: { __xecEvalProbe: probe, __xecEvalPreExisting: 'injected' } }
        );

        // The code saw the injected value...
        expect(probe.seen).toBe('injected');
        // ...and the original is back afterwards.
        expect(g['__xecEvalPreExisting']).toBe('original');
      } finally {
        delete g['__xecEvalPreExisting'];
      }
    });
  });
});
