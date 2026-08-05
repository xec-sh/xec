/// <reference path="../../apps/xec/globals.d.ts" />

import type { Command } from 'commander';
import { writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// Note: prism is available globally in xec scripts (from script context)
// If not available, fallback to kit.prism
const prism = (globalThis as any).prism || kit.prism;

// Dynamic imports - defer loading until command execution
let semver: any;

/**
 * Publishable packages, discovered from the workspace and ordered so every
 * package publishes after its workspace dependencies.
 *
 * This used to be a hand-typed list of five. The workspace had six: it
 * predated @xec-sh/ops and nobody remembered the copy when the package was
 * born. A release from that list publishes a CLI whose `workspace:*`
 * dependency rewrites to an ops version that never reaches the registry —
 * every `npm install -g @xec-sh/cli` then fails with E404. The workspace
 * manifest is the one list that cannot forget a package, because adding a
 * package IS editing it.
 */
function discoverPackages(): Array<{ name: string; path: string }> {
  const globs = readFileSync('pnpm-workspace.yaml', 'utf8')
    .split('\n')
    .map(line => line.match(/^\s*-\s*["']?([^"'#\s]+)["']?\s*$/)?.[1])
    .filter((entry): entry is string => Boolean(entry));

  const dirs = globs.flatMap(pattern => {
    if (pattern.endsWith('/*')) {
      const parent = pattern.slice(0, -2);
      if (!existsSync(parent)) return [];
      return readdirSync(parent, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => `${parent}/${entry.name}`);
    }
    return [pattern];
  });

  const packages = dirs.flatMap(dir => {
    const manifestPath = join(dir, 'package.json');
    if (!existsSync(manifestPath)) return [];
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    if (manifest.private === true || !manifest.name) return [];
    return [{
      name: manifest.name as string,
      path: dir,
      deps: Object.keys({
        ...manifest.dependencies,
        ...manifest.optionalDependencies,
        ...manifest.peerDependencies,
      }),
    }];
  });

  // Dependencies publish first: were the CLI to land before ops, an install
  // in the minutes between would 404 exactly like the missing-package case.
  const names = new Set(packages.map(pkg => pkg.name));
  const ordered: Array<{ name: string; path: string }> = [];
  const placed = new Set<string>();

  while (ordered.length < packages.length) {
    const ready = packages.filter(pkg =>
      !placed.has(pkg.name) &&
      pkg.deps.every(dep => !names.has(dep) || placed.has(dep))
    );
    if (ready.length === 0) {
      throw new Error('Dependency cycle among workspace packages; cannot order the publish');
    }
    for (const pkg of ready.sort((a, b) => a.name.localeCompare(b.name))) {
      ordered.push({ name: pkg.name, path: pkg.path });
      placed.add(pkg.name);
    }
  }

  return ordered;
}

const PACKAGES = discoverPackages();

// Release configuration
interface ReleaseConfig {
  version: string;
  previousVersion: string;
  packages: typeof PACKAGES;
  dryRun: boolean;
  skipGit: boolean;
  skipGithub: boolean;
  skipNpm: boolean;
  githubToken?: string;
  npmToken?: string;
}

// Rollback state to track changes
interface RollbackState {
  originalPackageJsons: Map<string, string>;
  createdFiles: string[];
  gitCommitCreated: boolean;
  gitTagCreated: boolean;
  tagName: string;
  originalChangelog?: string;
  originalChangesFile?: string;
}

// Helper to handle user cancellation
function handleCancel(): never {
  kit.outro(prism.yellow('Release cancelled'));
  process.exit(0);
}

async function promptWithCancel<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const result = await fn();
  if (kit.isCancel(result)) {
    handleCancel();
  }
  return result as T;
}

// Helper to read package.json
function readPackageJson(path: string): any {
  return JSON.parse(readFileSync(join(path, 'package.json'), 'utf8'));
}

// Helper to write package.json
function writePackageJson(path: string, data: any): void {
  writeFileSync(join(path, 'package.json'), JSON.stringify(data, null, 2) + '\n');
}

// Helper to parse CHANGES.md and return its content as is
async function parseChangesFile(): Promise<string | null> {
  const changesPath = 'CHANGES.md';
  if (!existsSync(changesPath)) {
    return null;
  }

  const content = readFileSync(changesPath, 'utf8');
  if (!content.trim()) {
    return null;
  }

  // Simply return the content as is
  return content.trim();
}

// // Helper to update CHANGELOG.md with new release
// async function updateChangelog(version: string, content: string): Promise<void> {
//   const changelogPath = 'CHANGELOG.md';
//   const changelog = readFileSync(changelogPath, 'utf8');

//   // Find the marker
//   const marker = '<!-- CHANGELOG-INSERT-MARKER -->';
//   const markerIndex = changelog.indexOf(marker);

//   if (markerIndex === -1) {
//     throw new Error('CHANGELOG.md is missing the insert marker');
//   }

//   // Find the end of the marker section (next line after marker comments)
//   const afterMarker = changelog.indexOf('\n\n', markerIndex) + 2;

//   // Format date
//   const date = new Date().toISOString().split('T')[0];

//   // Create new release entry
//   const newEntry = `## [${version}] - ${date}\n\n${content}\n\n`;

//   // Insert new entry after marker
//   const updatedChangelog =
//     changelog.slice(0, afterMarker) +
//     newEntry +
//     changelog.slice(afterMarker);

//   writeFileSync(changelogPath, updatedChangelog);
// }

const REPO_URL = 'https://github.com/xec-sh/xec';

