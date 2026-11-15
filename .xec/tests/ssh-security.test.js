import test from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { join, basename } from 'node:path';
import { releaseCommand } from '@xec-sh/ops/release';
import { rm, mkdir, access, mkdtemp, readdir, readFile, copyFile, writeFile } from 'node:fs/promises';

import { checkSSHSecurity, checkBuiltSSHSecurity } from '../lib/ssh-security.js';
import { checkSSHRuntimePackage, checkSSHSourceOwnership } from '../lib/ssh-boundary.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'xec-ssh-gate-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'apps'));
  for (const name of ['core', 'ssh']) {
    const directory = join(root, 'packages', name);
    await mkdir(join(directory, 'dist'), { recursive: true });
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: `@xec-sh/${name}`,
        version: '0.0.0-fixture',
        type: 'module',
        main: './dist/index.js',
        types: './dist/index.d.ts',
        dependencies: name === 'core' ? { '@xec-sh/ssh': '0.0.0-fixture' } : {},
        scripts: { build: 'must-not-run', prepack: 'must-not-run' },
      })
    );
    await writeFile(join(directory, 'dist/index.js'), 'export const value = 1;\n');
    await writeFile(join(directory, 'dist/index.d.ts'), 'export declare const value: number;\n');
  }
  return root;
}

async function archive(root, name, output) {
  const staging = await mkdtemp(join(root, 'pack-source-'));
  try {
    await mkdir(join(staging, 'package/dist'), { recursive: true });
    for (const file of ['package.json', 'dist/index.js', 'dist/index.d.ts'])
      await copyFile(join(root, 'packages', name, file), join(staging, 'package', file));
    await releaseCommand(staging, 'tar', ['-czf', output, 'package'], { timeoutMs: 10_000 });
  } finally {
    await rm(staging, { recursive: true, force: true });
  }
}

test('acceptance refuses a missing immutable archive pair before any command', async () => {
  let called = false;
  await assert.rejects(
    checkSSHSecurity('/not-used', {
      coreArchive: '/not-used',
      sshArchive: '',
      run: async () => {
        called = true;
      },
    }),
    /both exact/
  );
  assert.equal(called, false);
});

