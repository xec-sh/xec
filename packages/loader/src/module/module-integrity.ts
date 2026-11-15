/** Host policy and exact-source integrity for remote modules. */

import type { Stats } from 'node:fs';

import { isIP } from 'node:net';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { createHash, randomUUID } from 'node:crypto';

/** `off` disables digest checks only; transport and host policy always apply. */
export type IntegrityMode = 'lockfile' | 'strict' | 'off';

export interface IntegrityPolicy {
  /** Defaults to trust-on-first-use `lockfile`; use `strict` for reviewed sources only. */
  mode?: IntegrityMode;
  /** Exact hostnames permitted to serve modules. Defaults to the known CDN hosts. */
  allowedHosts?: string[];
  /** Defaults to `<cacheDir>/module-lock.json`; immutable raw-source pins live in its `.pins` sibling. */
  lockfilePath?: string;
}

export const DEFAULT_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'esm.sh', 'jsr.io', 'unpkg.com', 'cdn.skypack.dev', 'cdn.jsdelivr.net',
]);

interface LockEntry { url: string; integrity: string; addedAt: string }
interface PendingPin { url: string; entry: LockEntry }
const DESCRIPTOR = Object.freeze({ version: 2, storage: 'immutable-pins' });
const MAX_TRUST_FILE_BYTES = 16 * 1024;
const MAX_URL_BYTES = 8 * 1024;

function hasCode(error: unknown, code: string): boolean {
  return error instanceof Error && 'code' in error && error.code === code;
}
function sameFile(left: Stats, right: Stats): boolean { return left.dev === right.dev && left.ino === right.ino; }
function failuresOrThrow(failures: unknown[], message: string): void {
  if (failures.length === 1) throw failures[0];
  if (failures.length) throw new AggregateError(failures, message, { cause: failures[0] });
}

/** Diagnostics never echo URL userinfo, query credentials or fragments. */
export function diagnosticURL(value: string): string {
  try {
    const url = new URL(value);
    url.username = ''; url.password = ''; url.search = ''; url.hash = '';
    return url.href;
  } catch { return '<invalid module URL>'; }
}

export class IntegrityError extends Error {
  public readonly url: string;
  constructor(message: string, url: string, public readonly expected?: string, public readonly actual?: string) {
    super(message);
    this.name = 'IntegrityError';
    this.url = diagnosticURL(url);
  }
}

/** Hash exact valid UTF-8 source, including an initial BOM; no rewriting precedes this digest. */
export function computeIntegrity(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
}

/** Identity includes the complete canonical request URL, but never stores its query credentials. */
export function computeModuleIdentity(canonicalURL: string): string {
  return createHash('sha256').update(canonicalURL, 'utf8').digest('hex');
}

function isLoopbackHost(host: string): boolean {
  const bare = host.startsWith('[') && host.endsWith(']') ? host.slice(1, -1) : host;
  return bare === 'localhost' || bare === '::1' || (isIP(bare) === 4 && bare.split('.')[0] === '127');
}

/** A reviewed lock is not a sandbox: fetched code still runs with the caller's privileges. */
export class ModuleIntegrityVerifier {
  private readonly mode: IntegrityMode;
  private readonly allowedHosts: Set<string>;
  private readonly lockfilePath: string;
  private readonly pending = new Map<string, PendingPin>();
  private saving?: Promise<void>;

