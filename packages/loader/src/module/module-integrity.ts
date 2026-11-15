/** Host policy and exact-source integrity for remote modules. */

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
  /** Defaults to `<cacheDir>/module-lock.json`. Version 2 pins raw UTF-8 source. */
  lockfilePath?: string;
}

export const DEFAULT_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'esm.sh', 'jsr.io', 'unpkg.com', 'cdn.skypack.dev', 'cdn.jsdelivr.net',
]);

interface LockEntry { url: string; integrity: string; addedAt: string }
interface LockfileContents { version: 2; modules: Record<string, LockEntry> }

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
  private lockfile: LockfileContents | null = null;
  private loading?: Promise<LockfileContents>;
  private saving?: Promise<void>;
  private revision = 0;
  private savedRevision = 0;

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
    return url.href;
  }

  /** Strict mode and malformed/legacy locks reject before any request, including redirect hops. */
  async assertFetchAllowed(value: string): Promise<void> {
    const url = this.assertHostAllowed(value);
    if (this.mode === 'off') return;
    const lockfile = await this.load();
    if (this.mode === 'strict' && !Object.hasOwn(lockfile.modules, computeModuleIdentity(url))) {
      throw new IntegrityError(`No reviewed raw-source digest in strict mode for ${diagnosticURL(url)}`, url);
    }
  }

  async verify(value: string, content: string): Promise<void> {
    await this.verifyAll([value], content);
  }

  /** Check every HTTP alias before recording any new pin from this response. */
  async verifyAll(values: readonly string[], content: string): Promise<void> {
    const urls = [...new Set(values.map(value => this.assertHostAllowed(value)))];
    if (typeof content !== 'string' || Buffer.from(content, 'utf8').toString('utf8') !== content) throw new IntegrityError('Module source must be exact valid UTF-8 text', urls[0] ?? '');
    if (this.mode === 'off') return;
    const lockfile = await this.load();
    const actual = computeIntegrity(content);
    for (const url of urls) {
      const recorded = lockfile.modules[computeModuleIdentity(url)];
      if (recorded && recorded.integrity !== actual) {
        throw new IntegrityError(`Integrity mismatch for ${diagnosticURL(url)}. Review the source and the intended change to ${this.lockfilePath}; the existing digest has not been replaced.`, url, recorded.integrity, actual);
      }
      if (!recorded && this.mode === 'strict') throw new IntegrityError(`No reviewed raw-source digest in strict mode for ${diagnosticURL(url)}`, url);
    }
    for (const url of urls) {
      if (!Object.hasOwn(lockfile.modules, computeModuleIdentity(url))) {
        lockfile.modules[computeModuleIdentity(url)] = { url: diagnosticURL(url), integrity: actual, addedAt: new Date().toISOString() };
        this.revision++;
      }
    }
  }

  /** Atomically replace a complete lock snapshot. Separate processes must coordinate this file's ownership. */
  async save(): Promise<void> {
    const requestedRevision = this.revision;
    while (this.savedRevision < requestedRevision && this.mode !== 'off') {
      if (!this.saving) {
        const revision = this.revision;
        const modules = Object.fromEntries(Object.entries(this.lockfile!.modules).sort(([a], [b]) => a.localeCompare(b)));
        this.saving = this.writeSnapshot(JSON.stringify({ version: 2, modules }, null, 2) + '\n')
          .then(() => { this.savedRevision = revision; })
          .finally(() => { this.saving = undefined; });
      }
      await this.saving;
    }
  }

  private async writeSnapshot(content: string): Promise<void> {
    await fs.mkdir(path.dirname(this.lockfilePath), { recursive: true, mode: 0o700 });
    const temporary = `${this.lockfilePath}.${randomUUID()}.tmp`;
    let created = false;
    try {
      const handle = await fs.open(temporary, 'wx', 0o600); created = true;
      const failures: unknown[] = [];
      try { await handle.writeFile(content); await handle.sync(); } catch (error) { failures.push(error); }
      try { await handle.close(); } catch (error) { failures.push(error); }
      if (failures.length === 1) throw failures[0];
      if (failures.length) throw new AggregateError(failures, 'Module lock write and close failed', { cause: failures[0] });
      await fs.rename(temporary, this.lockfilePath); created = false;
    } catch (error) {
      const failures: unknown[] = [error];
      if (created) { try { await fs.unlink(temporary); } catch (cleanup) { failures.push(cleanup); } }
      if (failures.length > 1) throw new AggregateError(failures, 'Module lock publication and temporary-file cleanup failed', { cause: error });
      throw error;
    }
  }

  private load(): Promise<LockfileContents> {
    return this.loading ??= this.readLockfile();
  }

  private async readLockfile(): Promise<LockfileContents> {
    let raw: string;
    try { raw = await fs.readFile(this.lockfilePath, 'utf8'); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      return this.lockfile = { version: 2, modules: Object.create(null) as Record<string, LockEntry> };
    }
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { /* rejected by the common schema boundary below */ }
    if (parsed && typeof parsed === 'object' && 'version' in parsed && parsed.version === 1) {
      throw new IntegrityError('Module lock format version 1 pinned transformed text. Review raw remote sources and explicitly create a version 2 lock; automatic migration is unsafe. The existing file is unchanged.', this.lockfilePath);
    }
    if (!parsed || typeof parsed !== 'object' || !('version' in parsed) || parsed.version !== 2 || !('modules' in parsed)
      || !parsed.modules || typeof parsed.modules !== 'object' || Array.isArray(parsed.modules)) {
      throw new IntegrityError('Module lockfile is malformed; review and restore a trusted version 2 lock', this.lockfilePath);
    }
    const modules: Record<string, LockEntry> = Object.create(null) as Record<string, LockEntry>;
    for (const [identity, entry] of Object.entries(parsed.modules as Record<string, unknown>)) {
      if (!/^[a-f0-9]{64}$/u.test(identity) || !entry || typeof entry !== 'object' || !('url' in entry) || !('integrity' in entry) || !('addedAt' in entry)
        || typeof entry.url !== 'string' || diagnosticURL(entry.url) !== entry.url || !/^https?:\/\//u.test(entry.url) || typeof entry.integrity !== 'string' || !/^sha256-[A-Za-z0-9+/]{43}=$/u.test(entry.integrity)
        || typeof entry.addedAt !== 'string' || !Number.isFinite(Date.parse(entry.addedAt))) {
        throw new IntegrityError('Module lockfile contains a malformed raw-source digest entry', this.lockfilePath);
      }
      modules[identity] = { url: entry.url, integrity: entry.integrity, addedAt: entry.addedAt };
    }
    return this.lockfile = { version: 2, modules };
  }
}
