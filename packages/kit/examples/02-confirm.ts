/**
 * 02 - Confirm Prompt
 *
 * Yes/No selection with horizontal and vertical layouts.
 */
import { intro, confirm, isCancel, cancel, log, outro } from '../src/index.js';

async function main() {
  intro('Confirm Prompt Examples');

  // Basic confirm (horizontal layout)
  const proceed = await confirm({
    message: 'Do you want to continue?',
  });
  if (isCancel(proceed)) { cancel('Cancelled.'); process.exit(0); }

  // Custom labels
  const deploy = await confirm({
    message: 'Deploy to production?',
    active: 'Deploy now',
    inactive: 'Skip deploy',
    initialValue: false,
  });
  if (isCancel(deploy)) { cancel('Cancelled.'); process.exit(0); }

  // Vertical layout - options stacked on separate lines
  const deleteAll = await confirm({
    message: 'Are you sure you want to delete all files?',
    active: 'Yes, delete everything',
    inactive: 'No, keep my files',
    vertical: true,
    initialValue: false,
  });
  if (isCancel(deleteAll)) { cancel('Cancelled.'); process.exit(0); }

  log.info(`Continue: ${proceed}, Deploy: ${deploy}, Delete: ${deleteAll}`);
  outro('Done!');
}

main().catch(console.error);
