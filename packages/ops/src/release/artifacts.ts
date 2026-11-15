import type { ReleasePackage } from './packages.js';
import type { ReleaseCommand, ReleaseCommandOptions } from './command.js';

import { tmpdir } from 'node:os';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { getExecutionSignal } from '@xec-sh/core';
import { join, resolve, dirname, basename } from 'node:path';
import { rm, open, mkdir, chmod, lstat, rename, mkdtemp, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';

import { releaseCommand } from './command.js';
import { assertCleanReleaseTree } from './git.js';
import { releaseTag, discoverReleasePackages } from './packages.js';

/** API negotiation for recipes that require durable producer retention. */
export const RELEASE_PRODUCER_PROTOCOL = 1;

export interface ReleaseArtifact {
  name: string;
  version: string;
  file: string;
  integrity: string;
}
export interface PreparedRelease {
  schema: 1;
  commit: string;
  version: string;
  artifacts: ReleaseArtifact[];
}
export interface PrepareReleaseOptions {
  run?: ReleaseCommand;
  offline?: boolean;
  build: { executable: string; args: string[]; timeoutMs?: number };
  signal?: AbortSignal;
  onEvent?: ReleaseCommandOptions['onEvent'];
  outputLimit?: number;
  progress?: (message: string) => void;
  /**
   * Retain a complete packed producer before acceptance. The owner must bind
   * every external build/pack/verifier input and the complete policy closure to
   * SHA-256 digests. Function text is also bound, but cannot reveal JS closures.
   * Acceptance receives a fresh source-only snapshot on every attempt, never
   * the producer's dist or node_modules. It must await its resource cleanup.
   * Cannot be combined with the legacy built-workspace verifyArtifact callback.
   */
  retainProducer?: {
    policy: string;
    inputs: Readonly<Record<string, string>>;
    verify: (context: { source: string; artifacts: readonly ReleaseArtifact[]; run: ReleaseCommand; signal?: AbortSignal }) => Promise<void>;
  };
  /** Verify the actual archive (for example in a clean consumer) before sealing. */
  verifyArtifact?: (context: { workspace: string; artifact: ReleaseArtifact; run: ReleaseCommand; signal?: AbortSignal }) => Promise<void>;
  /** Normalize or annotate the packed archive before validation and its immutable digest. */
  prepareArchive?: (context: { workspace: string; temporary: string; pkg: ReleasePackage; file: string; run: ReleaseCommand; signal?: AbortSignal }) => Promise<void>;
  /** An owner-specific packaging recipe, executed only in the isolated snapshot. */
  preparePackage?: (context: { workspace: string; temporary: string; pkg: ReleasePackage; run: ReleaseCommand; signal?: AbortSignal }) => Promise<{ directory: string; manager: 'npm' | 'pnpm' } | undefined>;
}

/** The same packaging contract serves initial and independently reproduced builds. */
export type PackReleaseOptions = Pick<PrepareReleaseOptions,
  'run' | 'signal' | 'onEvent' | 'outputLimit' | 'progress' | 'preparePackage' | 'prepareArchive' | 'verifyArtifact'>;

/** Pack each workspace once. The caller owns the private temporary directory and cleanup. */
export async function packReleaseArtifacts(workspace: string, temporary: string,
  packages: readonly ReleasePackage[], options: PackReleaseOptions = {}): Promise<ReleaseArtifact[]> {
  const signal = getExecutionSignal(options.signal);
  const execute = options.run ?? releaseCommand;
  const run: ReleaseCommand = async (cwd, executable, args, commandOptions = {}) => {
    const combined = signal && commandOptions.signal
      ? AbortSignal.any([signal, commandOptions.signal]) : commandOptions.signal ?? signal;
    combined?.throwIfAborted();
    const result = await execute(cwd, executable, args, { ...commandOptions, signal: combined });
    combined?.throwIfAborted();
    return result;
  };
  const observedRun: ReleaseCommand = (cwd, executable, args, commandOptions) => run(cwd, executable, args, {
    onEvent: options.onEvent, outputLimit: options.outputLimit, ...commandOptions,
  });
  if (new Set(packages.map(pkg => pkg.name)).size !== packages.length) throw new Error('Duplicate package in release inventory');
  const artifacts: ReleaseArtifact[] = [];
  for (const pkg of packages) {
    signal?.throwIfAborted();
    options.progress?.(`Packing ${pkg.name}`);
    const output = await mkdtemp(join(temporary, 'pack-'));
    const recipe = await options.preparePackage?.({ workspace, temporary, pkg, run: observedRun, signal });
    signal?.throwIfAborted();
    const location = recipe?.directory ?? join(workspace, pkg.path), manager = recipe?.manager ?? 'pnpm';
    await observedRun(location, manager, manager === 'npm'
      ? ['pack', '--ignore-scripts', '--json', '--pack-destination', output]
      : ['--config.ignore-scripts=true', 'pack', '--pack-destination', output]);
    const archives = (await readdir(output)).filter(name => name.endsWith('.tgz'));
    if (archives.length !== 1) throw new Error(`Expected one archive for ${pkg.name}`);
    const file = join(output, archives[0]!);
    await options.prepareArchive?.({ workspace, temporary, pkg, file, run: observedRun, signal });
    signal?.throwIfAborted();
    await validatePackedPackage(workspace, file, pkg, run);
    const artifact = { name: pkg.name, version: pkg.version, file, integrity: artifactIntegrity(await readFile(file)) };
    await options.verifyArtifact?.({ workspace, artifact, run: observedRun, signal });
    signal?.throwIfAborted();
    await verifyReleaseArtifact(artifact);
    artifacts.push(artifact);
  }
  return artifacts;
}

export const artifactIntegrity = (bytes: Uint8Array): string => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const missing = (error: unknown) => error instanceof Error && 'code' in error && error.code === 'ENOENT';

export async function verifyReleaseArtifact(artifact: ReleaseArtifact): Promise<void> {
  if (artifactIntegrity(await readFile(artifact.file)) !== artifact.integrity) throw new Error(`Release archive changed: ${artifact.name}`);
}

/** A packed package must have registry dependencies and every promised entry point. */
export async function validatePackedPackage(root: string, file: string, pkg: Pick<ReleasePackage, 'name' | 'version'>, run: ReleaseCommand = releaseCommand): Promise<void> {
  await inspectPackedPackage(root, file, pkg, run);
}

export async function inspectPackedPackage(root: string, file: string, pkg: Pick<ReleasePackage, 'name' | 'version'>, run: ReleaseCommand): Promise<Record<string, unknown>> {
  // GNU tar treats a colon before the first slash as a remote host. This local
  // archive may live on a different Windows drive from the release checkout.
  const archive = resolve(root, file);
  const directory = dirname(archive);
  const name = './' + basename(archive);
  const manifest = JSON.parse(await run(directory, 'tar', ['-xOf', name, 'package/package.json'])) as Record<string, unknown>;
  if (manifest['name'] !== pkg.name || manifest['version'] !== pkg.version || manifest['private']) throw new Error(`Packed identity differs: ${pkg.name}@${pkg.version}`);
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    if (Object.values((manifest[section] ?? {}) as Record<string, unknown>).some(value => typeof value !== 'string' || /^(workspace:|file:|link:)/.test(value))) throw new Error(`Packed ${pkg.name} contains local ${section}`);
  }
  const files = (await run(directory, 'tar', ['-tzf', name])).split(/\r?\n/);
  if (files.some(path => !path.startsWith('package/') || path.includes('\\') || path.split('/').includes('..'))) throw new Error(`Unsafe archive path: ${pkg.name}`);
  const targets = (value: unknown): string[] => typeof value === 'string' ? [value]
    : value && typeof value === 'object' ? Object.values(value).flatMap(targets) : [];
  for (const target of [manifest['main'], manifest['types'], manifest['bin'], manifest['exports']].flatMap(targets)) {
    if (target.startsWith('#')) continue;
    const expected = 'package/' + target.replace(/^\.\//, '');
    const pattern = new RegExp('^' + expected.split('*').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.+') + '$');
    if (!files.some(path => pattern.test(path))) throw new Error(`Packed ${pkg.name} has no exported entry: ${target}`);
  }
  return manifest;
}

export async function loadPreparedRelease(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<PreparedRelease> {
  releaseTag(version);
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  const directory = join(root, '.release-artifacts', version, commit);
  const saved = JSON.parse(await readFile(join(directory, 'release.json'), 'utf8')) as PreparedRelease;
  if (saved.schema !== 1 || saved.commit !== commit || saved.version !== version || !Array.isArray(saved.artifacts)) throw new Error('Invalid prepared release identity');
  const packages = await discoverReleasePackages(root, run);
  if (saved.artifacts.length !== packages.length) throw new Error('Prepared release inventory differs');
  for (let index = 0; index < packages.length; index++) {
    const pkg = packages[index]!, artifact = saved.artifacts[index];
    if (!artifact || artifact.name !== pkg.name || artifact.version !== version || pkg.version !== version
        || typeof artifact.file !== 'string' || basename(artifact.file) !== artifact.file || !/^[A-Za-z0-9_.%-]+\.tgz$/.test(artifact.file)
        || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(artifact.integrity)) throw new Error('Invalid prepared package identity');
    artifact.file = join(directory, artifact.file);
    await verifyReleaseArtifact(artifact);
  }
  return saved;
}

const sha256 = (text: string): string => createHash('sha256').update(text).digest('hex');

function producerIdentity(options: PrepareReleaseOptions) {
  const retention = options.retainProducer!;
  return {
    protocol: RELEASE_PRODUCER_PROTOCOL,
    policy: retention.policy,
    inputs: Object.fromEntries(Object.entries(retention.inputs).sort(([a], [b]) => a.localeCompare(b, 'en'))),
    runtime: { platform: process.platform, arch: process.arch, versions: { ...process.versions } },
    build: { executable: options.build.executable, args: [...options.build.args] },
    transport: sha256(Function.prototype.toString.call(options.run ?? releaseCommand)),
    packaging: sha256(options.preparePackage ? Function.prototype.toString.call(options.preparePackage) : ''),
    archive: sha256(options.prepareArchive ? Function.prototype.toString.call(options.prepareArchive) : ''),
    acceptance: sha256(Function.prototype.toString.call(retention.verify)),
  };
}

interface RetainedProducer extends PreparedRelease {
  stage: 'producer';
  identity: ReturnType<typeof producerIdentity>;
}

async function assertPrivateDirectory(path: string): Promise<void> {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()
      || (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.())))
    throw new Error(`Release evidence requires a private owned directory: ${path}`);
}

async function readProducerFile(path: string, archive = false): Promise<Buffer> {
  const before = await lstat(path);
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1
      || (process.platform !== 'win32' && (before.uid !== process.getuid?.() || (before.mode & (archive ? 0o222 : 0o077)) !== 0)))
    throw new Error(`Invalid retained producer file: ${path}`);
  const handle = await open(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = await handle.stat();
    if (stat.dev !== before.dev || stat.ino !== before.ino || stat.size !== before.size || stat.mtimeMs !== before.mtimeMs)
      throw new Error(`Retained producer file changed while opening: ${path}`);
    return await handle.readFile();
  } finally { await handle.close(); }
}

