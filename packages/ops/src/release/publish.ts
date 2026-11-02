import type { ReleaseCommand } from './command.js';
import type { PreparedRelease, ReleaseArtifact } from './artifacts.js';

import semver from 'semver';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { rm, open, mkdtemp, readFile } from 'node:fs/promises';

import { distributionTag } from './packages.js';
import { releaseCommand, ReleaseCommandError } from './command.js';
import { assertReleaseHead, assertCleanReleaseTree } from './git.js';
import { artifactIntegrity, loadPreparedRelease, verifyReleaseArtifact, validatePackedPackage } from './artifacts.js';

export interface PublishReleaseOptions {
  registry?: string;
  run?: ReleaseCommand;
  env?: Record<string, string>;
  otp?: () => Promise<string>;
  progress?: (message: string) => void;
  /** Time allowed for a registry to expose an accepted immutable upload. */
  confirmationTimeoutMs?: number;
  confirmationIntervalMs?: number;
}
export function registryAddress(value = 'https://registry.npmjs.org/'): string {
  const url = new URL(value);
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== 'https:' && !(local && url.protocol === 'http:'))) throw new Error('Registry must use HTTPS, or loopback HTTP for an isolated test');
  return url.href;
}
function npmCode(error: unknown): string | undefined {
  if (!(error instanceof ReleaseCommandError)) return undefined;
  try { return (JSON.parse(error.stdout) as { error?: { code?: string } }).error?.code; } catch { return undefined; }
}

/** Check the immutable manifest before attempting a write. The tarball can appear later. */
export async function registryArtifactMatches(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions = {}): Promise<boolean> {
  const run = options.run ?? releaseCommand, registry = registryAddress(options.registry);
  let data: { name?: unknown; version?: unknown; dist?: { integrity?: unknown } };
  try { data = JSON.parse(await run(root, 'npm', ['view', `${artifact.name}@${artifact.version}`, '--json', '--prefer-online', '--registry', registry], { env: options.env })); }
  catch (error) {
    if (npmCode(error) === 'E404') return false;
    throw new Error(`Cannot verify registry state of ${artifact.name}@${artifact.version}; refusing to assume it is absent`, { cause: error });
  }
  if (!data || typeof data !== 'object' || data.name !== artifact.name || data.version !== artifact.version || typeof data.dist?.integrity !== 'string'
      || !data.dist.integrity.split(/\s+/).includes(artifact.integrity)) throw new Error(`Registry archive differs: ${artifact.name}@${artifact.version}. Recover the original archive or choose a new version`);
  return true;
}

/** Read mutable channel state separately from immutable archive confirmation. */
export async function registryReleaseChannel(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions = {}): Promise<string | undefined> {
  const run = options.run ?? releaseCommand;
  let tags: unknown;
  try { tags = JSON.parse(await run(root, 'npm', ['view', `${artifact.name}@${distributionTag(artifact.version)}`, 'dist-tags', '--json', '--prefer-online', '--registry', registryAddress(options.registry)], { env: options.env })); }
  catch (error) { if (npmCode(error) === 'E404') return undefined; throw new Error(`Cannot verify release channel for ${artifact.name}`, { cause: error }); }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new Error(`Invalid registry channel state: ${artifact.name}`);
  const value = (tags as Record<string, unknown>)[distributionTag(artifact.version)];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || semver.valid(value) !== value) throw new Error(`Invalid registry channel version: ${artifact.name}`);
  return value;
}

