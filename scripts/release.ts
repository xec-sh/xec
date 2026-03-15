#!/usr/bin/env tsx

/**
 * Unified release script for Xec monorepo
 *
 * Usage:
 *   pnpm release                    Interactive release
 *   pnpm release --list             List all packages
 *   pnpm release --dry-run          Simulate release
 *   pnpm release --skip-build       Skip builds
 *   pnpm release --skip-publish     Skip npm publish
 *   pnpm release --force            Allow dirty working tree
 */

import { glob } from 'glob'
import semver from 'semver'
import * as path from 'node:path'
import * as fs from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'
import { text, prism, select, confirm } from '@xec-sh/kit'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..')
const PACKAGES_DIR = path.join(ROOT_DIR, 'packages')
const APPS_DIR = path.join(ROOT_DIR, 'apps')

// Publish order: dependencies first, dependents last
const PUBLISH_ORDER = [
  '@xec-sh/testing',
  '@xec-sh/kit',
  '@xec-sh/core',
  '@xec-sh/loader',
  '@xec-sh/ops',
  '@xec-sh/cli',
]

interface Package {
  name: string
  version: string
  path: string
  private: boolean
  relativePath: string
}

interface ReleaseOptions {
  skipBuild?: boolean
  skipPublish?: boolean
  dryRun?: boolean
  force?: boolean
  listPackages?: boolean
}

function exec(cmd: string, opts: { cwd?: string; silent?: boolean } = {}): string {
  const { cwd = ROOT_DIR, silent = false } = opts
  try {
    const result = execSync(cmd, { cwd, encoding: 'utf-8', stdio: silent ? 'pipe' : 'inherit' })
    return result?.trim() || ''
  } catch (error: unknown) {
    if (!silent) {
      const msg = error instanceof Error ? error.message : String(error)
      console.error(prism.red(`Command failed: ${cmd}`))
      console.error(msg)
    }
    throw error
  }
}

async function getAllPackages(): Promise<Package[]> {
  const packages: Package[] = []
  const packagePaths = await glob('{packages,apps}/*/package.json', {
    cwd: ROOT_DIR,
    ignore: ['**/node_modules/**', '**/dist/**'],
  })

  for (const pkgPath of packagePaths) {
    const fullPath = path.join(ROOT_DIR, pkgPath)
    const packageDir = path.dirname(fullPath)

    try {
      const content = await fs.readFile(fullPath, 'utf-8')
      const pkg = JSON.parse(content)
      if (!pkg.name || !pkg.name.startsWith('@xec-sh/')) continue

      packages.push({
        name: pkg.name,
        version: pkg.version,
        path: packageDir,
        private: pkg.private || false,
        relativePath: path.relative(ROOT_DIR, packageDir),
      })
    } catch {
      // Skip invalid package.json
    }
  }

  // Sort by publish order
  return packages.sort((a, b) => {
    const ai = PUBLISH_ORDER.indexOf(a.name)
    const bi = PUBLISH_ORDER.indexOf(b.name)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })
}

async function listPackages(): Promise<void> {
  const packages = await getAllPackages()

  console.log(prism.bold(prism.cyan('\n📦 Xec Monorepo Packages\n')))

  const publishable = packages.filter(pkg => !pkg.private)
  const privatePkgs = packages.filter(pkg => pkg.private)

  if (publishable.length > 0) {
    console.log(prism.bold(prism.green(`Publishable (${publishable.length}):\n`)))
    for (const pkg of publishable) {
      console.log(`  ${prism.cyan(pkg.name.padEnd(25))} ${prism.dim(pkg.version.padEnd(10))} ${prism.gray(pkg.relativePath)}`)
    }
  }

  if (privatePkgs.length > 0) {
    console.log(prism.bold(prism.yellow(`\nPrivate (${privatePkgs.length}):\n`)))
    for (const pkg of privatePkgs) {
      console.log(`  ${prism.yellow(pkg.name.padEnd(25))} ${prism.dim(pkg.version.padEnd(10))} ${prism.gray(pkg.relativePath)}`)
    }
  }

  console.log(prism.gray(`\nTotal: ${packages.length} packages\n`))
}

async function getCurrentVersion(): Promise<string> {
  const rootPkg = JSON.parse(await fs.readFile(path.join(ROOT_DIR, 'package.json'), 'utf-8'))
  return rootPkg.version || '0.0.0'
}

