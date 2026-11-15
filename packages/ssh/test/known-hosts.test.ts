import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';

import {
  parseKnownHosts,
  formatHostToken,
  KnownHostsVerifier,
} from '../src/known-hosts.js';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }));

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

  it('uses the canonical DNS case for hashed trust and changed-key rejection', async () => {
    const salt = randomBytes(20);
    const digest = createHmac('sha1', salt).update('[h.example]:2222').digest();
    const line = `|1|${salt.toString('base64')}|${digest.toString('base64')} ssh-ed25519 ${HOST_KEY.toString('base64')}\n`;
    await fs.writeFile(file, line);
    expect(await new KnownHostsVerifier('strict', file).verify('H.EXAMPLE', 2222, HOST_KEY)).toMatchObject({ ok: true });
    expect(await new KnownHostsVerifier('accept-new', file).verify('H.EXAMPLE', 2222, IMPOSTOR_KEY)).toMatchObject({ ok: false, reason: 'changed' });
    expect(await fs.readFile(file, 'utf8')).toBe(line);
  });

  it('honours wildcard patterns', async () => {
    await fs.writeFile(file, `*.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
    const verdict = await new KnownHostsVerifier('strict', file).verify('web.example', 22, HOST_KEY);
    expect(verdict).toEqual({ ok: true, reason: 'known' });
  });

  it('matches bounded globs without interpreting regular-expression syntax', async () => {
    const cases: [string, string, boolean][] = [
      ['*.EXAMPLE', 'h.example', true],
      ['node?.example', 'node7.example', true],
      ['node?.example', 'node17.example', false],
      ['h.example', 'hXexample', false],
      ['[h.example]:2222', 'h.example', false],
      ['*.example,!admin?.example', 'admin7.example', false],
      ['!admin?.example,*.example', 'node7.example', true],
      ['*a*a*a*a*a*a*b', 'aaaaaaaaaaaaaaa', false],
      ['*a*a*a*a*a*a*b', 'aaaaaaaaaaaaaab', true],
      ['h.K', 'h.k', false],
    ];
    for (const [pattern, host, expected] of cases) {
      await fs.writeFile(file, `${pattern} ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
      expect((await new KnownHostsVerifier('strict', file).verify(host, 22, HOST_KEY)).ok, `${pattern} / ${host}`).toBe(expected);
    }
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


describe('host trust security boundaries', () => {
  let directory: string;
  let file: string;
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-host-trust-'));
    file = path.join(directory, 'known_hosts');
  });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });

  it('gives revocation precedence over an earlier matching allow entry', async () => {
    await fs.writeFile(file, `h.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n@revoked h.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
    expect(await new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('observes revocation added after the same verifier accepted a key', async () => {
    const verifier = new KnownHostsVerifier('accept-new', file);
    await verifier.verify('h.example', 22, HOST_KEY);
    await fs.appendFile(file, `@revoked h.example ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
    expect(await verifier.verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'changed' });
  });

  it('honours negated host patterns regardless of allow order', async () => {
    for (const patterns of ['*.example,!h.example', '!h.example,*.example']) {
      await fs.writeFile(file, `${patterns} ssh-ed25519 ${HOST_KEY.toString('base64')}\n`);
      const verifier = new KnownHostsVerifier('strict', file);
      expect(await verifier.verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'unknown' });
      expect(await verifier.verify('other.example', 22, HOST_KEY)).toMatchObject({ ok: true });
    }
  });

  it('requires explicit trust and rejects host-token injection', async () => {
    expect(await new KnownHostsVerifier(undefined, file).verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'unknown' });
    for (const host of ['h.example\nother.example', '*.example', 'h.example,other', 'h.example key']) {
      await expect(new KnownHostsVerifier('accept-new', file).verify(host, 22, HOST_KEY)).rejects.toMatchObject({ code: 'EINVAL' });
    }
    await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never reports accepted-new when the trust update cannot be owned', async () => {
    await fs.writeFile(file + '.xec-lock', 'another update owns this path');
    await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY)).rejects.toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(await fs.readFile(file + '.xec-lock', 'utf8')).toBe('another update owns this path');
    await expect(fs.stat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it.skipIf(process.platform === 'win32')('refuses a first connection when the trusted key cannot be persisted', async () => {
    await fs.writeFile(file, '', { mode: 0o400 });
    try {
      await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY)).rejects.toMatchObject({ code: 'EHOSTKEYSTORE' });
      expect(await fs.readFile(file, 'utf8')).toBe('');
      await expect(fs.stat(file + '.xec-lock')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally { await fs.chmod(file, 0o600); }
  });

  it('cannot accept conflicting first-use keys concurrently', async () => {
    const results = await Promise.allSettled([
      new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY),
      new KnownHostsVerifier('accept-new', file).verify('h.example', 22, IMPOSTOR_KEY),
    ]);
    expect(results.filter(result => result.status === 'fulfilled' && result.value.ok)).toHaveLength(1);
    const entries = parseKnownHosts(await fs.readFile(file, 'utf8'));
    expect(entries).toHaveLength(1);
    await expect(fs.stat(file + '.xec-lock')).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('does not merge a new key into a previous line without a trailing newline', async () => {
    await fs.writeFile(file, `other.example ssh-ed25519 ${IMPOSTOR_KEY.toString('base64')}`);
    await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    expect(parseKnownHosts(await fs.readFile(file, 'utf8'))).toHaveLength(2);
  });

  it('rejects oversized input and malformed key blobs before trusting', async () => {
    await fs.writeFile(file, ' '.repeat(8 * 1024 * 1024 + 1));
    await expect(new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY)).rejects.toMatchObject({ code: 'EFBIG' });
    await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, Buffer.from('bad'))).rejects.toMatchObject({ code: 'EHOSTKEY' });
  });
});


