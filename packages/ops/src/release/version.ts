import type { ReleaseCommand } from './command.js';
import type { ReleasePackage } from './packages.js';

import semver from 'semver';
import { sep, join } from 'node:path';
import { lstat, readFile, writeFile } from 'node:fs/promises';

import { releaseCommand } from './command.js';
import { finalizeChangelog } from './changelog.js';
import { releaseTag, discoverReleasePackages } from './packages.js';
import { assertReleaseHead, assertCleanReleaseTree } from './git.js';

/** Commit package versions and authored changelogs together; preserve workspace ranges. */
export async function commitReleaseVersion(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<ReleasePackage[]> {
  releaseTag(version); await assertCleanReleaseTree(root, run);
  const packages = await discoverReleasePackages(root, run);
  if (packages.some(pkg => semver.gt(pkg.version, version))) throw new Error('Release version cannot move backwards');
  const tag = await assertReleaseHead(root, version, run);
  if (tag && packages.some(pkg => pkg.version !== version)) throw new Error('Existing release tag has inconsistent package versions');
  const changed = packages.filter(pkg => pkg.version !== version);
  if (!changed.length) return packages;
  const before = await run(root, 'git', ['rev-parse', 'HEAD']);
  const changes = new Map<string, string>();
  for (const pkg of changed) {
    const file = join(pkg.path, 'package.json').split(sep).join('/');
    const manifest = JSON.parse(await readFile(join(root, file), 'utf8')) as Record<string, unknown>;
    manifest['version'] = version;
    changes.set(file, JSON.stringify(manifest, null, 2) + '\n');
  }
  const date = new Date().toISOString().slice(0, 10);
  const changelogs = new Set(['CHANGELOG.md', ...packages.map(pkg => join(pkg.path, 'CHANGELOG.md').split(sep).join('/'))]);
  for (const file of changelogs) {
    const location = join(root, file);
    const info = await lstat(location).catch((error: unknown) => {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return undefined;
      throw error;
    });
    if (!info) continue;
    if (!info.isFile()) throw new Error('Release changelog must be a regular file: ' + file);
    const tracked = (await run(root, 'git', ['ls-files', '-z', '--', file])).split('\0').includes(file);
    if (!tracked) throw new Error('Release changelog must be tracked: ' + file);
    const source = await readFile(location, 'utf8');
    let updated: string;
    try { updated = finalizeChangelog(source, version, date); }
    catch (cause) { throw new Error('Invalid release changelog: ' + file, { cause }); }
    if (updated !== source) changes.set(file, updated);
  }
  // Validate every document before writing any manifest or changelog.
  const files = [...changes.keys()];
  for (const [file, content] of changes) await writeFile(join(root, file), content);
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
