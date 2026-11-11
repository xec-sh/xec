#!/usr/bin/env -S node --import tsx
import type { ReleaseCommand, ReleaseArtifact } from '@xec-sh/ops/release';

import semver from 'semver';
import { parseArgs } from 'node:util';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { select, confirm, password, isCancel } from '@xec-sh/kit';
// The CLI and scripts use the same built operations package.
import {
  releaseTag, planRelease, releaseNotes, releaseCommand, pushReleaseRefs,
  ensureReleaseTag, assertReleaseHead, acquireReleaseLock, loadPreparedRelease, createGithubRelease,
  commitReleaseVersion, assertCleanReleaseTree, verifyRemoteReleaseTag, publishPreparedRelease,
  discoverReleasePackages, prepareReleaseArtifacts,
} from '@xec-sh/ops/release';

const repository = join(dirname(fileURLToPath(import.meta.url)), '..');
const usage = `xec release [version] [options]
  --dry-run           Read-only plan; no build, files, hooks, git writes or publication
  --prepare           Commit versions, build isolated archives and create a local tag
  --resume            Use existing sealed archives; never rebuild or change versions
  --workspace <path>  Resume an existing sealed release in the given checkout
  --github-only       Finish GitHub for the exact checked-out release tag
  --skip-npm          Skip npm publication
  --skip-github       Skip GitHub release creation
  --no-push           Leave the exact branch/tag push to the operator
  --offline           Install isolated build dependencies from the local pnpm store
  --registry <url>    npm destination (default: https://registry.npmjs.org/)
  --list-packages     List publishable workspaces in dependency order
  --yes               Confirm the displayed plan without a prompt
Credentials come from npm/gh login or their supported environment configuration.
A failed publication retains its version commit, tag and archives for --resume.
`;

async function verifyCoreArchive(context: { workspace: string; artifact: ReleaseArtifact; run: ReleaseCommand }): Promise<void> {
  if (context.artifact.name !== '@xec-sh/core') return;
  console.log('Checking the packed SSH runtime');
  await context.run(context.workspace, process.execPath, [join(context.workspace, 'scripts/check-ssh-security.mjs'), '--archive', context.artifact.file]);
}

