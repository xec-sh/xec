import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CLI = path.resolve(HERE, '../dist/main.js');

/**
 * `xec --help` should not load the machinery for running commands.
 *
 * A manifest exists precisely so help can list twelve commands without
 * importing them, because each one statically imports `@xec-sh/ops` and drags
 * the config and secrets layers in behind it. But command *discovery* went on
 * importing every module anyway, to read a description the manifest already
 * carried — so the manifest saved nothing on the path it was written for, and
 * printing help pulled in a bundler.
 *
 * This names the packages rather than timing the run: a wall-clock budget is
 * a flaky test on a loaded machine, whereas "did we load esbuild to print a
 * list of names" has one right answer.
 */
describe('printing help does not load the world', () => {
  /**
   * Every npm package reached while running the CLI with these arguments.
   *
   * Hooks `Module._load`, which sees CommonJS requires — enough here, because
   * the packages in question are all CJS and are what the ESM graph pulls in.
   */
  function packagesLoadedBy(args: string[]): Set<string> {
    const out = path.join(os.tmpdir(), `xec-startup-${process.pid}-${args.join('-')}.txt`);
    const preload = path.join(os.tmpdir(), `xec-startup-preload-${process.pid}.cjs`);

    fs.writeFileSync(preload, `
      const Module = require('node:module');
      const seen = new Set();
      const load = Module._load;

      Module._load = function (request, ...rest) {
        try {
          const file = String(Module._resolveFilename(request, ...rest));
          const at = file.lastIndexOf('node_modules/');
          if (at !== -1) {
            const parts = file.slice(at + 'node_modules/'.length).split('/');
            // pnpm nests real packages under .pnpm/<pkg>@<version>/node_modules/
            const name = parts[0].startsWith('.')
              ? parts[parts.length - 1] && parts[2]
              : (parts[0].startsWith('@') ? parts[0] + '/' + parts[1] : parts[0]);
            if (name) seen.add(name);
          }
        } catch { /* unresolvable — nothing we can name */ }
        return load.call(this, request, ...rest);
      };

      process.on('exit', () => fs.writeFileSync(process.env.XEC_PROBE_OUT, [...seen].join('\\n')));
      const fs = require('node:fs');
    `);

    try {
      execFileSync(process.execPath, ['--require', preload, CLI, ...args], {
        env: { ...process.env, XEC_PROBE_OUT: out },
        stdio: 'ignore',
      });
    } catch {
      // A non-zero exit is fine; only what was loaded on the way matters.
    }

    const loaded = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    fs.rmSync(out, { force: true });
    fs.rmSync(preload, { force: true });

    return new Set(loaded.split('\n').filter(Boolean));
  }

  /**
   * Reaching any of these to print a list of command names means the whole
   * command layer was imported. esbuild is the clearest tell: it is a bundler.
   */
  const FORBIDDEN = ['esbuild', 'zod', 'fs-extra'] as const;

  it('loads none of the command-execution machinery for --help', () => {
    const loaded = packagesLoadedBy(['--help']);

    expect(FORBIDDEN.filter(name => loaded.has(name))).toEqual([]);
  }, 60_000);

  it('loads none of it for --version either', () => {
    const loaded = packagesLoadedBy(['--version']);

    expect(FORBIDDEN.filter(name => loaded.has(name))).toEqual([]);
  }, 60_000);

  it('still lists every command', () => {
    const help = execFileSync(process.execPath, [CLI, '--help'], { encoding: 'utf8' });

    for (const name of ['run', 'on', 'in', 'copy', 'forward', 'config']) {
      expect(help).toContain(name);
    }
  }, 60_000);
});
