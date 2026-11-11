import type { Command } from 'commander';

import { runRelease } from '../../scripts/release.ts';

/** Execute the release recipe inside Xec's script runtime. */
export function command(program: Command): void {
  program.command('release [args...]')
    .description('Prepare immutable packages and resume verified npm/GitHub publication')
    .allowUnknownOption(true)
    .helpOption(false)
    .action((args: string[]) => runRelease(args));
}
