/// <reference path="../xec-globals.d.ts" />

/**
 * 🚀 Xec Release Command - Optimized with Native Parallel Execution
 * 
 * Demonstrates advanced Xec features with maximum performance:
 * - Native $.parallel.all() for fail-fast operations
 * - Native $.parallel.settled() for resilient batch operations
 * - Progress tracking with onProgress callbacks
 * - Efficient error handling with nothrow()
 * - Optimal concurrency limits for different operations
 * - Smart rollback with parallel cleanup
 * 
 * Performance improvements:
 * - Git operations run in parallel where safe
 * - Package builds use optimal concurrency
 * - NPM/JSR publishing respects rate limits
 * - File operations batched for speed
 * 
 * This command will be available as: xec release [version]
 */

import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Core dependencies - using xec module loader
const clack = await use('npm:@clack/prompts');
const chalk = (await use('npm:chalk')).default;

// Dynamic imports with efficient loading
const semver = await use('npm:semver@7');

// Package configurations
const PACKAGES = [
  { name: '@xec-sh/core', path: 'packages/core' },
  { name: '@xec-sh/cli', path: 'apps/xec' },
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
  clack.outro(chalk.yellow('✋ Release cancelled by user'));
  process.exit(0);
}

// Wrap clack prompts to handle cancellation
async function promptWithCancel<T>(fn: () => Promise<T | symbol>): Promise<T> {
  const result = await fn();
  if (clack.isCancel(result)) {
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

// Helper to update CHANGELOG.md with new release
async function updateChangelog(version: string, content: string): Promise<void> {
  const changelogPath = 'CHANGELOG.md';
  const changelog = readFileSync(changelogPath, 'utf8');

  // Find the marker
  const marker = '<!-- CHANGELOG-INSERT-MARKER -->';
  const markerIndex = changelog.indexOf(marker);

  if (markerIndex === -1) {
    throw new Error('CHANGELOG.md is missing the insert marker');
  }

  // Find the end of the marker section (next line after marker comments)
  const afterMarker = changelog.indexOf('\n\n', markerIndex) + 2;

  // Format date
  const date = new Date().toISOString().split('T')[0];

  // Create new release entry
  const newEntry = `## [${version}] - ${date}\n\n${content}\n\n`;

  // Insert new entry after marker
  const updatedChangelog =
    changelog.slice(0, afterMarker) +
    newEntry +
    changelog.slice(afterMarker);

  writeFileSync(changelogPath, updatedChangelog);
}

// Helper to generate changelog from git commits - optimized
async function generateChangelog(fromVersion: string, toVersion: string): Promise<string> {
  const result = await $`git log v${fromVersion}..HEAD --pretty=format:"%h - %s (%an)" --no-merges`.nothrow();

  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return '- Various improvements and bug fixes\n';
  }

  // Parse commits efficiently
  const lines = result.stdout.trim().split('\n');
  const categorized = lines.reduce((acc, line) => {
    if (line.includes('feat:') || line.includes('feature:')) {
      acc.features.push(line);
    } else if (line.includes('fix:') || line.includes('bug:')) {
      acc.fixes.push(line);
    } else {
      acc.other.push(line);
    }
    return acc;
  }, { features: [] as string[], fixes: [] as string[], other: [] as string[] });

  // Build changelog sections
  const sections = [
    categorized.features.length && `### 🚀 Features\n${categorized.features.map(f => `- ${f}`).join('\n')}`,
    categorized.fixes.length && `### 🐛 Bug Fixes\n${categorized.fixes.map(f => `- ${f}`).join('\n')}`,
    categorized.other.length && `### 📝 Other Changes\n${categorized.other.map(f => `- ${f}`).join('\n')}`
  ].filter(Boolean).join('\n\n');

  return sections ? sections + '\n\n' : '- Various improvements and bug fixes\n';
}


// Safe rollback function - optimized with parallel operations
async function performRollback(state: RollbackState, config: ReleaseConfig): Promise<void> {
  const s = clack.spinner();
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
    .description('🚀 Release Xec packages with style')
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
      const s = clack.spinner();
      const rollbackState: RollbackState = {
        originalPackageJsons: new Map(),
        createdFiles: [],
        gitCommitCreated: false,
        gitTagCreated: false,
        tagName: ''
      };
      let usedChangesFile = false;

      clack.intro(chalk.bgMagenta.black(' 🚀 Xec Release Manager '));
      clack.log.info(chalk.dim('Press ESC at any prompt to cancel safely'));

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
            clack.log.info(`Loaded configuration from ${options.config}`);
          } catch (error) {
            clack.log.warn(`Failed to load config file: ${options.config}`);
          }
        } else if (existsSync('.xec-release.json')) {
          try {
            const configContent = readFileSync('.xec-release.json', 'utf8');
            fileConfig = JSON.parse(configContent);
            clack.log.info('Loaded configuration from .xec-release.json');
          } catch { }
        }

        // Merge file config with command options
        options = { ...fileConfig, ...options };

        // Step 1: Check repository state
        s.start('Checking repository state...');

        // Check if we're in the root directory
        if (!existsSync('turbo.json')) {
          s.stop('❌ Not in project root');
          clack.outro(chalk.red('Please run this command from the project root'));
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
          const proceed = await promptWithCancel(() => clack.confirm({
            message: 'Working directory has uncommitted changes. Continue anyway?',
            initialValue: false
          }));
          if (!proceed) {
            handleCancel();
          }
        }

        if (currentBranch !== 'main' && !options.dryRun) {
          s.stop(`⚠️  Not on main branch (current: ${currentBranch})`);
          const proceed = await promptWithCancel(() => clack.confirm({
            message: 'You are not on the main branch. Continue anyway?',
            initialValue: false
          }));
          if (!proceed) {
            handleCancel();
          }
        }

        s.stop('✅ Repository state checked');

        // Step 2: Collect all release parameters
        clack.log.info(chalk.bold('\n📋 Release Configuration'));

        const currentPkg = readPackageJson('packages/core');
        const currentVersion = currentPkg.version;

        // Determine version
        let newVersion = version;
        if (!newVersion) {
          const versionType = await promptWithCancel(() => clack.select({
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
            newVersion = await promptWithCancel(() => clack.text({
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
            const prereleaseType = options.prerelease || await promptWithCancel(() => clack.select({
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
          clack.outro(chalk.red(`Invalid version: ${newVersion}`));
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

        // Show release plan
        clack.log.info(chalk.bold('\n📋 Release Plan:\n'));
        clack.log.info(`  Version: ${chalk.green(currentVersion)} → ${chalk.green(newVersion)}`);
        clack.log.info(`  Packages to release:`);
        for (const pkg of PACKAGES) {
          clack.log.info(`    - ${pkg.name}`);
        }

        if (!config.skipGit) {
          clack.log.info(`  Git operations:`);
          clack.log.info(`    - Update package versions`);
          clack.log.info(`    - Create commit: "chore: release v${config.version}"`);
          clack.log.info(`    - Create tag: v${config.version}`);
          clack.log.info(`    - Push to origin`);
        }

        if (!config.skipGithub) {
          clack.log.info(`  GitHub:`);
          clack.log.info(`    - Create release for v${config.version}`);
        }

        if (!config.skipNpm) {
          clack.log.info(`  NPM:`);
          clack.log.info(`    - Publish all packages`);
        }

        if (!config.skipJsr) {
          clack.log.info(`  JSR.io:`);
          clack.log.info(`    - Publish @xec-sh/core and @xec-sh/cli`);
        }

        if (config.dryRun) {
          clack.log.info(chalk.yellow('\n  🔸 DRY RUN MODE - No changes will be made'));
        }

        const proceed = await promptWithCancel(() => clack.confirm({
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
            const continueAnyway = await promptWithCancel(() => clack.confirm({
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
        clack.log.info(chalk.bold('\n🚀 Starting Release Process\n'));

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

        // Step 3.5: Update CHANGELOG.md from CHANGES.md
        s.start('Updating CHANGELOG...');

        let changelogContent = '';

        if (!config.dryRun) {
          // Parallel file reads for better performance
          const [changelogExists, changesExists] = await $.parallel.settled([
            `test -f CHANGELOG.md && echo true || echo false`,
            `test -f CHANGES.md && echo true || echo false`
          ]).then(r => r.results.map(res =>
            res instanceof Error ? false : res.stdout.trim() === 'true'
          ));

          // Save originals in parallel if they exist
          const backupTasks: (Promise<void>)[] = [];
          if (changelogExists) {
            backupTasks.push((async () => {
              rollbackState.originalChangelog = readFileSync('CHANGELOG.md', 'utf8');
            })());
          }
          if (changesExists) {
            backupTasks.push((async () => {
              rollbackState.originalChangesFile = readFileSync('CHANGES.md', 'utf8');
            })());
          }
          await Promise.all(backupTasks);

          // Try CHANGES.md first
          const changesContent = await parseChangesFile();
          if (changesContent) {
            changelogContent = changesContent;
            usedChangesFile = true;
            clack.log.info('Using content from CHANGES.md for changelog');
          } else {
            // Fallback to git commits
            changelogContent = await generateChangelog(config.previousVersion, config.version);
            clack.log.info('Generated changelog from git commits');
          }

          // Update CHANGELOG.md
          try {
            await updateChangelog(config.version, changelogContent);
            s.stop('✅ CHANGELOG.md updated');
          } catch (error) {
            s.stop('⚠️  Failed to update CHANGELOG.md');
            clack.log.warn('Could not update CHANGELOG.md: ' + error);
          }
        } else {
          s.stop('✅ CHANGELOG.md update skipped (dry run)');
        }

        // Step 4: Build packages
        s.start('Building packages...');

        if (!config.dryRun) {
          // Use $.batch for cleaner API with concurrency control
          const buildResult = await $.batch(
            config.packages.map(pkg => `cd ${pkg.path} && yarn build`),
            {
              concurrency: 3, // Optimal for most systems
              onProgress: (done, total, succeeded, failed) => {
                s.start(`Building packages: ${done}/${total} (✓ ${succeeded}, ✗ ${failed})`);
              }
            }
          );

          if (buildResult.failed.length > 0) {
            s.stop('❌ Build failed');
            await performRollback(rollbackState, config);
            throw new Error(`Build failed for ${buildResult.failed.length} packages`);
          }

          s.stop(`✅ Built ${buildResult.succeeded.length} packages successfully`);
        } else {
          s.stop('✅ Package build skipped (dry run)');
        }

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
            clack.log.info('No changes to commit');
          }

          // Check if tag already exists
          const tagExists = await $`git tag -l v${config.version}`.then(r => r.stdout.trim() !== '');

          if (tagExists) {
            s.stop(`⚠️  Tag v${config.version} already exists`);
            const overwriteTag = await promptWithCancel(() => clack.confirm({
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
              clack.log.info(`Using existing tag v${config.version}`);
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

            const authMethod = await promptWithCancel(() => clack.select({
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
              config.npmToken = await promptWithCancel(() => clack.password({
                message: 'Enter NPM authentication token:'
              }));
            } else {
              config.skipNpm = true;
            }
          }

          if (!config.skipNpm) {
            // Update .yarnrc.yml if token provided
            if (config.npmToken) {
              const yarnrcPath = join(process.cwd(), '.yarnrc.yml');

              // Check if .yarnrc.yml already exists and save original content
              let originalYarnrc: string | null = null;
              let yarnrcConfig: any = {};

              if (existsSync(yarnrcPath)) {
                originalYarnrc = readFileSync(yarnrcPath, 'utf8');
                // Parse YAML manually (simple key: value pairs)
                const lines = originalYarnrc.split('\n');
                for (const line of lines) {
                  const trimmedLine = line.trim();
                  if (!trimmedLine || trimmedLine.startsWith('#')) continue;

                  const colonIndex = trimmedLine.indexOf(':');
                  if (colonIndex > 0) {
                    const key = trimmedLine.substring(0, colonIndex).trim();
                    const value = trimmedLine.substring(colonIndex + 1).trim().replace(/^["']|["']$/g, '');
                    if (key && value) {
                      yarnrcConfig[key] = value;
                    }
                  }
                }
              } else {
                rollbackState.createdFiles.push(yarnrcPath);
              }

              try {
                // Update yarnrc config with new token
                yarnrcConfig.npmAuthToken = config.npmToken;
                yarnrcConfig.npmPublishRegistry = yarnrcConfig.npmPublishRegistry || 'https://registry.npmjs.org';
                yarnrcConfig.npmRegistryServer = yarnrcConfig.npmRegistryServer || 'https://registry.npmjs.org';

                // Convert back to YAML format
                const yarnrcContent = Object.entries(yarnrcConfig)
                  .map(([key, value]) => {
                    // Keep npmAuthToken without quotes, quote URLs
                    if (key === 'npmAuthToken' || key === 'nodeLinker') {
                      return `${key}: ${value}`;
                    } else if (typeof value === 'string' && (value.includes('://') || value.includes('registry'))) {
                      return `${key}: "${value}"`;
                    } else {
                      return `${key}: ${value}`;
                    }
                  })
                  .join('\n\n') + '\n';

                // Create .yarnrc.yml in project root
                writeFileSync(yarnrcPath, yarnrcContent);

                // Core packages must be published first
                const corePackages = config.packages.filter(p => p.name === '@xec-sh/core');
                const otherPackages = config.packages.filter(p => p.name !== '@xec-sh/core');

                // Publish core first (dependency for others)
                if (corePackages.length > 0) {
                  s.start(`Publishing ${corePackages[0]?.name}...`);
                  await $`yarn workspace ${corePackages[0]?.name} npm publish --access public`;

                  // Wait a bit for NPM to process the package
                  s.start('Waiting for NPM to process the package...');
                  await new Promise(resolve => setTimeout(resolve, 5000));
                }

                // Publish others sequentially to avoid "Failed to save packument" error
                for (let i = 0; i < otherPackages.length; i++) {
                  const pkg = otherPackages[i];
                  s.start(`Publishing ${pkg?.name}... (${i + 1}/${otherPackages.length})`);

                  try {
                    await $`yarn workspace ${pkg?.name} npm publish --access public`;

                    // Wait between publishes to avoid NPM rate limiting
                    if (i < otherPackages.length - 1) {
                      await new Promise(resolve => setTimeout(resolve, 3000));
                    }
                  } catch (error) {
                    throw new Error(`Failed to publish ${pkg?.name}: ${error}`);
                  }
                }

                s.stop(`✅ Published ${config.packages.length} packages to NPM`);
              } catch (error) {
                console.error(error);
                s.stop('❌ NPM publishing failed');
                throw error;
              } finally {
                // Clean up .yarnrc.yml
                if (originalYarnrc !== null) {
                  // Restore original content
                  writeFileSync(yarnrcPath, originalYarnrc);
                } else {
                  // Remove created file
                  try {
                    await $`rm -f ${yarnrcPath}`.nothrow();
                  } catch { }
                }
              }
            } else {
              // Publish without token - use sequential for auth prompts
              for (const pkg of config.packages) {
                clack.log.step(`Publishing ${pkg.name}...`);
                await $`yarn workspace ${pkg.name} npm publish --access public`;
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
            const installDeno = await promptWithCancel(() => clack.confirm({
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

              try {
                if (config.jsrToken) {
                  await $.env({ JSR_TOKEN: config.jsrToken }).cd(pkg?.path ?? '')`deno publish --token $JSR_TOKEN`;
                } else {
                  await $.cd(pkg?.path ?? '')`deno publish`;
                }

                // Wait between publishes to avoid rate limiting
                if (i < jsrPackages.length - 1) {
                  await new Promise(resolve => setTimeout(resolve, 3000));
                }
              } catch (error) {
                throw new Error(`Failed to publish ${pkg?.name} to JSR.io: ${error}`);
              }
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
            clack.log.warn('Install gh CLI to create GitHub releases: https://cli.github.com');
          } else {
            // Check GitHub authentication
            const ghAuth = await $`gh auth status`.nothrow();
            if (ghAuth.exitCode !== 0 && !config.githubToken) {
              s.stop('⚠️  Not authenticated to GitHub');

              const authMethod = await promptWithCancel(() => clack.select({
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
                config.githubToken = await promptWithCancel(() => clack.password({
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
# 🚀 Xec v${config.version}

${isPrerelease ? '**This is a pre-release version.**\n' : ''}

## 📦 Packages

- **@xec-sh/core**: v${config.version}
- **@xec-sh/cli**: v${config.version}
- **@xec-sh/test-utils**: v${config.version}

## 📥 Installation

\`\`\`bash
# NPM
npm install -g @xec-sh/cli
npm install @xec-sh/core

# Yarn
yarn global add @xec-sh/cli
yarn add @xec-sh/core

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
                clack.log.warn(`GitHub release v${config.version} already exists`);
                const updateRelease = await promptWithCancel(() => clack.confirm({
                  message: `Release v${config.version} already exists. Update it?`,
                  initialValue: true
                }));

                if (!updateRelease) {
                  clack.log.info('Skipping GitHub release update');
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
                    clack.log.error('Failed to create GitHub release');
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
                  clack.log.error('Failed to create GitHub release');
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
            clack.log.info('Cleared CHANGES.md after successful release');
          } catch (error) {
            clack.log.warn('Could not clear CHANGES.md: ' + error);
          }
        }

        // Success!
        clack.outro(chalk.green(`
✨ Release v${config.version} completed successfully!

📦 Published packages:
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
        clack.log.error(error.message);

        // Attempt rollback
        if (!options.dryRun) {
          const rollback = await clack.confirm({
            message: 'Would you like to rollback changes?',
            initialValue: true
          });

          if (clack.isCancel(rollback) || rollback) {
            await performRollback(rollbackState, config);
          }
        }

        clack.outro(chalk.red('Release failed'));
        process.exit(1);
      }
    });
}