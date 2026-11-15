import type { Stats } from 'node:fs';

import path from 'node:path';
import fs from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

import { SSHError, SSHOutcomeUnknownError } from './errors.js';

export interface DirectoryTraversalOptions {
  /** Root is depth zero. Defaults to 64. */
  maxDepth?: number;
  /** Counts every observed entry, including filtered entries. Defaults to 10,000. */
  maxEntries?: number;
  signal?: AbortSignal;
}

/** One budget covers the whole tree, never a fresh limit per subdirectory. */
export function directoryTraversal(options: DirectoryTraversalOptions) {
  const maxDepth = options.maxDepth ?? 64, maxEntries = options.maxEntries ?? 10000;
  if (!Number.isSafeInteger(maxDepth) || maxDepth < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 1) {
    throw new SSHError('Directory traversal limits must be nonnegative depth and positive entry count', 'EINVAL');
  }
  let entries = 0;
  const check = () => {
    if (options.signal?.aborted) throw new SSHError('Directory transfer cancelled', 'ABORT_ERR');
  };
  return {
    check,
    descend(depth: number) {
      check();
      if (depth > maxDepth) throw new SSHError(`Directory traversal exceeded depth ${maxDepth}`, 'EFBIG');
    },
    observe(count: number) {
      check();
      entries += count;
      if (entries > maxEntries) throw new SSHError(`Directory traversal exceeded ${maxEntries} entries`, 'EFBIG');
    },
  };
}

/** Remote names must remain one ordinary component on every supported host. */
export function validateDownloadComponent(name: string): void {
  if (!name || name === '.' || name === '..' || (/[<>:"/\\|?*]/u.test(name) || Array.from(name).some(character => character.charCodeAt(0) < 32)) || /[. ]$/u.test(name)
    || /^(?:con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])$/iu.test(name.split('.')[0]!.trimEnd()) || Buffer.byteLength(name) > 255) {
    throw new SSHError('Invalid or nonportable path component in SFTP directory response', 'EPROTO');
  }
}

function sameIdentity(first: Stats, second: Stats): boolean {
  return first.dev === second.dev && first.ino === second.ino;
}
async function inspect(file: string): Promise<Stats | undefined> {
  try { return await fs.lstat(file); }
  catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return undefined;
    throw error;
  }
}

/**
 * Merge into a caller-owned directory. The caller must exclude concurrent local
 * writers: Node has no portable openat/renameat boundary for ancestor races.
 * Pre-existing links/special files and observed identity changes are rejected.
 * Each completed file replaces its leaf atomically; the whole tree is not a transaction.
 */
export class LocalDownloadDirectory {
  private readonly targets = new Map<string, Stats | undefined>();

  private constructor(
    private readonly root: string,
    private readonly directories: Map<string, Stats>,
    private readonly staging: string,
    private readonly stagingIdentity: Stats,
  ) {}

  static async create(directory: string): Promise<LocalDownloadDirectory> {
    const requested = path.resolve(directory);
    // The explicitly supplied parent is a caller-selected location, including
    // normal platform aliases such as /tmp. Below this root no links are followed.
    await fs.mkdir(path.dirname(requested), { recursive: true });
    const parent = await fs.realpath(path.dirname(requested));
    const root = path.join(parent, path.basename(requested));
    try { await fs.mkdir(root); }
    catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
    const identity = await fs.lstat(root);
    if (!identity.isDirectory() || identity.isSymbolicLink()) throw new SSHError('Download root must be an ordinary directory', 'EUNSAFEPATH');
    const staging = await fs.mkdtemp(path.join(root, '.xec-download-'));
    let stagingIdentity: Stats;
    try { stagingIdentity = await fs.lstat(staging); }
    catch (cause) { throw new SSHError(`Unable to confirm staging identity; retained for reconciliation: ${staging}`, 'EUNSAFEPATH', { cause }); }
    return new LocalDownloadDirectory(root, new Map([[root, identity]]), staging, stagingIdentity);
  }

  private components(relative: string): string[] {
    const components = relative.split('/');
    for (const component of components) validateDownloadComponent(component);
    return components;
  }

  private async verifyDirectory(directory: string): Promise<void> {
    const expected = this.directories.get(directory), observed = await inspect(directory);
    if (!expected || !observed || !observed.isDirectory() || observed.isSymbolicLink() || !sameIdentity(expected, observed)) {
      throw new SSHError(`Download directory changed ownership: ${directory}`, 'EUNSAFEPATH');
    }
  }

  private async ensureDirectory(components: string[]): Promise<string> {
    let directory = this.root;
    await this.verifyDirectory(directory);
    for (const component of components) {
      directory = path.join(directory, component);
      let observed = await inspect(directory);
      if (!observed) {
        try { await fs.mkdir(directory); }
        catch (error) { if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error; }
        observed = await fs.lstat(directory);
      }
      if (!observed.isDirectory() || observed.isSymbolicLink()) throw new SSHError(`Download ancestor must be an ordinary directory: ${directory}`, 'EUNSAFEPATH');
      const previous = this.directories.get(directory);
      if (previous && !sameIdentity(previous, observed)) throw new SSHError(`Download directory changed ownership: ${directory}`, 'EUNSAFEPATH');
      this.directories.set(directory, observed);
    }
    return directory;
  }

  async createDirectory(relative: string): Promise<void> {
    await this.ensureDirectory(this.components(relative));
  }

  async prepareFile(relative: string): Promise<string> {
    const components = this.components(relative), leaf = components.pop()!;
    const directory = await this.ensureDirectory(components);
    const target = path.join(directory, leaf), previous = await inspect(target);
    if (previous && (!previous.isFile() || previous.isSymbolicLink())) throw new SSHError(`Download target must be an ordinary file: ${target}`, 'EUNSAFEPATH');
    if (this.targets.has(target)) {
      const expected = this.targets.get(target);
      if ((expected === undefined) !== (previous === undefined) || (expected && previous && !sameIdentity(expected, previous))) {
        throw new SSHError(`Download target changed ownership: ${target}`, 'EUNSAFEPATH');
      }
    } else this.targets.set(target, previous);
    return target;
  }

  async transfer(relative: string, download: (temporary: string) => Promise<void>): Promise<void> {
    const target = await this.prepareFile(relative);
    const temporary = path.join(this.staging, randomUUID());
    await this.verifyStaging();
    await download(temporary);
    const file = await fs.lstat(temporary);
    if (!file.isFile() || file.isSymbolicLink()) throw new SSHError('Downloaded file is not an ordinary owned file', 'EUNSAFEPATH');
    await this.verifyStaging();
    await this.prepareFile(relative);
    const previous = this.targets.get(target);
    if (previous) await fs.chmod(temporary, previous.mode & 0o777);
    await fs.rename(temporary, target);
    this.targets.set(target, file);
    try { await this.prepareFile(relative); }
    catch (cause) { throw new SSHOutcomeUnknownError({ cause }); }
  }

  private async verifyStaging(): Promise<void> {
    const observed = await inspect(this.staging);
    if (!observed || !observed.isDirectory() || observed.isSymbolicLink() || !sameIdentity(this.stagingIdentity, observed)) {
      throw new SSHError(`Download staging ownership changed; retained for reconciliation: ${this.staging}`, 'EUNSAFEPATH');
    }
  }

  async dispose(): Promise<void> {
    await this.verifyDirectory(this.root);
    await this.verifyStaging();
    await fs.rm(this.staging, { recursive: true });
  }
}
