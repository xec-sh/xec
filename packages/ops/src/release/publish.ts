import type { ReleaseCommand } from './command.js';
import type { PreparedRelease, ReleaseArtifact } from './artifacts.js';

import semver from 'semver';
import { tmpdir } from 'node:os';
import { join, dirname, basename } from 'node:path';
import { dialectFor, quoteForShell } from '@xec-sh/core';
import { rm, open, mkdtemp, readFile } from 'node:fs/promises';

import { distributionTag } from './packages.js';
import { releaseCommand, ReleaseCommandError } from './command.js';
import { assertReleaseHead, assertCleanReleaseTree } from './git.js';
import { artifactIntegrity, loadPreparedRelease, inspectPackedPackage, verifyReleaseArtifact } from './artifacts.js';

export interface PublishReleaseOptions {
  registry?: string;
  run?: ReleaseCommand;
  env?: Record<string, string>;
  /** Use npm's own browser/security-key prompt on EOTP. Defaults to an attached terminal. */
  interactive?: boolean;
  otp?: () => Promise<string>;
  /** Commit an external release reference after preflight and before the first upload. */
  beforeUpload?: () => Promise<void>;
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

// npm gives per-scope configuration precedence over its default registry.
function registryArgs(name: string, registry: string): string[] {
  const args = ['--registry', registry];
  if (name.startsWith('@')) args.push(`--${name.split('/')[0]}:registry=${registry}`);
  return args;
}

/** Check the immutable manifest before attempting a write. The tarball can appear later. */
export async function registryArtifactMatches(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions = {}): Promise<boolean> {
  const run = options.run ?? releaseCommand, registry = registryAddress(options.registry);
  let data: { name?: unknown; version?: unknown; dist?: { integrity?: unknown } };
  try { data = JSON.parse(await run(root, 'npm', ['view', `${artifact.name}@${artifact.version}`, '--json', '--prefer-online', ...registryArgs(artifact.name, registry)], { env: options.env })); }
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
  try { tags = JSON.parse(await run(root, 'npm', ['view', `${artifact.name}@${distributionTag(artifact.version)}`, 'dist-tags', '--json', '--prefer-online', ...registryArgs(artifact.name, registryAddress(options.registry))], { env: options.env })); }
  catch (error) { if (npmCode(error) === 'E404') return undefined; throw new Error(`Cannot verify release channel for ${artifact.name}`, { cause: error }); }
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) throw new Error(`Invalid registry channel state: ${artifact.name}`);
  const value = (tags as Record<string, unknown>)[distributionTag(artifact.version)];
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || semver.valid(value) !== value) throw new Error(`Invalid registry channel version: ${artifact.name}`);
  return value;
}

/** Use an empty cache so publication cannot be confirmed using a locally packed copy. */
async function checkDownload(root: string, artifact: ReleaseArtifact, options: PublishReleaseOptions): Promise<'verified' | 'npm version index' | 'downloadable tarball'> {
  const directory = await mkdtemp(join(tmpdir(), 'xec-registry-check-'));
  try {
    const run = options.run ?? releaseCommand;
    const packed = JSON.parse(await run(root, 'npm', ['pack', `${artifact.name}@${artifact.version}`,
      '--json', '--ignore-scripts', '--prefer-online', '--pack-destination', directory,
      '--cache', join(directory, 'cache'), ...registryArgs(artifact.name, registryAddress(options.registry))], { env: options.env }));
    const filename = packed?.[0]?.filename;
    if (typeof filename !== 'string' || basename(filename) !== filename || !filename.endsWith('.tgz')
        || artifactIntegrity(await readFile(join(directory, filename))) !== artifact.integrity)
      throw new Error(`Downloaded registry archive differs: ${artifact.name}@${artifact.version}`);
    return 'verified';
  } catch (error) {
    const code = npmCode(error);
    if (code === 'ETARGET') return 'npm version index';
    if (code === 'E404') return 'downloadable tarball';
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
async function recordedUploads(directory: string, registry: string): Promise<Map<string, { integrity: string; accepted: boolean }>> {
  const journal = await readFile(join(directory, 'publication.jsonl'), 'utf8').catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'ENOENT') throw error;
    return '';
  });
  const uploads = new Map<string, { integrity: string; accepted: boolean }>();
  for (const line of journal.trim().split('\n').filter(Boolean)) {
    const record = JSON.parse(line);
    if (record.registry !== registry) continue;
    if (record.state === 'awaiting-registry' || record.state === 'registry-confirmed') {
      uploads.set(record.name, { integrity: record.integrity, accepted: record.state === 'registry-confirmed' || record.accepted === true });
    }
  }
  return uploads;
}