/**
 * Publish one package, surviving a registry that is briefly unwell.
 *
 * A release that dies halfway leaves some packages published and some not, and
 * that cannot be undone — npm will not let a version be republished. So a 503,
 * a reset connection or a rate-limit has to be waited out rather than aborted
 * on. A version that is already published is a different thing entirely: it
 * means this release has run before, and retrying cannot help.
 *
 * The timeout matters as much as the retry. Without one, a publish that hangs
 * on a half-open socket hangs the release, and the operator finds out by
 * noticing that nothing has happened for an hour.
 */
/**
 * The one-time password for this release, shared across its packages.
 *
 * An account whose 2FA covers publishes rejects every publish that lacks an
 * OTP. Codes rotate every ~30 seconds and each is single-use, so one code
 * may cover the next package or may not — the flow below asks again exactly
 * when npm says so, rather than predicting.
 */
let npmOtp: string | null = null;

const NPM_OTP_ERROR = /EOTP|one-time password/i;
const NPM_CONFLICT = /EPUBLISHCONFLICT|previously published|cannot publish over/i;

async function publishToNpm(pkg: { name: string; path: string }, s: any): Promise<void> {
  // Two loops with different audiences. The inner retry waits out a registry
  // that is briefly unwell — a 503 or a reset connection. The outer loop
  // talks to the human: an OTP rejection is not transient and no amount of
  // backoff produces a fresh code, so it is excluded from the retry and
  // answered with a prompt instead. The previous run burned all three
  // attempts on EOTP and then died.
  for (let otpRound = 0; ; otpRound++) {
    try {
      await retry(
        async () => {
          const command = npmOtp
            ? $`pnpm --filter ${pkg.name} publish --access public --no-git-checks --otp ${npmOtp}`
            : $`pnpm --filter ${pkg.name} publish --access public --no-git-checks`;

          const result = await command.timeout('5m').nothrow();

          if (!result.ok) {
            // stdall keeps npm's diagnostics in the order they were printed;
            // stdout and stderr separately would scramble the explanation.
            throw new Error(`${pkg.name}: ${result.stdall.trim() || `exit ${result.exitCode}`}`);
          }
        },
        {
          maxAttempts: 3,
          initialDelay: 5_000,
          multiplier: 2,
          retryOn: error => !NPM_CONFLICT.test(error.message) && !NPM_OTP_ERROR.test(error.message),
          onRetry: (attempt, _error, delay) => {
            kit.log.warn(`${pkg.name}: attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`);
          },
        }
      );
      return;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      if (NPM_OTP_ERROR.test(message) && otpRound < 3) {
        s.stop(npmOtp
          ? '⚠️  The one-time password was rejected (used or expired)'
          : '⚠️  NPM requires a one-time password for publishing');

        npmOtp = await promptWithCancel(() => kit.password({
          message: `One-time password from your authenticator (${pkg.name}):`,
        }));

        s.start(`Publishing ${pkg.name}...`);
        continue;
      }

      throw error;
    }
  }
}

/**
 * Make sure npm publishing can succeed before anything is mutated.
 *
 * The check used to live inside the publish step — after versions were
 * written, packages built and the release commit tagged — and the login it
 * offered ran through the engine's default piped stdio with a 30-second
 * timeout. `npm login` is a conversation with a human and a browser: it got
 * no terminal, timed out, and took the half-made release down with it.
 *
 * Interactive commands run through $.interactive(), which inherits the real
 * stdin/stdout, and with no timeout — a human flow takes as long as the
 * human takes. The spinner stops first: its repaints fight the login prompt
 * for the same terminal.
 */
async function ensureNpmAuth(config: ReleaseConfig, s: any): Promise<void> {
  if (config.skipNpm || config.dryRun || config.npmToken) return;

  const whoami = await $`npm whoami`.nothrow();
  if (whoami.ok) {
    kit.log.info(`NPM: authenticated as ${whoami.stdout.trim()}`);

    // Say up front when 2FA covers publishes: every package will ask for a
    // one-time password, and an automation token (--npm-token) skips that.
    const profile = await $`npm profile get --json`.timeout('30s').nothrow();
    if (profile.ok) {
      try {
        const tfa = String(JSON.parse(profile.stdout)['two-factor auth'] ?? '');
        if (/writes/i.test(tfa)) {
          kit.log.info('NPM 2FA covers publishes: have your authenticator ready — each package may ask for a one-time password. An automation token (--npm-token) avoids this.');
        }
      } catch { /* profile output is informational only */ }
    }
    return;
  }

  const authMethod = await promptWithCancel(() => kit.select({
    message: 'Not authenticated to NPM. How would you like to authenticate?',
    options: [
      { value: 'browser', label: 'Run npm login (interactive)' },
      { value: 'token', label: 'Enter NPM token' },
      { value: 'skip', label: 'Skip NPM publishing' }
    ]
  }));

  if (authMethod === 'browser') {
    s.stop('Handing the terminal to npm login…');
    const login = await $.interactive()`npm login`.timeout(0).nothrow();

    if (!login.ok) {
      throw new Error('npm login failed; nothing has been changed yet');
    }

    const verify = await $`npm whoami`.nothrow();
    if (!verify.ok) {
      throw new Error('npm login reported success but npm whoami still fails');
    }
    kit.log.success(`NPM: authenticated as ${verify.stdout.trim()}`);
  } else if (authMethod === 'token') {
    config.npmToken = await promptWithCancel(() => kit.password({
      message: 'Enter NPM authentication token:'
    }));
  } else {
    config.skipNpm = true;
  }
}

