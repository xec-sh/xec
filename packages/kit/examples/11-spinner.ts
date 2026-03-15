/**
 * 11 - Spinner
 *
 * Animated loading indicators with multiple styles, timer mode,
 * cancel/error/clear methods, and custom frame styling.
 */
import { setTimeout } from 'node:timers/promises';

import { intro, spinner, log, outro, prism } from '../src/index.js';

async function main() {
  intro('Spinner Examples');

  // Basic spinner with dots indicator
  const s1 = spinner();
  s1.start('Installing dependencies');
  await setTimeout(2000);
  s1.stop('Dependencies installed');

  // Timer indicator - shows elapsed time
  const s2 = spinner({ indicator: 'timer' });
  s2.start('Building project');
  await setTimeout(2500);
  s2.stop('Build complete');

  // Different built-in styles
  for (const style of ['circle', 'dots', 'line', 'arrow'] as const) {
    const s = spinner({ style });
    s.start(`Style: ${style}`);
    await setTimeout(1200);
    s.stop(`${style} done`);
  }

  // Custom frame styling function
  const s3 = spinner({
    styleFrame: (frame) => prism.cyan(frame),
  });
  s3.start('Custom styled spinner');
  await setTimeout(1500);
  s3.stop('Styled spinner done');

  // Cancel and error methods
  const s4 = spinner();
  s4.start('Checking connection');
  await setTimeout(1000);
  s4.cancel('Connection check skipped');

  const s5 = spinner();
  s5.start('Validating config');
  await setTimeout(1000);
  s5.error('Invalid configuration');

  // Clear method - silently removes spinner without message
  const s6 = spinner();
  s6.start('Temporary operation');
  await setTimeout(800);
  s6.clear();
  log.step('Spinner cleared silently');

  // Dynamic message updates
  const s7 = spinner();
  s7.start('Processing');
  for (let i = 1; i <= 5; i++) {
    await setTimeout(500);
    s7.message(`Processing step ${i}/5`);
  }
  s7.stop('All steps complete');

  outro('Done!');
}

main().catch(console.error);