describe('known_hosts file ownership and I/O failure boundaries', () => {
  let directory: string;
  let file: string;
  const handles = new Set<fs.FileHandle>();
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-host-trust-io-'));
    file = path.join(directory, 'known_hosts');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const handle of handles) if (handle.fd !== -1) await handle.close();
    handles.clear();
    await fs.rm(directory, { recursive: true, force: true });
  });

  const causes = (error: unknown): unknown[] => error instanceof Error
    ? [error, ...('cause' in error ? causes(error.cause) : []), ...(error instanceof AggregateError ? error.errors.flatMap(causes) : [])]
    : [error];

  it('closes an acquired lock after stat failure and retains unproved ownership', async () => {
    const originalOpen = fs.open;
    const failure = new Error('lock stat failed');
    let lock: fs.FileHandle | undefined;
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      if (name === file + '.xec-lock') {
        lock = handle;
        vi.spyOn(handle, 'stat').mockRejectedValue(failure);
      }
      return handle;
    });
    const error = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY).catch(error => error);
    expect(error).toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(causes(error)).toContain(failure);
    expect(lock?.fd).toBe(-1);
    await expect(fs.lstat(file + '.xec-lock')).resolves.toBeDefined();
    await expect(fs.lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('preserves sync and both close failures without reporting successful trust', async () => {
    const originalOpen = fs.open;
    const syncFailure = new Error('trust sync failed');
    const fileCloseFailure = new Error('trust close failed');
    const lockCloseFailure = new Error('lock close failed');
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      const close = handle.close.bind(handle);
      if (name === file + '.xec-lock') {
        vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw lockCloseFailure; });
      } else if (name === file && (flags === 'a' || (typeof flags === 'number' && Boolean(flags & 1)))) {
        vi.spyOn(handle, 'sync').mockRejectedValue(syncFailure);
        vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw fileCloseFailure; });
      }
      return handle;
    });
    const error = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY).catch(error => error);
    expect(error).toMatchObject({ code: 'EHOSTKEYSTORE' });
    for (const failure of [syncFailure, fileCloseFailure, lockCloseFailure]) expect(causes(error)).toContain(failure);
    expect(error.message).toContain(file + '.xec-lock');
    await expect(fs.lstat(file + '.xec-lock')).resolves.toBeDefined();
    await expect(new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY)).rejects.toMatchObject({ code: 'EHOSTKEYSTORE' });
  });

  it('retains uncertain partial writes and never replaces them with a different first-use key', async () => {
    const originalOpen = fs.open;
    const failure = new Error('partial trust write');
    const partial = '\nh.example ssh-ed25519 AAA';
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      if (name === file && typeof flags === 'number' && Boolean(flags & 1)) {
        const write = handle.writeFile.bind(handle);
        vi.spyOn(handle, 'writeFile').mockImplementation(async () => { await write(partial); throw failure; });
      }
      return handle;
    });
    const first = await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY).catch(error => error);
    expect(first).toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(causes(first)).toContain(failure);
    expect(first.message).toContain('outcome is unknown');
    await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, IMPOSTOR_KEY)).rejects.toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(await fs.readFile(file, 'utf8')).toBe(partial);
    await expect(fs.lstat(file + '.xec-lock')).resolves.toBeDefined();
  });

  it('does not authenticate a visible append before its first-use sync is acknowledged', async () => {
    const originalOpen = fs.open;
    let acknowledge!: () => void;
    let started!: () => void;
    const synced = new Promise<void>(resolve => { acknowledge = resolve; });
    const reachedSync = new Promise<void>(resolve => { started = resolve; });
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      if (name === file && typeof flags === 'number' && Boolean(flags & 1)) {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, 'sync').mockImplementation(async () => { started(); await synced; await sync(); });
      }
      return handle;
    });
    const first = new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY);
    await reachedSync;
    let observed: unknown;
    try {
      observed = await new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY).catch(error => error);
    } finally { acknowledge(); await first; }
    expect(observed).toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(await new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: true, reason: 'known' });
  });

  it('keeps a replaced lock and denies trust after losing the exact ownership', async () => {
    const originalOpen = fs.open;
    let lock: fs.FileHandle | undefined;
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      if (name === file + '.xec-lock') lock = handle;
      else if (name === file && (flags === 'a' || (typeof flags === 'number' && Boolean(flags & 1)))) {
        const sync = handle.sync.bind(handle);
        vi.spyOn(handle, 'sync').mockImplementation(async () => {
          await sync();
          await fs.rename(file + '.xec-lock', file + '.former-lock');
          await fs.writeFile(file + '.xec-lock', 'foreign lock');
        });
      }
      return handle;
    });
    await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY)).rejects.toMatchObject({ code: 'EHOSTKEYSTORE' });
    expect(await fs.readFile(file + '.xec-lock', 'utf8')).toBe('foreign lock');
    expect(lock?.fd).toBe(-1);
  });

  it.skipIf(process.platform === 'win32')('rejects a FIFO without waiting for a writer', async () => {
    execFileSync('mkfifo', [file]);
    const result = new KnownHostsVerifier('strict', file).verify('h.example', 22, HOST_KEY).then(value => ({ value }), error => ({ error }));
    let timer: ReturnType<typeof setTimeout>;
    const observed = await Promise.race([result, new Promise<'pending'>(resolve => { timer = setTimeout(() => resolve('pending'), 1000); })]);
    clearTimeout(timer!);
    if (observed === 'pending') {
      // Release an old blocking reader so the red regression leaves no I/O behind.
      const writer = await fs.open(file, 'w');
      await writer.close();
      await result;
    }
    expect(observed).toMatchObject({ error: { code: 'EHOSTKEYSTORE' } });
  });

  it('rejects non-ASCII algorithm bytes instead of masking their high bits', async () => {
    const malformed = Buffer.from(HOST_KEY);
    malformed[4] = malformed[4]! | 0x80;
    await expect(new KnownHostsVerifier('accept-new', file).verify('h.example', 22, malformed)).rejects.toMatchObject({ code: 'EHOSTKEY' });
    await expect(fs.lstat(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a matching key under the wrong algorithm and never records over its revocation', async () => {
    await fs.writeFile(file, `h.example ssh-rsa ${HOST_KEY.toString('base64')}\n`);
    expect(await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'changed' });
    const revoked = `@revoked h.example ssh-rsa ${HOST_KEY.toString('base64')}\n`;
    await fs.writeFile(file, revoked);
    expect(await new KnownHostsVerifier('accept-new', file).verify('h.example', 22, HOST_KEY)).toMatchObject({ ok: false, reason: 'changed' });
    expect(await fs.readFile(file, 'utf8')).toBe(revoked);
  });
});
