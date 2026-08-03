/**
 * Integrity verification for remotely fetched modules
 * @module @xec-sh/loader/module/module-integrity
 */

import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { createHash } from 'node:crypto';

/**
 * How strictly remote module content is verified.
 *
 * - `lockfile` — record a digest the first time a URL is fetched, then require
 *   every later fetch of that URL to match. This is the npm/pnpm model: the
 *   first fetch is trusted, everything after it is pinned.
 * - `strict` — require the URL to already be present in the lockfile. Nothing
 *   new may be fetched, which is the right setting for CI and production.
 * - `off` — no verification. Only appropriate for throwaway local work.
 */
export type IntegrityMode = 'lockfile' | 'strict' | 'off';

/** Policy governing which remote modules may be loaded and how they are checked. */
export interface IntegrityPolicy {
  /** Verification mode. Defaults to `lockfile`. */
  mode?: IntegrityMode;

  /**
   * Hostnames permitted to serve modules.
   *
   * A URL whose host is absent from this list is rejected before any request
   * is made. Defaults to the known CDN hosts.
   */
  allowedHosts?: string[];

  /** Path to the lockfile. Defaults to `<cacheDir>/module-lock.json`. */
  lockfilePath?: string;
}

/** Hosts the resolver can produce URLs for. */
export const DEFAULT_ALLOWED_HOSTS: readonly string[] = Object.freeze([
  'esm.sh',
  'jsr.io',
  'unpkg.com',
  'cdn.skypack.dev',
  'cdn.jsdelivr.net',
]);

/** A recorded digest for one module URL. */
interface LockEntry {
  /** `sha256-<base64>`, matching the Subresource Integrity format. */
  integrity: string;
  /** ISO timestamp of when the entry was first recorded. */
  addedAt: string;
}

/** On-disk lockfile shape. */
interface LockfileContents {
  version: 1;
  modules: Record<string, LockEntry>;
}

/**
 * Raised when a fetched module fails verification.
 *
 * Loading must abort: a digest mismatch means the bytes about to be executed
 * are not the bytes that were reviewed.
 */
export class IntegrityError extends Error {
  constructor(
    message: string,
    public readonly url: string,
    public readonly expected?: string,
    public readonly actual?: string
  ) {
    super(message);
    this.name = 'IntegrityError';
  }
}

/**
 * Compute the Subresource-Integrity-style digest of module content.
 *
 * @param content - The exact text that would be executed.
 * @returns A digest of the form `sha256-<base64>`.
 */
export function computeIntegrity(content: string): string {
  return `sha256-${createHash('sha256').update(content, 'utf8').digest('base64')}`;
}

/**
 * Verifies remote module content against a persisted lockfile.
 *
 * Remote modules are executed with full process privileges on machines that
 * hold production credentials, so unverified fetch-and-execute is the highest
 * risk in the loader. This class makes that path auditable: what ran once is
 * what runs again, and a change is a loud failure rather than a silent swap.
 */
export class ModuleIntegrityVerifier {
  private readonly mode: IntegrityMode;
  private readonly allowedHosts: Set<string>;
  private readonly lockfilePath: string;
  private lockfile: LockfileContents | null = null;
  private dirty = false;

  /**
   * @param cacheDir - Directory used to derive the default lockfile location.
   * @param policy - Overrides for mode, allowed hosts and lockfile path.
   */
  constructor(cacheDir: string, policy: IntegrityPolicy = {}) {
    this.mode = policy.mode ?? 'lockfile';
    this.allowedHosts = new Set(policy.allowedHosts ?? DEFAULT_ALLOWED_HOSTS);
    this.lockfilePath = policy.lockfilePath ?? path.join(cacheDir, 'module-lock.json');
  }

