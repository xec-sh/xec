import { trust, commandsIn } from '@xec-sh/ops';
import { log, prism, confirm } from '@xec-sh/kit';

/**
 * Ask whether a configuration that runs commands may be loaded.
 *
 * `${cmd:...}` executes a shell command when the configuration is read, so a
 * configuration file is executable code — and configuration files arrive by
 * `git clone`. This is the moment the decision is a human's to make, so it
 * shows the commands rather than the fact that there are some. "This config
 * runs commands" is not something anyone can decide about.
 *
 * Refuses without asking when there is no terminal. A pipeline that owns its
 * configuration says so with `XEC_TRUST_CONFIG=1`, or approves it once with
 * `xec config trust`; guessing that an unattended run consents is how a gate
 * becomes decoration.
 */
export async function promptForConfigTrust(configPath: string, content: string): Promise<boolean> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    return false;
  }

  const commands = commandsIn(content);

  log.warn(
    `${prism.bold(configPath)} runs ${commands.length === 1 ? 'a command' : 'commands'} when it is loaded:`
  );
  for (const command of commands) {
    log.message(`  ${prism.yellow(command)}`);
  }
  log.message(
    prism.dim('They run as you, with your credentials, on every command that reads this file.')
  );

  const approved = await confirm({
    message: 'Approve this configuration?',
    initialValue: false,
  });

  // A cancelled prompt is a symbol, not a boolean — and not an approval.
  if (approved !== true) {
    return false;
  }

  await trust(configPath, content);
  log.success('Approved. Editing the file will ask again.');
  return true;
}
