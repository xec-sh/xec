
// Injected global context for dynamic commands
const process = globalThis.process;
const $ = globalThis.$;
const kit = globalThis.kit;
const prism = globalThis.prism;
const log = globalThis.log;
const use = globalThis.use;
const x = globalThis.x;
const Import = globalThis.Import;

import { writeFileSync, readFileSync, existsSync } from "fs";
import { join } from "path";
// prism is available from globalThis
let semver;
const PACKAGES = [
  { name: "@xec-sh/core", path: "packages/core" },
  { name: "@xec-sh/cli", path: "apps/xec" },
  { name: "@xec-sh/kit", path: "packages/kit" },
  { name: "@xec-sh/loader", path: "packages/loader" },
  { name: "@xec-sh/testing", path: "packages/testing" }
];
function handleCancel() {
  kit.outro(prism.yellow("\u270B Release cancelled by user"));
  process.exit(0);
}
async function promptWithCancel(fn) {
  const result = await fn();
  if (kit.isCancel(result)) {
    handleCancel();
  }
  return result;
}
function readPackageJson(path) {
  return JSON.parse(readFileSync(join(path, "package.json"), "utf8"));
}
function writePackageJson(path, data) {
  writeFileSync(join(path, "package.json"), JSON.stringify(data, null, 2) + "\n");
}
function createJsrJson(packageJson) {
  return {
    name: packageJson.name.replace(/^@/, "").replace("/", "-"),
    version: packageJson.version,
    exports: packageJson.main || "./dist/index.js",
    publish: {
      include: ["dist/**/*", "README.md", "LICENSE"],
      exclude: ["**/*.test.js", "**/*.test.d.ts"]
    }
  };
}
async function parseChangesFile() {
  const changesPath = "CHANGES.md";
  if (!existsSync(changesPath)) {
    return null;
  }
  const content = readFileSync(changesPath, "utf8");
  if (!content.trim()) {
    return null;
  }
  return content.trim();
}
async function generateChangelog(fromVersion, toVersion) {
  const result = await $`git log v${fromVersion}..HEAD --pretty=format:"%h - %s (%an)" --no-merges`.nothrow();
  if (result.exitCode !== 0 || !result.stdout.trim()) {
    return "- Various improvements and bug fixes\n";
  }
  const lines = result.stdout.trim().split("\n");
  const categorized = lines.reduce((acc, line) => {
    if (line.includes("feat:") || line.includes("feature:")) {
      acc.features.push(line);
    } else if (line.includes("fix:") || line.includes("bug:")) {
      acc.fixes.push(line);
    } else {
      acc.other.push(line);
    }
    return acc;
  }, { features: [], fixes: [], other: [] });
  const sections = [
    categorized.features.length && `### \u{1F680} Features
${categorized.features.map((f) => `- ${f}`).join("\n")}`,
    categorized.fixes.length && `### \u{1F41B} Bug Fixes
${categorized.fixes.map((f) => `- ${f}`).join("\n")}`,
    categorized.other.length && `### \u{1F4DD} Other Changes
${categorized.other.map((f) => `- ${f}`).join("\n")}`
  ].filter(Boolean).join("\n\n");
  return sections ? sections + "\n\n" : "- Various improvements and bug fixes\n";
}
async function performRollback(state, config) {
  const s = kit.spinner();
  s.start("Performing safe rollback...");
  try {
    const fileOps = [];
    for (const [path, content] of state.originalPackageJsons.entries()) {
      fileOps.push((async () => writeFileSync(path, content))());
    }
    if (state.originalChangelog) {
      fileOps.push((async () => writeFileSync("CHANGELOG.md", state.originalChangelog))());
    }
    if (state.originalChangesFile) {
      fileOps.push((async () => writeFileSync("CHANGES.md", state.originalChangesFile))());
    }
    await Promise.all(fileOps);
    const cleanupOps = [
      // Remove created files
      ...state.createdFiles.map(
        (file) => $`test -f ${file} && rm -f ${file} || true`.nothrow()
      ),
      // Git operations
      ...state.gitTagCreated && state.tagName ? [$`git tag -d ${state.tagName}`.nothrow()] : []
      // ...(state.gitCommitCreated && !config.skipGit ? [$`git reset --soft HEAD~1`.nothrow()] : [])
    ];
    await $.parallel.settled(cleanupOps, { maxConcurrency: 5 });
    s.stop("\u2705 Rollback completed successfully");
  } catch (error) {
    s.stop("\u26A0\uFE0F  Rollback completed with warnings");
    console.error("Some rollback operations failed:", error);
  }
}
function command(program) {
  program.command("release [version]").description("\u{1F680} Release Xec packages with style").option("-d, --dry-run", "Perform a dry run without making changes").option("--skip-git", "Skip git operations (commit, tag, push)").option("--skip-github", "Skip GitHub release creation").option("--skip-npm", "Skip NPM publishing").option("--skip-jsr", "Skip JSR.io publishing").option("--npm-token <token>", "NPM authentication token").option("--github-token <token>", "GitHub authentication token").option("--jsr-token <token>", "JSR.io authentication token").option("--prerelease <tag>", "Create a prerelease version (alpha, beta, rc)").option("--config <path>", "Path to release configuration file").action(async (version, options) => {
    if (!semver) {
      semver = await use("npm:semver@7");
    }
    const s = kit.spinner();
    const rollbackState = {
      originalPackageJsons: /* @__PURE__ */ new Map(),
      createdFiles: [],
      gitCommitCreated: false,
      gitTagCreated: false,
      tagName: ""
    };
    let usedChangesFile = false;
    kit.intro(prism.bgMagenta(prism.black(" \u{1F680} Xec Release Manager ")));
    kit.log.info(prism.dim("Press ESC at any prompt to cancel safely"));
    let config = {
      version: "",
      previousVersion: "",
      packages: [],
      dryRun: false,
      skipGit: false,
      skipGithub: false,
      skipNpm: false,
      skipJsr: false,
      githubToken: "",
      npmToken: "",
      jsrToken: ""
    };
    try {
      let fileConfig = {};
      if (options.config) {
        try {
          const configContent = readFileSync(options.config, "utf8");
          fileConfig = JSON.parse(configContent);
          kit.log.info(`Loaded configuration from ${options.config}`);
        } catch (error) {
          kit.log.warn(`Failed to load config file: ${options.config}`);
        }
      } else if (existsSync(".xec-release.json")) {
        try {
          const configContent = readFileSync(".xec-release.json", "utf8");
          fileConfig = JSON.parse(configContent);
          kit.log.info("Loaded configuration from .xec-release.json");
        } catch {
        }
      }
      options = { ...fileConfig, ...options };
      s.start("Checking repository state...");
      if (!existsSync("turbo.json")) {
        s.stop("\u274C Not in project root");
        kit.outro(prism.red("Please run this command from the project root"));
        process.exit(1);
      }
      for (const pkg of PACKAGES) {
        const packageJsonPath = join(pkg.path, "package.json");
        if (existsSync(packageJsonPath)) {
          rollbackState.originalPackageJsons.set(packageJsonPath, readFileSync(packageJsonPath, "utf8"));
        }
      }
      const [gitStatus, branchResult] = await $.parallel.all([
        `git status --porcelain`,
        `git branch --show-current`
      ]);
      const currentBranch = branchResult?.stdout.trim();
      if (gitStatus?.stdout.trim() && !options.dryRun) {
        s.stop("\u274C Working directory not clean");
        const proceed2 = await promptWithCancel(() => kit.confirm({
          message: "Working directory has uncommitted changes. Continue anyway?",
          initialValue: false
        }));
        if (!proceed2) {
          handleCancel();
        }
      }
      if (currentBranch !== "main" && !options.dryRun) {
        s.stop(`\u26A0\uFE0F  Not on main branch (current: ${currentBranch})`);
        const proceed2 = await promptWithCancel(() => kit.confirm({
          message: "You are not on the main branch. Continue anyway?",
          initialValue: false
        }));
        if (!proceed2) {
          handleCancel();
        }
      }
      s.stop("\u2705 Repository state checked");
      kit.log.info(prism.bold("\u{1F4CB} Release Configuration"));
      const currentPkg = readPackageJson("packages/core");
      const currentVersion = currentPkg.version;
      let newVersion = version;
      if (!newVersion) {
        const versionType = await promptWithCancel(() => kit.select({
          message: `Select version type (current: ${currentVersion})`,
          options: [
            { value: "patch", label: `Patch (${semver.inc(currentVersion, "patch")})` },
            { value: "minor", label: `Minor (${semver.inc(currentVersion, "minor")})` },
            { value: "major", label: `Major (${semver.inc(currentVersion, "major")})` },
            { value: "prerelease", label: `Prerelease (${semver.inc(currentVersion, "prerelease", options.prerelease || "alpha")})` },
            { value: "keep", label: `Keep unchanged (${currentVersion})` },
            { value: "custom", label: "Custom version" }
          ]
        }));
        if (versionType === "keep") {
          newVersion = currentVersion;
        } else if (versionType === "custom") {
          newVersion = await promptWithCancel(() => kit.text({
            message: "Enter custom version:",
            validate: (value) => {
              if (!semver.valid(value)) {
                return "Invalid semver version";
              }
              if (semver.lt(value, currentVersion)) {
                return `Version must be greater than or equal to ${currentVersion}`;
              }
            }
          }));
        } else if (versionType === "prerelease") {
          const prereleaseType = options.prerelease || await promptWithCancel(() => kit.select({
            message: "Select prerelease type:",
            options: [
              { value: "alpha", label: "Alpha" },
              { value: "beta", label: "Beta" },
              { value: "rc", label: "Release Candidate" }
            ]
          }));
          newVersion = semver.inc(currentVersion, "prerelease", prereleaseType);
        } else {
          newVersion = semver.inc(currentVersion, versionType);
        }
      }
      if (!semver.valid(newVersion)) {
        kit.note(prism.red(`Invalid version: ${newVersion}`));
        process.exit(1);
      }
      config = {
        version: newVersion,
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
      rollbackState.tagName = `v${config.version}`;
      const planContent = [
        `Version: ${prism.green(currentVersion)} \u2192 ${prism.green(newVersion)}`,
        "",
        "Packages to release:",
        ...PACKAGES.map((pkg) => `  - ${pkg.name}`),
        ""
      ];
      if (!config.skipGit) {
        planContent.push(
          "Git operations:",
          "  - Update package versions",
          `  - Create commit: "chore: release v${config.version}"`,
          `  - Create tag: v${config.version}`,
          "  - Push to origin",
          ""
        );
      }
      if (!config.skipGithub) {
        planContent.push(
          "GitHub:",
          `  - Create release for v${config.version}`,
          ""
        );
      }
      if (!config.skipNpm) {
        planContent.push(
          "NPM:",
          "  - Publish all packages",
          ""
        );
      }
      if (!config.skipJsr) {
        planContent.push(
          "JSR.io:",
          "  - Publish @xec-sh/core and @xec-sh/cli"
        );
      }
      if (config.dryRun) {
        planContent.push(prism.yellow("\u{1F538} DRY RUN MODE - No changes will be made"));
      }
      kit.box(planContent.join("\n"), "\u{1F4CB} Release Plan", { width: "auto" });
      const proceed = await promptWithCancel(() => kit.confirm({
        message: "Proceed with release?",
        initialValue: true
      }));
      if (!proceed) {
        handleCancel();
      }
      if (fileConfig.hooks?.preRelease && !config.dryRun) {
        s.start("Running pre-release hook...");
        const hookResult = await $.raw`${fileConfig.hooks.preRelease}`.nothrow();
        if (hookResult.exitCode !== 0) {
          s.stop("\u26A0\uFE0F  Pre-release hook failed");
          const continueAnyway = await promptWithCancel(() => kit.confirm({
            message: "Pre-release hook failed. Continue anyway?",
            initialValue: false
          }));
          if (!continueAnyway) {
            handleCancel();
          }
        } else {
          s.stop("\u2705 Pre-release hook completed");
        }
      }
      kit.log.info(prism.bold("\n\u{1F680} Starting Release Process\n"));
      s.start("Updating package versions...");
      if (!config.dryRun) {
        for (const pkg of config.packages) {
          const packageJson = readPackageJson(pkg.path);
          packageJson.version = config.version;
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
      s.stop("\u2705 Package versions updated");
      if (!config.skipGit && !config.dryRun) {
        s.start("Creating git commit and tag...");
        await $`git add .`;
        const hasChanges = await $`git diff --cached --exit-code`.nothrow().then((r) => r.exitCode !== 0);
        if (hasChanges) {
          await $`git commit -m "chore: release v${config.version}"`;
          rollbackState.gitCommitCreated = true;
        } else {
          kit.log.info("No changes to commit");
        }
        const tagExists = await $`git tag -l v${config.version}`.then((r) => r.stdout.trim() !== "");
        if (tagExists) {
          s.stop(`\u26A0\uFE0F  Tag v${config.version} already exists`);
          const overwriteTag = await promptWithCancel(() => kit.confirm({
            message: `Tag v${config.version} already exists. Delete and recreate it?`,
            initialValue: false
          }));
          if (overwriteTag) {
            await $`git tag -d v${config.version}`;
            await $`git push origin :refs/tags/v${config.version}`.nothrow();
            await $`git tag -a v${config.version} -m "Release v${config.version}"`;
            rollbackState.gitTagCreated = true;
          } else {
            kit.log.info(`Using existing tag v${config.version}`);
          }
        } else {
          await $`git tag -a v${config.version} -m "Release v${config.version}"`;
          rollbackState.gitTagCreated = true;
        }
        s.stop("\u2705 Git commit and tag created");
      }
      if (!config.skipNpm && !config.dryRun) {
        s.start("Publishing to NPM...");
        const npmWhoami = await $`npm whoami`.nothrow();
        if (npmWhoami.exitCode !== 0 && !config.npmToken) {
          s.stop("\u26A0\uFE0F  Not authenticated to NPM");
          const authMethod = await promptWithCancel(() => kit.select({
            message: "How would you like to authenticate to NPM?",
            options: [
              { value: "browser", label: "Open browser to login" },
              { value: "token", label: "Enter NPM token" },
              { value: "skip", label: "Skip NPM publishing" }
            ]
          }));
          if (authMethod === "browser") {
            s.start("Opening NPM login...");
            await $`npm login`;
            s.stop("\u2705 NPM authentication complete");
          } else if (authMethod === "token") {
            config.npmToken = await promptWithCancel(() => kit.password({
              message: "Enter NPM authentication token:"
            }));
          } else {
            config.skipNpm = true;
          }
        }
        if (!config.skipNpm) {
          if (config.npmToken) {
            const npmrcPath = join(process.cwd(), ".npmrc");
            let originalNpmrc = null;
            if (existsSync(npmrcPath)) {
              originalNpmrc = readFileSync(npmrcPath, "utf8");
            } else {
              rollbackState.createdFiles.push(npmrcPath);
            }
            try {
              const npmrcContent = `//registry.npmjs.org/:_authToken=${config.npmToken}
`;
              writeFileSync(npmrcPath, npmrcContent);
              const corePackages = config.packages.filter((p) => p.name === "@xec-sh/core");
              const otherPackages = config.packages.filter((p) => p.name !== "@xec-sh/core");
              if (corePackages.length > 0) {
                s.start(`Publishing ${corePackages[0]?.name}...`);
                await $`pnpm --filter ${corePackages[0]?.name} publish --access public --no-git-checks`;
                s.start("Waiting for NPM to process the package...");
                await new Promise((resolve) => setTimeout(resolve, 5e3));
              }
              for (let i = 0; i < otherPackages.length; i++) {
                const pkg = otherPackages[i];
                s.start(`Publishing ${pkg?.name}... (${i + 1}/${otherPackages.length})`);
                try {
                  await $`pnpm --filter ${pkg?.name} publish --access public --no-git-checks`;
                  if (i < otherPackages.length - 1) {
                    await new Promise((resolve) => setTimeout(resolve, 3e3));
                  }
                } catch (error) {
                  throw new Error(`Failed to publish ${pkg?.name}: ${error}`);
                }
              }
              s.stop(`\u2705 Published ${config.packages.length} packages to NPM`);
            } catch (error) {
              console.error(error);
              s.stop("\u274C NPM publishing failed");
              throw error;
            } finally {
              if (originalNpmrc !== null) {
                writeFileSync(npmrcPath, originalNpmrc);
              } else {
                try {
                  await $`rm -f ${npmrcPath}`.nothrow();
                } catch {
                }
              }
            }
          } else {
            for (const pkg of config.packages) {
              kit.log.step(`Publishing ${pkg.name}...`);
              await $`pnpm --filter ${pkg.name} publish --access public --no-git-checks`;
            }
          }
          s.stop("\u2705 Published to NPM");
        }
      }
      if (!config.skipJsr && !config.dryRun) {
        s.start("Publishing to JSR.io...");
        const jsrPackages = config.packages.filter(
          (p) => p.name === "@xec-sh/core" || p.name === "@xec-sh/cli"
        );
        const denoExists = await $`which deno`.nothrow().then((r) => r.exitCode === 0);
        if (!denoExists) {
          s.stop("\u26A0\uFE0F  Deno not installed");
          const installDeno = await promptWithCancel(() => kit.confirm({
            message: "Deno is required for JSR publishing. Install it now?",
            initialValue: true
          }));
          if (installDeno) {
            s.start("Installing Deno...");
            await $`curl -fsSL https://deno.land/install.sh | sh`;
            s.stop("\u2705 Deno installed");
          } else {
            config.skipJsr = true;
          }
        }
        if (!config.skipJsr) {
          await Promise.all(jsrPackages.map((pkg) => {
            const packageJson = readPackageJson(pkg.path);
            const jsrJson = createJsrJson(packageJson);
            const jsrJsonPath = join(pkg.path, "jsr.json");
            writeFileSync(jsrJsonPath, JSON.stringify(jsrJson, null, 2) + "\n");
            rollbackState.createdFiles.push(jsrJsonPath);
          }));
          for (let i = 0; i < jsrPackages.length; i++) {
            const pkg = jsrPackages[i];
            s.start(`Publishing ${pkg?.name} to JSR.io... (${i + 1}/${jsrPackages.length})`);
            try {
              if (config.jsrToken) {
                await $.env({ JSR_TOKEN: config.jsrToken }).cd(pkg?.path ?? "")`deno publish --token $JSR_TOKEN`;
              } else {
                await $.cd(pkg?.path ?? "")`deno publish`;
              }
              if (i < jsrPackages.length - 1) {
                await new Promise((resolve) => setTimeout(resolve, 3e3));
              }
            } catch (error) {
              throw new Error(`Failed to publish ${pkg?.name} to JSR.io: ${error}`);
            }
          }
          s.stop(`\u2705 Published ${jsrPackages.length} packages to JSR.io`);
        }
      }
      if (!config.skipGit && !config.dryRun) {
        s.start("Pushing to GitHub...");
        const pushCommands = [`git push origin ${currentBranch}`];
        if (rollbackState.gitTagCreated) {
          pushCommands.push(`git push origin v${config.version}`);
        }
        await $.parallel.all(pushCommands);
        s.stop("\u2705 Pushed to GitHub");
      }
      if (!config.skipGithub && !config.dryRun) {
        s.start("Creating GitHub release...");
        const ghCheck = await $`which gh`.nothrow();
        if (ghCheck.exitCode !== 0) {
          s.stop("\u26A0\uFE0F  GitHub CLI not installed");
          kit.log.warn("Install gh CLI to create GitHub releases: https://cli.github.com");
        } else {
          const ghAuth = await $`gh auth status`.nothrow();
          if (ghAuth.exitCode !== 0 && !config.githubToken) {
            s.stop("\u26A0\uFE0F  Not authenticated to GitHub");
            const authMethod = await promptWithCancel(() => kit.select({
              message: "How would you like to authenticate to GitHub?",
              options: [
                { value: "browser", label: "Open browser to login" },
                { value: "token", label: "Enter GitHub token" },
                { value: "skip", label: "Skip GitHub release" }
              ]
            }));
            if (authMethod === "browser") {
              s.start("Opening GitHub login...");
              await $`gh auth login`;
              s.stop("\u2705 GitHub authentication complete");
            } else if (authMethod === "token") {
              config.githubToken = await promptWithCancel(() => kit.password({
                message: "Enter GitHub personal access token:"
              }));
            } else {
              config.skipGithub = true;
            }
          }
          if (!config.skipGithub) {
            const isPrerelease = config.version.includes("-");
            const changelog = await generateChangelog(config.previousVersion, config.version);
            const releaseNotes = `
# \u{1F680} Xec v${config.version}

${isPrerelease ? "**This is a pre-release version.**\n" : ""}

## \u{1F4E6} Packages

- **@xec-sh/core**: v${config.version}
- **@xec-sh/cli**: v${config.version}
- **@xec-sh/testing**: v${config.version}

## \u{1F4E5} Installation

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

## \u{1F504} What's Changed

${changelog}

## \u{1F4DA} Documentation

- [Getting Started](https://xec.sh/docs/getting-started)
- [API Reference](https://xec.sh/docs/api)
- [Examples](https://github.com/xec-sh/xec/tree/main/examples)

---

Created with \u2764\uFE0F by Xec Release Manager
`;
            const releaseExists = await $`gh release view v${config.version}`.nothrow().then((r) => r.exitCode === 0);
            if (releaseExists) {
              kit.log.warn(`GitHub release v${config.version} already exists`);
              const updateRelease = await promptWithCancel(() => kit.confirm({
                message: `Release v${config.version} already exists. Update it?`,
                initialValue: true
              }));
              if (!updateRelease) {
                kit.log.info("Skipping GitHub release update");
              } else {
                await $`gh release delete v${config.version} --yes`.nothrow();
                try {
                  if (config.githubToken) {
                    await $.env({ GH_TOKEN: config.githubToken })`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? "--prerelease" : ""}`;
                  } else {
                    await $`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? "--prerelease" : ""}`;
                  }
                } catch (error) {
                  kit.log.error("Failed to create GitHub release");
                  throw error;
                }
              }
            } else {
              try {
                if (config.githubToken) {
                  await $.env({ GH_TOKEN: config.githubToken })`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? "--prerelease" : ""}`;
                } else {
                  await $`gh release create v${config.version} --title "v${config.version}" --notes ${releaseNotes} ${isPrerelease ? "--prerelease" : ""}`;
                }
              } catch (error) {
                kit.log.error("Failed to create GitHub release");
                throw error;
              }
            }
            s.stop("\u2705 GitHub release created");
          }
        }
      }
      if (fileConfig.hooks?.postRelease && !config.dryRun) {
        s.start("Running post-release hook...");
        const hookResult = await $.env({ RELEASE_VERSION: config.version }).raw`${fileConfig.hooks.postRelease}`.nothrow();
        s.stop(
          hookResult.exitCode === 0 ? "\u2705 Post-release hook completed" : "\u26A0\uFE0F  Post-release hook failed (non-critical)"
        );
      }
      if (usedChangesFile && !config.dryRun) {
        try {
          writeFileSync("CHANGES.md", "");
          kit.log.info("Cleared CHANGES.md after successful release");
        } catch (error) {
          kit.log.warn("Could not clear CHANGES.md: " + error);
        }
      }
      kit.outro(prism.green(`
\u2728 Release v${config.version} completed successfully!

\u{1F4E6} Published packages:
${config.packages.map((p) => `  - ${p.name}@${config.version}`).join("\n")}

\u{1F517} Links:
  - NPM: https://www.npmjs.com/package/@xec-sh/core
  - JSR: https://jsr.io/@xec/core
  - GitHub: https://github.com/xec-sh/xec/releases/tag/v${config.version}

\u{1F389} Happy coding with Xec!
        `));
      process.exit(0);
    } catch (error) {
      s.stop("\u274C Release failed");
      kit.log.error(error.message);
      if (!options.dryRun) {
        const rollback = await kit.confirm({
          message: "Would you like to rollback changes?",
          initialValue: true
        });
        if (kit.isCancel(rollback) || rollback) {
          await performRollback(rollbackState, config);
        }
      }
      kit.outro(prism.red("Release failed"));
      process.exit(1);
    }
  });
}
export {
  command
};
