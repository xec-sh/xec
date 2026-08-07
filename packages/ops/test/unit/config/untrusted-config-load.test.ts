import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { ConfigurationManager, UntrustedConfigError } from '../../../src/config/configuration-manager.js';

/**
 * Loading a configuration must not run its commands unasked.
 *
 * Measured before the gate existed: a directory containing a config with
 * `${cmd:touch /tmp/FILE}` created that file on `xec config get`. Cloning a
 * repository and running any command in it was remote code execution.
 */
describe('a configuration that runs commands', () => {
  let dir: string;

  const writeConfig = async (body: string): Promise<string> => {
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    const file = path.join(dir, '.xec', 'config.yaml');
    await fs.writeFile(file, body);
    return file;
  };

  const load = (options: Record<string, unknown> = {}): Promise<unknown> =>
    new ConfigurationManager({ projectRoot: dir, ...options }).load();

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-untrusted-'));
    delete process.env['XEC_TRUST_CONFIG'];
  });

  afterEach(async () => {
    delete process.env['XEC_TRUST_CONFIG'];
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('is refused, and says which commands', async () => {
    await writeConfig('vars:\n  sha: ${cmd:echo would-have-run}\n');

    await expect(load()).rejects.toThrow(UntrustedConfigError);
    await expect(load()).rejects.toThrow(/echo would-have-run/);
  });

  it('does not run them while refusing', async () => {
    // The refusal is worth nothing if the command has already run.
    const marker = path.join(dir, 'RAN');
    await writeConfig(`vars:\n  x: \${cmd:touch ${marker}}\n`);

    await expect(load()).rejects.toThrow(UntrustedConfigError);
    await expect(fs.access(marker)).rejects.toThrow();
  });

  it('stops the load rather than continuing with defaults', async () => {
    // Degrading to a warning and an empty configuration would run a
    // different command than the one that was asked for, and make the
    // refusal look advisory.
    await writeConfig('vars:\n  a: ${cmd:echo x}\n');

    await expect(load()).rejects.toThrow();
  });

  it('loads when a decider approves', async () => {
    await writeConfig('vars:\n  sha: ${cmd:echo approved}\n');

    await expect(load({ onUntrustedConfig: () => true })).resolves.toBeDefined();
  });

  it('refuses when the decider declines', async () => {
    await writeConfig('vars:\n  sha: ${cmd:echo denied}\n');

    await expect(load({ onUntrustedConfig: () => false })).rejects.toThrow(UntrustedConfigError);
  });

  it('refuses when there is no decider at all', async () => {
    // A library caller that cannot ask cannot consent.
    await writeConfig('vars:\n  sha: ${cmd:echo silent}\n');

    await expect(load()).rejects.toThrow(UntrustedConfigError);
  });

  it('loads on the environment opt-in', async () => {
    process.env['XEC_TRUST_CONFIG'] = '1';
    await writeConfig('vars:\n  sha: ${cmd:echo ci}\n');

    await expect(load()).resolves.toBeDefined();
  });
});

describe('an ordinary configuration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-ordinary-'));
    delete process.env['XEC_TRUST_CONFIG'];
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('loads without being asked about', async () => {
    // The gate must be invisible to the configurations that run nothing,
    // which is nearly all of them.
    await fs.mkdir(path.join(dir, '.xec'), { recursive: true });
    await fs.writeFile(
      path.join(dir, '.xec', 'config.yaml'),
      'vars:\n  name: app\n  home: ${env.HOME}\n'
    );

    let asked = false;
    const manager = new ConfigurationManager({
      projectRoot: dir,
      onUntrustedConfig: () => { asked = true; return false; },
    });

    await expect(manager.load()).resolves.toBeDefined();
    expect(asked).toBe(false);
  });
});
