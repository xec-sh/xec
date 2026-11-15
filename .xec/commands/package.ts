import type { Command } from 'commander';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { realpath } from 'node:fs/promises';
import { discoverReleasePackages } from '@xec-sh/ops/release';

import { buildPackage, cleanPackage, type PackageBuildOptions } from '../lib/package-build.ts';

const repository = fileURLToPath(new URL('../../', import.meta.url));

async function workspace(directory: string): Promise<string> {
  const selected = await realpath(resolve(directory));
  const packages = await discoverReleasePackages(repository);
  const allowed = await Promise.all(packages.map((pkg) => realpath(resolve(repository, pkg.path))));
  if (!allowed.includes(selected)) throw new Error(`Not a declared public Xec workspace: ${selected}`);
  return selected;
}

/** Package DAG/cache stay in Turbo; each build uses the pinned published Xec executor. */
export function command(program: Command): void {
  const pkg = program
    .command('package')
    .description('Build or clean one declared Xec workspace')
    .allowExcessArguments(false);
  pkg
    .command('build <directory>')
    .description('Compile a package and replace dist only after success')
    .option('--project <config>', 'TypeScript project relative to the package', 'tsconfig.json')
    .option('--bundle <entry>', 'Bundle a Node ESM entry with Bun after compiling declarations')
    .option('--development', 'Keep the optional bundle unminified')
    .allowExcessArguments(false)
    .action(async (directory: string, options: PackageBuildOptions) => {
      await buildPackage(await workspace(directory), options);
    });
  pkg
    .command('clean <directory>')
    .description('Remove generated dist')
    .allowExcessArguments(false)
    .action(async (directory: string) => {
      await cleanPackage(await workspace(directory));
    });
}