/** Use an empty cache so publication cannot be confirmed using a locally packed copy. */
async function downloadableArchiveMatches(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions): Promise<boolean> {
  const directory = await mkdtemp(join(tmpdir(), 'xec-registry-check-'));
  try {
    const run = options.run ?? releaseCommand;
    const packed = JSON.parse(await run(root, 'npm', ['pack', `${artifact.name}@${artifact.version}`,
      '--json', '--ignore-scripts', '--prefer-online', '--pack-destination', directory,
      '--cache', join(directory, 'cache'), '--registry', registryAddress(options.registry)], { env: options.env }));
    const filename = packed?.[0]?.filename;
    if (typeof filename !== 'string' || basename(filename) !== filename || !filename.endsWith('.tgz')
        || artifactIntegrity(await readFile(join(directory, filename))) !== artifact.integrity)
      throw new Error(`Downloaded registry archive differs: ${artifact.name}@${artifact.version}`);
    return true;
  } catch (error) {
    if (npmCode(error) === 'E404') return false;
    throw error;
  } finally { await rm(directory, { recursive: true, force: true }); }
}

async function receipt(directory: string, value: Record<string, unknown>): Promise<void> {
  const file = await open(join(directory, 'publication.jsonl'), 'a', 0o600);
  try { await file.writeFile(JSON.stringify({ at: new Date().toISOString(), ...value }) + '\n'); await file.sync(); }
  finally { await file.close(); }
}

/** A successful upload or an immutable reservation must never cause another
 * PUT while the registry is scanning. Scope recovery to these bytes and registry. */
async function pendingUploads(directory: string, registry: string): Promise<Map<string, string>> {
  const journal = await readFile(join(directory, 'publication.jsonl'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  const pending = new Map<string, string>();
  for (const line of journal.trim().split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.registry !== registry) continue;
    if (record.state === 'awaiting-registry') pending.set(record.name, record.integrity);
    if (record.state === 'registry-confirmed') pending.delete(record.name);
  }
  return pending;
}

async function waitForPublication(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions): Promise<string> {
  const timeout = options.confirmationTimeoutMs ?? 30 * 60_000;
  const interval = options.confirmationIntervalMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || !Number.isSafeInteger(interval) || interval < 1)
    throw new Error('Invalid registry confirmation timing');
  const deadline = Date.now() + timeout;
  let nextNotice = 0;
  let downloaded = false;
  let waitingFor = 'version metadata';
  for (;;) {
    if (!downloaded && await registryArtifactMatches(root, artifact, options)) {
      waitingFor = 'downloadable tarball';
      downloaded = await downloadableArchiveMatches(root, artifact, options);
    }
    if (downloaded) {
      const channel = await registryReleaseChannel(root, artifact, options);
      if (channel === artifact.version) return channel;
      if (channel && semver.gt(channel, artifact.version)) {
        options.progress?.(`${artifact.name}@${artifact.version}: preserving newer ${distributionTag(artifact.version)}=${channel}`);
        return channel;
      }
      waitingFor = `${distributionTag(artifact.version)} channel (currently ${channel ?? 'unset'})`;
    }
    const now = Date.now(), remaining = deadline - now;
    if (remaining <= 0) throw new Error(`Registry confirmation pending for ${artifact.name}@${artifact.version} (${waitingFor}). Inspect npm stage list ${artifact.name} or resume the same version to continue checking. The upload receipt is saved.`);
    if (now >= nextNotice) {
      options.progress?.(`Waiting for ${artifact.name}@${artifact.version} on the registry: ${waitingFor} (${Math.ceil(remaining / 60000)} min remaining)`);
      nextNotice = now + 60_000;
    }
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, remaining)));
  }
}

