import type { ReleaseCommand } from './command.js';
import type { ReleasePackage } from './packages.js';

import semver from 'semver';

import { assertReleaseHead } from './git.js';
import { releaseCommand } from './command.js';
import { releaseTag, distributionTag, discoverReleasePackages } from './packages.js';

export interface ReleasePlan {
  version: string;
  tag: string;
  npmTag: string;
  commit: string;
  packages: ReleasePackage[];
  blockers: string[];
}

/** Local, read-only evidence. Network, build and publication checks are separate. */
export async function planRelease(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<ReleasePlan> {
  const tag = releaseTag(version), packages = await discoverReleasePackages(root, run);
  const blockers: string[] = [];
  const changes = await run(root, 'git', ['status', '--porcelain', '--untracked-files=normal']);
  if (changes) blockers.push(`Working tree or index is not clean:\n${changes}`);
  if (packages.some(pkg => semver.gt(pkg.version, version))) blockers.push('Release version cannot move backwards');
  try {
    const existing = await assertReleaseHead(root, version, run);
    if (existing && packages.some(pkg => pkg.version !== version)) blockers.push('Existing release tag has inconsistent package versions');
  } catch (error) { blockers.push(error instanceof Error ? error.message : String(error)); }
  return { version, tag, npmTag: distributionTag(version), commit: await run(root, 'git', ['rev-parse', 'HEAD']), packages, blockers };
}
