/**
 * 17 - Streaming Output
 *
 * Fragmented text, explicit destinations, plain output and cooperative
 * cancellation. No network calls or external processes are started.
 */
import { setTimeout } from 'node:timers/promises';

import { log, intro, outro, stream } from '../src/index.js';

async function* fragments() {
  for (const fragment of [
    'Reading ',
    'local data\n',
    'Unicode: 日',
    '本語 👨',
    '‍👩‍👧‍👦\n',
    'Complete.',
  ]) {
    await setTimeout(80);
    yield fragment;
  }
}

async function main() {
  intro('Streaming Output');
  await stream.step(fragments());
  await stream.warn(['A diagnostic ', 'sent to stderr.'], {
    output: process.stderr,
    accessible: true,
    withGuide: false,
    spacing: 0,
  });

  const controller = new AbortController();
  const reason = new Error('Demonstration cancellation');
  let producerClosed = false;
  async function* cancellable() {
    try {
      yield 'One row delivered.\n';
      // A producer waiting on I/O must receive the same signal as stream.
      // Schedule cancellation here so the first row is deterministic.
      const timer = globalThis.setTimeout(() => controller.abort(reason), 80);
      try {
        await setTimeout(5_000, undefined, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      yield 'This row must never be displayed.\n';
    } finally {
      producerClosed = true;
    }
  }

  try {
    await stream.message(cancellable(), { signal: controller.signal });
    throw new Error('Expected the demonstration stream to be cancelled');
  } catch (error) {
    if (
      !controller.signal.aborted ||
      (error !== reason && !(error instanceof Error && error.cause === reason))
    ) {
      throw error;
    }
    if (!producerClosed) throw new Error('Producer cleanup did not complete', { cause: error });
    log.info('Cancellation acknowledged; producer cleanup completed.');
  }
  outro('Stream demonstration complete.');
}

await main();