/** Poll every outstanding archive before sleeping, so one delayed scan cannot hide verified siblings. */
async function confirmPublications(root: string, artifacts: ReleaseArtifact[], options: PublishReleaseOptions): Promise<void> {
  const timeout = options.confirmationTimeoutMs ?? 30 * 60_000;
  const interval = options.confirmationIntervalMs ?? 15_000;
  if (!Number.isSafeInteger(timeout) || timeout < 0 || !Number.isSafeInteger(interval) || interval < 1)
    throw new Error('Invalid registry confirmation timing');
  const registry = registryAddress(options.registry);
  const deadline = Date.now() + timeout;
  const pending = new Map(artifacts.map(artifact => [artifact, { downloaded: false, waitingFor: 'version metadata' }]));
  let nextNotice = 0;
  while (pending.size) {
    for (const [artifact, state] of pending) {
      if (!state.downloaded) {
        state.waitingFor = await registryArtifactMatches(root, artifact, options) ? await checkDownload(root, artifact, options) : 'version metadata';
        state.downloaded = state.waitingFor === 'verified';
      }
      if (!state.downloaded) continue;
      const tag = distributionTag(artifact.version);
      const channel = await registryReleaseChannel(root, artifact, options);
      if (channel !== artifact.version && !(channel && semver.gt(channel, artifact.version))) {
        state.waitingFor = `${tag} channel (currently ${channel ?? 'unset'})`;
        continue;
      }
      if (channel !== artifact.version) {
        options.progress?.(`${artifact.name}@${artifact.version}: preserving newer ${tag}=${channel}`);
      }
      await receipt(dirname(artifact.file), { name: artifact.name, integrity: artifact.integrity, state: 'registry-confirmed', registry, tag, channel });
      pending.delete(artifact);
      options.progress?.(`Verified ${artifact.name}@${artifact.version}: downloaded SHA-512 matches the prepared archive`);
    }
    if (!pending.size) return;
    const now = Date.now(), remaining = deadline - now;
    const outstanding = [...pending].map(([artifact, state]) => `${artifact.name}@${artifact.version} (${state.waitingFor})`).join(', ');
    if (remaining <= 0) {
      const artifact = pending.keys().next().value!;
      const inspection = ['npm', 'view', `${artifact.name}@${artifact.version}`, 'version', 'dist.integrity', 'dist.tarball', 'dist-tags',
        '--json', '--prefer-online', ...registryArgs(artifact.name, registry)]
        .map(value => quoteForShell(value, dialectFor())).join(' ');
      throw new Error(`Registry confirmation pending for ${outstanding}.\nInspect metadata without uploading:\n${inspection}\nSaved upload receipts: ${join(dirname(artifact.file), 'publication.jsonl')}\nResume this prepared release with the same version, archives and registry; recorded uploads will only be checked. Do not run npm publish again.`);
    }
    if (now >= nextNotice) {
      options.progress?.(`Waiting for ${pending.size} package(s) on the registry: ${outstanding}; ${Math.ceil(remaining / 60000)} min remaining`);
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
  let uploadRequired = false;
  // Check the complete batch before publishing its first package.
  for (const artifact of release.artifacts) {
    const manifest = await inspectPackedPackage(root, artifact.file, artifact, run) as { publishConfig?: { registry?: string; tag?: string } };
    if ((manifest.publishConfig?.registry && registryAddress(manifest.publishConfig.registry) !== registry)
        || (manifest.publishConfig?.tag && manifest.publishConfig.tag !== tag)) throw new Error(`Packed publishConfig conflicts with the release destination: ${artifact.name}`);
    const exists = await registryArtifactMatches(root, artifact, options);
    if (!exists) uploadRequired = true;
    const channel = await registryReleaseChannel(root, artifact, options);
    if (!exists && channel && semver.gt(channel, version)) throw new Error(`Publishing ${artifact.name}@${version} would move ${tag} backwards from ${channel}`);
  }
  // Human publication uses a logged-in npm identity. Trusted-publishing CI and
  // anonymous private registries have different authentication contracts.
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  if (uploadRequired && interactive && registry === 'https://registry.npmjs.org/') {
    try {
      const identity = await run(root, 'npm', ['whoami', '--json', '--registry', registry], { env: options.env });
      if (!identity.trim()) throw new Error('npm returned an empty publishing identity');
    } catch (error) {
      const code = npmCode(error);
      if (code !== 'E401' && code !== 'ENEEDAUTH' && code !== 'E403') throw error;
      throw new Error(`npm authentication failed before publication. Run npm login --auth-type=web --registry=${registry} and check npm whoami before resuming`, { cause: error });
    }
  }
  return release;
}

async function submitUploads(root: string, release: PreparedRelease, options: PublishReleaseOptions): Promise<ReleaseArtifact[]> {
  const run = options.run ?? releaseCommand;
  const { version } = release;
  const registry = registryAddress(options.registry), tag = distributionTag(version);
  const directory = dirname(release.artifacts[0]!.file);
  const uploads = await recordedUploads(directory, registry);
  const awaiting: ReleaseArtifact[] = [];
  const interactive = options.interactive ?? Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let otp: string | undefined;
  for (const artifact of release.artifacts) {
    const prior = uploads.get(artifact.name);
    if (prior && prior.integrity !== artifact.integrity) throw new Error('Pending publication integrity differs: ' + artifact.name);
    let accepted = prior?.accepted ?? true;
    let terminalChallenge = false;
    await verifyReleaseArtifact(artifact);
    if (prior === undefined && !await registryArtifactMatches(root, artifact, options)) {
      for (let attempt = 1; ; attempt++) {
        const currentChannel = await registryReleaseChannel(root, artifact, options);
        if (currentChannel && semver.gt(currentChannel, version)) throw new Error(`Refusing to move ${artifact.name} ${tag} backwards from ${currentChannel}`);
        await assertCleanReleaseTree(root, run);
        if (!await assertReleaseHead(root, version, run)) throw new Error('Release tag disappeared before publication');
        if (await run(root, 'git', ['rev-parse', 'HEAD']) !== release.commit) throw new Error('Source HEAD changed before publication');
        await verifyReleaseArtifact(artifact);
        options.progress?.(`Publishing ${artifact.name}@${version} (${tag}, attempt ${attempt})`);
        await receipt(directory, { name: artifact.name, integrity: artifact.integrity, state: 'dispatching', registry, tag, attempt });
        try {
          const output = terminalChallenge ? ['--auth-type=web', '--no-json', '--loglevel=error'] : ['--json'];
          await run(root, 'npm', ['publish', artifact.file, ...output, '--ignore-scripts', '--access', 'public', '--tag', tag, ...registryArgs(artifact.name, registry)],
            { interactive: terminalChallenge, timeoutMs: terminalChallenge ? 300000 : 120000,
              env: otp ? { ...options.env, npm_config_otp: otp } : options.env, redact: otp ? [otp] : [] });
        } catch (error) {
          const code = npmCode(error);
          if (code === 'EOTP' && !terminalChallenge && attempt < 3) {
            if (interactive) {
              terminalChallenge = true;
              options.progress?.(`npm needs authorization for ${artifact.name}. Continue in the terminal and browser.`);
              continue;
            }
            if (options.otp) {
              otp = await options.otp();
              if (!/^\d{6,8}$/.test(otp)) throw new Error('Invalid one-time password', { cause: error });
              continue;
            }
          }
          if (code === 'E409' || code === 'EPUBLISHCONFLICT') {
            // A reservation can belong to different bytes. Verify it before another upload.
            accepted = false;
          } else if (!await registryArtifactMatches(root, artifact, options)) {
            await receipt(directory, { name: artifact.name, state: 'unconfirmed', attempt, registry, code });
            const hint = code === 'E404' || code === 'E401' || code === 'E403'
              ? ' Check npm whoami and the account or token write permissions for this package and scope.' : '';
            throw new Error(`Publication interrupted for ${artifact.name}.${hint} Resume using the saved archives; nothing was rolled back`, { cause: error });
          }
        }
        await receipt(directory, { name: artifact.name, integrity: artifact.integrity, state: 'awaiting-registry', accepted, registry, tag, attempt });
        break;
      }
    }
    if (accepted) awaiting.push(artifact);
    else await confirmPublications(root, [artifact], options);
  }
  return awaiting;
}

/** Submit the sealed batch in dependency order, then verify consumer-visible registry state. */
export async function publishPreparedRelease(root: string, version: string, options: PublishReleaseOptions = {}): Promise<PreparedRelease> {
  const release = await preflightPreparedRelease(root, version, options);
  if (options.beforeUpload) {
    await options.beforeUpload();
    const run = options.run ?? releaseCommand;
    await assertCleanReleaseTree(root, run);
    if (await run(root, 'git', ['rev-parse', 'HEAD']) !== release.commit || !await assertReleaseHead(root, version, run)) {
      throw new Error('Release source changed after preflight');
    }
  }
  const awaiting = await submitUploads(root, release, options);
  if (awaiting.length) options.progress?.(`Uploads complete. Verifying ${awaiting.length} archive(s) against the registry.`);
  await confirmPublications(root, awaiting, options);
  return release;
}