async function loadProducer(directory: string, commit: string, version: string,
  identity: ReturnType<typeof producerIdentity>, packages: ReleasePackage[]): Promise<RetainedProducer | undefined> {
  let bytes: Buffer;
  try {
    for (const path of [dirname(dirname(directory)), dirname(directory), directory]) await assertPrivateDirectory(path);
    bytes = await readProducerFile(join(directory, 'producer.json'));
  } catch (error) { if (missing(error)) return undefined; throw error; }
  const saved = JSON.parse(bytes.toString('utf8')) as RetainedProducer;
  if (saved.schema !== 1 || saved.stage !== 'producer' || saved.commit !== commit || saved.version !== version
      || JSON.stringify(saved.identity) !== JSON.stringify(identity)
      || !Array.isArray(saved.artifacts) || saved.artifacts.length !== packages.length)
    throw new Error('Retained producer identity differs; preserve the evidence and review the declared inputs');
  for (let index = 0; index < packages.length; index++) {
    const pkg = packages[index]!, artifact = saved.artifacts[index];
    if (!artifact || artifact.name !== pkg.name || artifact.version !== version
        || artifact.file !== encodeURIComponent(pkg.name) + '.tgz'
        || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(artifact.integrity))
      throw new Error('Retained producer inventory differs');
    artifact.file = join(directory, artifact.file);
    let content: Buffer;
    try { content = await readProducerFile(artifact.file, true); }
    catch (error) { throw new Error(`Retained producer archive unavailable: ${artifact.name}`, { cause: error }); }
    if (artifactIntegrity(content) !== artifact.integrity) throw new Error(`Retained producer archive changed: ${artifact.name}`);
  }
  return saved;
}

