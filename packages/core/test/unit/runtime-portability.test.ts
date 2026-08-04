import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist');

/**
 * Every Node builtin must be imported with its `node:` prefix.
 *
 * CLAUDE.md promises the package works identically on Node, Bun and Deno.
 * It did not: Deno rejects a bare `import ... from 'path'` outright —
 * `Import "path" not a dependency` — so `import '@xec-sh/core'` failed before
 * a single line of ours ran. Node and Bun accept both spellings, which is why
 * nothing caught it.
 *
 * This checks the built output rather than the source, because that is what a
 * consumer resolves, and because a bundler could reintroduce the bare form.
 */
describe('the built package imports Node builtins portably', () => {
  /** The builtins this package actually uses, plus the ones easiest to slip in. */
  const BUILTINS = [
    'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
    'https', 'net', 'os', 'path', 'perf_hooks', 'readline', 'stream',
    'string_decoder', 'timers', 'tls', 'url', 'util', 'worker_threads', 'zlib',
  ];

  /** Every .js file under dist. */
  function builtFiles(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return builtFiles(full);
      return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
    });
  }

  it('never imports a builtin without the node: prefix', () => {
    const pattern = new RegExp(`from\\s+['"](${BUILTINS.join('|')})['"]`, 'g');
    const offenders: string[] = [];

    for (const file of builtFiles(DIST)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        offenders.push(`${path.relative(DIST, file)}: ${match[1]}`);
      }
    }

    expect(offenders, `bare builtin imports Deno rejects:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('never require()s one either', () => {
    const pattern = new RegExp(`require\\(['"](${BUILTINS.join('|')})['"]\\)`, 'g');
    const offenders: string[] = [];

    for (const file of builtFiles(DIST)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        offenders.push(`${path.relative(DIST, file)}: ${match[1]}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
