import type { ResolvedTarget } from '../../../src/config/types.js';

import * as os from 'node:os';
import * as path from 'node:path';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

import {
  ScriptLoader,
  commandFileUrl,
  getScriptLoader,
} from '../../../src/adapters/loader-adapter.js';

/**
 * The loader executes scripts by importing real files, so every test works
 * against a real scratch directory. Marker files are the only channel a
 * script has to prove what it observed at run time.
 */

let scratchDir: string;

function scratchPath(name: string): string {
  return path.join(scratchDir, name);
}

async function writeScript(name: string, source: string): Promise<string> {
  const filePath = scratchPath(name);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, source);
  return filePath;
}

async function readMarker(name: string): Promise<string> {
  return fs.readFile(scratchPath(name), 'utf8');
}

/** Minimal stand-in for a commander program. */
function fakeProgram() {
  const registered: string[] = [];
  return {
    registered,
    command(name: string) {
      registered.push(name);
      return this;
    },
  };
}

beforeEach(async () => {
  scratchDir = path.join(
    os.tmpdir(),
    `xec-ops-loader-${randomBytes(6).toString('hex')}`
  );
  await fs.mkdir(scratchDir, { recursive: true });
});

afterEach(async () => {
  await fs.rm(scratchDir, { recursive: true, force: true });
});

describe('ScriptLoader.executeScript', () => {
  it('executes a script file and reports success', async () => {
    const marker = scratchPath('ran.txt');
    const script = await writeScript(
      'ok.mjs',
      `import { writeFile } from 'node:fs/promises';
       await writeFile(${JSON.stringify(marker)}, 'ran');`
    );

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(script);

    expect(result.success).toBe(true);
    expect(result.error).toBeUndefined();
    expect(await readMarker('ran.txt')).toBe('ran');
  });

  it('injects the provided script context as __xecScriptContext', async () => {
    const marker = scratchPath('ctx.json');
    const script = await writeScript(
      'ctx.mjs',
      `import { writeFile } from 'node:fs/promises';
       await writeFile(${JSON.stringify(marker)}, JSON.stringify(globalThis.__xecScriptContext));`
    );

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(script, {
      context: {
        args: ['alpha', 'beta'],
        argv: ['node', script, 'alpha', 'beta'],
        __filename: script,
        __dirname: path.dirname(script),
      },
    });

    expect(result.success).toBe(true);
    const seen = JSON.parse(await readMarker('ctx.json'));
    expect(seen.args).toEqual(['alpha', 'beta']);
    expect(seen.__filename).toBe(script);
  });

  it('exposes every declared script global at run time', async () => {
    // Regression for the drifted hand-typed global lists: retry, sleep,
    // within and glob were declared in globals.d.ts yet undefined when a
    // script ran. The loader must inject the full declared set plus the
    // module-loading pair (use, x).
    const names = [
      '$', 'cd', 'pwd', 'echo', 'kit', 'prism', 'log', 'glob', 'within',
      'retry', 'sleep', 'quote', 'which', 'tmpdir', 'tmpfile', 'yaml',
      'csv', 'parseArgs', 'loadEnv', 'use', 'x',
    ];
    const marker = scratchPath('globals.json');
    const script = await writeScript(
      'globals.mjs',
      `import { writeFile } from 'node:fs/promises';
       const names = ${JSON.stringify(names)};
       const missing = names.filter((n) => typeof globalThis[n] === 'undefined');
       await writeFile(${JSON.stringify(marker)}, JSON.stringify(missing));`
    );

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(script);

    expect(result.success).toBe(true);
    expect(JSON.parse(await readMarker('globals.json'))).toEqual([]);
  });

  it('injects $target and $targetInfo when target and engine are provided', async () => {
    const marker = scratchPath('target.json');
    const script = await writeScript(
      'target.mjs',
      `import { writeFile } from 'node:fs/promises';
       await writeFile(${JSON.stringify(marker)}, JSON.stringify({
         engine: globalThis.$target?.probe,
         info: globalThis.$targetInfo,
       }));`
    );

    const target: ResolvedTarget = {
      id: 'hosts.web-1',
      type: 'ssh',
      name: 'web-1',
      config: { type: 'ssh', host: 'web-1.internal', user: 'deploy' },
      source: 'configured',
    };

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(script, {
      target,
      targetEngine: { probe: 'engine-7c40' },
    });

    expect(result.success).toBe(true);
    const seen = JSON.parse(await readMarker('target.json'));
    expect(seen.engine).toBe('engine-7c40');
    expect(seen.info.type).toBe('ssh');
    expect(seen.info.name).toBe('web-1');
  });

  it('reports failure for a missing script file', async () => {
    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(scratchPath('does-not-exist.mjs'));

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
    expect(String(result.error?.message)).toContain('not found');
  });

  it('captures an error thrown by the script', async () => {
    const script = await writeScript(
      'boom.mjs',
      `throw new Error('boom-51d2');`
    );

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.executeScript(script);

    expect(result.success).toBe(false);
    expect(result.error?.message).toContain('boom-51d2');
  });
});

