import type { ReleaseCommand } from './command.js';

import { releaseTag } from './packages.js';
import { releaseCommand } from './command.js';

export async function assertCleanReleaseTree(root: string, run: ReleaseCommand = releaseCommand): Promise<void> {
  const changes = await run(root, 'git', ['status', '--porcelain', '--untracked-files=normal']);
  if (changes) throw new Error(`Release requires a clean working tree and index:\n${changes}`);
}

export async function assertReleaseHead(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<string | undefined> {
  const tag = releaseTag(version), ref = `refs/tags/${tag}`;
  if (!await run(root, 'git', ['tag', '--list', tag])) return undefined;
  const [commit, head, object] = await Promise.all([
    run(root, 'git', ['rev-parse', `${ref}^{commit}`]), run(root, 'git', ['rev-parse', 'HEAD']), run(root, 'git', ['rev-parse', ref]),
  ]);
  if (commit !== head) throw new Error(`Release tag ${tag} differs from HEAD. Resume from its clean checkout or choose a new version`);
  return object;
}

export async function ensureReleaseTag(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<void> {
  await assertCleanReleaseTree(root, run);
  if (!await assertReleaseHead(root, version, run)) await run(root, 'git', ['tag', '-a', releaseTag(version), '-m', `Release ${releaseTag(version)}`]);
}

/** Only the selected release tag matters; historical tag divergence is irrelevant. */
export async function verifyRemoteReleaseTag(root: string, version: string, required = false, run: ReleaseCommand = releaseCommand): Promise<boolean> {
  const ref = `refs/tags/${releaseTag(version)}`;
  const remote = await run(root, 'git', ['ls-remote', '--tags', 'origin', ref]);
  if (!remote) { if (required) throw new Error(`Remote release tag is missing: ${ref}`); return false; }
  const local = await assertReleaseHead(root, version, run);
  if (!local || remote.split(/\s+/)[0] !== local) throw new Error(`Remote release tag differs: ${ref}; refusing to replace it`);
  return true;
}

/** Atomic branch + one exact tag; never force and never inherit push.followTags. */
export async function pushReleaseRefs(root: string, version: string, run: ReleaseCommand = releaseCommand): Promise<void> {
  await assertCleanReleaseTree(root, run);
  const object = await assertReleaseHead(root, version, run);
  if (!object) throw new Error('Release tag has not been created');
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  const pushed = await verifyRemoteReleaseTag(root, version, false, run);
  const branch = await run(root, 'git', ['branch', '--show-current']);
  if (!branch) throw new Error('Release push requires an attached branch');
  await run(root, 'git', ['check-ref-format', `refs/heads/${branch}`]);
  if (pushed && await run(root, 'git', ['ls-remote', '--heads', 'origin', `refs/heads/${branch}`])) {
    await run(root, 'git', ['fetch', '--no-tags', 'origin', `refs/heads/${branch}`]);
    try { await run(root, 'git', ['merge-base', '--is-ancestor', `refs/tags/${releaseTag(version)}^{commit}`, 'FETCH_HEAD']); return; }
    catch (error) { if (!(error instanceof Error) || !('status' in error) || error.status !== 1) throw error; }
  }
  const ref = `refs/tags/${releaseTag(version)}`;
  await run(root, 'git', ['-c', 'push.followTags=false', 'push', '--atomic', 'origin', `${commit}:refs/heads/${branch}`, `${object}:${ref}`]);
}
