import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist/main.js');

/**
 * `xec config set` claimed success and persisted nothing.
 *
 * save() writes the manager's raw configuration; the command mutated the
 * resolved view and poked it into a private field save() never reads. The
 * file was rewritten — comments stripped, keys reordered — with the change
 * absent, and `config get` right after `set` answered "not found". The same
 * road carried every mutating subcommand: vars, targets, tasks, defaults.
 */
describe('config edits reach the file', () => {
  let dir: string;

  const run = (
    cliArgs: string[]
  ): Promise<{ code: number; stdout: string; stderr: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...cliArgs], { cwd: dir }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          stdout: String(stdout),
          stderr: String(stderr),
        });
      });
    });

  const configPath = () => path.join(dir, '.xec', 'config.yaml');

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-cfgpersist-'));
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(
      configPath(),
      [
        `version: '1.0'`,
        'name: persist-probe',
        'vars:',
        '  existing: kept',
        'tasks:',
        '  hello:',
        '    description: Say hello',
        '    command: echo hello',
        '',
      ].join('\n')
    );
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('set writes the value into the project file', async () => {
    const { code } = await run(['config', 'set', 'vars.answer', '42']);
    expect(code).toBe(0);

    const onDisk = await fs.readFile(configPath(), 'utf-8');
    expect(onDisk).toContain('answer: 42');
    expect(onDisk).toContain('existing: kept');
  }, 30_000);

  it('get reads back what set wrote', async () => {
    await run(['config', 'set', 'vars.answer', '42']);
    const { code, stdout } = await run(['config', 'get', 'vars.answer']);
    expect(stdout).toContain('42');
    expect(code).toBe(0);
  }, 30_000);

  it('get of a missing key fails', async () => {
    const { code } = await run(['config', 'get', 'vars.absent']);
    expect(code).toBe(1);
  }, 30_000);

  it('unset removes the key from the file and misses loudly', async () => {
    await run(['config', 'set', 'vars.transient', 'here']);
    const removed = await run(['config', 'unset', 'vars.transient']);
    expect(removed.code).toBe(0);
    expect(await fs.readFile(configPath(), 'utf-8')).not.toContain('transient');

    const again = await run(['config', 'unset', 'vars.transient']);
    expect(again.code).toBe(1);
  }, 30_000);

  it('validate accepts a command-only task', async () => {
    const { code, stdout } = await run(['config', 'validate']);
    expect(stdout).not.toContain(`Task 'hello'`);
    expect(code).toBe(0);
  }, 30_000);

  it('validate fails on a target that names nothing', async () => {
    await fs.appendFile(configPath(), 'targets:\n  containers:\n    empty: {}\n');
    const { code } = await run(['config', 'validate']);
    expect(code).toBe(1);
  }, 30_000);
});
