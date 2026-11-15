import type { Command } from 'commander';

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkSSHBoundary } from '../lib/ssh-boundary.js';
import { checkSSHSecurity } from '../lib/ssh-security.js';
import { inspectSSHTransport, prepareSSHCorePackage, verifyPreparedSSHCorePackage } from '../lib/ssh-transport.js';

const root = fileURLToPath(new URL('../../', import.meta.url));

/** Project SSH release operations run through the pinned published Xec driver. */
export function command(program: Command): void {
  const ssh = program.command('ssh').description('Prepare and verify the reviewed SSH release payload')
    .allowUnknownOption(false).allowExcessArguments(false);
  ssh.command('prepare <directory>').description('Copy the completed Core build and bundle reviewed SSH dependencies in a new directory')
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async (directory: string) => { console.log(await prepareSSHCorePackage(root, resolve(directory))); });
  ssh.command('guard <directory>').description('Verify the complete prepared Core package before packing')
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async (directory: string) => { await verifyPreparedSSHCorePackage(root, resolve(directory)); console.log('Prepared SSH package verified'); });
  ssh.command('verify <directory>').description('Verify a transport installation against the reviewed patch hashes')
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async (directory: string) => { await inspectSSHTransport(root, resolve(directory), 'patched'); console.log('Reviewed SSH transport verified'); });
  ssh.command('boundary').description('Compile isolated declarations and a consumer without transport-library types')
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async () => { await checkSSHBoundary(root); });
  ssh.command('security').description('Install the exact Core archive and exercise bounded hostile SSH peers')
    .option('--archive <file>', 'Verify an existing immutable archive; otherwise pack the completed Core build')
    .addOption(program.createOption('--consumer <manager>', 'Package manager for the isolated consumer').choices(['npm', 'pnpm']).default('npm'))
    .allowUnknownOption(false).allowExcessArguments(false)
    .action(async (options: { archive?: string; consumer: 'npm' | 'pnpm' }) => { console.log(JSON.stringify(await checkSSHSecurity(root, options), null, 2)); });
}
