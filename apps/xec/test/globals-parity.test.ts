import * as path from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(ROOT, 'dist/main.js');

/**
 * Every global that `globals.d.ts` declares must exist when a script runs.
 *
 * The declaration file and the injection site are two hand-maintained lists
 * in two packages, and they had drifted to seven names out of thirty-two.
 * The type checker saw the declaration and approved `retry(...)`; the runtime
 * injected only the short list and threw `retry is not defined` — mid-release,
 * after the version commit, in the first script that ever reached one of the
 * missing names.
 *
 * This test reads the declared names from the source of truth and asks the
 * built CLI for `typeof` of each, so the two lists cannot drift apart again
 * in either direction a user can observe.
 */
describe('script globals: declared means injected', () => {
  /** Names promised to the type checker, straight from the declaration. */
  const declared = (): string[] => {
    const source = readFileSync(path.join(ROOT, 'src/globals.ts'), 'utf-8');
    const block = source.slice(source.indexOf('declare global'));
    const names = [...block.matchAll(/^\s+const (\w+):/gm)].map(m => m[1]!);

    // A parse that finds nothing must fail loudly, not pass vacuously.
    expect(names.length).toBeGreaterThanOrEqual(30);
    return names;
  };

  /** One CLI run reporting `typeof` for every declared name. */
  const probe = (names: string[]): Promise<Record<string, string>> => {
    const report = names.map(n => `"${n}": typeof ${n}`).join(', ');
    const code = `console.log("PARITY" + JSON.stringify({ ${report} }))`;

    return new Promise((resolve, reject) => {
      execFile(process.execPath, [CLI, '-e', code], (error, stdout, stderr) => {
        const line = String(stdout).split('\n').find(l => l.startsWith('PARITY'));
        if (!line) {
          reject(new Error(`probe produced no report: ${String(stdout)}${String(stderr)}${error ?? ''}`));
          return;
        }
        resolve(JSON.parse(line.slice('PARITY'.length)));
      });
    });
  };

  it('injects every declared global', async () => {
    const names = declared();
    const seen = await probe(names);

    const phantoms = names.filter(n => seen[n] === 'undefined');

    expect(
      phantoms,
      `declared in globals.d.ts but undefined at run time: ${phantoms.join(', ')}`
    ).toEqual([]);
  }, 60_000);

  it('does not inject what the declaration does not promise', async () => {
    // The mirror-image defect: a global that works in every script but is
    // invisible to the type checker becomes load-bearing and undocumented.
    // `Import` was such an alias, and `runtime` rode along in the utilities
    // aggregate. Neither is declared, so neither may exist. (`fetch` also
    // rides in the aggregate and is also filtered, but it stays a platform
    // global — nothing observable to pin.)
    const seen = await probe(['Import', 'runtime']);

    expect(seen).toEqual({ Import: 'undefined', runtime: 'undefined' });
  }, 60_000);
});
