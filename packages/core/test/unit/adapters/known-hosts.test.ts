import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHmac, randomBytes } from 'node:crypto';

import {
  parseKnownHosts,
  formatHostToken,
  KnownHostsVerifier,
} from '../../../src/adapters/ssh/known-hosts.js';

/**
 * Build a plausible SSH public key blob: a 4-byte big-endian length, the
 * algorithm name, then key material.
 */
function keyBlob(algorithm: string, seed: string): Buffer {
  const name = Buffer.from(algorithm, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(name.length, 0);
  return Buffer.concat([length, name, Buffer.from(seed.padEnd(32, '.'), 'ascii')]);
}

const HOST_KEY = keyBlob('ssh-ed25519', 'real-server-key');
const IMPOSTOR_KEY = keyBlob('ssh-ed25519', 'impostor-key');

describe('parseKnownHosts', () => {
  it('parses a plain entry', () => {
    const [entry] = parseKnownHosts('example.com ssh-ed25519 AAAAKEY comment');
    expect(entry).toMatchObject({ patterns: ['example.com'], keyType: 'ssh-ed25519', key: 'AAAAKEY' });
  });

  it('parses several comma-separated host patterns', () => {
    const [entry] = parseKnownHosts('a.example,b.example,10.0.0.1 ssh-rsa AAAAKEY');
    expect(entry!.patterns).toEqual(['a.example', 'b.example', '10.0.0.1']);
  });

  it('skips comments and blank lines', () => {
    expect(parseKnownHosts('# a comment\n\n   \n')).toHaveLength(0);
  });

  it('ignores certificate-authority entries rather than trusting them', () => {
    // Honouring @cert-authority requires validating a CA signature, which is
    // not implemented; treating it as a plain key would trust the CA key for
    // the host itself.
    expect(parseKnownHosts('@cert-authority *.example.com ssh-rsa AAAAKEY')).toHaveLength(0);
  });

  it('marks revoked entries', () => {
    const [entry] = parseKnownHosts('@revoked example.com ssh-rsa AAAAKEY');
    expect(entry!.revoked).toBe(true);
  });

  it('skips a malformed line instead of failing the whole file', () => {
    const entries = parseKnownHosts('garbage\nexample.com ssh-rsa AAAAKEY');
    expect(entries).toHaveLength(1);
    expect(entries[0]!.patterns).toEqual(['example.com']);
  });
});

describe('formatHostToken', () => {
  it('leaves the default port bare and brackets any other', () => {
    expect(formatHostToken('example.com', 22)).toBe('example.com');
    expect(formatHostToken('example.com', 2222)).toBe('[example.com]:2222');
  });
});

describe('KnownHostsVerifier', () => {
  let dir: string;
  let file: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-known-hosts-'));
    file = path.join(dir, 'known_hosts');
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('records an unseen host and accepts it thereafter', async () => {
    const first = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    expect(first).toEqual({ ok: true, reason: 'accepted-new' });

    const recorded = await fs.readFile(file, 'utf8');
    expect(recorded).toContain('h.example ssh-ed25519');

    const second = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    expect(second).toEqual({ ok: true, reason: 'known' });
  });

  it('refuses a key that changed after being recorded', async () => {
    await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);

    // This is the attack host key checking exists for.
    const verdict = await new KnownHostsVerifier('accept-new', file).verify(
      'h.example',
      22,
      IMPOSTOR_KEY
    );

    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: 'changed' });
    expect((verdict as { message: string }).message).toContain('ssh-keygen -R');
  });

  it('refuses an unknown host in strict mode', async () => {
    const verdict = await new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY);

    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: 'unknown' });
    // Nothing may be written when the connection is refused.
    await expect(fs.readFile(file, 'utf8')).rejects.toThrow();
  });

  it('accepts a recorded host in strict mode', async () => {
    await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    const verdict = await new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY);
    expect(verdict).toEqual({ ok: true, reason: 'known' });
  });

  it('performs no checking when disabled', async () => {
    const off = new KnownHostsVerifier('off', file);
    expect(await off.verify('h.example', 22, HOST_KEY)).toEqual({ ok: true, reason: 'disabled' });
    expect(await off.verify('h.example', 22, IMPOSTOR_KEY)).toEqual({ ok: true, reason: 'disabled' });
  });

  it('matches a hashed entry, the form OpenSSH writes by default', async () => {
    const salt = randomBytes(20);
    const token = '[h.example]:2222';
    const digest = createHmac('sha1', salt).update(token).digest();
    const line = `|1|${salt.toString('base64')}|${digest.toString('base64')} ssh-ed25519 ${HOST_KEY.toString('base64')}\n`;
    await fs.writeFile(file, line);

    const verdict = await new KnownHostsVerifier('strict', file).verify('h.example', 2222, HOST_KEY);
    expect(verdict).toEqual({ ok: true, reason: 'known' });
  });

  it('detects a changed key behind a hashed entry', async () => {
    const salt = randomBytes(20);
    const digest = createHmac('sha1', salt).update('h.example').digest();
    await fs.writeFile(
      file,
      `|1|${salt.toString('base64')}|${digest.toString('base64')} ssh-ed25519 ${HOST_KEY.toString('base64')}\n`
    );

    const verdict = await new KnownHostsVerifier('accept-new', file).verify(
      'h.example',
      22,
      IMPOSTOR_KEY
    );
    expect(verdict).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('honours wildcard patterns', async () => {
    await fs.writeFile(file, `*.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
    const verdict = await new KnownHostsVerifier('strict', file).verify('web.example', 22, HOST_KEY);
    expect(verdict).toEqual({ ok: true, reason: 'known' });
  });

  it('refuses a revoked key even when it matches', async () => {
    await fs.writeFile(file, `@revoked h.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
    const verdict = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    expect(verdict).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('distinguishes the same host on different ports', async () => {
    await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);

    // A different port is a different endpoint, so it is unknown, not changed.
    const verdict = await new KnownHostsVerifier('strict', file).verify('h.example', 2222, HOST_KEY);
    expect(verdict).toMatchObject({ ok: false, reason: 'unknown' });
  });

  it('treats a missing known_hosts as empty rather than failing', async () => {
    const verifier = new KnownHostsVerifier('accept-new', path.join(dir, 'nested', 'known_hosts'));
    expect(await verifier.verify('h.example', 22, HOST_KEY)).toEqual({
      ok: true,
      reason: 'accepted-new',
    });
  });
});
