/**
 * 17 - Streaming Output
 *
 * Async iterable streaming with different log levels.
 * Useful for displaying real-time data from generators or API responses.
 */
import { setTimeout } from 'node:timers/promises';

import { intro, stream, outro } from '../src/index.js';

async function* generateSteps() {
  const steps = [
    'Connecting to server...',
    'Authenticating...',
    'Fetching data...',
    'Processing batch 1/3...',
    'Processing batch 2/3...',
    'Processing batch 3/3...',
    'Finalizing...',
    'Done!',
  ];
  for (const step of steps) {
    await setTimeout(400);
    yield step + '\n';
  }
}

async function main() {
  intro('Streaming Output Example');

  // Stream with step-level formatting
  await stream.step(generateSteps());

  outro('Stream complete!');
}

main().catch(console.error);
