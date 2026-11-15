import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { releaseCommand } from '@xec-sh/ops/release';
import { cp, rm, mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';

import { resolveTypeScriptCompiler } from './typescript-compiler.js';

const externalTransport = /^(?:@types\/)?(?:ssh2(?:-streams)?|node-ssh|cpu-features|nan)$/;
const transportImport =
  /\b(?:from\s*|import\s*\(\s*|(?:require|requireModule)\s*\(\s*)['"](?:ssh2(?:-streams)?|node-ssh)['"]/;

/** Enforce source ownership independently of any installed development oracle. */
export async function checkSSHSourceOwnership(root) {
  async function inspectSource(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }
    for (const entry of entries) {
      const file = join(directory, entry.name);
      if (entry.isDirectory()) await inspectSource(file);
      else if (/\.[cm]?[jt]sx?$/.test(entry.name) && transportImport.test(await readFile(file, 'utf8')))
        throw new Error(`Source bypasses the owned SSH package: ${file}`);
    }
  }
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const directory = join(root, parent, entry.name);
      let manifest;
      try {
        manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      } catch (error) {
        if (error.code === 'ENOENT') continue;
        throw error;
      }
      for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const name of Object.keys(manifest[section] ?? {})) {
          if (externalTransport.test(name))
            throw new Error(`${manifest.name} has an external SSH runtime dependency: ${name}`);
        }
      }
      await inspectSource(join(directory, 'src'));
    }
  }
}

/**
 * Check the declarations of the same installed pair used by the runtime gate.
 * This does not rebuild packages or install an alternate transport/type package.
 * @param {string} root
 * @param {{consumer:string,run?:import('@xec-sh/ops/release').ReleaseCommand}} options
 */
