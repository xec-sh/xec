import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative } from 'node:path';
import { cp, mkdir, lstat, readFile, realpath, writeFile } from 'node:fs/promises';

import { resolveTypeScriptCompiler } from './typescript-compiler.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const policyFile = join(root, 'scripts/ssh-transport-policy.json');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const packageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;

/** Verify the exact transport files before accepting either a pristine or patched install. */
export async function inspectSSHTransport(directory, expected = 'either') {
  const policy = await json(policyFile);
  const manifest = await json(join(directory, 'package.json'));
  if (manifest.name !== policy.package || manifest.version !== policy.version) throw new Error('Unreviewed SSH transport version');
  const states = new Set();
  for (const [file, checksums] of Object.entries(policy.files)) {
    const digest = hash(await readFile(join(directory, file)));
    const state = digest === checksums.before ? 'pristine' : digest === checksums.after ? 'patched' : 'unknown';
    states.add(state);
    if (state === 'unknown') throw new Error(`SSH transport file differs from reviewed source: ${file} (SHA-256 ${digest})`);
  }
  if (states.size !== 1) throw new Error('SSH transport is only partially patched');
  const state = [...states][0];
  if (expected !== 'either' && state !== expected) throw new Error(`SSH transport must be ${expected}, found ${state}`);
  return { policy, state };
}

/** A fresh, platform-neutral copy; never modify a caller's installed dependency. */
async function copyPackage(origin, destination) {
  await cp(origin, destination, { recursive: true, errorOnExist: true, force: false, filter: async path => {
    const parts = relative(origin, path).split(/[\\/]/);
    if (parts.some(part => ['node_modules', '.git', 'build'].includes(part)) || /\.(node|o|obj|a)$/.test(path)) return false;
    if ((await lstat(path)).isSymbolicLink()) throw new Error(`Unexpected symlink in package payload: ${relative(origin, path)}`);
    return true;
  } });
}

/** Bundle the reviewed SSH source and its installed dependency closure for npm consumers. */
export async function bundleSSHTransport(source, packageDirectory) {
  source = await realpath(source);
  const policy = await json(policyFile);
  const modules = join(packageDirectory, 'node_modules');
  await mkdir(modules); // Fail if a caller tries to merge into an existing installation.
  const closure = new Map();
  const copyClosure = async origin => {
    origin = await realpath(origin);
    const manifest = await json(join(origin, 'package.json'));
    if (!packageName.test(manifest.name) || !manifest.version) throw new Error('Invalid bundled package identity');
    const prior = closure.get(manifest.name);
    if (prior) {
      if (prior !== manifest.version) throw new Error(`Conflicting bundled versions of ${manifest.name}`);
      return;
    }
    closure.set(manifest.name, manifest.version);
    const destination = join(modules, manifest.name);
    await mkdir(dirname(destination), { recursive: true });
    await copyPackage(origin, destination);
    const require = createRequire(join(origin, 'package.json'));
    for (const name of Object.keys({ ...manifest.dependencies, ...manifest.optionalDependencies })) {
      let dependency;
      try { dependency = dirname(require.resolve(`${name}/package.json`)); }
      catch (error) {
        if (manifest.optionalDependencies?.[name] && error.code === 'MODULE_NOT_FOUND') continue;
        throw error;
      }
      await copyClosure(dependency);
    }
  };
  await copyClosure(source);
  const transport = join(modules, policy.package);
  // Windows patch installers can retain CRLF in the installed dependency.
  // Normalize only the private copy; every resulting byte must match the
  // reviewed source before the patch or the packaged runtime is accepted.
  for (const file of Object.keys(policy.files)) {
    const path = join(transport, file);
    const bytes = await readFile(path);
    const canonical = Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    if (!bytes.equals(canonical)) await writeFile(path, canonical);
  }
  const { state } = await inspectSSHTransport(transport);
  const patchPath = join(root, policy.patch);
  if (state === 'pristine') {
    const patch = await readFile(patchPath, 'utf8');
    const paths = [...patch.matchAll(/^diff --git a\/(\S+) b\/(\S+)$/gm)];
    if (paths.length !== Object.keys(policy.files).length || paths.some(([, from, to]) => from !== to || !policy.files[to])) {
      throw new Error('SSH patch paths differ from reviewed policy');
    }
    // git apply runs outside the repository, only against the new private copy.
    execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--check', '--', patchPath], { cwd: transport, timeout: 30000 });
    execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--', patchPath], { cwd: transport, timeout: 30000 });
  }
  await inspectSSHTransport(transport, 'patched');
  const evidence = { upstream: `${policy.package}@${policy.version}`, patchSha256: hash(await readFile(patchPath)),
    files: Object.fromEntries(Object.entries(policy.files).map(([file, checksums]) => [file, checksums.after])),
    dependencies: Object.fromEntries(closure) };
  await writeFile(join(packageDirectory, 'SSH-TRANSPORT.json'), `${JSON.stringify(evidence, null, 2)}\n`);
  return evidence;
}

