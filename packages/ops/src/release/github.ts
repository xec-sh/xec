import type { ReleaseCommand } from './command.js';

import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdtemp, writeFile } from 'node:fs/promises';

import { releaseCommand } from './command.js';
import { assertReleaseNotesBase, verifyRemoteReleaseTag } from './git.js';
import { releaseTag, distributionTag, discoverReleasePackages } from './packages.js';

// GitHub caps release bodies at 125,000 characters. A UTF-8 byte budget is
// conservative across the API's character counting and never splits a commit.
const githubNotesLimit = 125_000;

export interface ReleaseNotesOptions {
  /** Full commit of the published release selected by the caller. No tag inference. */
  from?: string;
  run?: ReleaseCommand;
}

function validateRepository(repository: string): void {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) throw new Error('Invalid GitHub repository');
}

/** Notes cover an explicit published baseline, or committed history when none is supplied.
 * Large histories keep whole recent entries and link to the exact complete range. */
export async function releaseNotes(root: string, version: string, repository: string, options: ReleaseNotesOptions = {}): Promise<string> {
  validateRepository(repository); releaseTag(version);
  if (!options || typeof options !== 'object' || Array.isArray(options)) throw new Error('Release notes options must be an object');
  const run = options.run ?? releaseCommand;
  const commit = await run(root, 'git', ['rev-parse', 'HEAD']);
  if (options.from !== undefined) await assertReleaseNotesBase(root, options.from, commit, run);
  const history = await run(root, 'git', ['log', '--format=%H%x09%s', options.from ? `${options.from}..${commit}` : commit]);
  const changes = history.split(/\r?\n/).filter(Boolean).map(line => {
    const [hash, ...parts] = line.split('\t');
    const subject = parts.join(' ').replace(/[\\`*_{}[\]<>]/g, '\\$&');
    return `- ${subject} ([${hash!.slice(0, 8)}](https://github.com/${repository}/commit/${hash}))`;
  });
  const baseline = options.from
    ? `Caller-selected published baseline: [${options.from}](https://github.com/${repository}/commit/${options.from})`
    : 'No published baseline supplied; this covers committed history, not a release delta.';
  const heading = options.from ? 'Changes since selected baseline' : 'Committed history';
  const empty = options.from ? 'No commits since the selected baseline.' : 'No commits.';
  const packages = await discoverReleasePackages(root, run);
  const prefix = `# ${releaseTag(version)}\n\nSource: [${commit}](https://github.com/${repository}/commit/${commit})\n\n${baseline}\n\n## ${heading}\n\n`;
  const suffix = `\n\n## Packages\n\n${packages.map(pkg => `- ${pkg.name}@${version}`).join('\n')}\n`;
  const complete = prefix + (changes.join('\n') || empty) + suffix;
  if (Buffer.byteLength(complete, 'utf8') <= githubNotesLimit) return complete;

  const historyUrl = options.from
    ? `https://github.com/${repository}/compare/${options.from}...${commit}`
    : `https://github.com/${repository}/commits/${commit}`;
  const notice = (count: number) => `\n\nShowing ${count} of ${changes.length} commits. [Browse the complete history](${historyUrl}).`;
  // Reserve the largest possible count before selecting complete Markdown lines.
  let bytes = Buffer.byteLength(prefix + notice(changes.length) + suffix, 'utf8');
  if (bytes > githubNotesLimit) throw new Error(`Release source and package inventory exceed GitHub's ${githubNotesLimit}-byte notes budget`);
  const visible: string[] = [];
  for (const change of changes) {
    const addition = Buffer.byteLength(change, 'utf8') + (visible.length ? 1 : 0);
    if (bytes + addition > githubNotesLimit) break;
    visible.push(change); bytes += addition;
  }
  return prefix + visible.join('\n') + notice(visible.length) + suffix;
}

/** GitHub publication is independently resumable and never deletes a release. */
export async function createGithubRelease(root: string, version: string, repository: string, notes: string, run: ReleaseCommand = releaseCommand): Promise<string> {
  validateRepository(repository);
  if (Buffer.byteLength(notes, 'utf8') > githubNotesLimit)
    throw new Error(`GitHub notes exceed the ${githubNotesLimit}-byte budget; generate bounded notes with releaseNotes before publication`);
  await verifyRemoteReleaseTag(root, version, true, run);
  const tag = releaseTag(version), prerelease = distributionTag(version) !== 'latest';
  const tags = await run(root, 'gh', ['api', '--paginate', `repos/${repository}/releases`, '--jq', '.[].tag_name']);
  let failure: unknown;
  if (!tags.split(/\r?\n/).includes(tag)) {
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
