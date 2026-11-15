import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { join, dirname, resolve } from 'node:path';
import { releaseCommand } from '@xec-sh/ops/release';
import { rm, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { inspectSSHTransport, prepareSSHCorePackage } from './ssh-transport.js';
import { checkReceiveWindow } from '../../scripts/fixtures/ssh-receive-window.mjs';

/**
 * Install and inspect the exact packaged runtime under bounded hostile peers.
 * @param {string} root
 * @param {{ archive?: string, consumer?: 'npm' | 'pnpm', run?: import('@xec-sh/ops/release').ReleaseCommand }} options
 */
export async function checkSSHSecurity(root, { archive: selectedArchive, consumer: manager = 'npm', run: execute = releaseCommand } = {}) {
  if (!['npm', 'pnpm'].includes(manager)) throw new Error('SSH consumer must be npm or pnpm');
  const temporary = await mkdtemp(join(tmpdir(), 'xec-ssh-security-'));
  const packageTimeout = 120_000;
  const run = (args, cwd = root, timeoutMs = 10_000) => execute(cwd, process.execPath, args, { timeoutMs });
  try {
    // npm's documented bundled-dependency format must carry the patch to a consumer.
    const runNpm = (args, cwd) => execute(cwd, 'npm', args, { timeoutMs: packageTimeout });
    const npmArgs = ['--ignore-scripts', '--cache', join(temporary, 'cache')];
    let archive;
    if (selectedArchive) archive = resolve(selectedArchive);
    else {
      const packageDirectory = await prepareSSHCorePackage(root, join(temporary, 'core'), execute);
      const packed = JSON.parse(await runNpm(['pack', '--json', '--pack-destination', temporary, ...npmArgs], packageDirectory))[0];
      if (!packed.bundled?.includes('ssh2')) throw new Error('SSH transport was omitted from the package');
      archive = join(temporary, packed.filename);
    }
    const consumer = join(temporary, 'consumer'); await mkdir(consumer);
    await writeFile(join(consumer, 'package.json'), '{"private":true,"type":"module"}');
    if (manager === 'npm') {
      await runNpm(['install', '--offline', '--no-audit', '--no-fund', ...npmArgs, archive], consumer);
    } else {
      await execute(consumer, 'pnpm', ['add', '--offline', '--ignore-scripts',
        '--ignore-workspace', '--store-dir', join(temporary, 'store'), archive], { timeoutMs: packageTimeout });
    }
    const installed = join(consumer, 'node_modules/@xec-sh/core');
    const require = createRequire(join(installed, 'package.json'));
    const transport = dirname(require.resolve('ssh2/package.json'));
    await inspectSSHTransport(root, transport, 'patched');
    await run(['--input-type=module', '-e', "import { NodeSSH } from '@xec-sh/core/ssh'; if (typeof NodeSSH !== 'function') process.exit(1)"], consumer);
    const results = [checkReceiveWindow(transport)];
    for (const mode of ['zero-packet', 'buffered-close']) {
      const lines = (await run([join(root, 'scripts/fixtures/ssh-hostile-peer.mjs'), mode, installed])).trim().split('\n');
      const result = JSON.parse(lines.at(-1));
      const passed = mode === 'zero-packet'
        ? result.phase === 'authenticated' && result.level === 'protocol' && /CHANNEL_OPEN_CONFIRMATION/.test(result.error)
        : result.connectionClosed && result.callbackCalled && !!result.callbackError && result.writePending === 0;
      if (!passed) throw new Error(`${mode}: ${JSON.stringify(result)}`);
      results.push({ mode, passed: true });
    }
    await run([join(root, 'scripts/fixtures/ssh-chacha-reentrancy.mjs'), transport]);
    results.push({ mode: 'chacha-nested-writes', cases: 6, passed: true });
    await run([join(root, 'scripts/fixtures/ssh-sftp-cleanup.mjs'), installed]);
    results.push({ mode: 'sftp-cleanup', cases: 3, peerCloseCycles: 25, passed: true });
    const evidence = JSON.parse(await readFile(join(installed, 'SSH-TRANSPORT.json')));
    const integrity = 'sha512-' + createHash('sha512').update(await readFile(archive)).digest('base64');
    return { packaged: true, integrity, consumer: manager, transport: evidence.upstream, patchSha256: evidence.patchSha256, results };
  } finally { await rm(temporary, { recursive: true, force: true }); }

}
