import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

/**
 * Every Node builtin must be imported with its `node:` prefix.
 *
 * Deno rejects a bare `import ... from 'path'` outright — `Import "path" not
 * a dependency` — so `xec` died on its first import when run under Deno. Node
 * and Bun accept both spellings, which is why nothing else catches a
 * regression.
 *
 * This checks the built output rather than the source, because that is what
 * actually runs, and because a bundler could reintroduce the bare form.
 */
describe('the built CLI imports Node builtins portably', () => {
  /** The builtins this package actually uses, plus the ones easiest to slip in. */
  const BUILTINS = [
    'assert', 'buffer', 'child_process', 'crypto', 'events', 'fs', 'http',
    'https', 'module', 'net', 'os', 'path', 'perf_hooks', 'process',
    'readline', 'repl', 'stream', 'string_decoder', 'timers', 'tls', 'tty',
    'url', 'util', 'worker_threads', 'zlib',
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
    const pattern = new RegExp(`(?:from\\s+|import\\()['"](${BUILTINS.join('|')})(/[a-z0-9]+)?['"]`, 'g');
    const offenders: string[] = [];

    for (const file of builtFiles(DIST)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        offenders.push(`${path.relative(DIST, file)}: ${match[1]}${match[2] ?? ''}`);
      }
    }

    expect(offenders, `bare builtin imports Deno rejects:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('never require()s one either', () => {
    const pattern = new RegExp(`require\\(['"](${BUILTINS.join('|')})(/[a-z0-9]+)?['"]\\)`, 'g');
    const offenders: string[] = [];

    for (const file of builtFiles(DIST)) {
      const source = fs.readFileSync(file, 'utf8');
      for (const match of source.matchAll(pattern)) {
        offenders.push(`${path.relative(DIST, file)}: ${match[1]}${match[2] ?? ''}`);
      }
    }

    expect(offenders).toEqual([]);
  });
});
