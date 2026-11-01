import type { ReleaseCommand } from './command.js';

import semver from 'semver';
import { readFile, realpath } from 'node:fs/promises';
import { join, relative, isAbsolute } from 'node:path';

import { releaseCommand } from './command.js';

export interface ReleasePackage {
  name: string;
  path: string;
  version: string;
  dependencies: string[];
}
export const validPackageName = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
export function releaseTag(version: string): string {
  if (semver.valid(version) !== version || version.includes('+')) throw new Error(`Expected a canonical semver version: ${version}`);
  return `v${version}`;
}
export function distributionTag(version: string): string {
  releaseTag(version);
  const prerelease = semver.prerelease(version);
  if (!prerelease) return 'latest';
  // Numeric prereleases cannot be npm dist-tags; use one explicit preview lane.
  const label = prerelease[0];
  return typeof label === 'string' && label !== 'latest' && /^[a-z][a-z0-9-]*$/.test(label) && !semver.validRange(label) ? label : 'next';
}

/** The package manager owns workspace globs, exclusions and private packages. */
export async function discoverReleasePackages(root: string, run: ReleaseCommand = releaseCommand): Promise<ReleasePackage[]> {
  const realRoot = await realpath(root);
  const inventory: unknown = JSON.parse(await run(root, 'pnpm', ['--config.lockfile=false', '--config.ignore-pnpmfile=true', '--recursive', 'list', '--depth', '-1', '--json']));
  if (!Array.isArray(inventory)) throw new Error('Invalid workspace inventory');
  const packages: ReleasePackage[] = [];
  const names = new Set<string>();
  for (const entry of inventory as Array<{ path?: unknown }>) {
    if (typeof entry.path !== 'string') throw new Error('Workspace has no path');
    const location = await realpath(entry.path);
    const path = relative(realRoot, location);
    if (isAbsolute(path) || path === '..' || path.startsWith('../') || path.startsWith('..\\')) throw new Error(`Workspace is outside repository: ${location}`);
    const manifest = JSON.parse(await readFile(join(location, 'package.json'), 'utf8')) as Record<string, unknown>;
    if (manifest['private'] === true) continue;
    if (typeof manifest['name'] !== 'string' || !validPackageName.test(manifest['name']) || typeof manifest['version'] !== 'string') throw new Error(`Invalid package identity: ${path}`);
    if (names.has(manifest['name'])) throw new Error(`Duplicate release package: ${manifest['name']}`);
    releaseTag(manifest['version']); names.add(manifest['name']);
    const dependencies = Object.keys(Object.assign({}, manifest['dependencies'], manifest['optionalDependencies'], manifest['peerDependencies']));
    packages.push({ name: manifest['name'], path: path || '.', version: manifest['version'], dependencies });
  }
  if (!packages.length) throw new Error('No publishable workspaces');
  const ordered: ReleasePackage[] = [], placed = new Set<string>();
  while (ordered.length < packages.length) {
    const ready = packages.filter(pkg => !placed.has(pkg.name) && pkg.dependencies.every(name => !names.has(name) || placed.has(name)))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!ready.length) throw new Error('Publishable workspace dependency cycle');
    for (const pkg of ready) { ordered.push(pkg); placed.add(pkg.name); }
  }
  return ordered;
}
