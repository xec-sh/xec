import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFile } from 'node:child_process';
import { rm, mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { it, expect, afterAll, describe, beforeAll } from 'vitest';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const cli = join(root, 'apps/xec/src/main.ts');
const tsx = createRequire(import.meta.url).resolve('tsx');
const execute = promisify(execFile);
let fixture: string;
let config: string;

beforeAll(async () => {
  fixture = await mkdtemp(join(tmpdir(), 'xec-local-argv-'));
  config = join(fixture, 'tsconfig.json');
  await writeFile(config, JSON.stringify({ compilerOptions: { paths: {
    '@xec-sh/core': [join(root, 'packages/core/src/index.ts')],
    '@xec-sh/ops': [join(root, 'packages/ops/src/index.ts')],
    '@xec-sh/ops/*': [join(root, 'packages/ops/src/*.ts')],
  } } }));
  await mkdir(join(fixture, '.xec/commands'), { recursive: true });
  await writeFile(join(fixture, '.xec/commands/unrelated.js'), 'throw new Error("PROJECT_COMMAND_WAS_EVALUATED");');
  await writeFile(join(fixture, '.xec/config.yaml'), 'this is intentionally not an Xec configuration');
});
afterAll(async () => { await rm(fixture, { recursive: true, force: true }); });

async function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  try {
    const result = await execute(process.execPath, ['--import', tsx, cli, ...args], {
      cwd: fixture, timeout: 15_000,
      env: { ...process.env, TSX_TSCONFIG_PATH: config, XEC_HOME_DIR: join(fixture, 'home'), NO_COLOR: '1', ...extra },
    });
    return { ...result, code: 0 };
  } catch (value) {
    const error = value as Error & { code: number; stdout: string; stderr: string };
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('native CLI local dispatch', () => {
  it('preserves arguments after -- without loading project code or configuration', async () => {
    const args = ['two words', '', '$(echo injected)', '`echo injected`', '; echo injected', 'line\nbreak', '-q', '--help'];
    const result = await run(['--', process.execPath, '-e', 'process.stdout.write(JSON.stringify(process.argv.slice(1)));process.stderr.write("warn\\n\\n")', '--', ...args]);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(JSON.stringify(args));
    expect(result.stderr).toBe('warn\n\n');
  });

  it('honors root cwd before explicit local argv', async () => {
    const directory = join(fixture, 'space directory');
    await mkdir(directory);
    const result = await run(['--cwd', directory, '--', process.execPath, '-e', 'process.stdout.write(process.cwd())']);
    expect(result.code, result.stderr).toBe(0);
    expect(result.stdout).toBe(resolve(directory));
  });

  it('retains failed command output and status while masking diagnostic secrets', async () => {
    const result = await run(['--', process.execPath, '-e', 'process.stdout.write(process.env.PROBE_OUT);process.stderr.write(process.env.PROBE_ERR);process.exitCode=7'], {
      PROBE_OUT: 'stdout-evidence\ntoken=private-sentinel', PROBE_ERR: 'stderr-evidence',
    });
    expect(result.code, result.stderr).toBe(7);
    expect(result.stderr).toContain('stdout-evidence');
    expect(result.stderr).toContain('stderr-evidence');
    expect(result.stderr).not.toContain('private-sentinel');
  });

  it('keeps child exit status under root quiet', async () => {
    const result = await run(['--quiet', '--', process.execPath, '-e', 'process.exitCode=7']);
    expect(result.code, result.stderr).toBe(7);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('');
  });
});