  /**
   * Reject a URL whose host is not permitted.
   *
   * Checked before the request is issued, so a rejected host is never
   * contacted at all.
   *
   * @param url - The absolute URL about to be fetched.
   * @throws {IntegrityError} If the host is not in the allowlist.
   */
  assertHostAllowed(url: string): void {
    if (this.mode === 'off') {
      return;
    }

    let host: string;

    try {
      host = new URL(url).hostname;
    } catch {
      throw new IntegrityError(`Module URL is not a valid URL: ${url}`, url);
    }

    if (!this.allowedHosts.has(host)) {
      throw new IntegrityError(
        `Refusing to load a module from an unlisted host: ${host}. ` +
          `Allowed hosts: ${[...this.allowedHosts].join(', ')}. ` +
          `Add it to the loader's integrity.allowedHosts policy to permit it.`,
        url
      );
    }
  }

  /**
   * Verify fetched content, recording its digest when the mode permits.
   *
   * @param url - The URL the content came from.
   * @param content - The exact text that will be executed.
   * @throws {IntegrityError} On a digest mismatch, or in `strict` mode when the
   *   URL has no recorded digest.
   */
  async verify(url: string, content: string): Promise<void> {
    if (this.mode === 'off') {
      return;
    }

    const lockfile = await this.load();
    const actual = computeIntegrity(content);
    const recorded = lockfile.modules[url];

    if (recorded) {
      if (recorded.integrity !== actual) {
        throw new IntegrityError(
          `Integrity check failed for ${url}. The module's contents changed ` +
            `since it was locked, so it will not be executed. If the change is ` +
            `expected, remove the entry from ${this.lockfilePath} and re-run to ` +
            `re-lock it.`,
          url,
          recorded.integrity,
          actual
        );
      }

      return;
    }

    if (this.mode === 'strict') {
      throw new IntegrityError(
        `No locked digest for ${url} and integrity mode is 'strict', so it ` +
          `will not be fetched. Run once with mode 'lockfile' to record it, and ` +
          `commit ${this.lockfilePath}.`,
        url
      );
    }

    // Trust on first use, then pin.
    lockfile.modules[url] = { integrity: actual, addedAt: new Date().toISOString() };
    this.dirty = true;
  }

  /**
   * Persist newly recorded digests.
   *
   * Safe to call when nothing changed; it becomes a no-op.
   */
  async save(): Promise<void> {
    if (!this.dirty || !this.lockfile || this.mode === 'off') {
      return;
    }

    await fs.mkdir(path.dirname(this.lockfilePath), { recursive: true });

    // Sort keys so the file is stable across runs and reviewable in diffs.
    const sorted: Record<string, LockEntry> = {};
    for (const key of Object.keys(this.lockfile.modules).sort()) {
      sorted[key] = this.lockfile.modules[key]!;
    }

    const serialized = JSON.stringify({ version: 1, modules: sorted }, null, 2);
    await fs.writeFile(this.lockfilePath, `${serialized}\n`, { mode: 0o600 });
    this.dirty = false;
  }

  /**
   * Read the lockfile, treating an absent or unreadable one as empty.
   */
  private async load(): Promise<LockfileContents> {
    if (this.lockfile) {
      return this.lockfile;
    }

    try {
      const raw = await fs.readFile(this.lockfilePath, 'utf8');
      let parsed: LockfileContents | undefined;

      try {
        parsed = JSON.parse(raw) as LockfileContents;
      } catch {
        // Fall through to the shared malformed-lockfile error below: a raw
        // JSON SyntaxError tells the reader nothing about what to do.
        parsed = undefined;
      }

      if (parsed && parsed.version === 1 && typeof parsed.modules === 'object') {
        this.lockfile = { version: 1, modules: parsed.modules ?? {} };
        return this.lockfile;
      }

      // A malformed lockfile must not silently degrade into "no verification".
      throw new IntegrityError(
        `Module lockfile at ${this.lockfilePath} is malformed and cannot be ` +
          `trusted. Delete it to re-lock from scratch.`,
        this.lockfilePath
      );
    } catch (error) {
      if (error instanceof IntegrityError) {
        throw error;
      }

      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        this.lockfile = { version: 1, modules: {} };
        return this.lockfile;
      }

      throw error;
    }
  }
}