  constructor(cacheDir: string, policy: IntegrityPolicy = {}) {
    this.mode = policy.mode ?? 'lockfile';
    if (!['lockfile', 'strict', 'off'].includes(this.mode)) throw new TypeError('Invalid module integrity mode');
    const hosts = policy.allowedHosts ?? DEFAULT_ALLOWED_HOSTS;
    if (!Array.isArray(hosts)) throw new TypeError('Module allowedHosts must be an array of exact hostnames');
    this.allowedHosts = new Set(hosts.map(host => {
      if (typeof host !== 'string' || !host || /[\s/@?#]/u.test(host)) throw new TypeError('Invalid module allowlist hostname');
      const parsed = new URL(`https://${host}`);
      if (parsed.port || parsed.pathname !== '/' || !parsed.hostname) throw new TypeError('Module allowedHosts entries must contain only a hostname');
      return parsed.hostname;
    }));
    this.lockfilePath = policy.lockfilePath ?? path.join(cacheDir, 'module-lock.json');
  }

  /** Validate before contact; return the canonical URL without an HTTP-irrelevant fragment. */
  assertHostAllowed(value: string): string {
    if (typeof value !== 'string' || Buffer.byteLength(value, 'utf8') > MAX_URL_BYTES) throw new IntegrityError('Module URL exceeds the 8 KiB limit', '');
    let url: URL;
    try { url = new URL(value); }
    catch { throw new IntegrityError('Module URL must be an absolute HTTP(S) URL', value); }
    if (url.username || url.password) throw new IntegrityError('Module URLs cannot contain credentials; use explicitly scoped request headers', value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new IntegrityError('Module URLs must use HTTP or HTTPS', value);
    if (url.protocol === 'http:' && !isLoopbackHost(url.hostname)) {
      throw new IntegrityError('Remote modules must use https; http is permitted only for an explicitly allowed loopback host', value);
    }
    if (!this.allowedHosts.has(url.hostname)) {
      throw new IntegrityError(`Refusing to load a module from an unlisted host: ${url.hostname}`, value);
    }
    url.hash = '';
    if (Buffer.byteLength(url.href, 'utf8') > MAX_URL_BYTES) throw new IntegrityError('Canonical module URL exceeds the 8 KiB limit', '');
    return url.href;
  }

  /** Strict mode and malformed/legacy stores reject before any request, including redirects. */
  async assertFetchAllowed(value: string): Promise<void> {
    const url = this.assertHostAllowed(value);
    if (this.mode === 'off') return;
    const initialized = await this.readDescriptor();
    if (this.mode === 'strict' && (!initialized || !await this.readPin(url))) {
      throw new IntegrityError(`No reviewed raw-source digest in strict mode for ${diagnosticURL(url)}`, url);
    }
  }

  async verify(value: string, content: string): Promise<void> {
    await this.verifyAll([value], content);
  }

  /** Validate the complete response before staging any first-use decisions. */
  async verifyAll(values: readonly string[], content: string): Promise<void> {
    const urls = [...new Set(values.map(value => this.assertHostAllowed(value)))];
    if (typeof content !== 'string' || Buffer.from(content, 'utf8').toString('utf8') !== content) throw new IntegrityError('Module source must be exact valid UTF-8 text', urls[0] ?? '');
    if (this.mode === 'off') return;
    const initialized = await this.readDescriptor();
    const actual = computeIntegrity(content);
    const additions = new Map<string, PendingPin>();
    for (const url of urls) {
      const identity = computeModuleIdentity(url);
      const recorded = initialized ? await this.readPin(url) : undefined;
      if (recorded) this.assertDigest(url, recorded, actual);
      else if (this.mode === 'strict') throw new IntegrityError(`No reviewed raw-source digest in strict mode for ${diagnosticURL(url)}`, url);
      else additions.set(identity, { url, entry: { url: diagnosticURL(url), integrity: actual, addedAt: new Date().toISOString() } });
    }
    // No await between checking pending decisions and staging them: callers sharing
    // this instance cannot replace a first-use digest while disk reads are pending.
    for (const url of urls) {
      const pending = this.pending.get(computeModuleIdentity(url));
      if (pending) this.assertDigest(url, pending.entry, actual);
    }
    for (const [identity, pin] of additions) if (!this.pending.has(identity)) this.pending.set(identity, pin);
  }

  /**
   * Atomically publish independent immutable pins. Every process competes at the
   * final filename; a complete existing pin wins and can never be overwritten.
   * On a later batch conflict, earlier valid pins remain; execution must not proceed.
   */
  async save(): Promise<void> {
    if (this.mode === 'off') return;
    while (this.pending.size) {
      this.saving ??= this.publishPending().finally(() => { this.saving = undefined; });
      await this.saving;
    }
  }

  private get pinDirectory(): string { return `${this.lockfilePath}.pins`; }
  private pinPath(url: string): string { return path.join(this.pinDirectory, `${computeModuleIdentity(url)}.json`); }

  private assertDigest(url: string, recorded: LockEntry, expected: string): void {
    if (recorded.integrity !== expected) throw new IntegrityError(
      `Integrity mismatch for ${diagnosticURL(url)}. Review the source and its pin in ${this.lockfilePath}.pins; the existing digest has not been replaced.`,
      url, recorded.integrity, expected,
    );
  }

  private async publishPending(): Promise<void> {
    const pins = [...this.pending.entries()];
    await this.initializeStore();
    // Avoid partial publication for conflicts already visible before this batch.
    for (const [, pin] of pins) {
      const recorded = await this.readPin(pin.url);
      if (recorded) this.assertDigest(pin.url, recorded, pin.entry.integrity);
    }
    for (const [identity, pin] of pins) {
      await this.publishFile(this.pinPath(pin.url), JSON.stringify(pin.entry) + '\n', async () => {
        const recorded = await this.readPin(pin.url);
        if (!recorded) throw new IntegrityError('Published module pin is missing', pin.url);
        this.assertDigest(pin.url, recorded, pin.entry.integrity);
      });
      if (this.pending.get(identity) === pin) this.pending.delete(identity);
    }
  }

  private async initializeStore(): Promise<void> {
    if (await this.readDescriptor()) return;
    await this.ownedDirectory(path.dirname(this.lockfilePath), true);
    await this.ownedDirectory(this.pinDirectory, true);
    await this.publishFile(this.lockfilePath, JSON.stringify(DESCRIPTOR) + '\n', async () => {
      if (!await this.readDescriptor()) throw new IntegrityError('Published module integrity descriptor is missing', this.lockfilePath);
    });
  }

  private async readDescriptor(): Promise<boolean> {
    const parsed = await this.readJSON(this.lockfilePath);
    if (parsed === undefined) return false;
    await this.ownedDirectory(path.dirname(this.lockfilePath), false);
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1) {
      throw new IntegrityError('Module lock format version 1 pinned transformed text. Review raw remote sources and explicitly create an immutable version 2 store; automatic migration is unsafe. The existing file is unchanged.', this.lockfilePath);
    }
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 2 && 'modules' in parsed) {
      throw new IntegrityError('Interim version 2 mutable snapshots do not provide concurrent trust ownership. Review and re-pin into the immutable version 2 store; automatic migration is unsafe. The existing file is unchanged.', this.lockfilePath);
    }
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 2
      || !('storage' in parsed) || parsed.storage !== 'immutable-pins' || Object.keys(parsed).length !== 2) {
      throw new IntegrityError('Module integrity descriptor is malformed; review and restore the trusted immutable version 2 store', this.lockfilePath);
    }
    await this.ownedDirectory(this.pinDirectory, false);
    return true;
  }

