import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { constants, type Stats } from 'node:fs';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { open, mkdir, lstat, unlink } from 'node:fs/promises';

import { SSHError } from './errors.js';
import { readRegularFile } from './files.js';

/** Strict trust is the default; first-use trust and disabled verification are explicit policies. */
export type HostKeyChecking = 'accept-new' | 'strict' | 'off';
export type HostKeyVerdict =
  | { readonly ok: true; readonly reason: 'known' | 'accepted-new' | 'disabled' }
  | { readonly ok: false; readonly reason: 'changed' | 'unknown'; readonly message: string };

interface KnownHostEntry {
  readonly patterns: readonly string[] | null;
  readonly hashSalt: Buffer | null;
  readonly hashValue: Buffer | null;
  readonly keyType: string;
  readonly key: string;
  readonly revoked: boolean;
}

const maximumFileBytes = 8 * 1024 * 1024;
export function defaultKnownHostsPath(): string { return join(homedir(), '.ssh', 'known_hosts'); }

export function formatHostToken(host: string, port: number): string {
  if (!host || host.length > 253 || !/^[a-zA-Z0-9._:%-]+$/.test(host)) {
    throw new SSHError('Invalid SSH host name for known_hosts', 'EINVAL');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new SSHError('Invalid SSH port', 'EINVAL');
  // DNS names are case-insensitive, including when their tokens are hashed.
  // Preserve IPv6 scope spelling; interface identifiers are not DNS labels.
  const canonicalHost = host.includes(':') ? host : host.toLowerCase();
  return port === 22 ? canonicalHost : `[${canonicalHost}]:${port}`;
}

export function parseKnownHosts(contents: string): KnownHostEntry[] {
  const entries: KnownHostEntry[] = [];
  for (const raw of contents.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const fields = line.split(/\s+/);
    const marker = fields[0]?.startsWith('@') ? fields.shift() : undefined;
    // A CA key is never a host key. Certificate validation is not implicit trust.
    if (marker && marker !== '@revoked') continue;
    const [hosts, keyType, key] = fields;
    if (!hosts || !keyType || !key) continue;
    const revoked = marker === '@revoked';
    if (hosts.startsWith('|')) {
      const parts = hosts.split('|');
      if (parts.length !== 4 || parts[1] !== '1' || !parts[2] || !parts[3]) continue;
      const hashSalt = Buffer.from(parts[2], 'base64');
      const hashValue = Buffer.from(parts[3], 'base64');
      if (hashSalt.length !== 20 || hashValue.length !== 20 || hashSalt.toString('base64') !== parts[2] || hashValue.toString('base64') !== parts[3]) continue;
      entries.push({ patterns: null, hashSalt, hashValue, keyType, key, revoked });
    } else {
      entries.push({ patterns: hosts.split(','), hashSalt: null, hashValue: null, keyType, key, revoked });
    }
  }
  return entries;
}

function foldAscii(code: number): number {
  return code >= 65 && code <= 90 ? code + 32 : code;
}

/** OpenSSH '*' and '?' patterns, without exponential regular-expression backtracking. */
function matchesPattern(pattern: string, host: string): boolean {
  let source = 0;
  let target = 0;
  let star = -1;
  let retry = 0;
  while (target < host.length) {
    if (pattern[source] === '?' || foldAscii(pattern.charCodeAt(source)) === foldAscii(host.charCodeAt(target))) {
      source++;
      target++;
    } else if (pattern[source] === '*') {
      if (source === pattern.length - 1) return true;
      star = source++;
      retry = target;
    } else if (star >= 0) {
      source = star + 1;
      target = ++retry;
    } else return false;
  }
  while (pattern[source] === '*') source++;
  return source === pattern.length;
}

function matches(entry: KnownHostEntry, host: string): boolean {
  if (entry.hashSalt && entry.hashValue) {
    const digest = createHmac('sha1', entry.hashSalt).update(host).digest();
    return digest.length === entry.hashValue.length && timingSafeEqual(digest, entry.hashValue);
  }
  let included = false;
  for (const pattern of entry.patterns ?? []) {
    const negated = pattern.startsWith('!');
    const glob = negated ? pattern.slice(1) : pattern;
    if (!matchesPattern(glob, host)) continue;
    if (negated) return false;
    included = true;
  }
  return included;
}

function readKeyAlgorithm(blob: Buffer): string {
  if (!Buffer.isBuffer(blob) || blob.length < 5 || blob.length > 64 * 1024) throw new SSHError('Invalid SSH host key', 'EHOSTKEY');
  const size = blob.readUInt32BE(0);
  if (size < 1 || size > 64 || size + 4 >= blob.length) throw new SSHError('Invalid SSH host key', 'EHOSTKEY');
  const type = blob.subarray(4, 4 + size).toString('utf8');
  if (!/^[a-zA-Z0-9@._+-]+$/.test(type)) throw new SSHError('Invalid SSH host key algorithm', 'EHOSTKEY');
  return type;
}

/**
 * OpenSSH known_hosts verification. Every connection observes current revocations.
 * The single trust file serializes first-use writes. Readers fail closed while its
 * update lock exists, so an unacknowledged append cannot become trusted indirectly.
 * A failed write or sync retains the lock for explicit store reconciliation; no
 * timeout steals it and ordinary reads never create a quarantine or mutate trust.
 */
export class KnownHostsVerifier {
  constructor(private readonly mode: HostKeyChecking = 'strict', private readonly knownHostsPath = defaultKnownHostsPath()) {
    if (!['strict', 'accept-new', 'off'].includes(mode)) throw new SSHError('Invalid SSH host key checking policy', 'EINVAL');
  }

  async verify(host: string, port: number, key: Buffer): Promise<HostKeyVerdict> {
    const token = formatHostToken(host, port);
    const type = readKeyAlgorithm(key);
    if (this.mode === 'off') return { ok: true, reason: 'disabled' };
    const verdict = this.inspect(await this.read(), token, key, type);
    if (verdict.reason !== 'unknown' || this.mode === 'strict') return verdict;
    return this.record(token, key, type);
  }

  private inspect(entries: KnownHostEntry[], token: string, key: Buffer, type: string): HostKeyVerdict {
    const matching = entries.filter(entry => matches(entry, token));
    const presented = key.toString('base64');
    const exact = matching.filter(entry => entry.key === presented && entry.keyType === type);
    if (matching.some(entry => entry.revoked && entry.key === presented)) return {
      ok: false, reason: 'changed', message: `Host key for ${token} is @revoked in ${this.knownHostsPath}`,
    };
    if (exact.length) return { ok: true, reason: 'known' };
    if (matching.some(entry => !entry.revoked)) return {
      ok: false, reason: 'changed', message: `Host key changed for ${token}. Verify its fingerprint independently before changing ${this.knownHostsPath}; ssh-keygen -R ${token} removes a reviewed old entry.`,
    };
    return { ok: false, reason: 'unknown', message: `Host ${token} is not trusted in ${this.knownHostsPath}. Verify the fingerprint independently and add the key before connecting.` };
  }

  private async read(owner?: Stats): Promise<KnownHostEntry[]> {
    let contents: Buffer;
    try {
      contents = await readRegularFile(this.knownHostsPath, maximumFileBytes);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') contents = Buffer.alloc(0);
      else if (error instanceof SSHError && error.code === 'EFBIG') throw error;
      else throw new SSHError('Cannot read the SSH host trust store', 'EHOSTKEYSTORE', { cause: error });
    }
    const lockPath = `${this.knownHostsPath}.xec-lock`;
    let observed: Stats | undefined;
    try { observed = await lstat(lockPath); }
    catch (error) {
      if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
        throw new SSHError('Cannot verify SSH host trust update ownership', 'EHOSTKEYSTORE', { cause: error });
      }
    }
    const ownsLock = owner !== undefined && observed !== undefined && observed.dev === owner.dev && observed.ino === owner.ino && !observed.isSymbolicLink();
    if (owner ? !ownsLock : observed !== undefined) {
      throw new SSHError(`SSH host trust update is active or unresolved at ${lockPath}; inspect ${this.knownHostsPath} and reconcile the lock before retrying`, 'EHOSTKEYSTORE');
    }
    return parseKnownHosts(contents.toString('utf8'));
  }

  private async record(token: string, key: Buffer, type: string): Promise<HostKeyVerdict> {
    await mkdir(dirname(this.knownHostsPath), { recursive: true, mode: 0o700 }).catch((cause: unknown) => {
      throw new SSHError('Cannot prepare the SSH host trust directory', 'EHOSTKEYSTORE', { cause });
    });
    const lockPath = `${this.knownHostsPath}.xec-lock`;
    // No TTL, PID-based stealing or overwrite: an interrupted trust write needs inspection.
    const lock = await open(lockPath, 'wx', 0o600).catch((cause: unknown) => {
      throw new SSHError(`Cannot own the known_hosts update at ${lockPath}`, 'EHOSTKEYSTORE', { cause });
    });
    let identity: Stats | undefined;
    let writeStarted = false;
    let uncertainWrite: boolean;
    const failures: unknown[] = [];
    let verdict: HostKeyVerdict | undefined;
    try {
      identity = await lock.stat();
      const current = this.inspect(await this.read(identity), token, key, type);
      if (current.reason !== 'unknown') verdict = current;
      else {
        const file = await open(this.knownHostsPath, constants.O_WRONLY | constants.O_APPEND | constants.O_CREAT | constants.O_NONBLOCK, 0o600);
        try {
          if (!(await file.stat()).isFile()) throw new SSHError('Expected a regular SSH host trust store', 'EHOSTKEYSTORE');
          writeStarted = true;
          await file.writeFile(`\n${token} ${type} ${key.toString('base64')}\n`);
          await file.sync();
        } catch (error) { failures.push(error); }
        finally {
          try { await file.close(); } catch (error) { failures.push(error); }
        }
        if (!failures.length) verdict = { ok: true, reason: 'accepted-new' };
      }
    } catch (error) { failures.push(error); }
    finally {
      uncertainWrite = writeStarted && failures.length > 0;
      if (identity && !uncertainWrite) {
        try {
          const current = await lstat(lockPath);
          if (current.dev !== identity.dev || current.ino !== identity.ino || current.isSymbolicLink()) {
            failures.push(new SSHError('known_hosts update ownership changed; retained lock for inspection', 'EHOSTKEYSTORE'));
          } else await unlink(lockPath);
        } catch (error) { failures.push(error); }
      }
      // An unproved identity stays on disk, but its descriptor still belongs to this call.
      try { await lock.close(); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new SSHError(uncertainWrite
      ? `Host trust write outcome is unknown; inspect ${this.knownHostsPath} and reconcile ${lockPath} before retrying`
      : 'Host trust could not be recorded', 'EHOSTKEYSTORE', {
      cause: failures.length === 1 ? failures[0] : new AggregateError(failures, 'known_hosts update and cleanup failed', { cause: failures[0] }),
    });
    if (!verdict) throw new SSHError('Host trust result is missing', 'EHOSTKEYSTORE');
    return verdict;
  }
}
