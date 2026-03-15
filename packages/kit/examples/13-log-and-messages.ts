/**
 * 13 - Logging & Messages
 *
 * Structured log output (info, success, warn, error, step) and
 * flow markers (intro, outro, cancel, note, box).
 */
import {
  intro, outro, cancel, note, box, log, prism,
} from '../src/index.js';

function main() {
  // Flow markers
  intro('Logging & Messages Demo');

  // Log levels
  log.info('This is an informational message');
  log.success('Operation completed successfully');
  log.step('Step 1 of 3 completed');
  log.warn('Disk usage is above 80%');
  log.error('Failed to connect to database');

  // Multi-line messages
  log.message('This is a multi-line message\nwith several lines\nof content');

  // Note - highlighted message block with title
  note('Run these commands to get started:\n\n  npm install\n  npm run dev', 'Next steps');

  // Box - bordered container
  box(
    [
      `Status: ${prism.green('SUCCESS')}`,
      `Duration: ${prism.cyan('2.4s')}`,
      `Bundles: ${prism.yellow('3')}`,
    ].join('\n'),
    'Build Summary',
  );

  // Box with different options
  box(
    'This action cannot be undone.',
    'Warning',
    { rounded: false, titleAlign: 'center' },
  );

  outro('All done!');
}

main();
