import type { ReleaseCommand } from './command.js';
import type { ReleasePackage } from './packages.js';

import semver from 'semver';
import { sep, join } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

import { releaseCommand } from './command.js';
import { releaseTag, discoverReleasePackages } from './packages.js';
import { assertReleaseHead, assertCleanReleaseTree } from './git.js';

/** Only package versions are changed; workspace ranges remain workspace ranges. */
export async function commitReleaseVersion(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<ReleasePackage[]> {
  releaseTag(version); await assertCleanReleaseTree(root, run);
  const packages = await discoverReleasePackages(root, run);
  if (packages.some(pkg => semver.gt(pkg.version, version))) throw new Error('Release version cannot move backwards');
  const tag = await assertReleaseHead(root, version, run);
  if (tag && packages.some(pkg => pkg.version !== version)) throw new Error('Existing release tag has inconsistent package versions');
  const changed = packages.filter(pkg => pkg.version !== version);
  if (!changed.length) return packages;
  const before = await run(root, 'git', ['rev-parse', 'HEAD']);
  const files = changed.map(pkg => join(pkg.path, 'package.json').split(sep).join('/'));
  for (const file of files) {
    const manifest = JSON.parse(await readFile(join(root, file), 'utf8')) as Record<string, unknown>;
    manifest['version'] = version;
    await writeFile(join(root, file), JSON.stringify(manifest, null, 2) + '\n');
  }
  const modified = (await run(root, 'git', ['diff', '--name-only', '-z'])).split('\0').filter(Boolean);
  if (modified.some(file => !files.includes(file))) throw new Error('Unrelated changes appeared during version preparation; inspect the working tree');
  await run(root, 'git', ['add', '--', ...files]);
  const staged = (await run(root, 'git', ['diff', '--cached', '--name-only', '-z'])).split('\0').filter(Boolean);
  if (staged.some(file => !files.includes(file))) throw new Error('Unrelated files were staged during version preparation');
  const tree = await run(root, 'git', ['write-tree']);
  await run(root, 'git', ['commit', '-m', `chore: release ${releaseTag(version)}`]);
  if (await run(root, 'git', ['rev-parse', 'HEAD^']) !== before || await run(root, 'git', ['rev-parse', 'HEAD^{tree}']) !== tree) throw new Error('Release commit differs from the reviewed version changes');
  await assertCleanReleaseTree(root, run);
  return packages.map(pkg => ({ ...pkg, version }));
}
