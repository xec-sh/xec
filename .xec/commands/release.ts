/// <reference path="../../apps/xec/globals.d.ts" />

import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Note: prism is available globally in xec scripts (from script context)
// If not available, fallback to kit.prism
const prism = (globalThis as any).prism || kit.prism;

// Dynamic imports - defer loading until command execution
let semver: any;

// Package configurations
const PACKAGES = [
  { name: '@xec-sh/core', path: 'packages/core' },
  { name: '@xec-sh/cli', path: 'apps/xec' },
  { name: '@xec-sh/kit', path: 'packages/kit' },
  { name: '@xec-sh/loader', path: 'packages/loader' },
  { name: '@xec-sh/testing', path: 'packages/testing' },
];

// Release configuration
interface ReleaseConfig {
  version: string;
  previousVersion: string;
  packages: typeof PACKAGES;
  dryRun: boolean;
  skipGit: boolean;
  skipGithub: boolean;
  skipNpm: boolean;
  skipJsr: boolean;
  githubToken?: string;
  npmToken?: string;
  jsrToken?: string;
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

// Helper to create JSR configuration
function createJsrJson(packageJson: any): any {
  return {
    name: packageJson.name.replace(/^@/, '').replace('/', '-'),
    version: packageJson.version,
    exports: packageJson.main || './dist/index.js',
    publish: {
      include: ['dist/**/*', 'README.md', 'LICENSE'],
      exclude: ['**/*.test.js', '**/*.test.d.ts']
    }
  };
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
async function publishToNpm(pkg: { name: string; path: string }): Promise<void> {
  await retry(
    async () => {
      const result = await $`pnpm --filter ${pkg.name} publish --access public --no-git-checks`
        .timeout('5m')
        .nothrow();

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
      retryOn: error => !/EPUBLISHCONFLICT|previously published|cannot publish over/i.test(error.message),
      onRetry: (attempt, _error, delay) => {
        kit.log.warn(`${pkg.name}: attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`);
      },
    }
  );
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

    // Remove created files and git operations in parallel
    const cleanupOps = [
      // Remove created files
      ...state.createdFiles.map(file =>
        $`test -f ${file} && rm -f ${file} || true`.nothrow()
      ),
      // Git operations
      ...(state.gitTagCreated && state.tagName ? [$`git tag -d ${state.tagName}`.nothrow()] : []),
      // ...(state.gitCommitCreated && !config.skipGit ? [$`git reset --soft HEAD~1`.nothrow()] : [])
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
    .option('--skip-jsr', 'Skip JSR.io publishing')
    .option('--npm-token <token>', 'NPM authentication token')
    .option('--github-token <token>', 'GitHub authentication token')
    .option('--jsr-token <token>', 'JSR.io authentication token')
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
        skipJsr: false,
        githubToken: '',
        npmToken: '',
        jsrToken: '',
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

        // Create release config
        config = {
          version: newVersion!,
          previousVersion: currentVersion,
          packages: PACKAGES,
          dryRun: options.dryRun,
          skipGit: options.skipGit,
          skipGithub: options.skipGithub,
          skipNpm: options.skipNpm,
          skipJsr: options.skipJsr,
          githubToken: options.githubToken,
          npmToken: options.npmToken,
          jsrToken: options.jsrToken,
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

        if (!config.skipJsr) {
          planContent.push(
            'JSR.io:',
            '  - Publish @xec-sh/core and @xec-sh/cli'
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

        // Now apply all changes after collecting parameters
        kit.log.info(prism.bold('\nStarting the release\n'));

        // Step 3: Update versions
        s.start('Updating package versions...');

        if (!config.dryRun) {
          for (const pkg of config.packages) {
            const packageJson = readPackageJson(pkg.path);
            packageJson.version = config.version;

            // Update dependencies to use new versions
            if (packageJson.dependencies) {
              for (const depPkg of config.packages) {
                if (packageJson.dependencies[depPkg.name]) {
                  packageJson.dependencies[depPkg.name] = `^${config.version}`;
                }
              }
            }

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

        // Step 4: Build packages
        // s.start('Building packages...');

        // if (!config.dryRun) {
        //   // Use $.batch for cleaner API with concurrency control
        //   const buildResult = await $.batch(
        //     config.packages.map(pkg => `cd ${pkg.path} && yarn build`),
        //     {
        //       concurrency: 3, // Optimal for most systems
        //       onProgress: (done, total, succeeded, failed) => {
        //         s.start(`Building packages: ${done}/${total} (✓ ${succeeded}, ✗ ${failed})`);
        //       }
        //     }
        //   );

        //   if (buildResult.failed.length > 0) {
        //     s.stop('❌ Build failed');
        //     await performRollback(rollbackState, config);
        //     throw new Error(`Build failed for ${buildResult.failed.length} packages`);
        //   }

        //   s.stop(`✅ Built ${buildResult.succeeded.length} packages successfully`);
        // } else {
        //   s.stop('✅ Package build skipped (dry run)');
        // }

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

          // Check NPM authentication
          const npmWhoami = await $`npm whoami`.nothrow();
          if (npmWhoami.exitCode !== 0 && !config.npmToken) {
            s.stop('⚠️  Not authenticated to NPM');

            const authMethod = await promptWithCancel(() => kit.select({
              message: 'How would you like to authenticate to NPM?',
              options: [
                { value: 'browser', label: 'Open browser to login' },
                { value: 'token', label: 'Enter NPM token' },
                { value: 'skip', label: 'Skip NPM publishing' }
              ]
            }));

            if (authMethod === 'browser') {
              s.start('Opening NPM login...');
              await $`npm login`;
              s.stop('✅ NPM authentication complete');
            } else if (authMethod === 'token') {
              config.npmToken = await promptWithCancel(() => kit.password({
                message: 'Enter NPM authentication token:'
              }));
            } else {
              config.skipNpm = true;
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
                  await publishToNpm(corePackages[0]);

                  s.start('Waiting for NPM to process the package...');
                  await sleep(5_000);
                }

                // Sequential on purpose: publishing these concurrently makes
                // npm reject some with "Failed to save packument".
                for (let i = 0; i < otherPackages.length; i++) {
                  const pkg = otherPackages[i];
                  if (!pkg) continue;

                  s.start(`Publishing ${pkg.name}... (${i + 1}/${otherPackages.length})`);
                  await publishToNpm(pkg);

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
              // Publish without token - use sequential for auth prompts
              for (const pkg of config.packages) {
                kit.log.step(`Publishing ${pkg.name}...`);
                await $`pnpm --filter ${pkg.name} publish --access public --no-git-checks`;
              }
            }

            s.stop('✅ Published to NPM');
          }
        }

        // Step 7: JSR.io publishing
        if (!config.skipJsr && !config.dryRun) {
          s.start('Publishing to JSR.io...');

          // Only publish core and cli to JSR
          const jsrPackages = config.packages.filter(p =>
            p.name === '@xec-sh/core' || p.name === '@xec-sh/cli'
          );

          // Check deno once for all packages
          const denoExists = await $`which deno`.nothrow().then(r => r.exitCode === 0);

          if (!denoExists) {
            s.stop('⚠️  Deno not installed');
            const installDeno = await promptWithCancel(() => kit.confirm({
              message: 'Deno is required for JSR publishing. Install it now?',
              initialValue: true
            }));

            if (installDeno) {
              s.start('Installing Deno...');
              await $`curl -fsSL https://deno.land/install.sh | sh`;
              s.stop('✅ Deno installed');
            } else {
              config.skipJsr = true;
            }
          }

          if (!config.skipJsr) {
            // Create all jsr.json files in parallel
            await Promise.all(jsrPackages.map(pkg => {
              const packageJson = readPackageJson(pkg.path);
              const jsrJson = createJsrJson(packageJson);
              const jsrJsonPath = join(pkg.path, 'jsr.json');
              writeFileSync(jsrJsonPath, JSON.stringify(jsrJson, null, 2) + '\n');
              rollbackState.createdFiles.push(jsrJsonPath);
            }));

            // Publish packages sequentially with delays
            for (let i = 0; i < jsrPackages.length; i++) {
              const pkg = jsrPackages[i];
              s.start(`Publishing ${pkg?.name} to JSR.io... (${i + 1}/${jsrPackages.length})`);

              // The same reasoning as npm: a registry hiccup mid-release
              // cannot be rolled back, so it is waited out rather than fatal.
              const jsr = config.jsrToken
                ? $.env({ JSR_TOKEN: config.jsrToken }).cd(pkg?.path ?? '')
                : $.cd(pkg?.path ?? '');

              await retry(
                async () => {
                  const result = config.jsrToken
                    ? await jsr`deno publish --token $JSR_TOKEN`.timeout('5m').nothrow()
                    : await jsr`deno publish`.timeout('5m').nothrow();

                  if (!result.ok) {
                    throw new Error(
                      `${pkg?.name}: ${result.stdall.trim() || `exit ${result.exitCode}`}`
                    );
                  }
                },
                {
                  maxAttempts: 3,
                  initialDelay: 5_000,
                  multiplier: 2,
                  retryOn: error => !/already exists|version.*published/i.test(error.message),
                  onRetry: (attempt, _error, delay) => {
                    kit.log.warn(
                      `${pkg?.name}: JSR attempt ${attempt} failed, retrying in ${Math.round(delay / 1000)}s`
                    );
                  },
                }
              );

              // Space the requests out; JSR rate-limits a burst.
              if (i < jsrPackages.length - 1) await sleep(3_000);
            }

            s.stop(`✅ Published ${jsrPackages.length} packages to JSR.io`);
          }
        }

        // Step 8: Push to GitHub
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

        // Step 9: Create GitHub release
        if (!config.skipGithub && !config.dryRun) {
          s.start('Creating GitHub release...');

          // Check if gh CLI is installed
          const ghCheck = await $`which gh`.nothrow();
          if (ghCheck.exitCode !== 0) {
            s.stop('⚠️  GitHub CLI not installed');
            kit.log.warn('Install gh CLI to create GitHub releases: https://cli.github.com');
          } else {
            // Check GitHub authentication
            const ghAuth = await $`gh auth status`.nothrow();
            if (ghAuth.exitCode !== 0 && !config.githubToken) {
              s.stop('⚠️  Not authenticated to GitHub');

              const authMethod = await promptWithCancel(() => kit.select({
                message: 'How would you like to authenticate to GitHub?',
                options: [
                  { value: 'browser', label: 'Open browser to login' },
                  { value: 'token', label: 'Enter GitHub token' },
                  { value: 'skip', label: 'Skip GitHub release' }
                ]
              }));

              if (authMethod === 'browser') {
                s.start('Opening GitHub login...');
                await $`gh auth login`;
                s.stop('✅ GitHub authentication complete');
              } else if (authMethod === 'token') {
                config.githubToken = await promptWithCancel(() => kit.password({
                  message: 'Enter GitHub personal access token:'
                }));
              } else {
                config.skipGithub = true;
              }
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

# JSR.io  
deno add @xec/core
deno add @xec/cli
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
  - JSR: https://jsr.io/@xec/core
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