async function updatePackageVersion(packagePath: string, version: string): Promise<void> {
  const pkgJsonPath = path.join(packagePath, 'package.json')
  const content = await fs.readFile(pkgJsonPath, 'utf-8')
  const pkg = JSON.parse(content)

  pkg.version = version

  // Update workspace deps to use the new version for publish
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies']) {
    if (pkg[field]) {
      for (const [depName, depVersion] of Object.entries(pkg[field])) {
        if (depName.startsWith('@xec-sh/') && depVersion === 'workspace:*') {
          // Keep workspace protocol — pnpm publish handles this
        }
      }
    }
  }

  await fs.writeFile(pkgJsonPath, JSON.stringify(pkg, null, 2) + '\n')
}

function checkGitStatus(options: ReleaseOptions): void {
  const status = exec('git status --porcelain', { silent: true })
  if (status && !options.force) {
    console.error(prism.red('Working directory is not clean:'))
    console.error(status)
    throw new Error('Commit or stash changes first (or use --force)')
  }

  const branch = exec('git branch --show-current', { silent: true })
  if (branch !== 'main' && branch !== 'master' && !options.force) {
    throw new Error(`Must be on main branch (currently on ${branch}). Use --force to override.`)
  }
}

async function generateChangelog(version: string): Promise<string> {
  const date = new Date().toISOString().split('T')[0]

  let commits = ''
  try {
    const lastTag = exec('git describe --tags --abbrev=0', { silent: true })
    commits = exec(`git log ${lastTag}..HEAD --oneline`, { silent: true })
  } catch {
    commits = exec('git log --oneline -50', { silent: true })
  }

  const features: string[] = []
  const fixes: string[] = []
  const breaking: string[] = []
  const refactors: string[] = []
  const other: string[] = []

  for (const line of commits.split('\n')) {
    if (!line) continue
    const match = line.match(/^[a-f0-9]+ (.+)$/)
    if (!match || !match[1]) continue
    const message = match[1]

    if (message.includes('BREAKING')) breaking.push(message)
    else if (message.startsWith('feat')) features.push(message)
    else if (message.startsWith('fix')) fixes.push(message)
    else if (message.startsWith('refactor')) refactors.push(message)
    else other.push(message)
  }

  let changelog = `## [${version}] - ${date}\n\n`

  if (breaking.length > 0) {
    changelog += '### ⚠️ BREAKING CHANGES\n\n'
    breaking.forEach(msg => (changelog += `- ${msg}\n`))
    changelog += '\n'
  }
  if (features.length > 0) {
    changelog += '### ✨ Features\n\n'
    features.forEach(msg => (changelog += `- ${msg}\n`))
    changelog += '\n'
  }
  if (fixes.length > 0) {
    changelog += '### 🐛 Bug Fixes\n\n'
    fixes.forEach(msg => (changelog += `- ${msg}\n`))
    changelog += '\n'
  }
  if (refactors.length > 0) {
    changelog += '### ♻️ Refactors\n\n'
    refactors.forEach(msg => (changelog += `- ${msg}\n`))
    changelog += '\n'
  }
  if (other.length > 0) {
    changelog += '### 📝 Other Changes\n\n'
    other.forEach(msg => (changelog += `- ${msg}\n`))
    changelog += '\n'
  }

  return changelog
}

async function updateChangelog(version: string): Promise<void> {
  const changelogPath = path.join(ROOT_DIR, 'CHANGELOG.md')
  const newEntry = await generateChangelog(version)

  let existing = ''
  try {
    existing = await fs.readFile(changelogPath, 'utf-8')
  } catch {
    existing = `# Changelog\n\nAll notable changes to this project will be documented in this file.\n\n`
  }

  const lines = existing.split('\n')
  const insertIndex = lines.findIndex(line => line.startsWith('## ['))
  if (insertIndex > 0) {
    lines.splice(insertIndex, 0, newEntry)
  } else {
    lines.push(newEntry)
  }

  await fs.writeFile(changelogPath, lines.join('\n'))
}

