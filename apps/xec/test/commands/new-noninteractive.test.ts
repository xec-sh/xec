/**
 * Non-interactive scaffolding for the new command.
 *
 * `new task` decided whether it could prompt by looking at CI and
 * XEC_NO_INTERACTIVE alone. Anywhere else without a terminal — a pipeline that
 * does not set CI, a script, `xec new task … < /dev/null` — it rendered a menu
 * to a stream nobody could answer and gave up, exiting 0 having written
 * nothing. `new script` in the same spot writes its file, so the silent
 * success was specific to this path rather than a house rule.
 */

import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { createArtifact } from '../../src/commands/new.js';

describe('new command without a terminal', () => {
  let projectDir: string;
  let originalCwd: string;
  let savedEnv: Record<string, string | undefined>;

  const configPath = () => path.join(projectDir, '.xec', 'config.yaml');

  const readConfig = async () =>
    yaml.load(await fs.readFile(configPath(), 'utf-8')) as Record<string, any>;

  beforeEach(async () => {
    originalCwd = process.cwd();
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-new-test-'));

    await fs.mkdir(path.join(projectDir, '.xec'), { recursive: true });
    await fs.writeFile(configPath(), 'version: "1.0"\ntasks: {}\n', 'utf-8');

    // The point of these tests is the no-terminal path, so make sure the env
    // escape hatches are not what is carrying them.
    savedEnv = { CI: process.env['CI'], XEC_NO_INTERACTIVE: process.env['XEC_NO_INTERACTIVE'] };
    delete process.env['CI'];
    delete process.env['XEC_NO_INTERACTIVE'];

    process.chdir(projectDir);
  });

  afterEach(async () => {
    process.chdir(originalCwd);
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await fs.rm(projectDir, { recursive: true, force: true });
  });

  it('writes the task to the config', async () => {
    await createArtifact('task', 'build', { desc: 'build the thing' });

    const config = await readConfig();
    expect(config['tasks']).toHaveProperty('build');
    expect(config['tasks']['build'].description).toBe('build the thing');
  });

  it('writes a script file', async () => {
    await createArtifact('script', 'deploy', { desc: 'deploy the thing' });

    const scripts = await fs.readdir(path.join(projectDir, '.xec', 'scripts'));
    expect(scripts).toContain('deploy.ts');
  });
});
