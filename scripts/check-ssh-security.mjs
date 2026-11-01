#!/usr/bin/env node
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
/** Release gate: exercise the actual packaged SSH runtime under bounded hostile peers. */
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, delimiter } from 'node:path';
import { rm, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';

import { inspectSSHTransport, prepareSSHCorePackage } from './ssh-transport.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const temporary = await mkdtemp(join(tmpdir(), 'xec-ssh-security-'));
const run = (args, cwd = root) => execFileSync(process.execPath, args, {
  cwd, timeout: 10000, killSignal: 'SIGKILL', encoding: 'utf8', maxBuffer: 128 * 1024,
});
try {
  const packageDirectory = await prepareSSHCorePackage(join(temporary, 'core'));
  // npm's documented bundled-dependency format must carry the patch to a consumer.
  const candidates = [process.env.npm_execpath,
    join(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    join(dirname(process.execPath), '../lib/node_modules/npm/bin/npm-cli.js'),
    ...String(process.env.PATH ?? '').split(delimiter).flatMap(directory => [join(directory, 'npm'), join(directory, 'node_modules/npm/bin/npm-cli.js')])];
  let npm;
  for (const candidate of candidates.filter(Boolean)) {
    try { const path = await realpath(candidate); if (path.endsWith('npm-cli.js')) { npm = path; break; } } catch { /* Try the next installed CLI. */ }
  }
  if (!npm) throw new Error('An installed npm CLI is required for the package-consumer security check');
  const npmArgs = ['--ignore-scripts', '--cache', join(temporary, 'cache')];
  const packed = JSON.parse(run([npm, 'pack', '--json', '--pack-destination', temporary, ...npmArgs], packageDirectory))[0];
  if (!packed.bundled?.includes('ssh2')) throw new Error('SSH transport was omitted from the package');
  const manager = process.env.XEC_SECURITY_CONSUMER ?? 'npm';
  if (!['npm', 'pnpm'].includes(manager)) throw new Error('XEC_SECURITY_CONSUMER must be npm or pnpm');
  const consumer = join(temporary, 'consumer'); await mkdir(consumer);
  await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
  if (manager === 'npm') {
    run([npm, 'install', '--offline', '--no-audit', '--no-fund', ...npmArgs, join(temporary, packed.filename)], consumer);
  } else {
    // pnpm can be a standalone executable; do not force it through Node.
    execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', ['add', '--offline', '--ignore-scripts',
      '--ignore-workspace', '--store-dir', join(temporary, 'store'), join(temporary, packed.filename)], {
      cwd: consumer, timeout: 30000, killSignal: 'SIGKILL', stdio: 'pipe',
    });
  }
  const installed = join(consumer, 'node_modules/@xec-sh/core');
  const require = createRequire(join(installed, 'package.json'));
  const transport = dirname(require.resolve('ssh2/package.json'));
  await inspectSSHTransport(transport, 'patched');
  run(['--input-type=module', '-e', "import { NodeSSH } from '@xec-sh/core/ssh'; if (typeof NodeSSH !== 'function') process.exit(1)"], consumer);
  const results = [];
  for (const mode of ['zero-packet', 'receive-window', 'buffered-close']) {
    const lines = run([join(root, 'scripts/fixtures/ssh-hostile-peer.mjs'), mode, installed]).trim().split('\n');
    const result = JSON.parse(lines.at(-1));
    const passed = mode === 'zero-packet'
      ? result.phase === 'authenticated' && result.level === 'protocol' && /CHANNEL_OPEN_CONFIRMATION/.test(result.error)
      : mode === 'receive-window'
        ? result.violationSent && result.disconnected && result.remaining >= 0
        : result.connectionClosed && result.callbackCalled && !!result.callbackError && result.writePending === 0;
    if (!passed) throw new Error(`${mode}: ${JSON.stringify(result)}`);
    results.push({ mode, passed: true });
  }
  run([join(root, 'scripts/fixtures/ssh-chacha-reentrancy.mjs'), transport]);
  results.push({ mode: 'chacha-nested-writes', cases: 6, passed: true });
  const evidence = JSON.parse(await readFile(join(installed, 'SSH-TRANSPORT.json')));
  console.log(JSON.stringify({ packaged: true, consumer: manager, transport: evidence.upstream, patchSha256: evidence.patchSha256, results }, null, 2));
} finally { await rm(temporary, { recursive: true, force: true }); }
