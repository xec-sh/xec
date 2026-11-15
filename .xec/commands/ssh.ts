import type { Command } from 'commander';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkSSHSecurity, checkBuiltSSHSecurity } from '../lib/ssh-security.js';
import { checkSSHBoundary, checkSSHSourceOwnership } from '../lib/ssh-boundary.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Owned SSH qualification runs through the pinned published Xec driver. */
export function command(program: Command): void {
  const ssh = program
    .command('ssh')
    .description('Qualify the owned SSH package and its Core consumer')
    .allowUnknownOption(false)
    .allowExcessArguments(false);
  ssh
    .command('boundary')
    .description('Check an installed Core/SSH pair without rebuilding its declarations')
    .requiredOption('--consumer <directory>', 'Directory containing the isolated installed archive pair')
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .action(async (options: { consumer: string }) => {
      await checkSSHSourceOwnership(root);
      console.log(JSON.stringify(await checkSSHBoundary(root, { consumer: resolve(options.consumer) }), null, 2));
    });
  ssh
    .command('security')
    .description('Qualify exact Core/SSH archives; otherwise pack both completed builds once')
    .option('--core-archive <file>', 'Immutable Core archive; requires --ssh-archive')
    .option('--ssh-archive <file>', 'Immutable SSH archive; requires --core-archive')
    .addOption(
      program
        .createOption('--consumer <manager>', 'Package manager for the isolated consumer')
        .choices(['npm', 'pnpm'])
        .default('npm')
    )
    .allowUnknownOption(false)
    .allowExcessArguments(false)
    .action(async (options: { coreArchive?: string; sshArchive?: string; consumer: 'npm' | 'pnpm' }) => {
      if (!!options.coreArchive !== !!options.sshArchive)
        throw new Error('Pass both --core-archive and --ssh-archive, or neither');
      const result =
        options.coreArchive && options.sshArchive
          ? await checkSSHSecurity(root, {
              coreArchive: resolve(options.coreArchive),
              sshArchive: resolve(options.sshArchive),
              consumer: options.consumer,
            })
          : await checkBuiltSSHSecurity(root, { consumer: options.consumer });
      console.log(JSON.stringify(result, null, 2));
    });
}