export async function checkSSHBoundary(root, { consumer, run = releaseCommand }) {
  if (!consumer) throw new Error('SSH declaration verification requires an installed consumer');
  consumer = resolve(consumer);
  // Project loaders may intentionally customize their own module resolution.
  // A consumer boundary must observe ordinary Node resolution in a fresh process.
  const resolution = JSON.parse(
    await run(
      consumer,
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
    import { createRequire } from 'node:module';
    import { join } from 'node:path';
    const require = createRequire(join(process.cwd(), 'package.json'));
    const core = require.resolve('@xec-sh/core/package.json');
    const ssh = require.resolve('@xec-sh/ssh/package.json');
    const forbidden = [];
    for (const name of ['ssh2', 'ssh2-streams', 'node-ssh', '@types/ssh2']) {
      try { forbidden.push({name, file: require.resolve(name + '/package.json')}); }
      catch (error) { if (error.code !== 'MODULE_NOT_FOUND') throw error; }
    }
    console.log(JSON.stringify({ core, ssh, coreSSH: createRequire(core).resolve('@xec-sh/ssh/package.json'), forbidden }));
  `,
      ],
      { timeoutMs: 10_000, env: { NODE_PATH: '', NODE_OPTIONS: '' } }
    )
  );
  if (resolution.forbidden.length)
    throw new Error(
      `Isolated consumer contains an external SSH implementation: ${JSON.stringify(resolution.forbidden)}`
    );
  if (resolution.coreSSH !== resolution.ssh)
    throw new Error('Core resolves a different SSH package from the verified consumer');
  const manifests = new Map();
  for (const name of ['@xec-sh/core', '@xec-sh/ssh']) {
    const file = name === '@xec-sh/core' ? resolution.core : resolution.ssh;
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    if (manifest.name !== name || manifest.private) throw new Error(`Invalid installed SSH package: ${name}`);
    manifests.set(name, { manifest, directory: dirname(file) });
    async function inspect(directory) {
      for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) await inspect(path);
        else if (entry.name.endsWith('.d.ts') && transportImport.test(await readFile(path, 'utf8')))
          throw new Error(`Declaration leaks an external SSH implementation: ${path}`);
        else if (/\.(?:node|wasm)$/.test(entry.name))
          throw new Error(`SSH package contains a native or WASM binding: ${path}`);
      }
    }
    await inspect(join(dirname(file), 'dist'));
  }
  const core = manifests.get('@xec-sh/core');
  const ssh = manifests.get('@xec-sh/ssh');
  if (core.manifest.dependencies?.['@xec-sh/ssh'] !== ssh.manifest.version)
    throw new Error('Core must depend on the exact verified SSH package version');
  const directory = await mkdtemp(join(consumer, '.xec-ssh-types-'));
  let failure;
  try {
    const sourceRequire = createRequire(join(root, 'package.json'));
    for (const name of ['@types/node', 'undici-types']) {
      const resolver =
        name === 'undici-types' ? createRequire(sourceRequire.resolve('@types/node/package.json')) : sourceRequire;
      const origin = dirname(resolver.resolve(`${name}/package.json`));
      const target = join(directory, 'node_modules', name);
      await mkdir(dirname(target), { recursive: true });
      await cp(origin, target, { recursive: true });
    }
    await writeFile(
      join(directory, 'consumer.ts'),
      `
import { $, type SSHDirectoryTransferOptions } from '@xec-sh/core';
import { SSHClient, type SSHAgent, type SSHChannel, type SFTPClient, type SSHConnectionConfig } from '@xec-sh/ssh';
const agent: SSHAgent = {
  getIdentities(done) { done(undefined, []); },
  sign(_key, _data, _options, done) { done(undefined, Buffer.alloc(0)); },
};
const config: SSHConnectionConfig = { host: 'host.invalid', username: 'operator', agent,
  expectedHostFingerprint: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  algorithms: { cipher: ['aes256-gcm@openssh.com'], kex: ['curve25519-sha256'] } };
async function use() {
  const ssh = await new SSHClient().connect(config);
  ssh.connection?.once('close', () => {});
  // @ts-expect-error Connection lifecycle is not a protocol escape hatch.
  ssh.connection?.exec('mutate');
  const shell: SSHChannel = await ssh.requestShell({ rows: 30, cols: 120 });
  shell.setWindow(40, 140, 0, 0);
  const sftp: SFTPClient = await ssh.requestSFTP({ operationTimeoutMs: 10000 });
  sftp.stat('/data', (error, stats) => { if (!error) stats.isDirectory(); });
  sftp.readFile('/data/text', 'utf8', (error, contents) => { if (!error) contents.toUpperCase(); });
  sftp.readFile('/data/bytes', (error, contents) => { if (!error) contents.readUInt8(0); });
  const result = await ssh.exec('echo fixture');
  result.stdout.toUpperCase();
  const options: SSHDirectoryTransferOptions = { signal: new AbortController().signal, concurrency: 2 };
  const host = $.ssh({ host: 'host.invalid', username: 'operator', agent,
    expectedHostFingerprint: config.expectedHostFingerprint, algorithms: config.algorithms });
  await host.downloadDirectory('/data', '/local', options);
  const reverse = await host.reverseTunnel({ remotePort: 0, localPort: 3000, timeoutMs: 1000, signal: options.signal });
  await reverse.close();
  await (await ssh.forwardIn('127.0.0.1', 0, undefined, { signal: options.signal })).dispose();
  await (await ssh.forwardInStreamLocal('/tmp/fixture.sock', undefined, { timeoutMs: 1000 })).dispose();
  await ssh.withSFTP(async files => files.stat('/data', () => {}));
  ssh.dispose();
}
void use;
`
    );
    await writeFile(
      join(directory, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM'],
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ['node'],
          typeRoots: [join(directory, 'node_modules/@types')],
          noUncheckedIndexedAccess: true,
        },
        include: ['consumer.ts'],
      })
    );
    await run(directory, process.execPath, [resolveTypeScriptCompiler(root), '-p', 'tsconfig.json'], {
      timeoutMs: 120_000,
      env: { NODE_PATH: '', NODE_OPTIONS: '' },
    });
  } catch (error) {
    failure = error;
  }
  try {
    await rm(directory, { recursive: true, force: true });
  } catch (error) {
    failure = failure
      ? new AggregateError([failure, error], 'SSH boundary failed and its fixture cleanup is incomplete')
      : error;
  }
  if (failure) throw failure;
  return {
    installed: true,
    strictTypes: true,
    packages: [...manifests.values()].map((value) => `${value.manifest.name}@${value.manifest.version}`),
  };
}
