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
import * as fs from 'fs/promises';
import { existsSync } from 'fs';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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

  describe('without --dry-run', () => {
    it('executes the task', async () => {
      await execute({});

      expect(existsSync(markerPath)).toBe(true);
    });
  });
});
