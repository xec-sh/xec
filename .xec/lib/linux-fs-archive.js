import { tmpdir } from 'node:os';
import { constants } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { rm, mkdir, access, mkdtemp, copyFile, readFile } from 'node:fs/promises';

/** Qualify the exact tarball supplied to the release verifier. */
export async function checkLinuxFsArchive(workspace, archive, run) {
  const consumer = await mkdtemp(join(tmpdir(), 'xec-linux-fs-consumer-'));
  try {
    const installed = join(consumer, 'node_modules', '@xec-sh', 'linux-fs');
    await mkdir(installed, { recursive: true });
    const tar = './' + basename(archive);
    const archiveRoot = dirname(archive);
    const members = ['package.json', 'dist/index.js', 'dist/index.d.ts',
      'dist/rename-noreplace-x64', 'dist/rename-noreplace-arm64'];
    for (const member of members) {
      const row = (await run(archiveRoot, 'tar', ['-tvf', tar, 'package/' + member])).trim();
      const mode = member.startsWith('dist/rename-noreplace-') ? /^-rwxr-xr-x[ +@]/ : /^-rw[-x]r[-w][-x]r[-w][-x][ +@]/;
      if (row.includes('\n') || !mode.test(row)) throw new Error('Unexpected archive member or mode: ' + member);
    }
    await run(archiveRoot, 'tar', ['-xf', tar, '-C', installed, '--strip-components=1', ...members.map(m => 'package/' + m)]);
    const pkg = join(workspace, 'packages/linux-fs');
    const manifest = JSON.parse(await readFile(join(installed, 'package.json'), 'utf8'));
    if (manifest.exports?.['.']?.import !== './dist/index.js' || manifest.type !== 'module')
      throw new Error('Unexpected Linux filesystem archive entry point');
    for (const member of members.slice(1)) {
      const packed = await readFile(join(installed, member));
      if (!packed.equals(await readFile(join(pkg, member)))) throw new Error('Packed content differs: ' + member);
    }
    for (const [arch, machine] of [['x64', 62], ['arm64', 183]]) {
      const member = 'dist/rename-noreplace-' + arch;
      const file = join(installed, member);
      const content = await readFile(file);
      if (content.length < 64 || content.subarray(0, 6).toString('hex') !== '7f454c460201' ||
          content.readUInt16LE(18) !== machine) {
        throw new Error('Invalid packed Linux helper for ' + arch);
      }
      if (process.platform !== 'win32') await access(file, constants.X_OK);
    }
    await copyFile(join(workspace, 'packages/linux-fs/test/rename.test.mjs'), join(consumer, 'rename.test.mjs'));
    await run(consumer, process.execPath, ['--test', 'rename.test.mjs']);
  } finally {
    await rm(consumer, { recursive: true, force: true });
  }
}
