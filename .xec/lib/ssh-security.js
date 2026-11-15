import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { cp, rm, mkdir, access, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { releaseCommand, artifactIntegrity, acquireReleaseLock, validatePackedPackage } from '@xec-sh/ops/release';

import { checkSSHBoundary, checkSSHSourceOwnership } from './ssh-boundary.js';

/**
 * Qualify the exact immutable Core and SSH archives through public imports.
 * No build, repacking, source alias or private runtime subpath is used here.
 * @param {string} root
 * @param {{coreArchive:string,sshArchive:string,consumer?:'npm'|'pnpm',run?:import('@xec-sh/ops/release').ReleaseCommand}} options
 */
export async function checkSSHSecurity(
  root,
  { coreArchive, sshArchive, consumer: manager = 'npm', run = releaseCommand }
) {
  if (!coreArchive || !sshArchive) throw new Error('SSH acceptance requires both exact Core and SSH archives');
  if (!['npm', 'pnpm'].includes(manager)) throw new Error('SSH consumer must be npm or pnpm');
  const archives = [];
  for (const [name, file, directory] of [
    ['@xec-sh/core', coreArchive, 'core'],
    ['@xec-sh/ssh', sshArchive, 'ssh'],
  ]) {
    const manifest = JSON.parse(await readFile(join(root, 'packages', directory, 'package.json'), 'utf8'));
    const path = resolve(file);
    if (manifest.name !== name) throw new Error(`Unexpected SSH source identity: ${name}`);
    const integrity = artifactIntegrity(await readFile(path));
    await validatePackedPackage(root, path, manifest, run);
    archives.push({ name, version: manifest.version, file: path, integrity });
  }
  const [core, ssh] = archives;
  if (core.version !== ssh.version) throw new Error('Core and SSH archives must belong to one release version');
  await checkSSHSourceOwnership(root);
  const temporary = await mkdtemp(join(tmpdir(), 'xec-ssh-security-'));
  let failure;
  let result;
  try {
    const consumer = join(temporary, 'consumer');
    await mkdir(consumer);
    await writeFile(
      join(consumer, 'package.json'),
      JSON.stringify({
        private: true,
        type: 'module',
        dependencies: { '@xec-sh/core': `file:${core.file}`, '@xec-sh/ssh': `file:${ssh.file}` },
        overrides: { '@xec-sh/ssh': '$@xec-sh/ssh' },
      })
    );
    if (manager === 'npm') {
      await run(consumer, 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], { timeoutMs: 120_000 });
    } else {
      await writeFile(
        join(consumer, 'pnpm-workspace.yaml'),
        `packages: []\noverrides:\n  '@xec-sh/ssh': ${JSON.stringify(`file:${ssh.file}`)}\n`
      );
      await run(consumer, 'pnpm', ['install', '--ignore-scripts'], { timeoutMs: 120_000 });
    }
    const boundary = await checkSSHBoundary(root, { consumer, run });
    // Resolve the independent development-only peer from the source checkout;
    // the consumer itself contains only the two archives and runtime dependencies.
    const fixture = join(consumer, 'ssh-security.test.js');
    await cp(join(root, 'scripts/fixtures/ssh-security.test.js'), fixture);
    await run(consumer, process.execPath, ['--test', '--test-reporter=tap', fixture], {
      timeoutMs: 30_000,
      env: { NODE_PATH: '', NODE_OPTIONS: '', XEC_SSH_TEST_PEER_PACKAGE: join(root, 'packages/ssh/package.json') },
    });
    const provenance = JSON.parse(await readFile(join(consumer, 'node_modules/@xec-sh/ssh/PROVENANCE.json'), 'utf8'));
    await access(join(consumer, 'node_modules/@xec-sh/ssh/LICENSE'));
    result = { packaged: true, consumer: manager, archives, boundary, nativePublicClient: true, provenance };
  } catch (error) {
    failure = error;
  }
  // Acceptance covers exactly the initially selected bytes, even on failure.
  for (const archive of archives) {
    try {
      if (artifactIntegrity(await readFile(archive.file)) !== archive.integrity)
        throw new Error(`SSH archive changed during acceptance: ${archive.name}`);
    } catch (error) {
      failure = failure ? new AggregateError([failure, error], 'SSH acceptance and archive integrity failed') : error;
    }
  }
  try {
    await rm(temporary, { recursive: true, force: true });
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], 'SSH acceptance failed and consumer cleanup is incomplete')
      : error;
  }
  if (failure) throw failure;
  return result;
}

/** Use the published executor to pack existing outputs and run acceptance for the ordinary CI command. */
export async function checkBuiltSSHSecurity(root, { consumer = 'npm', run = releaseCommand } = {}) {
  const temporary = await mkdtemp(join(tmpdir(), 'xec-ssh-pack-'));
  const releases = [];
  let failure;
  let result;
  try {
    const archives = {};
    // The same package ownership primitive prevents a concurrent build replacing
    // dist while these already completed outputs are packed. No build is repeated.
    for (const name of ['core', 'ssh']) releases.push(await acquireReleaseLock(join(root, 'packages', name)));
    for (const name of ['core', 'ssh']) {
      const directory = join(root, 'packages', name),
        output = join(temporary, name);
      await access(join(directory, 'dist/index.js'));
      await access(join(directory, 'dist/index.d.ts'));
      await mkdir(output);
      await run(directory, 'pnpm', ['--config.ignore-scripts=true', 'pack', '--pack-destination', output], {
        timeoutMs: 120_000,
      });
      const files = (await readdir(output)).filter((file) => file.endsWith('.tgz'));
      if (files.length !== 1) throw new Error(`Expected one existing-build archive for ${name}`);
      archives[name] = join(output, files[0]);
    }
    // Release the build locks before consumers execute. The archives are now
    // independent immutable inputs and their hashes are checked by acceptance.
    while (releases.length) await releases.pop()();
    result = await checkSSHSecurity(root, { coreArchive: archives.core, sshArchive: archives.ssh, consumer, run });
  } catch (error) {
    failure = error;
  }
  while (releases.length) {
    try {
      await releases.pop()();
    } catch (error) {
      failure = failure
        ? new AggregateError([failure, error], 'SSH packing failed and package ownership cleanup is incomplete')
        : error;
    }
  }
  try {
    await rm(temporary, { recursive: true, force: true });
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], 'SSH packing failed and archive cleanup is incomplete')
      : error;
  }
  if (failure) throw failure;
  return result;
}
