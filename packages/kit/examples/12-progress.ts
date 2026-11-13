/**
 * 12 - Progress Bar
 *
 * Visual progress indicators extending the spinner with
 * three built-in styles and advance/message methods.
 */
import { setTimeout } from 'node:timers/promises';

import { log, intro, outro, progress } from '../src/index.js';

async function main() {
  intro('Progress Bar Examples');
  log.info('The bars below animate simulated work.');

  // Heavy style (default)
  const p1 = progress({ style: 'heavy', max: 100, size: 40 });
  p1.start('Downloading');
  for (let i = 0; i < 10; i++) {
    await setTimeout(60);
    p1.advance(10, `Downloading ${(i + 1) * 10}%`);
  }
  p1.stop('Download complete');

  // Block style
  const p2 = progress({ style: 'block', max: 50 });
  p2.start('Compiling');
  for (let i = 0; i < 50; i++) {
    await setTimeout(10);
    p2.advance(1, `Compiling module ${i + 1}/50`);
  }
  p2.stop('Compilation finished');

  // Light style with cancel
  const p3 = progress({ style: 'light', max: 100 });
  p3.start('Uploading');
  for (let i = 0; i < 6; i++) {
    await setTimeout(80);
    p3.advance(15);
  }
  p3.cancel('Demonstrated cancellation');

  // A completed or cancelled instance can start again with its value reset.
  p3.start('Retry preview');
  p3.advance(100, 'Retry preview 100%');
  p3.stop('Retry preview complete');

  log.success('All progress demos complete');
  outro('Done!');
}

await main();
