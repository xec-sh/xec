#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
/** Release gate: exercise the actual packaged SSH runtime under bounded hostile peers. */
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { checkReceiveWindow } from './fixtures/ssh-receive-window.mjs';
import { inspectSSHTransport, prepareSSHCorePackage } from './ssh-transport.mjs';
import { windowsPackageManager } from '../packages/ops/src/release/package-manager.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { values } = parseArgs({ options: { archive: { type: 'string' } } });
const temporary = await mkdtemp(join(tmpdir(), 'xec-ssh-security-'));
const packageTimeout = 120_000;
const run = (args, cwd = root, timeout = 10_000) => execFileSync(process.execPath, args, {
  cwd, timeout, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 128 * 1024,
});
try {
  // npm's documented bundled-dependency format must carry the patch to a consumer.
  const npm = process.platform === 'win32' ? windowsPackageManager('npm', process.env) : { executable: 'npm' };
  const runNpm = (args, cwd) => execFileSync(npm.executable, [...(npm.script ? [npm.script] : []), ...args], {
    cwd, timeout: packageTimeout, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 128 * 1024,
  });
  const npmArgs = ['--ignore-scripts', '--cache', join(temporary, 'cache')];
  let archive;
  if (values.archive) archive = resolve(values.archive);
  else {
    const packageDirectory = await prepareSSHCorePackage(join(temporary, 'core'));
    const packed = JSON.parse(runNpm(['pack', '--json', '--pack-destination', temporary, ...npmArgs], packageDirectory))[0];
    if (!packed.bundled?.includes('ssh2')) throw new Error('SSH transport was omitted from the package');
    archive = join(temporary, packed.filename);
  }
  const manager = process.env.XEC_SECURITY_CONSUMER ?? 'npm';
  if (!['npm', 'pnpm'].includes(manager)) throw new Error('XEC_SECURITY_CONSUMER must be npm or pnpm');
  const consumer = join(temporary, 'consumer'); await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  if (manager === 'npm') {
    runNpm(['install', '--offline', '--no-audit', '--no-fund', ...npmArgs, archive], consumer);
  } else {
    // pnpm can be a standalone executable; do not force it through Node.
    const pnpm = process.platform === 'win32' ? windowsPackageManager('pnpm', process.env) : { executable: 'pnpm' };
    execFileSync(pnpm.executable, [...(pnpm.script ? [pnpm.script] : []), 'add', '--offline', '--ignore-scripts',
      '--ignore-workspace', '--store-dir', join(temporary, 'store'), archive], {
      cwd: consumer, timeout: packageTimeout, killSignal: 'SIGKILL', stdio: 'pipe',
    });
  }
  const installed = join(consumer, 'node_modules/@xec-sh/core');
  const require = createRequire(join(installed, 'package.json'));
  const transport = dirname(require.resolve('ssh2/package.json'));
  await inspectSSHTransport(transport, 'patched');
  run(['--input-type=module', '-e', "import { NodeSSH } from '@xec-sh/core/ssh'; if (typeof NodeSSH !== 'function') process.exit(1)"], consumer);
  const results = [checkReceiveWindow(transport)];
  for (const mode of ['zero-packet', 'buffered-close']) {
    const lines = run([join(root, 'scripts/fixtures/ssh-hostile-peer.mjs'), mode, installed]).trim().split('\n');
    const result = JSON.parse(lines.at(-1));
    const passed = mode === 'zero-packet'
      ? result.phase === 'authenticated' && result.level === 'protocol' && /CHANNEL_OPEN_CONFIRMATION/.test(result.error)
      : result.connectionClosed && result.callbackCalled && !!result.callbackError && result.writePending === 0;
    if (!passed) throw new Error(`${mode}: ${JSON.stringify(result)}`);
    results.push({ mode, passed: true });
  }
  run([join(root, 'scripts/fixtures/ssh-chacha-reentrancy.mjs'), transport]);
  results.push({ mode: 'chacha-nested-writes', cases: 6, passed: true });
  run([join(root, 'scripts/fixtures/ssh-sftp-cleanup.mjs'), installed]);
  results.push({ mode: 'sftp-cleanup', cases: 3, peerCloseCycles: 25, passed: true });
  const evidence = JSON.parse(await readFile(join(installed, 'SSH-TRANSPORT.json')));
  const integrity = 'sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64');
  console.log(JSON.stringify({ packaged: true, integrity, consumer: manager, transport: evidence.upstream, patchSha256: evidence.patchSha256, results }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
