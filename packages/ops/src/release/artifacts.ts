import type { ReleasePackage } from './packages.js';
import type { ReleaseCommand, ReleaseCommandOptions } from './command.js';

import { tmpdir } from 'node:os';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, resolve, dirname, basename } from 'node:path';
import { rm, open, mkdir, chmod, rename, mkdtemp, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';

import { releaseCommand } from './command.js';
import { assertCleanReleaseTree } from './git.js';
import { releaseTag, discoverReleasePackages } from './packages.js';

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
  /** Verify the actual archive (for example in a clean consumer) before sealing. */
  verifyArtifact?: (context: { workspace: string; artifact: ReleaseArtifact; run: ReleaseCommand; signal?: AbortSignal }) => Promise<void>;
  /** An owner-specific packaging recipe, executed only in the isolated snapshot. */
  preparePackage?: (context: { workspace: string; temporary: string; pkg: ReleasePackage; run: ReleaseCommand; signal?: AbortSignal }) => Promise<{ directory: string; manager: 'npm' | 'pnpm' } | undefined>;
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

/** Build from the exact committed snapshot; never replace a working checkout's dist or dependencies. */
export async function prepareReleaseArtifacts(root: string, version: string, options: PrepareReleaseOptions): Promise<PreparedRelease> {
  root = resolve(root); releaseTag(version);
  if (options.build.timeoutMs !== undefined && (!Number.isFinite(options.build.timeoutMs) || options.build.timeoutMs <= 0))
    throw new Error('Build timeout must be positive');
  if (options.outputLimit !== undefined && (!Number.isSafeInteger(options.outputLimit) || options.outputLimit < 1))
    throw new Error('Output limit must be a positive integer');
  options.signal?.throwIfAborted();
  const execute = options.run ?? releaseCommand;
  const run: ReleaseCommand = async (cwd, executable, args, commandOptions = {}) => {
    const signal = options.signal && commandOptions.signal
      ? AbortSignal.any([options.signal, commandOptions.signal]) : commandOptions.signal ?? options.signal;
    signal?.throwIfAborted();
    const answer = await execute(cwd, executable, args, {
      ...commandOptions, signal,
    });
    signal?.throwIfAborted();
    return answer;
  };
  // Internal inventories and identity queries require complete stdout. Tail
  // capture is only used for commands whose output is not parsed here.
  const observedRun: ReleaseCommand = (cwd, executable, args, commandOptions) => run(cwd, executable, args, {
    onEvent: options.onEvent, outputLimit: options.outputLimit, ...commandOptions,
  });
  await assertCleanReleaseTree(root, run);
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  if (!/^[a-f0-9]{40,64}$/.test(commit)) throw new Error('Invalid source commit');
  try { return await loadPreparedRelease(root, version, run); } catch (error) { if (!missing(error)) throw error; }
  const packages = await discoverReleasePackages(root, run);
  if (packages.some(pkg => pkg.version !== version)) throw new Error('Commit synchronized package versions before preparing release artifacts');
  const parent = join(root, '.release-artifacts', version), directory = join(parent, commit);
  await mkdir(parent, { recursive: true, mode: 0o700 });
  try { await readdir(directory); throw new Error(`Incomplete artifact directory already exists: ${directory}. Inspect it before recovery`); }
  catch (error) { if (!missing(error)) throw error; }
  const temporary = await mkdtemp(join(tmpdir(), 'xec-release-build-'));
  const workspace = join(temporary, 'workspace');
  let preparationFailure: unknown;
  let cleanupFailure: unknown;
  let preparationFailed = false;
  let cleanupFailed = false;
  let prepared: PreparedRelease | undefined;
  try {
    await mkdir(workspace);
    options.progress?.(`Preparing isolated source ${commit.slice(0, 12)}`);
    const archive = join(temporary, 'source.tar');
    await run(root, 'git', ['archive', '--format=tar', '--output', archive, commit]);
    await run(temporary, 'tar', ['-xf', './source.tar', '-C', basename(workspace)]);
    await observedRun(workspace, 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', '--prod=false', ...(options.offline ? ['--offline'] : [])], { timeoutMs: 600000 });
    options.progress?.('Building isolated packages');
    await observedRun(workspace, options.build.executable, options.build.args, { timeoutMs: options.build.timeoutMs ?? 600000 });
    const artifacts: ReleaseArtifact[] = [];
    for (const pkg of packages) {
      options.progress?.(`Packing ${pkg.name}`);
      const output = await mkdtemp(join(temporary, 'pack-'));
      const recipe = await options.preparePackage?.({ workspace, temporary, pkg, run: observedRun, signal: options.signal });
      options.signal?.throwIfAborted();
      const location = recipe?.directory ?? join(workspace, pkg.path), manager = recipe?.manager ?? 'pnpm';
      await observedRun(location, manager, manager === 'npm'
        ? ['pack', '--ignore-scripts', '--json', '--pack-destination', output]
        : ['--config.ignore-scripts=true', 'pack', '--pack-destination', output]);
      const archives = (await readdir(output)).filter(name => name.endsWith('.tgz'));
      if (archives.length !== 1) throw new Error(`Expected one archive for ${pkg.name}`);
      const file = join(output, archives[0]!);
      await validatePackedPackage(root, file, pkg, run);
      const artifact = { name: pkg.name, version, file, integrity: artifactIntegrity(await readFile(file)) };
      await options.verifyArtifact?.({ workspace, artifact, run: observedRun, signal: options.signal });
      options.signal?.throwIfAborted();
      await verifyReleaseArtifact(artifact);
      artifacts.push(artifact);
    }
    if (await run(root, 'git', ['rev-parse', 'HEAD']) !== commit) throw new Error('Source HEAD changed during preparation');
    await assertCleanReleaseTree(root, run);
    // A sealed record appears only after all archives are complete. A partial
    // directory is never silently repacked or treated as a resumable publication.
    options.signal?.throwIfAborted();
    await mkdir(directory, { mode: 0o700 });
    const saved: PreparedRelease = { schema: 1, commit, version, artifacts: [] };
    for (const artifact of artifacts) {
      const filename = encodeURIComponent(artifact.name) + '.tgz';
      const file = join(directory, filename);
      await copyFile(artifact.file, file, constants.COPYFILE_EXCL);
      const archiveHandle = await open(file, 'r+');
      try { await archiveHandle.sync(); } finally { await archiveHandle.close(); }
      await chmod(file, 0o444);
      saved.artifacts.push({ ...artifact, file: filename });
    }
    const record = join(directory, '.release.json.tmp');
    const handle = await open(record, 'wx', 0o600);
    try { await handle.writeFile(JSON.stringify(saved, null, 2) + '\n'); await handle.sync(); }
    finally { await handle.close(); }
    await rename(record, join(directory, 'release.json'));
    // Windows cannot fsync directory handles. Missing state after a power loss
    // always fails closed on recovery; no publication can start without hashes.
    if (process.platform !== 'win32') {
      for (const path of [directory, parent, join(root, '.release-artifacts')]) {
        const directoryHandle = await open(path, 'r');
        try { await directoryHandle.sync(); } finally { await directoryHandle.close(); }
      }
    }
    prepared = await loadPreparedRelease(root, version, run);
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
  return prepared!;
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