describe('ScriptLoader.evaluateCode', () => {
  it('evaluates plain JavaScript', async () => {
    const marker = scratchPath('eval.txt');
    const loader = new ScriptLoader({ quiet: true });

    const result = await loader.evaluateCode(
      `const { writeFile } = await import('node:fs/promises');
       await writeFile(${JSON.stringify(marker)}, 'evaluated');`
    );

    expect(result.success).toBe(true);
    expect(await readMarker('eval.txt')).toBe('evaluated');
  });

  it('rejects TypeScript syntax when the typescript option is off', async () => {
    // Code is imported as a data: URL; no runtime type-strips those, so
    // TypeScript syntax must fail without the transform.
    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.evaluateCode(
      `interface Probe { value: number }
       const p: Probe = { value: 1 };`
    );

    expect(result.success).toBe(false);
    expect(result.error).toBeInstanceOf(Error);
  });

  it('compiles TypeScript when the constructor enables it', async () => {
    const marker = scratchPath('eval-ts.txt');
    const loader = new ScriptLoader({ quiet: true, typescript: true });

    const result = await loader.evaluateCode(
      `interface Probe { value: string }
       const p: Probe = { value: 'ts-4b1e' };
       const { writeFile } = await import('node:fs/promises');
       await writeFile(${JSON.stringify(marker)}, p.value);`
    );

    expect(result.success).toBe(true);
    expect(await readMarker('eval-ts.txt')).toBe('ts-4b1e');
  });

  it('compiles TypeScript when the call enables it', async () => {
    const marker = scratchPath('eval-ts-call.txt');
    const loader = new ScriptLoader({ quiet: true });

    const result = await loader.evaluateCode(
      `const n: number = 17;
       const { writeFile } = await import('node:fs/promises');
       await writeFile(${JSON.stringify(marker)}, String(n));`,
      { typescript: true }
    );

    expect(result.success).toBe(true);
    expect(await readMarker('eval-ts-call.txt')).toBe('17');
  });
});

