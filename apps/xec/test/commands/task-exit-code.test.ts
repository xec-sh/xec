import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');

/**
 * An exit code is a message. `exit 3` inside a task means something
 * specific to whoever wrote it — a migration that found nothing to do, a
 * check that failed in a particular way — and the CLI answered 1 for every
 * failure, so a caller could tell that something went wrong and never
 * what. The classified codes for the CLI's own failures still hold: a task
 * choosing its own code does not disturb them.
 */
describe('a task keeps the exit code it chose', () => {
  let dir: string;

  const run = (args: string[]): Promise<{ code: number; stdout: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...args], { cwd: dir }, (error, stdout) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          stdout: String(stdout),
        });
      });
    });

  beforeAll(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-exit-'));
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      [
        'version: "1.0"',
        'tasks:',
        '  three:',
        '    command: exit 3',
        '  forty-two:',
        '    command: exit 42',
        '  fine:',
        '    command: echo ok',
        '',
      ].join('\n')
    );
  });

  afterAll(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('propagates a specific failure code through xec run', async () => {
    expect((await run(['run', 'three'])).code).toBe(3);
  }, 60_000);

  it('propagates it through the bare task shorthand too', async () => {
    expect((await run(['forty-two'])).code).toBe(42);
  }, 60_000);

  it('still exits zero when the task succeeds', async () => {
    const { code, stdout } = await run(['run', 'fine']);

    expect(code).toBe(0);
    expect(stdout).toContain('ok');
  }, 60_000);

  it('keeps the classified code for the CLI\'s own failures', async () => {
    // An unknown output format is a validation error, which the documented
    // table numbers 2 — a task's code must not have displaced that.
    expect((await run(['inspect', 'targets', '-o', 'nonsense'])).code).toBe(2);
  }, 60_000);
});