/** Check the complete batch and destination before any external publication or ref push. */
export async function preflightPreparedRelease(root: string, version: string, options: PublishReleaseOptions = {}): Promise<PreparedRelease> {
  const run = options.run ?? releaseCommand;
  await assertCleanReleaseTree(root, run);
  if (!await assertReleaseHead(root, version, run)) throw new Error('Create the exact release tag before publication');
  const release = await loadPreparedRelease(root, version, run), registry = registryAddress(options.registry), tag = distributionTag(version);
  // Check the complete batch before publishing its first package.
  for (const artifact of release.artifacts) {
    await validatePackedPackage(root, artifact.file, artifact, run);
    const manifest = JSON.parse(await run(root, 'tar', ['-xOf', artifact.file, 'package/package.json'])) as { publishConfig?: { registry?: string; tag?: string } };
    if ((manifest.publishConfig?.registry && registryAddress(manifest.publishConfig.registry) !== registry)
        || (manifest.publishConfig?.tag && manifest.publishConfig.tag !== tag)) throw new Error(`Packed publishConfig conflicts with the release destination: ${artifact.name}`);
    const exists = await registryArtifactMatches(root, artifact, options);
    const channel = await registryReleaseChannel(root, artifact, options);
    if (!exists && channel && semver.gt(channel, version)) throw new Error(`Publishing ${artifact.name}@${version} would move ${tag} backwards from ${channel}`);
  }
  return release;
}

/** Publication uses only a sealed batch; retries reconcile the registry before another effect. */
export async function publishPreparedRelease(root: string, version: string, options: PublishReleaseOptions = {}): Promise<PreparedRelease> {
  const run = options.run ?? releaseCommand;
  const release = await preflightPreparedRelease(root, version, options);
  const registry = registryAddress(options.registry), tag = distributionTag(version);
  const directory = dirname(release.artifacts[0]!.file);
  const pending = await pendingUploads(directory, registry);
  for (const artifact of release.artifacts) {
    const prior = pending.get(artifact.name);
    if (prior !== undefined && prior !== artifact.integrity) throw new Error('Pending publication integrity differs: ' + artifact.name);
    let otp: string | undefined;
    await verifyReleaseArtifact(artifact);
    if (prior === undefined && !await registryArtifactMatches(root, artifact, options)) {
      for (let attempt = 1; ; attempt++) {
        const currentChannel = await registryReleaseChannel(root, artifact, options);
        if (currentChannel && semver.gt(currentChannel, version)) throw new Error(`Refusing to move ${artifact.name} ${tag} backwards from ${currentChannel}`);
        await assertCleanReleaseTree(root, run);
        await assertReleaseHead(root, version, run);
        if (await run(root, 'git', ['rev-parse', 'HEAD']) !== release.commit) throw new Error('Source HEAD changed before publication');
        await verifyReleaseArtifact(artifact);
        options.progress?.(`Publishing ${artifact.name}@${version} (${tag}, attempt ${attempt})`);
        await receipt(directory, { name: artifact.name, integrity: artifact.integrity, state: 'dispatching', registry, tag, attempt });
        try {
          await run(root, 'npm', ['publish', artifact.file, '--json', '--ignore-scripts', '--access', 'public', '--tag', tag, '--registry', registry],
            { timeoutMs: 120000, env: otp ? { ...options.env, npm_config_otp: otp } : options.env, redact: otp ? [otp] : [] });
        } catch (error) {
          const code = npmCode(error);
          if (code === 'EOTP' && options.otp && attempt < 3) {
            otp = await options.otp();
            if (!/^\d{6,8}$/.test(otp)) throw new Error('Invalid one-time password', { cause: error });
            continue;
          }
          if (code !== 'E409' && code !== 'EPUBLISHCONFLICT' && !await registryArtifactMatches(root, artifact, options)) {
            await receipt(directory, { name: artifact.name, state: 'unconfirmed', attempt, registry, code });
            throw new Error(`Publication interrupted for ${artifact.name}. Resume using the saved archives; nothing was rolled back`, { cause: error });
          }
        }
        await receipt(directory, { name: artifact.name, integrity: artifact.integrity, state: 'awaiting-registry', registry, tag, attempt });
        break;
      }
    }
    const channel = await waitForPublication(root, artifact, options);
    await receipt(directory, { name: artifact.name, integrity: artifact.integrity, state: 'registry-confirmed', registry, tag, channel });
    options.progress?.(`Verified ${artifact.name}@${version}: downloaded SHA-512 matches the prepared archive`);
  }
  return release;
}
