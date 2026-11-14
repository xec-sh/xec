import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join, delimiter } from 'node:path';
import { ExecutionEngine } from '@xec-sh/core';
import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

const entry = fileURLToPath(new URL('../../dist/main.js', import.meta.url));

// The real CLI can only reach this private executable. No Docker daemon is used.
describe.skipIf(process.platform === 'win32')('Docker prune CLI', () => {
  let directory: string;
  let record: string;
  let engine: ExecutionEngine;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-prune-contract-'));
    record = join(directory, 'calls.json');
    const program = '#!' + process.execPath + '\n' +
      "const fs = require('node:fs');\n" +
      'fs.writeFileSync(process.env.XEC_PRUNE_RECORD, JSON.stringify(process.argv.slice(2)));\n' +
      "if (process.env.XEC_PRUNE_REFUSE) { process.stderr.write('daemon refused cleanup'); process.exitCode = 7; }\n";
    await writeFile(join(directory, 'docker'), program, { mode: 0o700 });
    engine = new ExecutionEngine({ defaultTimeout: 10000 });
  });
  afterEach(async () => {
    await engine.dispose();
    await rm(directory, { recursive: true, force: true });
  });
  const run = (args: string[], refuse = false) => engine.exec(process.execPath, {
    args: [entry, ...args], shell: false, cwd: directory, nothrow: true,
    env: { PATH: directory + delimiter + process.env['PATH'], XEC_PRUNE_RECORD: record,
      XEC_PRUNE_REFUSE: refuse ? '1' : '', NO_COLOR: '1' },
  });

  it('keeps the builtin ahead of a same-named local file and forwards only requested flags', async () => {
    expect((await run(['docker', 'prune', '--all', '--volumes'])).exitCode).toBe(0);
    expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(['system', 'prune', '--force', '--all', '--volumes']);
    expect((await run(['docker', 'prune'])).exitCode).toBe(0);
    expect(JSON.parse(await readFile(record, 'utf8'))).toEqual(['system', 'prune', '--force']);
  });
  it('keeps dry run free from Docker execution', async () => {
    expect((await run(['docker', '--dry-run', 'prune', '--volumes'])).exitCode).toBe(0);
    await expect(readFile(record)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await run(['docker', 'prune', '--dry-run', '--volumes'])).exitCode).toBe(0);
    await expect(readFile(record)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('never starts a container when dry-run is set on the group', async () => {
    expect((await run(['docker', '--dry-run', 'container', 'run', 'alpine', '--name', 'synthetic', '-p', '127.0.0.1::80', '-v', '/synthetic:/data:ro'])).exitCode).toBe(0);
    await expect(readFile(record)).rejects.toMatchObject({ code: 'ENOENT' });
  });
  it('returns failure when Docker refuses cleanup', async () => {
    const result = await run(['docker', 'prune'], true);
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr + result.stdout).toContain('daemon refused cleanup');
  });
});
