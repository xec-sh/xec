import * as os from 'node:os';
import * as path from 'node:path';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const CLI = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../dist/main.js');

/**
 * Secrets belong to the project that uses them.
 *
 * They used to live in one machine-wide store, so a brand-new project in an
 * empty directory listed — and could read — the secrets of every other
 * project on the machine. Nobody asked for that, and nobody would notice it
 * until the wrong credential reached the wrong host.
 */
describe('secrets do not leak between projects', () => {
  let root: string;
  let alpha: string;
  let beta: string;

  const run = (args: string[], cwd: string): Promise<{ code: number; output: string }> =>
    new Promise(resolve => {
      execFile(process.execPath, [CLI, ...args], { cwd }, (error, stdout, stderr) => {
        resolve({
          code: (error as NodeJS.ErrnoException & { code?: number })?.code ?? 0,
          output: String(stdout) + String(stderr),
        });
      });
    });

  const project = async (name: string): Promise<string> => {
    const dir = path.join(root, name);
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(path.join(dir, '.xec', 'config.yaml'), 'version: "1.0"\n');
    return dir;
  };

  beforeAll(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-scope-'));
    alpha = await project('alpha');
    beta = await project('beta');
  }, 60_000);

  afterAll(async () => {
    await fs.rm(root, { recursive: true, force: true });
  });

  it('stores a secret inside the project that set it', async () => {
    const set = await run(['secrets', 'set', 'db-password', '--value', 'alpha-only'], alpha);
    expect(set.code, set.output).toBe(0);

    const entries = await fs.readdir(path.join(alpha, '.xec', 'secrets'));
    expect(entries.some(name => name.endsWith('.secret'))).toBe(true);
  }, 60_000);

  it('does not show it to another project', async () => {
    const list = await run(['secrets', 'list'], beta);

    expect(list.output).not.toContain('db-password');
  }, 60_000);

  it('does not let another project read it', async () => {
    const read = await run(['secrets', 'get', 'db-password'], beta);

    expect(read.output).not.toContain('alpha-only');
    expect(read.code).not.toBe(0);
  }, 60_000);

  it('keeps the store readable only by its owner', async () => {
    const dir = await fs.stat(path.join(alpha, '.xec', 'secrets'));
    expect(dir.mode & 0o077).toBe(0);

    const entries = await fs.readdir(path.join(alpha, '.xec', 'secrets'));
    for (const name of entries) {
      const file = await fs.stat(path.join(alpha, '.xec', 'secrets', name));
      expect(file.mode & 0o077, `${name} is readable by others`).toBe(0);
    }
  }, 60_000);

  it('a generated project ignores its own secret store', async () => {
    const created = await run(['new', 'project', 'gen', '-d', 'probe', '--skip-git'], root);
    expect(created.code, created.output).toBe(0);

    const ignored = await fs.readFile(path.join(root, 'gen', '.xec', '.gitignore'), 'utf-8');
    expect(ignored).toContain('secrets/');
  }, 120_000);
});