/** Publication must use a prepared artifact, not whatever happens to be installed in a workspace. */
export async function verifyPreparedSSHCorePackage(directory) {
  let evidence;
  try { evidence = await json(join(directory, 'SSH-TRANSPORT.json')); }
  catch { throw new Error('SSH release artifact is not prepared; run node scripts/ssh-transport.mjs prepare <new-directory> and pack that directory'); }
  const manifest = await json(join(directory, 'package.json'));
  const policy = await json(policyFile);
  const expectedFiles = Object.fromEntries(Object.entries(policy.files).map(([file, checksums]) => [file, checksums.after]));
  const sameFiles = evidence.files && Object.keys(evidence.files).length === Object.keys(expectedFiles).length
    && Object.entries(expectedFiles).every(([file, digest]) => evidence.files[file] === digest);
  if (manifest.name !== '@xec-sh/core' || !manifest.bundleDependencies?.includes('ssh2')
      || manifest.dependencies?.ssh2 !== policy.version
      || evidence.upstream !== `${policy.package}@${policy.version}` || !sameFiles
      || evidence.dependencies?.ssh2 !== policy.version
      || evidence.patchSha256 !== hash(await readFile(join(root, policy.patch)))) throw new Error('SSH release artifact metadata does not match reviewed policy');
  for (const [name, version] of Object.entries(evidence.dependencies)) {
    if (!packageName.test(name) || typeof version !== 'string') throw new Error('Invalid SSH dependency inventory');
    const dependency = await json(join(directory, 'node_modules', name, 'package.json'));
    if (dependency.name !== name || dependency.version !== version) throw new Error(`SSH dependency inventory differs: ${name}`);
    for (const required of Object.keys(dependency.dependencies ?? {})) {
      if (!Object.hasOwn(evidence.dependencies, required)) throw new Error(`SSH dependency inventory is incomplete: ${required}`);
    }
  }
  await inspectSSHTransport(join(directory, 'node_modules/ssh2'), 'patched');
}

/** Prepare a new package directory for packing; no publication, install hooks or runtime mutation. */
export async function prepareSSHCorePackage(output) {
  output = resolve(output);
  await mkdir(output); // Existing artifacts are immutable: never merge or overwrite them.
  const core = join(root, 'packages/core');
  const require = createRequire(join(core, 'package.json'));
  const manifest = await json(join(core, 'package.json'));
  execFileSync(process.execPath, [resolveTypeScriptCompiler(root), '-p', join(core, 'tsconfig.json'),
    '--incremental', 'false', '--outDir', join(output, 'dist')], { cwd: root, timeout: 120000, stdio: 'pipe' });
  await bundleSSHTransport(dirname(require.resolve('ssh2/package.json')), output);
  manifest.bundleDependencies = ['ssh2'];
  manifest.files = [...new Set([...manifest.files, 'SSH-TRANSPORT.json'])];
  delete manifest.devDependencies;
  delete manifest.scripts;
  await writeFile(join(output, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await cp(join(core, 'SSH-TYPES-LICENSE'), join(output, 'SSH-TYPES-LICENSE'));
  await cp(join(root, 'LICENSE'), join(output, 'LICENSE'));
  await writeFile(join(output, '.npmignore'), '# The package manifest is the publication allowlist.\n');
  await verifyPreparedSSHCorePackage(output);
  return output;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [action, directory] = process.argv.slice(2);
  if (action === 'prepare' && directory) console.log(await prepareSSHCorePackage(directory));
  else if (action === 'guard' && directory) { await verifyPreparedSSHCorePackage(resolve(directory)); console.log('Prepared SSH package verified'); }
  else if (action === 'verify' && directory) { await inspectSSHTransport(resolve(directory), 'patched'); console.log('Reviewed SSH transport verified'); }
  else throw new Error('Usage: node scripts/ssh-transport.mjs prepare <new-package-directory> | verify <ssh2-directory>');
}