/** The same contract for GitHub: verified before anything is mutated. */
async function ensureGithubAuth(config: ReleaseConfig, s: any): Promise<void> {
  if (config.skipGithub || config.dryRun || config.githubToken) return;

  const ghExists = await $`which gh`.nothrow();
  if (!ghExists.ok) {
    kit.log.warn('gh CLI not installed — GitHub release will be skipped. https://cli.github.com');
    config.skipGithub = true;
    return;
  }

  const status = await $`gh auth status`.nothrow();
  if (status.ok) return;

  const authMethod = await promptWithCancel(() => kit.select({
    message: 'Not authenticated to GitHub. How would you like to authenticate?',
    options: [
      { value: 'browser', label: 'Run gh auth login (interactive)' },
      { value: 'token', label: 'Enter GitHub token' },
      { value: 'skip', label: 'Skip GitHub release' }
    ]
  }));

  if (authMethod === 'browser') {
    s.stop('Handing the terminal to gh auth login…');
    const login = await $.interactive()`gh auth login`.timeout(0).nothrow();

    if (!login.ok) {
      throw new Error('gh auth login failed; nothing has been changed yet');
    }
  } else if (authMethod === 'token') {
    config.githubToken = await promptWithCancel(() => kit.password({
      message: 'Enter GitHub personal access token:'
    }));
  } else {
    config.skipGithub = true;
  }
}

interface ParsedCommit {
  hash: string;
  /** The original subject, kept so it can be matched against CHANGELOG.md. */
  rawSubject: string;
  /** Conventional type, or 'other' when the subject does not follow it. */
  type: string;
  scope: string | null;
  subject: string;
  breaking: boolean;
  /** The text after a `BREAKING CHANGE:` footer, when there is one. */
  breakingNote: string | null;
}

const CONVENTIONAL_COMMIT = /^(\w+)(?:\(([^)]*)\))?(!)?:\s*(.+)$/;

const KNOWN_TYPES = new Set([
  'feat', 'fix', 'perf', 'refactor', 'docs',
  'test', 'build', 'ci', 'chore', 'style', 'revert',
]);

const SECTIONS: readonly { types: readonly string[]; title: string }[] = [
  { types: ['feat'], title: '### Features' },
  { types: ['fix'], title: '### Bug Fixes' },
  { types: ['perf'], title: '### Performance' },
  { types: ['refactor'], title: '### Refactoring' },
  { types: ['docs'], title: '### Documentation' },
  { types: ['test'], title: '### Tests' },
  { types: ['build', 'ci', 'chore', 'style', 'revert'], title: '### Maintenance' },
  { types: ['other'], title: '### Other Changes' },
];

/**
 * The tag the notes should be written against.
 *
 * Takes the highest `v*` tag by semver rather than asking git. `git describe`
 * walks back from HEAD and returns whichever tag is nearest in topology, which
 * silently produces the wrong range the moment a tag lands on an unexpected
 * commit. Releasing a stable version skips prerelease tags, so the notes cover
 * the whole rc period rather than only the part after the last rc.
 */
async function findBaseTag(newVersion: string): Promise<string | null> {
  const listed = await $`git tag --list v*`.nothrow();
  if (!listed.ok) return null;

  const wantStable = !newVersion.includes('-');
  const parse = (tag: string) => semver.valid(tag.slice(1));

  const candidates = listed.stdout
    .split('\n')
    .map(line => line.trim())
    .filter(tag => parse(tag) !== null)
    .filter(tag => (wantStable ? !semver.prerelease(tag.slice(1)) : true))
    .filter(tag => semver.lt(tag.slice(1), newVersion));

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => semver.rcompare(a.slice(1), b.slice(1)))[0] ?? null;
}

/**
 * Every commit since the base tag, parsed.
 *
 * Fields are separated by unit and record separators rather than newlines,
 * because a commit body is multi-line and a line-oriented format silently
 * drops it — which is where `BREAKING CHANGE:` lives.
 */
async function readCommitsSince(baseTag: string | null): Promise<ParsedCommit[]> {
  const range = baseTag ? `${baseTag}..HEAD` : 'HEAD';
  const log = await $`git log ${range} --format=%H%x1f%s%x1f%b%x1e`.nothrow();

  if (!log.ok) return [];

  const commits: ParsedCommit[] = [];

  for (const record of log.stdout.split('\x1e')) {
    const [rawHash = '', rawSubjectField = '', body = ''] = record.split('\x1f');
    const hash = rawHash.trim();
    const rawSubject = rawSubjectField.trim();

    if (!hash || !rawSubject) continue;
    // A merge says nothing a reader wants, and the release commit itself
    // would reappear in the next release's notes.
    if (rawSubject.startsWith('Merge ')) continue;
    if (rawSubject.startsWith('chore(release)')) continue;

    const match = CONVENTIONAL_COMMIT.exec(rawSubject);

    let type = 'other';
    let scope: string | null = null;
    let subject = rawSubject;

    if (match) {
      const parsedType = (match[1] ?? '').toLowerCase();
      if (KNOWN_TYPES.has(parsedType)) type = parsedType;

      const parsedScope = (match[2] ?? '').trim();
      scope = parsedScope === '' ? null : parsedScope;

      const parsedSubject = (match[4] ?? '').trim();
      subject = parsedSubject === '' ? rawSubject : parsedSubject;
    }

    const footer = /^BREAKING[ -]CHANGES?:?[ \t]*(.*)$/m.exec(body);
    const note = (footer?.[1] ?? '').trim();

    commits.push({
      hash,
      rawSubject,
      type,
      scope,
      subject,
      breaking: Boolean(match?.[3]) || footer !== null,
      breakingNote: note === '' ? null : note,
    });
  }

  return commits;
}

