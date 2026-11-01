import type { Command } from 'commander';

import { join } from 'node:path';
import { spawn } from 'node:child_process';

/** The interactive command and npm script use the same reviewable release pipeline. */
export function command(program: Command): void {
  program.command('release [args...]')
    .description('Prepare immutable packages and resume verified npm/GitHub publication')
    .allowUnknownOption(true)
    .helpOption(false)
    .action(async (args: string[]) => {
      const status = await new Promise<number>((resolve, reject) => {
        const child = spawn(process.execPath, ['--import', 'tsx', join(process.cwd(), 'scripts/release.ts'), ...args], { stdio: 'inherit' });
        child.once('error', reject);
        child.once('exit', code => resolve(code ?? 1));
      });
      process.exitCode = status;
    });
}
