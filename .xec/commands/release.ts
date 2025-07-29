/**
 * 🚀 Xec Release Command
 * 
 * A comprehensive release command that demonstrates the power of Xec
 * while providing flexible release management for the Xec monorepo.
 * 
 * Features:
 * - Version management with semver
 * - Git operations (tags, commits)
 * - GitHub release creation
 * - NPM publishing
 * - JSR.io publishing
 * - Progress tracking
 * - Rollback on failure
 * 
 * This command will be available as: xec release [version]
 */

import type { Command } from 'commander';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';

// Universal module loading support
const moduleContext = globalThis.__xecModuleContext || {
  import: (spec) => import(spec),
  importJSR: (pkg) => import('https://jsr.io/' + pkg),
  importNPM: (pkg) => import('https://esm.sh/' + pkg)
};

// Load dependencies
const clack = await moduleContext.import('@clack/prompts');
const { $, parallel, Pipeline, withTempFile, withTempDir } = await moduleContext.import('@xec-sh/core');
const chalkModule = await moduleContext.import('chalk');
const chalk = chalkModule.default || chalkModule;

// For packages not in dependencies, use dynamic imports with fallback
let semver: any;
let ora: any;

try {
  // Try local import first
  semver = await moduleContext.import('semver');
} catch {
  // Fallback to NPM if not found locally
  try {
    semver = await moduleContext.importNPM('semver@7');
  } catch (err) {
    console.error('Failed to load semver package. Please install it with: npm install semver');
    process.exit(1);
  }
}

try {
  // Try local import first
  ora = await moduleContext.import('ora');
} catch {
  // For ora, we can use a simple spinner fallback
  ora = (options: any) => ({
    start: (text?: string) => {
      if (text) console.log('⏳', text);
      return {
        text: '',
        succeed: (text?: string) => console.log('✅', text || ''),
        fail: (text?: string) => console.log('❌', text || ''),
        stop: () => { }
      };
    }
  });
}

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

// Helper to generate changelog from git commits
async function generateChangelog(fromVersion: string, toVersion: string): Promise<string> {
  const commits = await $`git log v${fromVersion}..HEAD --pretty=format:"%h - %s (%an)" --no-merges`.nothrow();

  if (commits.exitCode !== 0) {
    return '- Various improvements and bug fixes\n';
  }

  const lines = commits.stdout.trim().split('\n').filter(Boolean);
  const categorized = {
    features: [] as string[],
    fixes: [] as string[],
    other: [] as string[]
  };

  for (const line of lines) {
    if (line.includes('feat:') || line.includes('feature:')) {
      categorized.features.push(line);
    } else if (line.includes('fix:') || line.includes('bug:')) {
      categorized.fixes.push(line);
    } else {
      categorized.other.push(line);
    }
  }

  let changelog = '';
  if (categorized.features.length > 0) {
    changelog += '### 🚀 Features\n' + categorized.features.map(f => `- ${f}`).join('\n') + '\n\n';
  }
  if (categorized.fixes.length > 0) {
    changelog += '### 🐛 Bug Fixes\n' + categorized.fixes.map(f => `- ${f}`).join('\n') + '\n\n';
  }
  if (categorized.other.length > 0) {
    changelog += '### 📝 Other Changes\n' + categorized.other.map(f => `- ${f}`).join('\n') + '\n\n';
  }

  return changelog || '- Various improvements and bug fixes\n';
}