/** Packages whose files changed in the range, so the notes say what moved. */
async function collectAffectedPackages(baseTag: string | null): Promise<string[]> {
  if (!baseTag) return [];

  const diff = await $`git diff --name-only ${baseTag}..HEAD`.nothrow();
  if (!diff.ok) return [];

  const files = diff.stdout.split('\n').filter(Boolean);

  return PACKAGES
    .filter(pkg => files.some(file => file.startsWith(`${pkg.path}/`)))
    .map(pkg => pkg.name)
    .sort();
}

function formatCommit(commit: ParsedCommit): string {
  const scope = commit.scope ? `**${commit.scope}:** ` : '';
  return `- ${scope}${commit.subject} (${commit.hash.slice(0, 7)})`;
}

/** Cluster entries by scope; unscoped ones go last. */
function byScope(commits: ParsedCommit[]): ParsedCommit[] {
  return [...commits].sort((a, b) => {
    if (a.scope === b.scope) return 0;
    if (a.scope === null) return 1;
    if (b.scope === null) return -1;
    return a.scope.localeCompare(b.scope);
  });
}

/**
 * Release notes built from the commits themselves.
 *
 * The previous version matched `line.includes('feat:')`, so a commit whose
 * subject merely mentioned another type landed in the wrong section, scopes
 * were dropped, breaking changes were invisible, and an empty range produced
 * "Various improvements and bug fixes" — a sentence that tells a reader
 * deciding whether to upgrade precisely nothing.
 */
async function generateChangelog(fromVersion: string, toVersion: string): Promise<string> {
  const baseTag = await findBaseTag(toVersion) ?? (fromVersion ? `v${fromVersion}` : null);

  // Anything already written up is a tag that landed on the wrong commit
  // resurfacing released work; drop it rather than repeat it.
  const released = existsSync('CHANGELOG.md') ? readFileSync('CHANGELOG.md', 'utf8') : '';
  const commits = (await readCommitsSince(baseTag))
    .filter(commit => !released.includes(commit.rawSubject));

  const affected = await collectAffectedPackages(baseTag);

  let notes = '';

  const header: string[] = [];
  if (affected.length > 0) header.push(`Packages: ${affected.join(', ')}`);
  if (baseTag) {
    header.push(`[${baseTag}...v${toVersion}](${REPO_URL}/compare/${baseTag}...v${toVersion})`);
  }
  if (header.length > 0) notes += `_${header.join(' · ')}_\n\n`;

  const breaking = commits.filter(commit => commit.breaking);
  if (breaking.length > 0) {
    notes += '### BREAKING CHANGES\n\n';
    for (const commit of byScope(breaking)) {
      notes += `${formatCommit(commit)}\n`;
      if (commit.breakingNote) notes += `  - ${commit.breakingNote}\n`;
    }
    notes += '\n';
  }

  for (const section of SECTIONS) {
    const items = commits.filter(commit => section.types.includes(commit.type));
    if (items.length === 0) continue;

    notes += `${section.title}\n\n`;
    for (const commit of byScope(items)) notes += `${formatCommit(commit)}\n`;
    notes += '\n';
  }

  if (commits.length === 0) notes += '- No user-facing changes recorded.\n';

  return `${notes.trimEnd()}\n`;
}


// Safe rollback function - optimized with parallel operations
async function performRollback(state: RollbackState, config: ReleaseConfig): Promise<void> {
  const s = kit.spinner();
  s.start('Performing safe rollback...');

  try {
    // Parallel file operations
    const fileOps: (Promise<void>)[] = [];

    // Restore package.json files
    for (const [path, content] of state.originalPackageJsons.entries()) {
      fileOps.push((async () => writeFileSync(path, content))());
    }

    // Restore other files
    if (state.originalChangelog) {
      fileOps.push((async () => writeFileSync('CHANGELOG.md', state.originalChangelog!))());
    }
    if (state.originalChangesFile) {
      fileOps.push((async () => writeFileSync('CHANGES.md', state.originalChangesFile!))());
    }

    // Execute file restores in parallel
    await Promise.all(fileOps);

    // The release commit goes first, and it goes hard. This line used to be
    // commented out, so a "successful" rollback deleted the tag and restored
    // the files while the release commit stayed in history — half a rollback
    // reported as a whole one. --hard, because the commit contains exactly
    // the version changes this rollback exists to undo; a --soft reset would
    // leave them staged over the restored files.
    if (state.gitCommitCreated && !config.skipGit) {
      const reset = await $`git reset --hard HEAD~1`.nothrow();
      if (!reset.ok) {
        throw new Error(`git reset failed: ${reset.stderr.trim()}`);
      }
    }

    // Remove created files and the tag in parallel
    const cleanupOps = [
      ...state.createdFiles.map(file =>
        $`test -f ${file} && rm -f ${file} || true`.nothrow()
      ),
      ...(state.gitTagCreated && state.tagName ? [$`git tag -d ${state.tagName}`.nothrow()] : []),
    ];

    await $.parallel.settled(cleanupOps, { maxConcurrency: 5 });

    s.stop('✅ Rollback completed successfully');
  } catch (error) {
    s.stop('⚠️  Rollback completed with warnings');
    console.error('Some rollback operations failed:', error);
  }
}

