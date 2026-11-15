import { test } from 'node:test';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { rm, cp, mkdir, access, symlink, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { bundleSSHTransport, inspectSSHTransport, prepareSSHCorePackage, verifyPreparedSSHCorePackage } from '../../.xec/lib/ssh-transport.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(join(root, 'packages/core/package.json'));
const source = dirname(require.resolve('ssh2/package.json'));
const policy = JSON.parse(await readFile(join(root, '.xec/ssh-transport-policy.json')));

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'xec-ssh-bundle-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test('patching an isolated dependency preserves the installed source and carries evidence', async t => {
  const output = await fixture(t);
  const before = new Map(await Promise.all(Object.keys(policy.files).map(async file => [file, await readFile(join(source, file))])));
  const evidence = await bundleSSHTransport(root, source, output);
  assert.equal((await inspectSSHTransport(root, join(output, 'node_modules/ssh2'), 'patched')).state, 'patched');
  assert.equal(evidence.upstream, 'ssh2@1.17.0');
  assert.equal(evidence.dependencies.ssh2, '1.17.0');
  assert.match(await readFile(join(output, 'node_modules/ssh2/LICENSE'), 'utf8'), /MIT|Permission is hereby granted/);
  for (const [file, bytes] of before) assert.deepEqual(await readFile(join(source, file)), bytes);
  await assert.rejects(bundleSSHTransport(root, source, output), { code: 'EEXIST' });
});

for (const variant of ['patched', 'pristine']) {
  test(`canonicalizes a ${variant} CRLF install into the reviewed artifact bytes`, async t => {
    const input = await fixture(t);
    await bundleSSHTransport(root, source, input);
    const transport = join(input, 'node_modules/ssh2');
    if (variant === 'pristine') {
      execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--reverse', '--', join(root, policy.patch)], { cwd: transport });
    }
    const windowsBytes = new Map();
    for (const file of Object.keys(policy.files)) {
      const bytes = (await readFile(join(transport, file), 'utf8')).replace(/\r?\n/g, '\r\n');
      windowsBytes.set(file, bytes);
      await writeFile(join(transport, file), bytes);
    }
    await assert.rejects(inspectSSHTransport(root, transport), /differs from reviewed source/);
    const output = await fixture(t);
    await bundleSSHTransport(root, transport, output);
    assert.equal((await inspectSSHTransport(root, join(output, 'node_modules/ssh2'), 'patched')).state, 'patched');
    for (const [file, bytes] of windowsBytes) assert.equal(await readFile(join(transport, file), 'utf8'), bytes);
    const first = Object.keys(policy.files)[0];
    await writeFile(join(transport, first), windowsBytes.get(first) + '// unreviewed edit\r\n');
    await assert.rejects(bundleSSHTransport(root, transport, await fixture(t)), /differs from reviewed source/);
  });
}

test('an unknown or partially applied patch cannot pass artifact verification', async t => {
  const output = await fixture(t);
  await bundleSSHTransport(root, source, output);
  const transport = join(output, 'node_modules/ssh2');
  const first = Object.keys(policy.files)[0];
  execFileSync('git', ['-c', 'core.autocrlf=false', 'apply', '--reverse', '--include', first, '--', join(root, policy.patch)], { cwd: transport });
  await assert.rejects(inspectSSHTransport(root, transport), /only partially patched/);
  const content = await readFile(join(transport, first));
  await writeFile(join(transport, first), Buffer.concat([content, Buffer.from('\n// unexpected change\n')]));
  await assert.rejects(inspectSSHTransport(root, transport), /differs from reviewed source/);
});

test('the publication guard rejects a workspace or stale artifact before packing', async t => {
  const output = await fixture(t);
  await writeFile(join(output, 'package.json'), '{"name":"@xec-sh/core"}');
  await assert.rejects(verifyPreparedSSHCorePackage(root, output), /not prepared/);
  await writeFile(join(output, 'SSH-TRANSPORT.json'), '{"patchSha256":"old"}');
  await assert.rejects(verifyPreparedSSHCorePackage(root, output), /metadata/);
});

test('a different upstream version requires a policy review', async t => {
  const output = await fixture(t);
  await mkdir(join(output, 'transport'));
  await writeFile(join(output, 'transport/package.json'), '{"name":"ssh2","version":"99.0.0"}');
  await assert.rejects(inspectSSHTransport(root, join(output, 'transport')), /Unreviewed/);
});


test('the publication guard verifies inventory and evidence against the prepared files', async t => {
  const output = await fixture(t);
  const evidence = await bundleSSHTransport(root, source, output);
  const manifest = { name: '@xec-sh/core', bundleDependencies: ['ssh2'], dependencies: { ssh2: policy.version } };
  await writeFile(join(output, 'package.json'), JSON.stringify(manifest));
  await verifyPreparedSSHCorePackage(root, output);
  for (const mutate of [
    value => { value.upstream = 'ssh2@0.0.0'; },
    value => { value.files[Object.keys(policy.files)[0]] = 'incorrect'; },
    value => { value.dependencies.ssh2 = '0.0.0'; },
    value => { delete value.dependencies.asn1; },
  ]) {
    const changed = structuredClone(evidence); mutate(changed);
    await writeFile(join(output, 'SSH-TRANSPORT.json'), JSON.stringify(changed));
    await assert.rejects(verifyPreparedSSHCorePackage(root, output), /metadata|inventory/);
  }
});


test('preparation consumes the existing build once and refuses missing or replaced destinations', async t => {
  const repository = await fixture(t);
  const core = join(repository, 'packages/core');
  await mkdir(core, { recursive: true });
  await mkdir(join(repository, '.xec'));
  await writeFile(join(core, 'package.json'), JSON.stringify({
    name: '@xec-sh/core', version: '0.0.0-test', type: 'module', files: ['dist'],
    dependencies: { ssh2: policy.version }, scripts: { build: 'must-not-run', prepack: 'must-not-run' },
  }));
  const output = join(repository, 'prepared');
  const run = async () => { throw new Error('Packaging attempted to execute a second producer'); };
  await assert.rejects(prepareSSHCorePackage(repository, output, run), /Build Core/);
  await assert.rejects(access(output), { code: 'ENOENT' });
  await mkdir(join(core, 'dist'));
  const bytes = Buffer.from('export const marker = "exact-built-bytes";\n');
  await writeFile(join(core, 'dist/index.js'), bytes);
  await writeFile(join(core, 'SSH-TYPES-LICENSE'), 'Synthetic license');
  await writeFile(join(core, 'README.md'), 'Synthetic package guide');
  await writeFile(join(repository, 'LICENSE'), 'Synthetic repository license');
  await cp(join(root, '.xec/ssh-transport-policy.json'), join(repository, '.xec/ssh-transport-policy.json'));
  await mkdir(dirname(join(repository, policy.patch)), { recursive: true });
  await cp(join(root, policy.patch), join(repository, policy.patch));
  const dependencies = await fixture(t);
  await bundleSSHTransport(root, source, dependencies);
  await symlink(join(dependencies, 'node_modules'), join(core, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await prepareSSHCorePackage(repository, output, run), output);
  assert.deepEqual(await readFile(join(output, 'dist/index.js')), bytes);
  assert.equal(await readFile(join(output, 'README.md'), 'utf8'), 'Synthetic package guide');
  assert.equal(JSON.parse(await readFile(join(output, 'package.json'), 'utf8')).scripts, undefined);
  await assert.rejects(prepareSSHCorePackage(repository, output, run), { code: 'EEXIST' });
  assert.deepEqual(await readFile(join(core, 'dist/index.js')), bytes);
});
