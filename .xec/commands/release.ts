import type { Command } from 'commander';
import type { ReleaseCommand, ReleaseArtifact } from '@xec-sh/ops/release';

import semver from 'semver';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { select, confirm, password, isCancel } from '@xec-sh/kit';
// The project pins the published driver and release API independently of workspace builds.
import {
  releaseTag, planRelease, releaseNotes, releaseCommand, pushReleaseRefs,
  ensureReleaseTag, assertReleaseHead, acquireReleaseLock, loadPreparedRelease, createGithubRelease, commitReleaseVersion,
  assertReleaseNotesBase, assertCleanReleaseTree, verifyRemoteReleaseTag, publishPreparedRelease,
  discoverReleasePackages, prepareReleaseArtifacts,
} from '@xec-sh/ops/release';

import { checkSSHSecurity } from '../lib/ssh-security.js';

const repository = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
interface ReleaseOptions {
  dryRun?: boolean;
  prepare?: boolean;
  resume?: boolean;
  githubOnly?: boolean;
  skipNpm?: boolean;
  skipGithub?: boolean;
  push?: boolean;
  offline?: boolean;
  workspace?: string;
  registry?: string;
  notesFrom?: string;
  listPackages?: boolean;
  yes?: boolean;
}

async function runRelease(version: string | undefined, values: ReleaseOptions): Promise<void> {
  if (values.workspace && !values.resume && !values.githubOnly) throw new Error('--workspace requires --resume or --github-only');
  const root = values.workspace ? resolve(values.workspace) : repository;
  if ((values.resume || values.githubOnly) && !version) throw new Error('--resume and --github-only require the exact release version');
  const packages = await discoverReleasePackages(root);
  if (values.listPackages) { console.log(JSON.stringify(packages, null, 2)); return; }
  if (!version) {
    const current = packages.find(pkg => pkg.name === '@xec-sh/core')?.version;
    if (!current) throw new Error('Specify the exact release version');
    if (values.dryRun) version = semver.inc(current, 'patch')!;
    else {
      if (!process.stdin.isTTY) throw new Error('Specify the release version in non-interactive mode');
      const choice = await select({ message: `Release version (current ${current})`, options: ['patch', 'minor', 'major'].map(type => ({ value: semver.inc(current, type as 'patch' | 'minor' | 'major')!, label: `${type}: ${semver.inc(current, type as 'patch' | 'minor' | 'major')}` })) });
      if (isCancel(choice)) return; version = choice;
    }
  }
  releaseTag(version);
  const evidence = await planRelease(root, version);
  if (values.notesFrom !== undefined) await assertReleaseNotesBase(root, values.notesFrom, evidence.commit);
  const plan = { version, tag: evidence.tag, npmTag: evidence.npmTag, source: evidence.commit, blockers: evidence.blockers, remoteState: 'not checked by dry-run',
    mode: values.prepare ? 'prepare' : values.resume ? 'resume' : values.githubOnly ? 'github-only' : 'release',
    notesFrom: values.notesFrom ?? null,
    packages: packages.map(pkg => ({ name: pkg.name, path: pkg.path, from: pkg.version, to: version })),
    build: values.resume || values.githubOnly ? false : 'isolated committed snapshot', push: values.push !== false && !values.prepare,
    npm: !values.skipNpm && !values.prepare && !values.githubOnly, github: !values.skipGithub && !values.prepare };
  console.log(JSON.stringify(plan, null, 2));
  if (values.dryRun) { if (evidence.blockers.length) process.exitCode = 1; return; }
  if (evidence.blockers.length) throw new Error(evidence.blockers.join('\n'));
  if (!values.yes) {
    if (!process.stdin.isTTY) throw new Error('Review --dry-run, then use --yes for a non-interactive release');
    const accepted = await confirm({ message: 'Execute this release plan?', initialValue: false });
    if (isCancel(accepted) || !accepted) return;
  }
  const unlock = await acquireReleaseLock(root);
  try {
    await assertCleanReleaseTree(root);
    const tagExists = await assertReleaseHead(root, version);
    if (values.workspace && !tagExists) throw new Error('--workspace requires a tagged release checkout');
    // A colliding remote release is refused before any version changes.
    if (!values.prepare && values.push !== false) await verifyRemoteReleaseTag(root, version);
    if (!values.resume && !values.githubOnly) {
      await commitReleaseVersion(root, version);
      // pnpm verifies installed workspace versions before it can invoke --resume.
      await releaseCommand(root, 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', ...(values.offline ? ['--offline'] : [])], { timeoutMs: 600000 });
      await assertCleanReleaseTree(root);
    }
    if (!values.githubOnly) {
      if (values.resume) await loadPreparedRelease(root, version);
      else {
        for (const name of ['@xec-sh/core', '@xec-sh/ssh']) {
          if (!packages.some(pkg => pkg.name === name)) throw new Error('SSH release acceptance requires both Core and SSH packages');
        }
        const sshArchives = new Map<string, ReleaseArtifact>();
        let sshVerified = false;
        await prepareReleaseArtifacts(root, version, {
          build: { executable: 'pnpm', args: ['--recursive', ...packages.flatMap(pkg => ['--filter', pkg.name]), 'run', 'build'] }, offline: values.offline,
          progress: console.log,
          // 0.12.0 supports archive acceptance, not producer retention. Never
          // pass a newer option that an older published API could ignore.
          verifyArtifact: async ({ workspace, artifact, run }: { workspace: string; artifact: ReleaseArtifact; run: ReleaseCommand }) => {
            if (artifact.name !== '@xec-sh/core' && artifact.name !== '@xec-sh/ssh') return;
            sshArchives.set(artifact.name, artifact);
            const core = sshArchives.get('@xec-sh/core');
            const ssh = sshArchives.get('@xec-sh/ssh');
            if (!core || !ssh) return;
            console.log('Checking the exact Core and SSH archives in an installed consumer');
            console.log(JSON.stringify(await checkSSHSecurity(workspace, {
              coreArchive: core.file, sshArchive: ssh.file, run,
            }), null, 2));
            sshVerified = true;
          },
        });
        if (!sshVerified) throw new Error('Core and SSH archive acceptance did not complete');
      }
      await ensureReleaseTag(root, version);
    }
    if (values.prepare) { console.log(`Prepared ${version}. Review .release-artifacts, then use: xec release ${version} --resume${values.notesFrom ? ` --notes-from ${values.notesFrom}` : ''}`); return; }
    if (values.push === false && (!values.skipGithub || !values.skipNpm)) await verifyRemoteReleaseTag(root, version, true);
    const push = values.push === false ? undefined : () => pushReleaseRefs(root, version);
    if (values.skipNpm || values.githubOnly) await push?.();
    else await publishPreparedRelease(root, version, {
      registry: values.registry, progress: console.log, beforeUpload: push,
      otp: async () => {
        if (!process.stdin.isTTY) throw new Error('npm requires an OTP; resume interactively or configure an automation credential');
        const value = await password({ message: 'npm one-time password' });
        if (isCancel(value)) throw new Error('Publication cancelled; preserve archives and resume later');
        return value;
      },
    });
    if (!values.skipGithub) {
      const origin = await releaseCommand(root, 'git', ['remote', 'get-url', 'origin']);
      const target = await releaseCommand(root, 'gh', ['repo', 'view', origin, '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
      const notes = await releaseNotes(root, version, target, { from: values.notesFrom });
      console.log(await createGithubRelease(root, version, target, notes));
    }
    console.log(`Release ${version} verified. Prepared archives and receipts remain in .release-artifacts.`);
  } catch (error) {
    throw new Error(`Release interrupted. No source, tags or archives were rolled back. Inspect the failure and resume ${version} from its exact clean commit`, { cause: error });
  } finally { await unlock(); }
}

/** Project release policy, executed by the pinned published Xec runtime. */
export function command(program: Command): void {
  const release = program.command('release [version]')
    .description('Prepare immutable packages and resume verified npm/GitHub publication')
    .option('-d, --dry-run', 'Print a read-only plan without builds, hooks, Git writes or publication')
    .addOption(program.createOption('--prepare', 'Commit versions, prepare isolated archives and create a local tag')
      .conflicts(['resume', 'githubOnly']))
    .addOption(program.createOption('--resume', 'Publish existing sealed archives without rebuilding or changing versions')
      .conflicts(['prepare', 'githubOnly']))
    .addOption(program.createOption('--github-only', 'Finish GitHub for the exact checked-out release tag')
      .conflicts(['prepare', 'resume']))
    .option('--workspace <path>', 'Checkout containing the sealed release; requires --resume or --github-only')
    .option('--skip-npm', 'Skip npm publication')
    .option('--skip-github', 'Skip GitHub release creation')
    .option('--no-push', 'Leave the exact branch/tag push to the operator')
    .option('--offline', 'Install isolated build dependencies from the local pnpm store')
    .option('--registry <url>', 'npm destination', 'https://registry.npmjs.org/')
    .addOption(program.createOption('--notes-from <sha>', 'Full commit of a verified published release; otherwise use full history')
      .conflicts('skipGithub'))
    .option('--list-packages', 'List publishable workspaces in dependency order')
    .option('-y, --yes', 'Confirm the displayed plan without prompting')
    .allowExcessArguments(false)
    .addHelpText('after', `
Credentials come from npm/gh login or their supported environment configuration.
A failed publication retains its version commit, tag and archives for --resume.
`);
  release.action((version: string | undefined, options: ReleaseOptions) => runRelease(version, options));
}
