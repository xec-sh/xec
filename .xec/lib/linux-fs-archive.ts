import { constants } from 'node:fs';
import { $, fs, path } from '@xec-sh/ops';
import type { ReleaseCommand } from '@xec-sh/ops/release';

/** Qualify the exact tarball supplied to the release verifier. */
export async function checkLinuxFsArchive(workspace: string, archive: string, run: ReleaseCommand) {
  await $.withTempDir(async consumer => {
    const destination = 'node_modules/@xec-sh/linux-fs';
    const installed = path.join(consumer, destination);
    await fs.ensureDir(installed);
    // The archive and output may be on different drives. Give tar only names
    // relative to its own working directory on every platform.
    const tar = './received.tgz';
    await fs.copyFile(archive, path.join(consumer, tar));
    const members = ['package.json', 'dist/index.js', 'dist/index.d.ts',
      'dist/rename-noreplace-x64', 'dist/rename-noreplace-arm64'];
    for (const member of members) {
      const row = (await run(consumer, 'tar', ['-tvf', tar, 'package/' + member])).trim();
      const mode = member.startsWith('dist/rename-noreplace-') ? /^-rwxr-xr-x[ +@]/ : /^-rw[-x]r[-w][-x]r[-w][-x][ +@]/;
      if (row.includes('\n') || !mode.test(row)) throw new Error('Unexpected archive member or mode: ' + member);
    }
    await run(consumer, 'tar', ['-xf', tar, '-C', destination, '--strip-components=1', ...members.map(m => 'package/' + m)]);
    const pkg = path.join(workspace, 'packages/linux-fs');
    const manifest = await fs.readJson(path.join(installed, 'package.json'));
    if (manifest.exports?.['.']?.import !== './dist/index.js' || manifest.type !== 'module')
      throw new Error('Unexpected Linux filesystem archive entry point');
    for (const member of members.slice(1)) {
      const packed = await fs.readFile(path.join(installed, member));
      if (!packed.equals(await fs.readFile(path.join(pkg, member)))) throw new Error('Packed content differs: ' + member);
    }
    for (const [arch, machine] of [['x64', 62], ['arm64', 183]] as const) {
      const member = 'dist/rename-noreplace-' + arch;
      const file = path.join(installed, member);
      const content = await fs.readFile(file);
      if (content.length < 64 || content.subarray(0, 6).toString('hex') !== '7f454c460201' ||
          content.readUInt16LE(18) !== machine) {
        throw new Error('Invalid packed Linux helper for ' + arch);
      }
      if (process.platform !== 'win32') await fs.access(file, constants.X_OK);
    }
    await fs.copyFile(path.join(workspace, 'packages/linux-fs/test/rename.test.mjs'), path.join(consumer, 'rename.test.mjs'));
    await run(consumer, process.execPath, ['--test', 'rename.test.mjs']);
  }, { prefix: 'xec-linux-fs-consumer-' });
}