// Helper to check for dependency updates
async function checkDependencyUpdates(): Promise<{ hasUpdates: boolean; updates: string[] }> {
  const updates: string[] = [];

  // Check with npm outdated
  const outdated = await $`npm outdated --json`.nothrow();
  if (outdated.exitCode === 0 && outdated.stdout.trim()) {
    try {
      const data = JSON.parse(outdated.stdout);
      for (const [pkg, info] of Object.entries(data)) {
        updates.push(`${pkg}: ${(info as any).current} → ${(info as any).wanted}`);
      }
    } catch { }
  }

  return {
    hasUpdates: updates.length > 0,
    updates
  };
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
    .option('--skip-dep-check', 'Skip dependency update check')
    .option('--config <path>', 'Path to release configuration file')
    .action(async (version: string | undefined, options: any) => {
      const s = clack.spinner();

      clack.intro(chalk.bgMagenta.black(' 🚀 Xec Release Manager '));

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

        // Execute pre-release hook if defined
        if (fileConfig.hooks?.preRelease && !options.dryRun) {
          s.start('Running pre-release hook...');
          try {
            await $.raw`${fileConfig.hooks.preRelease}`;
            s.stop('✅ Pre-release hook completed');
          } catch (error) {
            s.stop('⚠️  Pre-release hook failed');
            const continueAnyway = await clack.confirm({
              message: 'Pre-release hook failed. Continue anyway?',
              initialValue: false
            });
            if (!continueAnyway) {
              clack.outro(chalk.yellow('Release cancelled'));
              process.exit(1);
            }
          }
        }

        // Step 1: Check repository state
        s.start('Checking repository state...');

        // Check if we're in the root directory
        if (!existsSync('turbo.json')) {
          s.stop('❌ Not in project root');
          clack.outro(chalk.red('Please run this command from the project root'));
          process.exit(1);
        }

        // Check git status
        const gitStatus = await $`git status --porcelain`.nothrow();
        if (gitStatus.stdout.trim() && !options.dryRun) {
          s.stop('❌ Working directory not clean');
          const proceed = await clack.confirm({
            message: 'Working directory has uncommitted changes. Continue anyway?',
            initialValue: false
          });
          if (!proceed) {
            clack.outro(chalk.yellow('Release cancelled'));
            process.exit(0);
          }
        }

        // Get current branch
        const currentBranch = (await $`git branch --show-current`).stdout.trim();
        if (currentBranch !== 'main' && !options.dryRun) {
          s.stop(`⚠️  Not on main branch (current: ${currentBranch})`);
          const proceed = await clack.confirm({
            message: 'You are not on the main branch. Continue anyway?',
            initialValue: false
          });
          if (!proceed) {
            clack.outro(chalk.yellow('Release cancelled'));
            process.exit(0);
          }
        }

        s.stop('✅ Repository state checked');

        // Progress tracking
        const steps = [
          'Check repository',
          'Select version',
          'Update versions',
          'Check dependencies',
          'Build packages',
          'Run tests',
          'Git operations',
          'NPM publish',
          'JSR publish',
          'GitHub push',
          'GitHub release'
        ];
        let currentStep = 1;

        const showProgress = (step: string) => {
          const progress = Math.round((currentStep / steps.length) * 100);
          clack.log.info(chalk.dim(`[${currentStep}/${steps.length}] ${progress}%`) + ` ${chalk.bold(step)}`);
          currentStep++;
        };

        showProgress('Repository checked');

        // Step 2: Determine version
        showProgress('Determining version');
        const currentPkg = readPackageJson('packages/core');
        const currentVersion = currentPkg.version;

        let newVersion = version;
        if (!newVersion) {
          const versionType = await clack.select({
            message: `Select version type (current: ${currentVersion})`,
            options: [
              { value: 'patch', label: `Patch (${semver.inc(currentVersion, 'patch')})` },
              { value: 'minor', label: `Minor (${semver.inc(currentVersion, 'minor')})` },
              { value: 'major', label: `Major (${semver.inc(currentVersion, 'major')})` },
              { value: 'prerelease', label: `Prerelease (${semver.inc(currentVersion, 'prerelease', options.prerelease || 'alpha')})` },
              { value: 'custom', label: 'Custom version' }
            ]
          });

          if (versionType === 'custom') {
            newVersion = await clack.text({
              message: 'Enter custom version:',
              validate: (value) => {
                if (!semver.valid(value)) {
                  return 'Invalid semver version';
                }
                if (!semver.gt(value, currentVersion)) {
                  return `Version must be greater than ${currentVersion}`;
                }
              }
            });
          } else if (versionType === 'prerelease') {
            const prereleaseType = options.prerelease || await clack.select({
              message: 'Select prerelease type:',
              options: [
                { value: 'alpha', label: 'Alpha' },
                { value: 'beta', label: 'Beta' },
                { value: 'rc', label: 'Release Candidate' }
              ]
            });
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

        // Step 3: Show release plan
        clack.log.info(chalk.bold('📋 Release Plan:\n'));
        clack.log.info(`  Version: ${chalk.green(currentVersion)} → ${chalk.green(newVersion)}`);
        clack.log.info(`  Packages to release:`);
        for (const pkg of PACKAGES) {
          clack.log.info(`    - ${pkg.name}`);
        }

        if (!options.skipGit) {
          clack.log.info(`  Git operations:`);
          clack.log.info(`    - Create commit: "chore: release v${newVersion}"`);
          clack.log.info(`    - Create tag: v${newVersion}`);
          clack.log.info(`    - Push to origin`);
        }

        if (!options.skipGithub) {
          clack.log.info(`  GitHub:`);
          clack.log.info(`    - Create release for v${newVersion}`);
        }

        if (!options.skipNpm) {
          clack.log.info(`  NPM:`);
          clack.log.info(`    - Publish all packages`);
        }

        if (!options.skipJsr) {
          clack.log.info(`  JSR.io:`);
          clack.log.info(`    - Publish @xec-sh/core and @xec-sh/cli`);
        }

        if (options.dryRun) {
          clack.log.info(chalk.yellow('\n  🔸 DRY RUN MODE - No changes will be made'));
        }

        const proceed = await clack.confirm({
          message: 'Proceed with release?',
          initialValue: true
        });

        if (!proceed) {
          clack.outro(chalk.yellow('Release cancelled'));
          process.exit(0);
        }

        // Create release config
        const config: ReleaseConfig = {
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
          jsrToken: options.jsrToken
        };

        // Step 4: Update versions
        showProgress('Updating package versions');
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

        // Step 5: Check dependencies
        showProgress('Checking dependencies');
        if (!options.skipDepCheck) {
          s.start('Checking for dependency updates...');
          const depCheck = await checkDependencyUpdates();

          if (depCheck.hasUpdates) {
            s.stop('⚠️  Found outdated dependencies');
            clack.log.warn('Outdated dependencies found:');
            depCheck.updates.forEach(u => clack.log.info(`  - ${u}`));

            const continueWithOutdated = await clack.confirm({
              message: 'Continue with outdated dependencies?',
              initialValue: true
            });

            if (!continueWithOutdated) {
              clack.outro(chalk.yellow('Release cancelled - please update dependencies first'));
              process.exit(0);
            }
          } else {
            s.stop('✅ All dependencies up to date');
          }
        }

        // Step 6: Build packages
        showProgress('Building packages');
        s.start('Building packages...');

        if (!config.dryRun) {
          // Build in parallel for better performance
          const buildSpinner = ora({ text: 'Building packages in parallel...', spinner: 'dots' }).start();

          const buildTasks = config.packages.map(pkg => async () => {
            buildSpinner.text = `Building ${pkg.name}...`;
            await $.cd(pkg.path)`yarn build`;
            return pkg.name;
          });

          try {
            const results = await parallel(...buildTasks);
            buildSpinner.succeed(`Built ${results.length} packages successfully`);
          } catch (error) {
            buildSpinner.fail('Build failed');
            throw error;
          }
        }

        s.stop('✅ Packages built');

        // Step 6: Git operations
        if (!config.skipGit && !config.dryRun) {
          s.start('Creating git commit and tag...');

          await $`git add .`;
          await $`git commit -m "chore: release v${config.version}"`;
          await $`git tag -a v${config.version} -m "Release v${config.version}"`;

          s.stop('✅ Git commit and tag created');
        }

        // Step 7: Run tests (optional but recommended)
        showProgress('Running tests');
        const runTests = await clack.confirm({
          message: 'Run tests before publishing?',
          initialValue: true
        });

        if (runTests && !config.dryRun) {
          s.start('Running tests...');

          const testResult = await $`yarn test`.nothrow();
          if (testResult.exitCode !== 0) {
            s.stop('❌ Tests failed');

            const continueAnyway = await clack.confirm({
              message: 'Tests failed. Continue anyway?',
              initialValue: false
            });

            if (!continueAnyway) {
              // Rollback
              if (!config.skipGit) {
                s.start('Rolling back git changes...');
                await $`git reset --hard HEAD~1`;
                await $`git tag -d v${config.version}`;
                s.stop('✅ Rolled back');
              }
              clack.outro(chalk.red('Release cancelled due to test failures'));
              process.exit(1);
            }
          } else {
            s.stop('✅ Tests passed');
          }
        }

        // Step 8: NPM publishing
        showProgress('Publishing to NPM');
        if (!config.skipNpm && !config.dryRun) {
          s.start('Publishing to NPM...');

          // Check NPM authentication
          const npmWhoami = await $`npm whoami`.nothrow();
          if (npmWhoami.exitCode !== 0 && !config.npmToken) {
            s.stop('⚠️  Not authenticated to NPM');

            const authMethod = await clack.select({
              message: 'How would you like to authenticate to NPM?',
              options: [
                { value: 'browser', label: 'Open browser to login' },
                { value: 'token', label: 'Enter NPM token' },
                { value: 'skip', label: 'Skip NPM publishing' }
              ]
            });

            if (authMethod === 'browser') {
              s.start('Opening NPM login...');
              await $`npm login`;
              s.stop('✅ NPM authentication complete');
            } else if (authMethod === 'token') {
              config.npmToken = await clack.password({
                message: 'Enter NPM authentication token:'
              });
            } else {
              config.skipNpm = true;
            }
          }

          if (!config.skipNpm) {
            // Create .npmrc if token provided
            if (config.npmToken) {
              await withTempFile(async (npmrcPath) => {
                writeFileSync(npmrcPath, `//registry.npmjs.org/:_authToken=${config.npmToken}\n`);

                // Publish packages in parallel (where safe)
                const publishSpinner = ora({ text: 'Publishing packages...', spinner: 'dots' }).start();

                // Core packages must be published first
                const corePackages = config.packages.filter(p => p.name === '@xec-sh/core');
                const otherPackages = config.packages.filter(p => p.name !== '@xec-sh/core');

                // Publish core first
                for (const pkg of corePackages) {
                  publishSpinner.text = `Publishing ${pkg.name}...`;
                  await $.env({ NPM_CONFIG_USERCONFIG: npmrcPath })
                    `yarn workspace ${pkg.name} npm publish --access public`;
                }

                // Then publish others in parallel
                if (otherPackages.length > 0) {
                  const publishTasks = otherPackages.map(pkg => async () => {
                    await $.env({ NPM_CONFIG_USERCONFIG: npmrcPath })
                      `yarn workspace ${pkg.name} npm publish --access public`;
                    return pkg.name;
                  });

                  const published = await parallel(...publishTasks);
                  publishSpinner.succeed(`Published ${corePackages.length + published.length} packages`);
                } else {
                  publishSpinner.succeed(`Published ${corePackages.length} packages`);
                }
              });
            } else {
              // Publish without token (assumes already authenticated)
              const publishTasks = config.packages.map(pkg => async () => {
                clack.log.step(`Publishing ${pkg.name}...`);
                await $`yarn workspace ${pkg.name} npm publish --access public`;
              });

              await Pipeline.sequential(...publishTasks);
            }

            s.stop('✅ Published to NPM');
          }
        }

        // Step 9: JSR.io publishing
        showProgress('Publishing to JSR.io');
        if (!config.skipJsr && !config.dryRun) {
          s.start('Publishing to JSR.io...');

          // Only publish core and cli to JSR
          const jsrPackages = config.packages.filter(p =>
            p.name === '@xec-sh/core' || p.name === '@xec-sh/cli'
          );

          for (const pkg of jsrPackages) {
            // Create jsr.json
            const packageJson = readPackageJson(pkg.path);
            const jsrJson = createJsrJson(packageJson);
            writeFileSync(join(pkg.path, 'jsr.json'), JSON.stringify(jsrJson, null, 2) + '\n');

            // Check if deno is installed
            const denoCheck = await $`which deno`.nothrow();
            if (denoCheck.exitCode !== 0) {
              s.stop('⚠️  Deno not installed');

              const installDeno = await clack.confirm({
                message: 'Deno is required for JSR publishing. Install it now?',
                initialValue: true
              });

              if (installDeno) {
                s.start('Installing Deno...');
                await $`curl -fsSL https://deno.land/install.sh | sh`;
                s.stop('✅ Deno installed');
              } else {
                config.skipJsr = true;
                continue;
              }
            }

            if (!config.skipJsr) {
              clack.log.step(`Publishing ${pkg.name} to JSR.io...`);

              // JSR publishing requires authentication
              if (config.jsrToken) {
                await $.env({ JSR_TOKEN: config.jsrToken })
                  .cd(pkg.path)`deno publish --token $JSR_TOKEN`;
              } else {
                // Interactive auth
                await $.cd(pkg.path)`deno publish`;
              }
            }
          }

          s.stop('✅ Published to JSR.io');
        }

        // Step 10: Push to GitHub
        showProgress('Pushing to GitHub');
        if (!config.skipGit && !config.dryRun) {
          s.start('Pushing to GitHub...');

          await $`git push origin ${currentBranch}`;
          await $`git push origin v${config.version}`;

          s.stop('✅ Pushed to GitHub');
        }

        // Step 11: Create GitHub release
        showProgress('Creating GitHub release');
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

              const authMethod = await clack.select({
                message: 'How would you like to authenticate to GitHub?',
                options: [
                  { value: 'browser', label: 'Open browser to login' },
                  { value: 'token', label: 'Enter GitHub token' },
                  { value: 'skip', label: 'Skip GitHub release' }
                ]
              });

              if (authMethod === 'browser') {
                s.start('Opening GitHub login...');
                await $`gh auth login`;
                s.stop('✅ GitHub authentication complete');
              } else if (authMethod === 'token') {
                config.githubToken = await clack.password({
                  message: 'Enter GitHub personal access token:'
                });
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

              // Create release
              if (config.githubToken) {
                await $.env({ GH_TOKEN: config.githubToken })`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
              } else {
                await $`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? '--prerelease' : ''}`;
              }

              s.stop('✅ GitHub release created');
            }
          }
        }

        // Execute post-release hook if defined
        if (fileConfig.hooks?.postRelease && !config.dryRun) {
          s.start('Running post-release hook...');
          try {
            await $.env({ RELEASE_VERSION: config.version }).raw`${fileConfig.hooks.postRelease}`;
            s.stop('✅ Post-release hook completed');
          } catch (error) {
            s.stop('⚠️  Post-release hook failed (non-critical)');
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

      } catch (error: any) {
        s.stop('❌ Release failed');
        clack.log.error(error.message);

        // Attempt rollback
        if (!options.skipGit && !options.dryRun) {
          const rollback = await clack.confirm({
            message: 'Would you like to rollback git changes?',
            initialValue: true
          });

          if (rollback) {
            s.start('Rolling back...');
            try {
              await $`git reset --hard HEAD~1`.nothrow();
              await $`git tag -d v${version}`.nothrow();
              s.stop('✅ Rolled back');
            } catch (e) {
              s.stop('❌ Rollback failed');
            }
          }
        }

        clack.outro(chalk.red('Release failed'));
        process.exit(1);
      }
    });
}