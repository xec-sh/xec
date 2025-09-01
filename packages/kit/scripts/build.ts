#!/usr/bin/env bun
/**
 * Build script for @xec-sh/kit package
 * Compiles TypeScript code and creates distribution package
 */

import { fileURLToPath } from 'url';
import path, { join, dirname, resolve } from 'path';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { rmSync, mkdirSync, existsSync, copyFileSync, readFileSync, writeFileSync } from 'fs';

interface PackageJson {
  name: string;
  version: string;
  license?: string;
  repository?: any;
  description?: string;
  homepage?: string;
  author?: string;
  bugs?: any;
  keywords?: string[];
  module?: string;
  main?: string;
  types?: string;
  type?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const licensePath = path.resolve(__dirname, '../../../LICENSE');
const packageJson: PackageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));

const args = process.argv.slice(2);
const isWatch = args.includes('--watch');
const isDev = args.includes('--dev');

// Helper function to replace relative links with absolute GitHub links
const replaceLinks = (text: string): string =>
  packageJson.homepage
    ? text.replace(
        /(\[.*?\]\()(\.\/.*?\))/g,
        (_, p1: string, p2: string) =>
          `${p1}${packageJson.homepage}/blob/HEAD/${p2.replace('./', '')}`
      )
    : text;

// Validate required fields
const requiredFields: (keyof PackageJson)[] = [
  'name',
  'version',
  'license',
  'repository',
  'description',
];
const missingRequired = requiredFields.filter((field) => !packageJson[field]);
if (missingRequired.length > 0) {
  console.error(`Error: Missing required fields in package.json: ${missingRequired.join(', ')}`);
  process.exit(1);
}

console.log(`Building @xec-sh/kit${isDev ? ' (dev mode)' : ''}...`);

const distDir = join(rootDir, 'dist');

// Clean dist directory
console.log('Cleaning dist directory...');
rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

// Generate TypeScript declarations
console.log('Generating TypeScript declarations...');
const tscArgs = [
  'tsc',
  './src/index.ts',
  '--declaration',
  '--declarationMap',
  '--emitDeclarationOnly',
  '--outDir',
  './dist',
  '--module',
  'esnext',
  '--target',
  'esnext',
  '--moduleResolution',
  'node',
  '--esModuleInterop',
  'true',
  '--skipLibCheck',
  'true',
  '--strict',
  'true',
];

const tscResult = spawnSync('npx', tscArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});

if (tscResult.status !== 0) {
  console.error('Error: TypeScript declaration generation failed');
  process.exit(1);
}

// Bundle with Bun
console.log('Bundling with Bun...');
const entryPoint = join(rootDir, 'src', 'index.ts');

// Get external dependencies
const externalDeps = [
  ...Object.keys(packageJson.dependencies || {}),
  ...Object.keys(packageJson.peerDependencies || {}),
];

const bundleArgs = [
  'build',
  entryPoint,
  '--target=node',
  `--outdir=${distDir}`,
  '--sourcemap',
  '--format=esm',
  isDev ? '' : '--minify',
  ...externalDeps.flatMap((dep) => ['--external', dep]),
].filter(Boolean);

const bundleResult: SpawnSyncReturns<Buffer> = spawnSync('bun', bundleArgs, {
  cwd: rootDir,
  stdio: 'inherit',
});

if (bundleResult.error) {
  console.error('Error: Bun is not installed or not in PATH');
  process.exit(1);
}

if (bundleResult.status !== 0) {
  console.error('Error: Bundling failed');
  process.exit(1);
}

// Verify that the file was created
if (!existsSync(join(distDir, 'index.js'))) {
  console.error('Error: index.js was not created in dist directory');
  process.exit(1);
}

// Create dist/package.json
const distPackageJson = {
  ...packageJson,
  main: 'index.js',
  module: 'index.js',
  types: 'index.d.ts',
};

// Remove scripts and devDependencies for published package
delete (distPackageJson as any).scripts;
delete distPackageJson.devDependencies;

writeFileSync(join(distDir, 'package.json'), JSON.stringify(distPackageJson, null, 2));

// Copy README and LICENSE
const readmePath = join(rootDir, 'README.md');
if (existsSync(readmePath)) {
  const readmeContent = readFileSync(readmePath, 'utf8');
  writeFileSync(join(distDir, 'README.md'), replaceLinks(readmeContent));
}

if (existsSync(licensePath)) {
  copyFileSync(licensePath, join(distDir, 'LICENSE'));
}

// Copy CHANGELOG if exists
const changelogPath = join(rootDir, 'CHANGELOG.md');
if (existsSync(changelogPath)) {
  copyFileSync(changelogPath, join(distDir, 'CHANGELOG.md'));
}

console.log(`✅ Build complete! Output at: ${distDir}`);

// Watch mode implementation
if (isWatch) {
  console.log('\n👀 Watching for changes...');

  const { watch } = await import('fs');
  const { join } = await import('path');

  const srcDir = join(rootDir, 'src');
  const watcher = watch(srcDir, { recursive: true }, (eventType, filename) => {
    if (!filename) return;
    if (filename.endsWith('.test.ts') || filename.endsWith('.spec.ts')) return;

    console.log(`\n🔄 File changed: ${filename}`);
    console.log('Rebuilding...');

    // Re-run the build process
    const rebuildResult = spawnSync('bun', ['scripts/build.ts', isDev ? '--dev' : ''], {
      cwd: rootDir,
      stdio: 'inherit',
    });

    if (rebuildResult.status === 0) {
      console.log('✅ Rebuild complete!');
    } else {
      console.error('❌ Rebuild failed!');
    }
  });

  // Handle Ctrl+C gracefully
  process.on('SIGINT', () => {
    console.log('\n👋 Stopping watch mode...');
    watcher.close();
    process.exit(0);
  });
}
