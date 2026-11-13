/** The public scaffold command must produce runnable, strictly typed programs. */
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { it, expect, describe, afterAll, beforeAll } from 'vitest';

const root = fileURLToPath(new URL('../../../..', import.meta.url));
const cli = path.join(root, 'apps/xec/bin/xec');
const variants = ['basic-js', 'basic-ts', 'advanced-js', 'advanced-ts'] as const;
let directory: string;

function execute(argv: string[], cwd = directory) {
  return new Promise<{ code: number | null; output: string }>((resolve, reject) => {
    const child = spawn(process.execPath, argv, {
      cwd,
      env: { ...process.env, CI: 'true', XEC_NO_INTERACTIVE: 'true', NO_COLOR: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let output = '';
    child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
    child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, output }));
  });
}

async function run(...args: string[]) {
  return execute([cli, ...args]);
}

beforeAll(async () => {
  directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-scaffold-runtime-'));
  await fs.mkdir(path.join(directory, '.xec'), { recursive: true });
  await fs.mkdir(path.join(directory, '.tmp'));
  await fs.writeFile(path.join(directory, '.tmp', 'unrelated.txt'), 'must survive');
  await fs.writeFile(path.join(directory, 'package.json'), '{"type":"module"}');
  await fs.writeFile(path.join(directory, '.xec', 'config.yaml'), 'version: "1.0"\nname: scaffold-fixture\n');
  for (const variant of variants) {
    const flags = ['--force', '--desc', 'Public scaffold regression'];
    if (variant.endsWith('js')) flags.push('--js');
    if (variant.startsWith('advanced')) flags.push('--advanced');
    for (const type of ['script', 'command']) {
      const result = await run('new', type, `${type}-${variant}`, ...flags);
      expect(result.code, result.output).toBe(0);
    }
  }
}, 60_000);

afterAll(async () => {
  if (directory) await fs.rm(directory, { recursive: true, force: true });
});

describe('generated scripts through xec run', () => {
  for (const variant of variants) {
    const extension = variant.endsWith('js') ? 'js' : 'ts';
    const script = `.xec/scripts/script-${variant}.${extension}`;
    it(`runs ${variant} without network access or additional packages`, async () => {
      const result = await run('run', script);
      expect(result.code, result.output).toBe(0);
      expect(result.output).not.toMatch(/ReferenceError|TypeError|Failed to fetch/);
      if (variant.startsWith('advanced')) expect(result.output).toContain('Target runtime checked');
      expect(await fs.readFile(path.join(directory, '.tmp', 'unrelated.txt'), 'utf8')).toBe('must survive');
    });
    if (variant.startsWith('advanced')) {
      it(`${variant} parses adjacent flags and dry run`, async () => {
        const result = await run('run', script, '--', '--dry-run', '--verbose');
        expect(result.code, result.output).toBe(0);
        expect(result.output).toContain('Dry run: would execute node --version');
        expect(result.output).not.toContain('Target runtime checked');
      });
      it(`${variant} rejects an invalid environment`, async () => {
        const result = await run('run', script, '--', '--env', 'invalid');
        expect(result.code, result.output).not.toBe(0);
        expect(result.output).toContain('Invalid environment: invalid');
      });
      it(`${variant} never substitutes local for a missing production target`, async () => {
        const result = await run('run', script, '--', '--env', 'production');
        expect(result.code, result.output).not.toBe(0);
        expect(result.output).toContain('production');
        expect(result.output).not.toContain('Target runtime checked');
      });
    }
  }
});

describe('generated dynamic commands', () => {
  for (const variant of variants) {
    it(`executes ${variant} through ordinary command discovery`, async () => {
      const result = await run(`command-${variant}`, ...(variant.startsWith('advanced') ? ['list'] : ['example']));
      expect(result.code, result.output).toBe(0);
      expect(result.output).toContain(variant.startsWith('advanced') ? 'example' : 'executed successfully');
    });
    if (variant.startsWith('advanced')) {
      it(`${variant} cannot silently confirm a noninteractive mutation`, async () => {
        const result = await run(`command-${variant}`, 'create', 'sample', '--type', 'service');
        expect(result.code, result.output).not.toBe(0);
        expect(result.output).toContain('pass --yes explicitly');
      });
      it(`${variant} carries the documented description option into the example`, async () => {
        const result = await run(`command-${variant}`, 'create', 'sample', '--type', 'service', '--description', 'Exact description', '--yes');
        expect(result.code, result.output).toBe(0);
        expect(result.output).toContain('Exact description');
        expect(result.output).toContain('no item was stored');
      });
    }
  }
});

it('all eight generated files compile against the real public API in strict mode', async () => {
  const blocks: string[] = [];
  for (const type of ['script', 'command']) {
    for (const variant of variants) {
      const language = variant.endsWith('js') ? 'js' : 'ts';
      const file = path.join(directory, '.xec', `${type}s`, `${type}-${variant}.${language}`);
      const source = (await fs.readFile(file, 'utf8')).replace(/^#![^\n]*\n/, '');
      blocks.push(`\n## ${type}-${variant}\n\n\`\`\`${language}\n${source}\n\`\`\`\n`);
    }
  }
  const examples = path.join(directory, 'generated.md');
  await fs.writeFile(examples, blocks.join('\n'));
  const result = await execute([path.join(root, 'scripts/check-doc-examples.mjs'), '--file', examples, '--strict'], root);
  expect(result.code, result.output).toBe(0);
  expect(result.output).toContain('8 examples checked. 0 failing blocks');
});
