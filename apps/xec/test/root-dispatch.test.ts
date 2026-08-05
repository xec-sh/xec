import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * Root options act on every dispatch path, not only the commander one.
 *
 * `--cwd` and `--no-color` were applied in a commander preAction hook, which
 * never runs for the paths that bypass parseAsync: an eval, a task, a direct
 * command. `xec --cwd /x -e ...` evaluated in the old directory; and task
 * parameters obeyed a different grammar at the root than under `run` —
 * `--who=a=b` lost its tail, a valueless flag vanished, `-p` was unknown.
 */
describe('root dispatch', () => {
  let dir: string;

  const run = (
    cliArgs: string[],
    cwd?: string
  ): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...cliArgs], { cwd: cwd ?? dir }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-dispatch-'));
    await fs.mkdir(path.join(dir, '.xec'));
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      [
        'name: dispatch-test',
        'tasks:',
        '  greet:',
        '    params:',
        '      - name: who',
        '        required: true',
        '    command: echo "P=${params.who}"',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('applies --cwd on the eval path', async () => {
    const { output } = await run(['--cwd', os.tmpdir(), '-e', 'console.log("CWD=" + process.cwd())']);
    const line = output.split('\n').find(l => l.startsWith('CWD='));
    expect(line, output).toBeDefined();
    expect(await fs.realpath(line!.slice(4))).toBe(await fs.realpath(os.tmpdir()));
  }, 60_000);

  it('rejects a --cwd that does not exist', async () => {
    const { code, output } = await run(['--cwd', '/no/such/dir', '-e', '1']);
    expect(output).toContain("Cannot change directory to '/no/such/dir'");
    expect(code).not.toBe(0);
  }, 60_000);

  it('applies --no-color on the eval path', async () => {
    const { output } = await run(['--no-color', '-e', 'console.log("NC=" + process.env.NO_COLOR)']);
    expect(output).toContain('NC=1');
  }, 60_000);

  it('keeps every = in a root task parameter value', async () => {
    const { output } = await run(['greet', '--who=a=b']);
    expect(output).toContain('P=a=b');
  }, 60_000);

  it('accepts --key value and -p key=value for a root task alike', async () => {
    expect((await run(['greet', '--who', 'space'])).output).toContain('P=space');
    expect((await run(['greet', '-p', 'who=pair'])).output).toContain('P=pair');
  }, 60_000);

  it('accepts --key value under run as -p does', async () => {
    expect((await run(['run', 'greet', '--who', 'viarun'])).output).toContain('P=viarun');
    expect((await run(['run', 'greet', '-p', 'who=viap'])).output).toContain('P=viap');
  }, 60_000);

  it('refuses a stray positional after a task name', async () => {
    const { code, output } = await run(['greet', 'stray', '--who', 'x']);
    expect(output).toContain("Unexpected argument for task 'greet': stray");
    expect(code).not.toBe(0);
  }, 60_000);

  it('leaves -e alone after the command word', async () => {
    // Before the boundary, any -e anywhere in argv switched the whole
    // invocation into eval mode - even a script's own arguments.
    const script = path.join(dir, 'echo-args.mjs');
    await fs.writeFile(script, "console.log('GOT', JSON.stringify(process.argv.slice(2)))\n");
    const { output } = await run([script, '-e', 'payload']);
    expect(output).toContain('"-e"');
    expect(output).not.toContain('Evaluating');
  }, 60_000);
});
