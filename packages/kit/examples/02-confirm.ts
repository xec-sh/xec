/**
 * 02 - Confirm Prompt
 *
 * Yes/No selection with horizontal and vertical layouts.
 */
import { log, intro, outro, cancel, confirm, isCancel } from '../src/index.js';

async function main() {
  intro('Confirm Prompt Examples');
  log.info('These prompts only preview choices; no deployment or deletion is performed.');

  // Basic confirm (horizontal layout)
  const proceed = await confirm({
    message: 'Do you want to continue?',
  });
  if (isCancel(proceed)) {
    cancel('Cancelled.');
    return;
  }

  // Custom labels
  const deploy = await confirm({
    message: 'Include deployment in the preview?',
    active: 'Deploy now',
    inactive: 'Skip deploy',
    initialValue: false,
  });
  if (isCancel(deploy)) {
    cancel('Cancelled.');
    return;
  }

  // Vertical layout - options stacked on separate lines
  const deleteAll = await confirm({
    message: 'Include file removal in the preview?',
    active: 'Include removal',
    inactive: 'No, keep my files',
    vertical: true,
    initialValue: false,
  });
  if (isCancel(deleteAll)) {
    cancel('Cancelled.');
    return;
  }

  log.info(`Continue: ${proceed}, Deploy: ${deploy}, Delete: ${deleteAll}`);
  outro('Done!');
}

await main();