export function command(program: Command): void {
  program
    .command('release [version]')
    .description('Version, publish and tag the xec packages')
    .option('-d, --dry-run', 'Perform a dry run without making changes')
    .option('--skip-git', 'Skip git operations (commit, tag, push)')
    .option('--skip-github', 'Skip GitHub release creation')
    .option('--skip-npm', 'Skip NPM publishing')
    .option('--npm-token <token>', 'NPM authentication token')
    .option('--github-token <token>', 'GitHub authentication token')
    .option('--prerelease <tag>', 'Create a prerelease version (alpha, beta, rc)')
    .option('--config <path>', 'Path to release configuration file')
    .action(async (version: string | undefined, options: any) => {
      // Load dependencies
      if (!semver) {
        semver = await use('npm:semver@7');
      }

      const s = kit.spinner();
      const rollbackState: RollbackState = {
        originalPackageJsons: new Map(),
        createdFiles: [],
        gitCommitCreated: false,
        gitTagCreated: false,
        tagName: ''
      };
      let usedChangesFile = false;

      kit.intro(prism.bgMagenta(prism.black(' xec release ')));
      kit.log.info(prism.dim('Press ESC at any prompt to cancel safely'));

      let config: ReleaseConfig = {
        version: '',
        previousVersion: '',
        packages: [],
        dryRun: false,
        skipGit: false,
        skipGithub: false,
        skipNpm: false,
        githubToken: '',
        npmToken: '',
      };

      try {
        // Load configuration file if specified
        let fileConfig: any = {};
        if (options.config) {
          try {
            const configContent = readFileSync(options.config, 'utf8');
            fileConfig = JSON.parse(configContent);
            kit.log.info(`Loaded configuration from ${options.config}`);
          } catch (error) {
            kit.log.warn(`Failed to load config file: ${options.config}`);
          }
        } else if (existsSync('.xec-release.json')) {
          try {
            const configContent = readFileSync('.xec-release.json', 'utf8');
            fileConfig = JSON.parse(configContent);
            kit.log.info('Loaded configuration from .xec-release.json');
          } catch { }
        }

        // Merge file config with command options
        options = { ...fileConfig, ...options };

        // Step 1: Check repository state
        s.start('Checking repository state...');

        // Check if we're in the root directory
        if (!existsSync('turbo.json')) {
          s.stop('❌ Not in project root');
          kit.outro(prism.red('Please run this command from the project root'));
          process.exit(1);
        }

        // Store original package.json contents for rollback
        for (const pkg of PACKAGES) {
          const packageJsonPath = join(pkg.path, 'package.json');
          if (existsSync(packageJsonPath)) {
            rollbackState.originalPackageJsons.set(packageJsonPath, readFileSync(packageJsonPath, 'utf8'));
          }
        }

        // Check git status and branch in parallel
        const [gitStatus, branchResult] = await $.parallel.all([
          `git status --porcelain`,
          `git branch --show-current`
        ]);

        const currentBranch = branchResult?.stdout.trim();

        if (gitStatus?.stdout.trim() && !options.dryRun) {
          s.stop('❌ Working directory not clean');
          const proceed = await promptWithCancel(() => kit.confirm({
            message: 'Working directory has uncommitted changes. Continue anyway?',
            initialValue: false
          }));
          if (!proceed) {
            handleCancel();
          }
        }

        if (currentBranch !== 'main' && !options.dryRun) {
          s.stop(`⚠️  Not on main branch (current: ${currentBranch})`);
          const proceed = await promptWithCancel(() => kit.confirm({
            message: 'You are not on the main branch. Continue anyway?',
            initialValue: false
          }));
          if (!proceed) {
            handleCancel();
          }
        }

        s.stop('✅ Repository state checked');

        // Step 2: Collect all release parameters
        kit.log.info(prism.bold('📋 Release Configuration'));

        const currentPkg = readPackageJson('packages/core');
        const currentVersion = currentPkg.version;

        // Determine version
        let newVersion = version;
        if (!newVersion) {
          const versionType = await promptWithCancel(() => kit.select({
            message: `Select version type (current: ${currentVersion})`,
            options: [
              { value: 'patch', label: `Patch (${semver.inc(currentVersion, 'patch')})` },
              { value: 'minor', label: `Minor (${semver.inc(currentVersion, 'minor')})` },
              { value: 'major', label: `Major (${semver.inc(currentVersion, 'major')})` },
              { value: 'prerelease', label: `Prerelease (${semver.inc(currentVersion, 'prerelease', options.prerelease || 'alpha')})` },
              { value: 'keep', label: `Keep unchanged (${currentVersion})` },
              { value: 'custom', label: 'Custom version' }
            ]
          }));

          if (versionType === 'keep') {
            newVersion = currentVersion;
          } else if (versionType === 'custom') {
            newVersion = await promptWithCancel(() => kit.text({
              message: 'Enter custom version:',
              validate: (value) => {
                if (!semver.valid(value)) {
                  return 'Invalid semver version';
                }
                if (semver.lt(value, currentVersion)) {
                  return `Version must be greater than or equal to ${currentVersion}`;
                }
              }
            }));
          } else if (versionType === 'prerelease') {
            const prereleaseType = options.prerelease || await promptWithCancel(() => kit.select({
              message: 'Select prerelease type:',
              options: [
                { value: 'alpha', label: 'Alpha' },
                { value: 'beta', label: 'Beta' },
                { value: 'rc', label: 'Release Candidate' }
              ]
            }));
            newVersion = semver.inc(currentVersion, 'prerelease', prereleaseType);
          } else {
            newVersion = semver.inc(currentVersion, versionType as any);
          }
        }

        // Validate version
        if (!semver.valid(newVersion)) {
          kit.note(prism.red(`Invalid version: ${newVersion}`));
          process.exit(1);
        }

        // Equal is allowed on purpose: every step downstream is idempotent
        // (no-change commit is skipped, an existing tag is reused, an
        // already-published npm version counts as success), so re-running
        // the same version resumes a release that died mid-flight instead
        // of forcing manual surgery. Backwards is never allowed.
        if (semver.lt(newVersion!, currentVersion)) {
          kit.note(prism.red(`Version ${newVersion} is below the current ${currentVersion}`));
          process.exit(1);
        }
        if (semver.eq(newVersion!, currentVersion)) {
          kit.log.info(`Version ${newVersion} is already current — completing an unfinished release.`);
        }

        // Create release config
        config = {
          version: newVersion!,
          previousVersion: currentVersion,
          packages: PACKAGES,
          dryRun: options.dryRun,
          skipGit: options.skipGit,
          skipGithub: options.skipGithub,
          skipNpm: options.skipNpm,
          githubToken: options.githubToken,
          npmToken: options.npmToken,
        };

        rollbackState.tagName = `v${config.version}`;

        // A dry run's whole purpose is to show what would happen, so echo
        // every command as it is built. Secrets are masked before they reach
        // the echo, so a token passed on the command line does not appear.
        if (config.dryRun) {
          $.verbose = true;
        }

        // Show release plan
        const planContent = [
          `Version: ${prism.green(currentVersion)} → ${prism.green(newVersion)}`,
          '',
          'Packages to release:',
          ...PACKAGES.map(pkg => `  - ${pkg.name}`),
          ''
        ];

        if (!config.skipGit) {
          planContent.push(
            'Git operations:',
            '  - Update package versions',
            `  - Create commit: "chore: release v${config.version}"`,
            `  - Create tag: v${config.version}`,
            '  - Push to origin',
            ''
          );
        }

        if (!config.skipGithub) {
          planContent.push(
            'GitHub:',
            `  - Create release for v${config.version}`,
            ''
          );
        }

        if (!config.skipNpm) {
          planContent.push(
            'NPM:',
            '  - Publish all packages',
            ''
          );
        }

        if (config.dryRun) {
          planContent.push(prism.yellow('🔸 DRY RUN MODE - No changes will be made'));
        }

        kit.box(planContent.join('\n'), '📋 Release Plan', { width: 'auto' });

        const proceed = await promptWithCancel(() => kit.confirm({
          message: 'Proceed with release?',
          initialValue: true
        }));

        if (!proceed) {
          handleCancel();
        }

        // Execute pre-release hook if defined
        if (fileConfig.hooks?.preRelease && !config.dryRun) {
          s.start('Running pre-release hook...');
          const hookResult = await $.raw`${fileConfig.hooks.preRelease}`.nothrow();

          if (hookResult.exitCode !== 0) {
            s.stop('⚠️  Pre-release hook failed');
            const continueAnyway = await promptWithCancel(() => kit.confirm({
              message: 'Pre-release hook failed. Continue anyway?',
              initialValue: false
            }));
            if (!continueAnyway) {
              handleCancel();
            }
          } else {
            s.stop('✅ Pre-release hook completed');
          }
        }

        // Credentials are proven before the first mutation. Discovering a
        // dead login after versions are written and the tag is cut is how the
        // previous release died mid-flight.
        await ensureNpmAuth(config, s);
        await ensureGithubAuth(config, s);

        // Now apply all changes after collecting parameters
        kit.log.info(prism.bold('\nStarting the release\n'));

        // Step 3: Update versions
        s.start('Updating package versions...');

        if (!config.dryRun) {
          // Only the version moves. Internal dependencies stay on
          // `workspace:*` — pnpm publish rewrites them to the real version in
          // the tarball, which is the only place the number belongs. The old
          // rewrite baked `^x.y.z` into the source tree: every frozen-lockfile
          // install then failed with ERR_PNPM_OUTDATED_LOCKFILE, and local
          // development quietly resolved sibling packages from the registry
          // instead of the workspace.
          for (const pkg of config.packages) {
            const packageJson = readPackageJson(pkg.path);
            packageJson.version = config.version;
            writePackageJson(pkg.path, packageJson);
          }
        }

        s.stop('✅ Package versions updated');

        // // Step 3.5: Update CHANGELOG.md from CHANGES.md
        // s.start('Updating CHANGELOG...');

        // let changelogContent = '';

        // if (!config.dryRun) {
        //   // Parallel file reads for better performance
        //   const [changelogExists, changesExists] = await $.parallel.settled([
        //     `test -f CHANGELOG.md && echo true || echo false`,
        //     `test -f CHANGES.md && echo true || echo false`
        //   ]).then(r => r.results.map(res =>
        //     res instanceof Error ? false : res.stdout.trim() === 'true'
        //   ));

        //   // Save originals in parallel if they exist
        //   const backupTasks: (Promise<void>)[] = [];
        //   if (changelogExists) {
        //     backupTasks.push((async () => {
        //       rollbackState.originalChangelog = readFileSync('CHANGELOG.md', 'utf8');
        //     })());
        //   }
        //   if (changesExists) {
        //     backupTasks.push((async () => {
        //       rollbackState.originalChangesFile = readFileSync('CHANGES.md', 'utf8');
        //     })());
        //   }
        //   await Promise.all(backupTasks);

        //   // Try CHANGES.md first
        //   const changesContent = await parseChangesFile();
        //   if (changesContent) {
        //     changelogContent = changesContent;
        //     usedChangesFile = true;
        //     kit.log.info('Using content from CHANGES.md for changelog');
        //   } else {
        //     // Fallback to git commits
        //     changelogContent = await generateChangelog(config.previousVersion, config.version);
        //     kit.log.info('Generated changelog from git commits');
        //   }

        //   // Update CHANGELOG.md
        //   try {
        //     await updateChangelog(config.version, changelogContent);
        //     s.stop('✅ CHANGELOG.md updated');
        //   } catch (error) {
        //     s.stop('⚠️  Failed to update CHANGELOG.md');
        //     kit.log.warn('Could not update CHANGELOG.md: ' + error);
        //   }
        // } else {
        //   s.stop('✅ CHANGELOG.md update skipped (dry run)');
        // }

        // Step 4: Build everything that is about to be published.
        //
        // Publishing dist as it happens to lie on disk ships whatever the
        // last manual build produced — stale artifacts shaped exactly like a
        // release. Versions were just written into package.json (step 3), so
        // this build also bakes the new version into the tarballs. The build
        // runs tsc, so it is the typecheck gate too. Dry runs build as well:
        // a dry run that skips the step it exists to rehearse proves nothing.
        s.start('Building packages...');

        const buildResult = await $`pnpm build`.timeout('10m').nothrow();

        if (!buildResult.ok) {
          s.stop('❌ Build failed');
          const tail = buildResult.stdall.trim().split('\n').slice(-15).join('\n');
          kit.log.error(tail);
          if (!config.dryRun) {
            await performRollback(rollbackState, config);
          }
          throw new Error('Build failed; nothing was published');
        }

        s.stop('✅ Packages built');

        // Step 5: Git operations
        if (!config.skipGit && !config.dryRun) {
          s.start('Creating git commit and tag...');

          // Now add files after all changes are made
          await $`git add .`;

          // Check if there are any changes to commit
          const hasChanges = await $`git diff --cached --exit-code`.nothrow().then(r => r.exitCode !== 0);

          if (hasChanges) {
            await $`git commit -m "chore: release v${config.version}"`;
            rollbackState.gitCommitCreated = true;
          } else {
            kit.log.info('No changes to commit');
          }

          // Check if tag already exists
          const tagExists = await $`git tag -l v${config.version}`.then(r => r.stdout.trim() !== '');

          if (tagExists) {
            s.stop(`⚠️  Tag v${config.version} already exists`);
            const overwriteTag = await promptWithCancel(() => kit.confirm({
              message: `Tag v${config.version} already exists. Delete and recreate it?`,
              initialValue: false
            }));

            if (overwriteTag) {
              // Delete existing tag locally
              await $`git tag -d v${config.version}`;
              // Delete remote tag if it exists
              await $`git push origin :refs/tags/v${config.version}`.nothrow();
              // Create new tag
              await $`git tag -a v${config.version} -m "Release v${config.version}"`;
              rollbackState.gitTagCreated = true;
            } else {
              // Skip tag creation but continue with release
              kit.log.info(`Using existing tag v${config.version}`);
            }
          } else {
            // Create new tag
            await $`git tag -a v${config.version} -m "Release v${config.version}"`;
            rollbackState.gitTagCreated = true;
          }

          s.stop('✅ Git commit and tag created');
        }

        // Step 6: NPM publishing
        if (!config.skipNpm && !config.dryRun) {
          s.start('Publishing to NPM...');

          // Authentication was proven in preflight, before any mutation.
          // A cheap re-verify guards the window between the two; failing hard
          // here is right, because prompting for a login mid-mutation is how
          // the previous release wedged.
          if (!config.npmToken) {
            const npmWhoami = await $`npm whoami`.nothrow();
            if (!npmWhoami.ok) {
              throw new Error('NPM authentication was lost after preflight; aborting before publish');
            }
          }

          if (!config.skipNpm) {
            // Update .npmrc if token provided
            if (config.npmToken) {
              const npmrcPath = join(process.cwd(), '.npmrc');

              // Check if .npmrc already exists and save original content
              let originalNpmrc: string | null = null;

              if (existsSync(npmrcPath)) {
                originalNpmrc = readFileSync(npmrcPath, 'utf8');
              } else {
                rollbackState.createdFiles.push(npmrcPath);
              }

              try {
                // Create .npmrc with auth token
                const npmrcContent = `//registry.npmjs.org/:_authToken=${config.npmToken}\n`;
                writeFileSync(npmrcPath, npmrcContent);

                // Core packages must be published first
                const corePackages = config.packages.filter(p => p.name === '@xec-sh/core');
                const otherPackages = config.packages.filter(p => p.name !== '@xec-sh/core');

                // Core first: the others depend on it, and npm has to have
                // the packument before a dependant referencing it can go up.
                if (corePackages[0]) {
                  s.start(`Publishing ${corePackages[0].name}...`);
                  await publishToNpm(corePackages[0], s);

                  s.start('Waiting for NPM to process the package...');
                  await sleep(5_000);
                }

                // Sequential on purpose: publishing these concurrently makes
                // npm reject some with "Failed to save packument".
                for (let i = 0; i < otherPackages.length; i++) {
                  const pkg = otherPackages[i];
                  if (!pkg) continue;

                  s.start(`Publishing ${pkg.name}... (${i + 1}/${otherPackages.length})`);
                  await publishToNpm(pkg, s);

                  // Space the requests out; npm rate-limits a burst.
                  if (i < otherPackages.length - 1) await sleep(3_000);
                }

                s.stop(`✅ Published ${config.packages.length} packages to NPM`);
              } catch (error) {
                console.error(error);
                s.stop('❌ NPM publishing failed');
                throw error;
              } finally {
                // Clean up .npmrc
                if (originalNpmrc !== null) {
                  // Restore original content
                  writeFileSync(npmrcPath, originalNpmrc);
                } else {
                  // Remove created file
                  try {
                    await $`rm -f ${npmrcPath}`.nothrow();
                  } catch { }
                }
              }
            } else {
              // No token: the login session publishes, and when the account's
              // 2FA covers writes, publishToNpm collects the one-time password
              // at the moment npm demands it. Bare piped publishes died here —
              // npm's OTP prompt never reached a terminal.
              for (const pkg of config.packages) {
                s.start(`Publishing ${pkg.name}...`);
                await publishToNpm(pkg, s);
              }
            }

            s.stop('✅ Published to NPM');
          }
        }

        // Step 7: Push to GitHub
        if (!config.skipGit && !config.dryRun) {
          s.start('Pushing to GitHub...');

          // Push branch and tag in parallel
          const pushCommands = [`git push origin ${currentBranch}`];

          // Only push tag if it was created or updated
          if (rollbackState.gitTagCreated) {
            pushCommands.push(`git push origin v${config.version}`);
          }

          await $.parallel.all(pushCommands);

          s.stop('✅ Pushed to GitHub');
        }

        // Step 8: Create GitHub release
        if (!config.skipGithub && !config.dryRun) {
          s.start('Creating GitHub release...');

          // Check if gh CLI is installed
          const ghCheck = await $`which gh`.nothrow();
          if (ghCheck.exitCode !== 0) {
            s.stop('⚠️  GitHub CLI not installed');
            kit.log.warn('Install gh CLI to create GitHub releases: https://cli.github.com');
          } else {
            // Proven in preflight; re-verify and fail hard, as with npm.
            // Prompting for a login mid-mutation is how the previous release
            // wedged.
            const ghAuth = await $`gh auth status`.nothrow();
            if (!ghAuth.ok && !config.githubToken) {
              throw new Error('GitHub authentication was lost after preflight; aborting before the GitHub release');
            }

            if (!config.skipGithub) {
              // Generate release notes with changelog
              const isPrerelease = config.version.includes('-');
              const changelog = await generateChangelog(config.previousVersion, config.version);

              const releaseNotes = `
# Xec v${config.version}

${isPrerelease ? '**This is a pre-release version.**\n' : ''}

## Packages

${config.packages.map(pkg => `- **${pkg.name}**: v${config.version}`).join('\n')}

## Installation

\`\`\`bash
# NPM
npm install -g @xec-sh/cli
npm install @xec-sh/core

# pnpm
pnpm add -g @xec-sh/cli
pnpm add @xec-sh/core

# Deno
deno add npm:@xec-sh/core
\`\`\`

## 🔄 What's Changed

${changelog}

## 📚 Documentation

- [Getting Started](https://xec.sh/docs/getting-started)
- [API Reference](https://xec.sh/docs/api)
- [Examples](https://github.com/xec-sh/xec/tree/main/examples)

---

Created with ❤️ by Xec Release Manager
`;

              // Check if release already exists
              const releaseExists = await $`gh release view v${config.version}`.nothrow().then(r => r.exitCode === 0);

              if (releaseExists) {
                kit.log.warn(`GitHub release v${config.version} already exists`);
                const updateRelease = await promptWithCancel(() => kit.confirm({
                  message: `Release v${config.version} already exists. Update it?`,
                  initialValue: true
                }));

                if (!updateRelease) {
                  kit.log.info('Skipping GitHub release update');
                } else {
                  // Delete and recreate release
                  await $`gh release delete v${config.version} --yes`.nothrow();

                  // Create release
                  try {
                    if (config.githubToken) {
                      await $.env({ GH_TOKEN: config.githubToken })`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
                    } else {
                      await $`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
                    }
                  } catch (error) {
                    kit.log.error('Failed to create GitHub release');
                    throw error;
                  }
                }
              } else {
                // Create release
                try {
                  if (config.githubToken) {
                    await $.env({ GH_TOKEN: config.githubToken })`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
                  } else {
                    await $`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
                  }
                } catch (error) {
                  kit.log.error('Failed to create GitHub release');
                  throw error;
                }
              }

              s.stop('✅ GitHub release created');
            }
          }
        }

        // Execute post-release hook if defined
        if (fileConfig.hooks?.postRelease && !config.dryRun) {
          s.start('Running post-release hook...');
          const hookResult = await $.env({ RELEASE_VERSION: config.version })
            .raw`${fileConfig.hooks.postRelease}`
            .nothrow();

          s.stop(hookResult.exitCode === 0
            ? '✅ Post-release hook completed'
            : '⚠️  Post-release hook failed (non-critical)'
          );
        }

        // Clear CHANGES.md if we used it
        if (usedChangesFile && !config.dryRun) {
          try {
            writeFileSync('CHANGES.md', '');
            kit.log.info('Cleared CHANGES.md after successful release');
          } catch (error) {
            kit.log.warn('Could not clear CHANGES.md: ' + error);
          }
        }

        // Success!
        kit.outro(prism.green(`
✨ Release v${config.version} completed successfully!

Published packages:
${config.packages.map(p => `  - ${p.name}@${config.version}`).join('\n')}

🔗 Links:
  - NPM: https://www.npmjs.com/package/@xec-sh/core
  - GitHub: https://github.com/xec-sh/xec/releases/tag/v${config.version}

🎉 Happy coding with Xec!
        `));

        // Exit successfully
        process.exit(0);

      } catch (error: any) {
        s.stop('❌ Release failed');
        kit.log.error(error.message);

        // Attempt rollback
        if (!options.dryRun) {
          const rollback = await kit.confirm({
            message: 'Would you like to rollback changes?',
            initialValue: true
          });

          if (kit.isCancel(rollback) || rollback) {
            await performRollback(rollbackState, config);
          }
        }

        kit.outro(prism.red('Release failed'));
        process.exit(1);
      }
    });
}