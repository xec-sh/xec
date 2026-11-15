/**
 * Tests for the run command.
 *
 * The dry-run cases matter more than they look: `run --dry-run` is advertised
 * in the command's own help examples, and `copy`/`in`/`on` all honour the flag
 * correctly. A user who has seen it work there will reasonably trust it here
 * before rehearsing a destructive task.
 */

import * as os from 'os';
import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { RunCommand } from '../../src/commands/run.js';

describe('run command', () => {
  let projectDir: string;
  let markerPath: string;
  let originalCwd: string;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-run-test-'));
    markerPath = path.join(projectDir, 'side-effect.txt');

    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.writeFile(
      path.join(projectDir, '.xec', 'config.yaml'),
      [
        'version: "1.0"',
        'tasks:',
        '  sideeffect:',
        `    command: touch ${JSON.stringify(markerPath)}`,
        '',
      ].join('\n'),
      'utf-8'
    );

    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  // execute() reads the task name from args[0] and the parsed options from the
  // last element, which is the shape commander hands it.
  const execute = (options: Record<string, unknown>) =>
    new RunCommand().execute(['sideeffect', [], options]);

  describe('--dry-run', () => {
    it('does not execute the task', async () => {
      await execute({ dryRun: true });

      expect(existsSync(markerPath)).toBe(false);
    });
  });

  it('does not load a script or evaluate code through the registered CLI command', async () => {
    const program = `require('node:fs').writeFileSync(${JSON.stringify(markerPath)}, 'bad')`;
    const file = path.join(projectDir, 'sideeffect.mjs');
    await fs.writeFile(file, `import{writeFileSync}from'node:fs';writeFileSync(${JSON.stringify(markerPath)},'bad');`);
    for (const argv of [[file, '--dry-run'], ['--eval', program, '--dry-run']]) {
      await new RunCommand().create().parseAsync(argv, { from: 'user' });
      expect(existsSync(markerPath)).toBe(false);
    }
  });

  it('refuses executable configuration in dry-run even when the file is trusted', async () => {
    const previous = process.env['XEC_TRUST_CONFIG'];
    process.env['XEC_TRUST_CONFIG'] = '1';
    try {
      await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), [
        'version: "1.0"',
        'vars:',
        `  effect: "\${cmd:touch ${markerPath}}"`,
        'tasks:',
        '  sideeffect: echo harmless',
      ].join('\n'));
      await expect(execute({ dryRun: true })).rejects.toThrow(/Dry-run.*unknown/);
      expect(existsSync(markerPath)).toBe(false);
    } finally {
      if (previous === undefined) delete process.env['XEC_TRUST_CONFIG'];
      else process.env['XEC_TRUST_CONFIG'] = previous;
    }
  });

  it('does not initialize secret storage while previewing a task', async () => {
    const storage = path.join(projectDir, 'never-created-secrets');
    await fs.writeFile(path.join(projectDir, '.xec', 'config.yaml'), [
      'version: "1.0"', 'secrets:', '  provider: local', '  config:',
      `    storageDir: ${JSON.stringify(storage)}`,
      'tasks:', '  sideeffect: echo harmless',
    ].join('\n'));
    await execute({ dryRun: true });
    expect(existsSync(storage)).toBe(false);
    expect(existsSync(markerPath)).toBe(false);
  });

  describe('without --dry-run', () => {
    it('executes the task', async () => {
      await execute({});

      expect(existsSync(markerPath)).toBe(true);
    });
  });
});
