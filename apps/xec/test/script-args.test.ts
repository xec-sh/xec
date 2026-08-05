import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * A script is a program, and programs take arguments.
 *
 * `xec run script.ts staging` died on commander's arity check — the
 * registration declared no variadic while the usage line printed right below
 * the error promised [args...]. And the context the docs described — `args`,
 * `argv`, `__filename`, `__dirname` — existed only inside an internal
 * `__xecScriptContext` global nobody was told about, so a script following
 * the documentation died on a ReferenceError.
 */
describe('scripts receive their arguments', () => {
  let dir: string;

  const run = (cliArgs: string[]): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...cliArgs], { cwd: dir }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-args-'));
    await fs.writeFile(
      path.join(dir, 'echo-args.ts'),
      "console.log('CTX', JSON.stringify({ args, tail: argv.slice(1), file: __filename, dir: __dirname }));\n"
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const parse = (output: string) => {
    const line = output.split('\n').find(l => l.startsWith('CTX '));
    expect(line, output).toBeDefined();
    return JSON.parse(line!.slice(4)) as { args: string[]; tail: string[]; file: string; dir: string };
  };

  it('passes positional arguments through xec run', async () => {
    const { code, output } = await run(['run', 'echo-args.ts', 'staging', 'v2']);

    const ctx = parse(output);
    expect(ctx.args).toEqual(['staging', 'v2']);
    expect(code).toBe(0);
  }, 60_000);

  it('passes flags after -- untouched', async () => {
    const { output } = await run(['run', 'echo-args.ts', '--', '--force', '-x']);

    expect(parse(output).args).toEqual(['--force', '-x']);
  }, 60_000);

  it('passes flags the run command does not own', async () => {
    const { output } = await run(['run', 'echo-args.ts', 'build', '--parallel', '4']);

    expect(parse(output).args).toEqual(['build', '--parallel', '4']);
  }, 60_000);

  it('argv follows the shell convention and the file names itself', async () => {
    const { output } = await run(['run', 'echo-args.ts', 'one']);

    const ctx = parse(output);
    expect(ctx.tail[0]!.endsWith('echo-args.ts')).toBe(true);
    expect(ctx.tail.slice(1)).toEqual(['one']);
    expect(ctx.file.endsWith('echo-args.ts')).toBe(true);
    expect(ctx.dir).toBe(path.dirname(ctx.file));
  }, 60_000);

  it('the eval context carries empty args and its own argv', async () => {
    const { output } = await run(['-e', "console.log('CTX', JSON.stringify({ args, tail: argv }))"]);

    const line = output.split('\n').find(l => l.startsWith('CTX '));
    expect(line, output).toBeDefined();
    const ctx = JSON.parse(line!.slice(4)) as { args: string[]; tail: string[] };
    expect(ctx.args).toEqual([]);
    expect(ctx.tail).toEqual(['xec', '<eval>']);
  }, 60_000);
});