describe('ScriptLoader.loadDynamicCommand', () => {
  it('loads a JavaScript command exporting a default function', async () => {
    const file = await writeScript(
      'cmd-default.js',
      `export default function (program) { program.command('deploy-x'); }`
    );

    const loader = new ScriptLoader({ quiet: true });
    const program = fakeProgram();
    const result = await loader.loadDynamicCommand(file, program, 'deploy-x');

    expect(result).toEqual({ success: true });
    expect(program.registered).toEqual(['deploy-x']);
  });

  it('accepts setup and command named exports', async () => {
    const setupFile = await writeScript(
      'cmd-setup.js',
      `export function setup(program) { program.command('via-setup'); }`
    );
    const commandFile = await writeScript(
      'cmd-command.js',
      `export function command(program) { program.command('via-command'); }`
    );

    const loader = new ScriptLoader({ quiet: true });

    const p1 = fakeProgram();
    expect((await loader.loadDynamicCommand(setupFile, p1, 'a')).success).toBe(true);
    expect(p1.registered).toEqual(['via-setup']);

    const p2 = fakeProgram();
    expect((await loader.loadDynamicCommand(commandFile, p2, 'b')).success).toBe(true);
    expect(p2.registered).toEqual(['via-command']);
  });

  it('resolves a relative JavaScript path against the working directory', async () => {
    // Regression: a relative path was handed to import() verbatim and
    // resolved as a package specifier, never as a file.
    const file = await writeScript(
      path.join('cmds', 'rel.js'),
      `export default function (program) { program.command('relative'); }`
    );

    const previousCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      const loader = new ScriptLoader({ quiet: true });
      const program = fakeProgram();
      const result = await loader.loadDynamicCommand(
        path.relative(scratchDir, file),
        program,
        'relative'
      );

      expect(result).toEqual({ success: true });
      expect(program.registered).toEqual(['relative']);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('transpiles a TypeScript command and cleans up its temp file', async () => {
    const file = await writeScript(
      'cmd-typed.ts',
      `interface Registrar { command(name: string): unknown }
       export default function (program: Registrar): void {
         program.command('typed-cmd');
       }`
    );

    const previousCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      const loader = new ScriptLoader({ quiet: true });
      const program = fakeProgram();
      const result = await loader.loadDynamicCommand(file, program, 'typed-cmd');

      expect(result).toEqual({ success: true });
      expect(program.registered).toEqual(['typed-cmd']);

      const tmpDir = path.join(scratchDir, '.xec', '.tmp');
      if (existsSync(tmpDir)) {
        expect(await fs.readdir(tmpDir)).toEqual([]);
      }
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('gives concurrently loaded TypeScript commands their own modules', async () => {
    // Regression: temp files were named xec-cmd-<Date.now()>.js, so two
    // loads in the same millisecond shared one path and one ESM cache entry
    // — the second command received the first command's exports.
    const fileA = await writeScript(
      'cmd-a.ts',
      `export default function (program: { command(n: string): unknown }): void {
         program.command('cmd-a');
       }`
    );
    const fileB = await writeScript(
      'cmd-b.ts',
      `export default function (program: { command(n: string): unknown }): void {
         program.command('cmd-b');
       }`
    );

    const previousCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      const loader = new ScriptLoader({ quiet: true });
      const programA = fakeProgram();
      const programB = fakeProgram();

      const [resultA, resultB] = await Promise.all([
        loader.loadDynamicCommand(fileA, programA, 'cmd-a'),
        loader.loadDynamicCommand(fileB, programB, 'cmd-b'),
      ]);

      expect(resultA).toEqual({ success: true });
      expect(resultB).toEqual({ success: true });
      expect(programA.registered).toEqual(['cmd-a']);
      expect(programB.registered).toEqual(['cmd-b']);
    } finally {
      process.chdir(previousCwd);
    }
  });

  it('rejects a module that exports no function', async () => {
    const file = await writeScript('cmd-data.js', `export default { name: 'nope' };`);

    const loader = new ScriptLoader({ quiet: true });
    const result = await loader.loadDynamicCommand(file, fakeProgram(), 'nope');

    expect(result.success).toBe(false);
    expect(result.error).toContain('export a default function');
  });

  it('reports a TypeScript file that fails to parse', async () => {
    const file = await writeScript('cmd-broken.ts', `export default function ( {`);

    const previousCwd = process.cwd();
    process.chdir(scratchDir);
    try {
      const loader = new ScriptLoader({ quiet: true });
      const result = await loader.loadDynamicCommand(file, fakeProgram(), 'broken');

      expect(result.success).toBe(false);
      expect(typeof result.error).toBe('string');
      expect(result.error?.length).toBeGreaterThan(0);
    } finally {
      process.chdir(previousCwd);
    }
  });
});

describe('commandFileUrl', () => {
  // Regression for URLs built as `file://${path}`: everything after '#'
  // parsed as a fragment and '%' was double-interpreted, so command files in
  // such directories were reported as "not found". End-to-end imports of
  // these URLs are proven against plain Node; vitest's SSR runner cannot
  // load percent-encoded file URLs, so the mapping is pinned here instead.
  it('percent-encodes # and spaces', () => {
    const url = commandFileUrl('/opt/release #2 dir/cmd.js');
    expect(url).toBe('file:///opt/release%20%232%20dir/cmd.js');
  });

  it('percent-encodes an existing % so it cannot re-decode', () => {
    const url = commandFileUrl('/opt/100%done/cmd.js');
    expect(url).toBe('file:///opt/100%25done/cmd.js');
  });

  it('resolves relative paths against the working directory', () => {
    const url = commandFileUrl('cmds/rel.js');
    expect(url).toBe(
      `file://${path.resolve('cmds/rel.js').split(path.sep).join('/')}`
    );
  });
});

describe('getScriptLoader', () => {
  it('shares one instance per option set', () => {
    const a = getScriptLoader({ quiet: true, verbose: false });
    const b = getScriptLoader({ quiet: true, verbose: false });
    expect(a).toBe(b);
  });

  it('does not silently reuse an instance built with different options', () => {
    // Regression: a single cached instance meant the first caller's options
    // won for the rest of the process — a later `quiet: true` was dropped.
    const loud = getScriptLoader({ quiet: false });
    const quiet = getScriptLoader({ quiet: true });
    expect(loud).not.toBe(quiet);
  });
});

describe('ScriptLoader option wiring', () => {
  it('passes cache and verbose through to the module loader', () => {
    // Structural check on a private field: the defect being pinned is an
    // option accepted by the constructor and dropped before reaching the
    // ModuleLoader, which has no public read-back for its options.
    const loader = new ScriptLoader({ quiet: true, cache: false, verbose: true });
    const moduleLoaderOptions = (loader as any).moduleLoader.options;
    expect(moduleLoaderOptions.cache).toBe(false);
    expect(moduleLoaderOptions.verbose).toBe(true);
  });
});