export async function runRelease(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, options: {
    'dry-run': { type: 'boolean', short: 'd' }, prepare: { type: 'boolean' }, resume: { type: 'boolean' },
    'github-only': { type: 'boolean' }, 'skip-npm': { type: 'boolean' }, 'skip-github': { type: 'boolean' },
    'no-push': { type: 'boolean' }, offline: { type: 'boolean' }, workspace: { type: 'string' }, registry: { type: 'string' },
    'list-packages': { type: 'boolean' }, yes: { type: 'boolean', short: 'y' }, help: { type: 'boolean', short: 'h' },
  } });
  if (values.help) { console.log(usage); return; }
  if (values.workspace && !values.resume && !values['github-only']) throw new Error('--workspace requires --resume or --github-only');
  const root = values.workspace ? resolve(values.workspace) : repository;
  if (positionals.length > 1) throw new Error('Expected at most one release version');
  if ([values.prepare, values.resume, values['github-only']].filter(Boolean).length > 1) throw new Error('Choose only one of --prepare, --resume or --github-only');
  if ((values.resume || values['github-only']) && !positionals[0]) throw new Error('--resume and --github-only require the exact release version');
  const packages = await discoverReleasePackages(root);
  if (values['list-packages']) { console.log(JSON.stringify(packages, null, 2)); return; }
  let version = positionals[0];
  if (!version) {
    const current = packages.find(pkg => pkg.name === '@xec-sh/core')?.version;
    if (!current) throw new Error('Specify the exact release version');
    if (values['dry-run']) version = semver.inc(current, 'patch')!;
    else {
      if (!process.stdin.isTTY) throw new Error('Specify the release version in non-interactive mode');
      const choice = await select({ message: `Release version (current ${current})`, options: ['patch', 'minor', 'major'].map(type => ({ value: semver.inc(current, type as 'patch' | 'minor' | 'major')!, label: `${type}: ${semver.inc(current, type as 'patch' | 'minor' | 'major')}` })) });
      if (isCancel(choice)) return; version = choice;
    }
  }
  releaseTag(version);
  const evidence = await planRelease(root, version);
  const plan = { version, tag: evidence.tag, npmTag: evidence.npmTag, source: evidence.commit, blockers: evidence.blockers, remoteState: 'not checked by dry-run',
    mode: values.prepare ? 'prepare' : values.resume ? 'resume' : values['github-only'] ? 'github-only' : 'release',
    packages: packages.map(pkg => ({ name: pkg.name, path: pkg.path, from: pkg.version, to: version })),
    build: values.resume || values['github-only'] ? false : 'isolated committed snapshot', push: !values['no-push'] && !values.prepare,
    npm: !values['skip-npm'] && !values.prepare && !values['github-only'], github: !values['skip-github'] && !values.prepare };
  console.log(JSON.stringify(plan, null, 2));
  if (values['dry-run']) { if (evidence.blockers.length) process.exitCode = 1; return; }
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
    if (!values.prepare && !values['no-push']) await verifyRemoteReleaseTag(root, version);
    if (!values.resume && !values['github-only']) {
      await commitReleaseVersion(root, version);
      // pnpm verifies installed workspace versions before it can invoke --resume.
      await releaseCommand(root, 'pnpm', ['install', '--frozen-lockfile', '--ignore-scripts', ...(values.offline ? ['--offline'] : [])], { timeoutMs: 600000 });
      await assertCleanReleaseTree(root);
    }
    if (!values['github-only']) {
      if (values.resume) await loadPreparedRelease(root, version);
      else await prepareReleaseArtifacts(root, version, {
        build: { executable: 'pnpm', args: ['--recursive', ...packages.flatMap(pkg => ['--filter', pkg.name]), 'run', 'build'] }, offline: values.offline,
        progress: console.log, verifyArtifact: verifyCoreArchive,
        preparePackage: async ({ workspace, temporary, pkg, run }) => {
          if (pkg.name !== '@xec-sh/core') return undefined;
          const directory = join(temporary, 'prepared-core');
          await run(workspace, process.execPath, [join(workspace, 'scripts/ssh-transport.mjs'), 'prepare', directory]);
          return { directory, manager: 'npm' };
        },
      });
      await ensureReleaseTag(root, version);
    }
    if (values.prepare) { console.log(`Prepared ${version}. Review .release-artifacts, then use: xec release ${version} --resume`); return; }
    if (values['no-push'] && (!values['skip-github'] || !values['skip-npm'])) await verifyRemoteReleaseTag(root, version, true);
    const push = values['no-push'] ? undefined : () => pushReleaseRefs(root, version);
    if (values['skip-npm'] || values['github-only']) await push?.();
    else await publishPreparedRelease(root, version, {
      registry: values.registry, progress: console.log, beforeUpload: push,
      otp: async () => {
        if (!process.stdin.isTTY) throw new Error('npm requires an OTP; resume interactively or configure an automation credential');
        const value = await password({ message: 'npm one-time password' });
        if (isCancel(value)) throw new Error('Publication cancelled; preserve archives and resume later');
        return value;
      },
    });
    if (!values['skip-github']) {
      const origin = await releaseCommand(root, 'git', ['remote', 'get-url', 'origin']);
      const target = await releaseCommand(root, 'gh', ['repo', 'view', origin, '--json', 'nameWithOwner', '--jq', '.nameWithOwner']);
      const notes = await releaseNotes(root, version, target);
      console.log(await createGithubRelease(root, version, target, notes));
    }
    console.log(`Release ${version} verified. Prepared archives and receipts remain in .release-artifacts.`);
  } catch (error) {
    throw new Error(`Release interrupted. No source, tags or archives were rolled back. Inspect the failure and resume ${version} from its exact clean commit`, { cause: error });
  } finally { await unlock(); }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runRelease(process.argv.slice(2)).catch(error => { console.error(error); process.exitCode = 1; });
}
