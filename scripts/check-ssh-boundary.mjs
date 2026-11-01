#!/usr/bin/env node
/** Build declarations in isolation and compile a consumer without transport-library types. */
import { mkdtemp, mkdir, readFile, writeFile, cp, rm, readdir } from 'node:fs/promises';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { resolveTypeScriptCompiler } from './typescript-compiler.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const directory = await mkdtemp(join(tmpdir(), 'xec-ssh-boundary-'));
const compiler = resolveTypeScriptCompiler(root);
const run = args => execFileSync(process.execPath, [compiler, ...args], { cwd: root, encoding: 'utf8', timeout: 120000, stdio: 'pipe' });
async function checkSourceOwnership(base, owner, insideTransport = false) {
  let entries;
  try { entries = await readdir(base, { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return; throw error; }
  for (const entry of entries) {
    const file = join(base, entry.name);
    const allowed = insideTransport || (owner === '@xec-sh/core' && file === join(root, 'packages/core/src/adapters/ssh'));
    if (entry.isDirectory()) await checkSourceOwnership(file, owner, allowed);
    else if (!allowed && /\.[cm]?[jt]sx?$/.test(entry.name)
      && /\b(?:from\s*|import\s*\(\s*|(?:require|requireModule)\s*\(\s*)['"]ssh2(?:-streams)?['"]/.test(await readFile(file, 'utf8'))) {
      throw new Error(`Source bypasses Xec SSH ownership: ${file}`);
    }
  }
}

async function checkDependencyOwnership() {
  const forbidden = /^(?:@types\/)?ssh2(?:-streams)?$/;
  for (const parent of ['apps', 'packages']) {
    for (const entry of await readdir(join(root, parent), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const base = join(root, parent, entry.name);
      let manifest;
      try { manifest = JSON.parse(await readFile(join(base, 'package.json'), 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      await checkSourceOwnership(join(base, 'src'), manifest.name);
      if (manifest.name === '@xec-sh/core') continue;
      for (const section of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const dependency of Object.keys(manifest[section] ?? {})) {
          if (forbidden.test(dependency)) throw new Error(`${manifest.name} bypasses Xec SSH ownership with ${dependency}`);
        }
      }
    }
  }
}
try {
  await checkDependencyOwnership();
  const packageRoot = join(directory, 'node_modules/@xec-sh/core');
  const output = join(packageRoot, 'dist');
  await mkdir(packageRoot, { recursive: true });
  run(['-p', join(root, 'packages/core/tsconfig.json'), '--incremental', 'false', '--outDir', output]);
  await cp(join(root, 'packages/core/package.json'), join(packageRoot, 'package.json'));
  for (const name of ['@types/node', 'undici-types']) {
    const origin = dirname((name === 'undici-types' ? createRequire(require.resolve('@types/node/package.json')) : require).resolve(`${name}/package.json`));
    const target = join(directory, 'node_modules', name);
    await mkdir(dirname(target), { recursive: true }); await cp(origin, target, { recursive: true });
  }
  async function inspect(path) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const file = join(path, entry.name);
      if (entry.isDirectory()) await inspect(file);
      else if (entry.name.endsWith('.d.ts') && /(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"]ssh2(?:-streams)?['"]/.test(await readFile(file, 'utf8'))) {
        throw new Error(`Public declaration leaks transport dependency: ${file}`);
      }
    }
  }
  await inspect(output);
  await writeFile(join(directory, 'package.json'), JSON.stringify({ private: true, type: 'module' }));
  await writeFile(join(directory, 'consumer.ts'), `
import { $, type SSHAgent, type SSHChannel, type SFTPClient, type SSHDirectoryTransferOptions } from '@xec-sh/core';
import { NodeSSH, type Config } from '@xec-sh/core/ssh';
const agent: SSHAgent = {
  getIdentities(done) { done(undefined, []); },
  sign(_key, _data, _options, done) { done(undefined, Buffer.alloc(0)); },
};
const config: Config = { host: 'host.invalid', username: 'operator', agent, privateKey: Buffer.from('key'),
  algorithms: { kex: { remove: ['diffie-hellman-group1-sha1'] } } };
async function use() {
  const ssh = await new NodeSSH().connect(config);
  ssh.connection?.once('close', () => {});
  // @ts-expect-error The private client is deliberately not an escape hatch.
  ssh.connection?.exec('mutate');
  const shell: SSHChannel = await ssh.requestShell({ rows: 30, cols: 120 });
  shell.setWindow(40, 140, 0, 0);
  const sftp: SFTPClient = await ssh.requestSFTP({ operationTimeoutMs: 10000 });
  sftp.stat('/data', (error, stats) => { if (!error) stats.isDirectory(); });
  sftp.readFile('/data/text', 'utf8', (error, contents) => { if (!error) contents.toUpperCase(); });
  sftp.readFile('/data/bytes', (error, contents) => { if (!error) contents.readUInt8(0); });
  const options: SSHDirectoryTransferOptions = { signal: new AbortController().signal, concurrency: 2 };
  const host = $.ssh({ host: 'host.invalid', username: 'operator' });
  await host.downloadDirectory('/data', '/local', options);
  const reverse = await host.reverseTunnel({ remotePort: 0, localPort: 3000, timeoutMs: 1000, signal: options.signal });
  await reverse.close();
  await (await ssh.forwardIn('127.0.0.1', 0, undefined, { signal: options.signal })).dispose();
  await (await ssh.forwardInStreamLocal('/tmp/fixture.sock', undefined, { timeoutMs: 1000 })).dispose();
  await ssh.withSFTP(async files => files.stat('/data', () => {}));
  ssh.dispose();
}
void use;
`);
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({
    compilerOptions: { target: 'ES2022', lib: ['ES2022', 'DOM'], module: 'NodeNext', moduleResolution: 'NodeNext',
      strict: true, skipLibCheck: false, noEmit: true, types: ['node'], noUncheckedIndexedAccess: true },
    include: ['consumer.ts'],
  }));
  run(['-p', join(directory, 'tsconfig.json')]);
  console.log('SSH public API: isolated build and strict consumer pass without ssh2 or its types installed.');
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally { await rm(directory, { recursive: true, force: true }); }
