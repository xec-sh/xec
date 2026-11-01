import type { ReleaseCommand } from './command.js';

import semver from 'semver';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';

import { verifyRemoteReleaseTag } from './git.js';
import { releaseCommand, ReleaseCommandError } from './command.js';
import { releaseTag, distributionTag, discoverReleasePackages } from './packages.js';

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
}

/** Notes use committed history and the nearest earlier release on this ancestry. */
export async function releaseNotes(root: string, version: string, repository: string, run: ReleaseCommand = releaseCommand): Promise<string> {
  validateRepository(repository); releaseTag(version);
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  const versions = (await run(root, 'git', ['tag', '--list', 'v*'])).split('\n').map(tag => tag.slice(1))
    .filter(value => semver.valid(value) === value && semver.lt(value, version)).sort(semver.rcompare);
  let previous: string | undefined;
  for (const value of versions) {
    try { await run(root, 'git', ['merge-base', '--is-ancestor', `refs/tags/v${value}^{commit}`, commit]); previous = `v${value}`; break; }
    catch (error) { if (!(error instanceof ReleaseCommandError) || error.status !== 1) throw error; }
  }
  const history = await run(root, 'git', ['log', '--format=%H%x09%s', previous ? `refs/tags/${previous}..${commit}` : commit]);
  const changes = history.split('\n').filter(Boolean).filter(line => !/\tchore: release v/.test(line)).map(line => {
    const [hash, ...parts] = line.split('\t');
    const subject = parts.join(' ').replace(/[\\`*_{}[\]<>]/g, '\\$&');
    return `- ${subject} ([${hash!.slice(0, 8)}](https://github.com/${repository}/commit/${hash}))`;
  });
  const packages = await discoverReleasePackages(root, run);
  return `# ${releaseTag(version)}\n\nSource: [${commit}](https://github.com/${repository}/commit/${commit})\n\n## Changes\n\n${changes.join('\n') || 'No source changes since the preceding release.'}\n\n## Packages\n\n${packages.map(pkg => `- ${pkg.name}@${version}`).join('\n')}\n`;
}

/** GitHub publication is independently resumable and never deletes a release. */
export async function createGithubRelease(root: string, version: string, repository: string, notes: string, run: ReleaseCommand = releaseCommand): Promise<string> {
  validateRepository(repository);
  await verifyRemoteReleaseTag(root, version, true, run);
  const tag = releaseTag(version), prerelease = distributionTag(version) !== 'latest';
  const tags = await run(root, 'gh', ['api', '--paginate', `repos/${repository}/releases`, '--jq', '.[].tag_name']);
  let failure: unknown;
  if (!tags.split('\n').includes(tag)) {
    const directory = await mkdtemp(join(tmpdir(), 'xec-release-notes-'));
    try {
      const file = join(directory, 'notes.md'); await writeFile(file, notes, { mode: 0o600 });
      await run(root, 'gh', ['release', 'create', tag, '--repo', repository, '--verify-tag', '--title', tag, '--notes-file', file,
        ...(prerelease ? ['--prerelease', '--latest=false'] : [])]);
    } catch (error) { failure = error; }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
  // A lost create response may still have committed. Never create twice without
  // reading back the exact tag; existing drafts and mismatched kinds need review.
  let record: { tagName?: string; isDraft?: boolean; isPrerelease?: boolean; url?: string };
  try { record = JSON.parse(await run(root, 'gh', ['release', 'view', tag, '--repo', repository, '--json', 'tagName,isDraft,isPrerelease,url'])); }
  catch (error) { throw new AggregateError(failure ? [failure, error] : [error], `GitHub publication is unconfirmed for ${tag}; resume after inspecting the remote`, { cause: error }); }
  if (!record || record.tagName !== tag || record.isDraft !== false || record.isPrerelease !== prerelease
      || typeof record.url !== 'string' || !record.url.startsWith(`https://github.com/${repository}/releases/`)) throw new Error(`GitHub release ${tag} exists but its published identity or release kind differs; no changes were made to it`);
  return record.url;
}