  private async readPin(url: string): Promise<LockEntry | undefined> {
    const entry = await this.readJSON(this.pinPath(url));
    if (entry === undefined) return undefined;
    if (!entry || typeof entry !== 'object' || !('url' in entry) || entry.url !== diagnosticURL(url)
      || !('integrity' in entry) || typeof entry.integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(entry.integrity)
      || !('addedAt' in entry) || typeof entry.addedAt !== 'string' || !Number.isFinite(Date.parse(entry.addedAt))
      || Object.keys(entry).length !== 3) {
      throw new IntegrityError('Module integrity pin is malformed; review the immutable trust store', url);
    }
    return { url: entry.url, integrity: entry.integrity, addedAt: entry.addedAt };
  }

  private async ownedDirectory(directory: string, create: boolean): Promise<Stats> {
    if (create) await fs.mkdir(directory, { recursive: true, mode: 0o700 });
    const found = await fs.lstat(directory);
    if (!found.isDirectory() || found.isSymbolicLink()
      || (process.platform !== 'win32' && ((found.mode & 0o022) !== 0 || (process.getuid && found.uid !== process.getuid())))) {
      throw new IntegrityError('Module integrity store requires a directory owned by this user with no other writers', directory);
    }
    return found;
  }

  /** Finite, nonblocking reads: a FIFO or growing file cannot hang or exhaust memory. */
  private async readJSON(file: string): Promise<unknown> {
    const handle = await fs.open(file, fs.constants.O_RDONLY | fs.constants.O_NONBLOCK | fs.constants.O_NOFOLLOW).catch((error: unknown) => {
      if (hasCode(error, 'ENOENT')) return undefined;
      throw error;
    });
    if (!handle) return undefined;
    const failures: unknown[] = [];
    let result: unknown;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.size > MAX_TRUST_FILE_BYTES) throw new IntegrityError('Module integrity record must be a regular file of at most 16 KiB', file);
      if (process.platform !== 'win32' && ((opened.mode & 0o022) !== 0 || (process.getuid && opened.uid !== process.getuid()))) {
        throw new IntegrityError('Module integrity record must be owned by this user with no other writers', file);
      }
      const buffer = Buffer.alloc(MAX_TRUST_FILE_BYTES + 1);
      let count = 0;
      while (count <= MAX_TRUST_FILE_BYTES) {
        const { bytesRead } = await handle.read(buffer, count, buffer.byteLength - count, null);
        if (!bytesRead) break;
        count += bytesRead;
      }
      if (count > MAX_TRUST_FILE_BYTES) throw new IntegrityError('Module integrity record exceeds the measured 16 KiB limit', file);
      const named = await fs.lstat(file);
      if (!named.isFile() || named.isSymbolicLink() || !sameFile(opened, named)) throw new IntegrityError('Module integrity record identity changed while reading', file);
      try { result = JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(buffer.subarray(0, count))); }
      catch { throw new IntegrityError('Module integrity record is malformed JSON or UTF-8', file); }
    } catch (error) { failures.push(error); }
    try { await handle.close(); } catch (error) { failures.push(error); }
    failuresOrThrow(failures, 'Module integrity read and descriptor cleanup failed');
    return result;
  }

  /** Same-filesystem hard links publish complete bytes without replacing any peer's decision. */
  private async publishFile(file: string, content: string, verifyExisting: () => Promise<void>): Promise<void> {
    if (Buffer.byteLength(content, 'utf8') > MAX_TRUST_FILE_BYTES) throw new IntegrityError('Module integrity record exceeds the 16 KiB limit', file);
    const directory = path.dirname(file);
    const parent = await this.ownedDirectory(directory, false);
    const temporary = path.join(directory, `.${path.basename(file)}.${randomUUID()}.tmp`);
    const failures: unknown[] = [];
    let identity: Stats | undefined;
    let created = false;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600); created = true;
      try { identity = await handle.stat(); await handle.writeFile(content); await handle.sync(); }
      catch (error) { failures.push(error); }
      try { await handle.close(); } catch (error) { failures.push(error); }
      if (!failures.length) {
        if (!sameFile(parent, await this.ownedDirectory(directory, false))) throw new IntegrityError('Module integrity directory identity changed before publication', file);
        try { await fs.link(temporary, file); }
        catch (error) { if (!hasCode(error, 'EEXIST')) throw error; }
        await verifyExisting();
      }
    } catch (error) { failures.push(error); }
    if (created) {
      try {
        const current = await fs.lstat(temporary).catch((error: unknown) => {
          if (hasCode(error, 'ENOENT')) return undefined;
          throw error;
        });
        if (current) {
          if (!identity || current.isSymbolicLink() || !sameFile(identity, current)) throw new IntegrityError('Module integrity temporary-file ownership changed; foreign path retained', temporary);
          await fs.unlink(temporary);
        }
      } catch (error) { failures.push(error); }
    }
    failuresOrThrow(failures, 'Module integrity publication and owned temporary-file cleanup failed');
  }
}