async function syncReleaseDirectories(directory: string): Promise<void> {
  // Windows cannot fsync directory handles. Missing evidence after power loss
  // fails closed; the corresponding complete record and hashes are mandatory.
  if (process.platform === 'win32') return;
  for (const path of [directory, dirname(directory), dirname(dirname(directory))]) {
    const handle = await open(path, 'r');
    try { await handle.sync(); } finally { await handle.close(); }
  }
}

async function writeReleaseRecord(directory: string, name: string, record: PreparedRelease | RetainedProducer): Promise<void> {
  const temporary = join(directory, `.${name}.tmp`);
  const handle = await open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(record, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await rename(temporary, join(directory, name));
  await syncReleaseDirectories(directory);
}

async function retainArchives(directory: string, commit: string, version: string, artifacts: ReleaseArtifact[]): Promise<PreparedRelease> {
  // This directory is exclusive. Never merge with an interrupted producer or
  // replace archives that may already be the subject of publication receipts.
  await mkdir(directory, { mode: 0o700 });
  const saved: PreparedRelease = { schema: 1, commit, version, artifacts: [] };
  for (const artifact of artifacts) {
    const filename = encodeURIComponent(artifact.name) + '.tgz';
    const file = join(directory, filename);
    await copyFile(artifact.file, file, constants.COPYFILE_EXCL);
    const handle = await open(file, 'r+');
    try { await handle.sync(); } finally { await handle.close(); }
    await chmod(file, 0o444);
    const retained = { ...artifact, file };
    await verifyReleaseArtifact(retained);
    saved.artifacts.push({ ...artifact, file: filename });
  }
  return saved;
}

/** Build an exact committed snapshot. Hold acquireReleaseLock across this call and publication. */
export async function prepareReleaseArtifacts(root: string, version: string, options: PrepareReleaseOptions): Promise<PreparedRelease> {
  options = { ...options, build: { ...options.build, args: [...options.build.args] }, signal: getExecutionSignal(options.signal) };
  root = resolve(root); releaseTag(version);
  if (options.build.timeoutMs !== undefined && (!Number.isFinite(options.build.timeoutMs) || options.build.timeoutMs <= 0))
    throw new Error('Build timeout must be positive');
  if (options.outputLimit !== undefined && (!Number.isSafeInteger(options.outputLimit) || options.outputLimit < 1))
    throw new Error('Output limit must be a positive integer');
  if (options.retainProducer) {
    const { policy, inputs, verify } = options.retainProducer;
    if (options.verifyArtifact) throw new Error('Retained producer acceptance cannot use the legacy built-workspace verifyArtifact callback');
    if (!/^[a-f0-9]{64}$/.test(policy) || !inputs || typeof inputs !== 'object' || Array.isArray(inputs)
        || Object.entries(inputs).some(([name, digest]) => !name || typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest))
        || typeof verify !== 'function') throw new Error('Retained producer policy and declared inputs require SHA-256 digests and an acceptance callback');
    options.retainProducer = { policy, inputs: { ...inputs }, verify };
  }
  options.signal?.throwIfAborted();
  const execute = options.run ?? releaseCommand;
  const run: ReleaseCommand = async (cwd, executable, args, commandOptions = {}) => {
    const signal = options.signal && commandOptions.signal
      ? AbortSignal.any([options.signal, commandOptions.signal]) : commandOptions.signal ?? options.signal;
    signal?.throwIfAborted();
    const answer = await execute(cwd, executable, args, { ...commandOptions, signal });
    signal?.throwIfAborted();
    return answer;
  };
  // Internal inventories require complete stdout; only unparsed build logs use tails.
  const observedRun: ReleaseCommand = (cwd, executable, args, commandOptions) => run(cwd, executable, args, {
    onEvent: options.onEvent, outputLimit: options.outputLimit, ...commandOptions,
  });
  await assertCleanReleaseTree(root, run);
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Invalid source commit');
  const packages = await discoverReleasePackages(root, run);
  if (packages.some(pkg => pkg.version !== version)) throw new Error('Commit synchronized package versions before preparing release artifacts');
  const parent = join(root, '.release-artifacts', version), directory = join(parent, commit);
  const identity = options.retainProducer ? producerIdentity(options) : undefined;
  let producer = identity ? await loadProducer(directory, commit, version, identity, packages) : undefined;
  try {
    const completed = await loadPreparedRelease(root, version, run);
    if (identity && !producer) throw new Error('Prepared release has no matching retained producer evidence');
    return completed;
  } catch (error) { if (!missing(error)) throw error; }
  await mkdir(parent, { recursive: true, mode: 0o700 });
  if (identity) for (const path of [dirname(parent), parent]) await assertPrivateDirectory(path);
  if (!producer) {
    try { await readdir(directory); throw new Error(`Incomplete artifact directory already exists: ${directory}. Inspect it before recovery`); }
    catch (error) { if (!missing(error)) throw error; }
  }
  const temporary = await mkdtemp(join(tmpdir(), 'xec-release-build-'));
  const workspace = join(temporary, 'workspace');
  let preparationFailure: unknown;
  let cleanupFailure: unknown;
  let preparationFailed = false;
  let cleanupFailed = false;
  let saved: PreparedRelease | undefined;
  try {
    options.progress?.(`Preparing isolated source ${commit.slice(0, 12)}`);
    const archive = join(temporary, 'source.tar');
    await run(root, 'git', ['archive', '--format=tar', '--output', archive, commit]);
    if (!producer) {
      await mkdir(workspace);
      await run(temporary, 'tar', ['-xf', './source.tar', '-C', basename(workspace)]);
      await observedRun(workspace, 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--prod=false', ...(options.offline ? ['--offline'] : [])], { timeoutMs: 600000 });
      options.progress?.('Building isolated packages');
      await observedRun(workspace, options.build.executable, options.build.args, { timeoutMs: options.build.timeoutMs ?? 600000 });
      const artifacts = await packReleaseArtifacts(workspace, temporary, packages, { ...options, run });
      if (await run(root, 'git', ['rev-parse', 'HEAD']) !== commit) throw new Error('Source HEAD changed during preparation');
      await assertCleanReleaseTree(root, run);
      options.signal?.throwIfAborted();
      saved = await retainArchives(directory, commit, version, artifacts);
      if (identity) {
        await writeReleaseRecord(directory, 'producer.json', { ...saved, stage: 'producer', identity });
        producer = await loadProducer(directory, commit, version, identity, packages);
        options.progress?.('Producer archives retained; acceptance is not complete');
      }
    } else options.progress?.('Verified retained producer; skipping dependency install, build and pack');
    if (producer) {
      options.signal?.throwIfAborted();
      const source = join(temporary, 'acceptance');
      await mkdir(source);
      await run(temporary, 'tar', ['-xf', './source.tar', '-C', basename(source)]);
      const producerRecord = await readProducerFile(join(directory, 'producer.json'));
      await options.retainProducer!.verify({ source, artifacts: producer.artifacts.map(artifact => ({ ...artifact })), run: observedRun, signal: options.signal });
      options.signal?.throwIfAborted();
      // Acceptance can run arbitrary commands. Recheck the evidence and archives
      // rather than trusting a callback's success or mutated context objects.
      if (!producerRecord.equals(await readProducerFile(join(directory, 'producer.json')))) throw new Error('Retained producer evidence changed during acceptance');
      producer = await loadProducer(directory, commit, version, identity!, packages);
      if (!producer) throw new Error('Retained producer evidence disappeared during acceptance');
      saved = { schema: 1, commit, version, artifacts: producer.artifacts.map(artifact => ({ ...artifact, file: basename(artifact.file) })) };
    }
    if (await run(root, 'git', ['rev-parse', 'HEAD']) !== commit) throw new Error('Source HEAD changed during acceptance');
    await assertCleanReleaseTree(root, run);
  } catch (error) {
    preparationFailed = true;
    preparationFailure = error;
  } finally {
    try {
      try { options.progress?.('Cleaning isolated release workspace'); }
      finally { await rm(temporary, { recursive: true, force: true }); }
      options.progress?.('Isolated release workspace cleaned');
    } catch (error) {
      cleanupFailed = true;
      cleanupFailure = error;
    }
  }
  if (preparationFailed) {
    if (cleanupFailed) throw new AggregateError([preparationFailure, cleanupFailure],
      'Release preparation failed; cleanup also reported an error', { cause: preparationFailure });
    throw preparationFailure;
  }
  if (cleanupFailed) throw cleanupFailure;
  // Cleanup failure is not successful acceptance. The unqualified producer stays
  // available, but publication authority appears only after all gates and cleanup.
  options.signal?.throwIfAborted();
  if (await run(root, 'git', ['rev-parse', 'HEAD']) !== commit) throw new Error('Source HEAD changed during cleanup');
  await assertCleanReleaseTree(root, run);
  await writeReleaseRecord(directory, 'release.json', saved!);
  return loadPreparedRelease(root, version, run);
}

/** One writer per checkout; stale locks require explicit inspection, never PID guessing. */
export async function acquireReleaseLock(root: string): Promise<() => Promise<void>> {
  const directory = join(root, '.release-artifacts');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const lock = join(directory, 'running');
  try { await mkdir(lock, { mode: 0o700 }); }
  catch (error) { throw new Error(`Release is locked: ${lock}; inspect the prior operation before recovery`, { cause: error }); }
  try { await writeFile(join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { mode: 0o600 }); }
  catch (error) { await rm(lock, { recursive: true, force: true }); throw error; }
  return () => rm(lock, { recursive: true, force: true });
}