test('development peers cannot become runtime imports or dependencies', async (t) => {
  const root = await fixture(t);
  const path = join(root, 'packages/ssh/package.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.devDependencies = { ssh2: '1.17.0' };
  await writeFile(path, JSON.stringify(manifest));
  await checkSSHSourceOwnership(root);
  manifest.dependencies = { ssh2: '1.17.0' };
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(checkSSHSourceOwnership(root), /external SSH runtime dependency/);
  manifest.dependencies = {};
  await writeFile(path, JSON.stringify(manifest));
  await mkdir(join(root, 'packages/core/src'));
  await writeFile(join(root, 'packages/core/src/bypass.js'), "import {Client} from 'ssh2';\n");
  await assert.rejects(checkSSHSourceOwnership(root), /bypasses the owned SSH/);
});

test('failed consumer acceptance neither repacks archives nor hides concurrent archive changes', async (t) => {
  const root = await fixture(t),
    coreArchive = join(root, 'core.tgz'),
    sshArchive = join(root, 'ssh.tgz');
  await archive(root, 'core', coreArchive);
  await archive(root, 'ssh', sshArchive);
  const calls = [];
  let consumer;
  const run = async (cwd, executable, args, options) => {
    calls.push([executable, ...args]);
    if (executable === 'npm') {
      consumer = cwd;
      await writeFile(sshArchive, 'tampered while consumer was running');
      throw new Error('Synthetic consumer failure');
    }
    assert.equal(executable, 'tar');
    return releaseCommand(cwd, executable, args, options);
  };
  await assert.rejects(checkSSHSecurity(root, { coreArchive, sshArchive, run }), (error) => {
    assert(error instanceof AggregateError);
    assert.match(error.errors[0].message, /Synthetic consumer failure/);
    assert.match(error.errors[1].message, /archive changed/);
    return true;
  });
  assert.equal(
    calls.some((call) => call.includes('pack') || call.includes('build')),
    false
  );
  await assert.rejects(access(consumer), { code: 'ENOENT' });
  assert.equal(await readFile(sshArchive, 'utf8'), 'tampered while consumer was running');
});

test('the ordinary gate packs each completed build once and releases package ownership on failure', async (t) => {
  const root = await fixture(t),
    packed = [];
  const run = async (cwd, executable, args, options) => {
    if (executable === 'pnpm') {
      assert.deepEqual(args.slice(0, 2), ['--config.ignore-scripts=true', 'pack']);
      const name = basename(cwd);
      packed.push(name);
      await archive(root, name, join(args.at(-1), `${name}.tgz`));
      return '';
    }
    if (executable === 'npm') throw new Error('Synthetic consumer failure');
    assert.equal(executable, 'tar');
    return releaseCommand(cwd, executable, args, options);
  };
  await assert.rejects(checkBuiltSSHSecurity(root, { run }), /Synthetic consumer failure/);
  assert.deepEqual(packed, ['core', 'ssh']);
  for (const name of ['core', 'ssh']) {
    const directory = join(root, 'packages', name);
    assert.equal(await readFile(join(directory, 'dist/index.js'), 'utf8'), 'export const value = 1;\n');
    await assert.rejects(access(join(directory, '.release-artifacts/running')), { code: 'ENOENT' });
    assert.deepEqual(
      (await readdir(directory)).filter((path) => path.endsWith('.tgz')),
      []
    );
  }
});

test('pnpm acceptance pins the exact SSH archive in its owning workspace settings', async (t) => {
  const root = await fixture(t),
    coreArchive = join(root, 'core.tgz'),
    sshArchive = join(root, 'ssh.tgz');
  await archive(root, 'core', coreArchive);
  await archive(root, 'ssh', sshArchive);
  let consumer;
  const run = async (cwd, executable, args, options) => {
    if (executable !== 'pnpm') return releaseCommand(cwd, executable, args, options);
    consumer = cwd;
    assert.deepEqual(args, ['install', '--ignore-scripts']);
    assert.equal(
      await readFile(join(cwd, 'pnpm-workspace.yaml'), 'utf8'),
      `packages: []\noverrides:\n  '@xec-sh/ssh': ${JSON.stringify(`file:${sshArchive}`)}\n`
    );
    const manifest = JSON.parse(await readFile(join(cwd, 'package.json'), 'utf8'));
    assert.equal(manifest.pnpm, undefined);
    assert.equal(manifest.dependencies['@xec-sh/ssh'], `file:${sshArchive}`);
    throw new Error('Synthetic consumer failure');
  };
  await assert.rejects(
    checkSSHSecurity(root, { coreArchive, sshArchive, consumer: 'pnpm', run }),
    /Synthetic consumer failure/
  );
  await assert.rejects(access(consumer), { code: 'ENOENT' });
});

test('shipped SSH closure rejects runtime dependencies and every external import form', async (t) => {
  const root = await fixture(t),
    directory = join(root, 'packages/ssh');
  const manifestPath = join(directory, 'package.json');
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    await writeFile(manifestPath, JSON.stringify({ ...manifest, [section]: { 'bcrypt-pbkdf': '1.0.2' } }));
    await assert.rejects(checkSSHRuntimePackage(directory, manifest.version), /must not declare/);
  }
  await writeFile(manifestPath, JSON.stringify(manifest));
  for (const source of [
    "import 'asn1';",
    "export { value } from 'asn1';",
    "void import('asn1');",
    "require('asn1');",
    "import { createRequire as factory } from 'node:module'; const load = factory(import.meta.url); load('asn1');",
    "import('../../outside.js');",
    "const name = 'asn1'; import(name);",
  ]) {
    await writeFile(join(directory, 'dist/index.js'), source);
    await assert.rejects(
      checkSSHRuntimePackage(directory, manifest.version),
      /External SSH runtime import|Computed SSH runtime import/
    );
  }
  await writeFile(
    join(directory, 'dist/index.js'),
    "import { randomBytes } from 'node:crypto'; export { value } from './owned.js';"
  );
  await writeFile(join(directory, 'dist/owned.js'), 'export const value = 1;');
  await checkSSHRuntimePackage(directory, manifest.version);
  const core = join(root, 'packages/core'),
    corePath = join(core, 'package.json');
  const coreManifest = JSON.parse(await readFile(corePath, 'utf8'));
  await checkSSHRuntimePackage(core, manifest.version);
  for (const dependencies of [
    {},
    { '@xec-sh/ssh': '^' + manifest.version },
    { '@xec-sh/ssh': manifest.version, asn1: '0.2.6' },
  ]) {
    await writeFile(corePath, JSON.stringify({ ...coreManifest, dependencies }));
    await assert.rejects(checkSSHRuntimePackage(core, manifest.version), /exactly the verified SSH version/);
  }
});