async function promptVersion(currentVersion: string): Promise<string> {
  const versionType = await select({
    message: `Current version: ${currentVersion}. Select bump:`,
    options: [
      { label: `Patch (${semver.inc(currentVersion, 'patch')})`, value: 'patch' },
      { label: `Minor (${semver.inc(currentVersion, 'minor')})`, value: 'minor' },
      { label: `Major (${semver.inc(currentVersion, 'major')})`, value: 'major' },
      { label: 'Prerelease', value: 'prerelease' },
      { label: 'Custom', value: 'custom' },
    ],
  })

  if (versionType === 'custom') {
    const custom = await text({
      message: 'Enter version:',
      validate: v => (!semver.valid(v) ? 'Invalid semver' : undefined),
    })
    return custom as string
  }

  if (versionType === 'prerelease') {
    const pre = await select({
      message: 'Prerelease type:',
      options: [
        { label: 'Alpha', value: 'alpha' },
        { label: 'Beta', value: 'beta' },
        { label: 'RC', value: 'rc' },
      ],
    })
    return semver.inc(currentVersion, 'prerelease', pre as string) || currentVersion
  }

  return semver.inc(currentVersion, versionType as semver.ReleaseType) || currentVersion
}

async function main() {
  console.log(prism.bold(prism.cyan('\n🚀 Xec Release\n')))

  const args = process.argv.slice(2)
  const options: ReleaseOptions = {
    skipBuild: args.includes('--skip-build'),
    skipPublish: args.includes('--skip-publish'),
    dryRun: args.includes('--dry-run'),
    force: args.includes('--force'),
    listPackages: args.includes('--list-packages') || args.includes('--list'),
  }

  if (options.listPackages) {
    await listPackages()
    return
  }

  try {
    // 1. Check environment
    console.log(prism.cyan('📋 Checking environment...'))
    checkGitStatus(options)
    console.log(prism.green('✅ Git clean'))

    // 2. Discover packages
    const currentVersion = await getCurrentVersion()
    const packages = await getAllPackages()
    console.log(prism.gray(`Version: ${currentVersion}, ${packages.length} packages`))

    // 3. Prompt version
    const newVersion = await promptVersion(currentVersion)
    console.log(prism.bold(prism.green(`\n📦 Releasing v${newVersion}\n`)))

    // 4. Update versions
    console.log(prism.cyan('📝 Updating versions...'))
    await updatePackageVersion(ROOT_DIR, newVersion)
    for (const pkg of packages) {
      await updatePackageVersion(pkg.path, newVersion)
      console.log(prism.gray(`  ${pkg.name} → ${newVersion}`))
    }
    console.log(prism.green('✅ Versions updated'))

    // 5. Changelog
    console.log(prism.cyan('\n📄 Generating changelog...'))
    await updateChangelog(newVersion)
    console.log(prism.green('✅ Changelog updated'))

    // 6. Build
    if (!options.skipBuild) {
      console.log(prism.cyan('\n🔨 Building...'))
      exec('pnpm build')
      console.log(prism.green('✅ Built'))
    }

    // 7. Publish
    if (!options.skipPublish) {
      const publishable = packages.filter(p => !p.private)
      console.log(prism.cyan(`\n📦 Publishing ${publishable.length} packages...`))

      for (const pkg of publishable) {
        if (options.dryRun) {
          console.log(prism.yellow(`  [DRY RUN] ${pkg.name}`))
        } else {
          try {
            exec('pnpm publish --access public --no-git-checks', { cwd: pkg.path })
            console.log(prism.green(`  ✅ ${pkg.name}`))
          } catch {
            console.error(prism.red(`  ❌ ${pkg.name}`))
            throw new Error(`Failed to publish ${pkg.name}`)
          }
        }
      }
    }

    // 9. Git tag
    if (!options.dryRun) {
      exec('git add -A')
      exec(`git commit -m "chore(release): v${newVersion}"`)
      exec(`git tag -a v${newVersion} -m "Release v${newVersion}"`)

      const shouldPush = await confirm({ message: 'Push to remote?' })
      if (shouldPush) {
        exec('git push && git push --tags')
        console.log(prism.green('✅ Pushed'))
      }
    }

    console.log(prism.bold(prism.green('\n✨ Release complete!\n')))
    console.log(`  Tag: v${newVersion}`)
    console.log(`  GitHub: https://github.com/xec-sh/xec/releases/new?tag=v${newVersion}`)
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    console.error(prism.red(`\n❌ Release failed: ${msg}`))
    process.exit(1)
  }
}

main().catch(err => {
  console.error(prism.red('Fatal:'), err)
  process.exit(1)
})
