import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import { rm, mkdtemp, readdir, readFile } from 'node:fs/promises';
import { within, getExecutionSignal, withoutCancellation } from '@xec-sh/core';

import { retry } from '../../src/retry/index.js';
import { Pipeline } from '../../src/pipeline/index.js';
import { releaseCommand, ReleaseCommandError } from '../../src/release/command.js';

it('only executes explicit cleanup in a cancelled scope and restores the parent afterwards', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'xec-cleanup-command-'));
  const parent = new AbortController();
  const marker = (name: string) => ['--input-type=module', '-e',
    `import{writeFile}from'node:fs/promises';await writeFile(${JSON.stringify(name)},process.env.CLEANUP_SCOPE)`];
  try {
    await within({ signal: parent.signal, defaultEnv: { CLEANUP_SCOPE: 'retained' } }, async () => {
      parent.abort(new TypeError('cancelled workflow'));
      await expect(releaseCommand(directory, process.execPath, marker('before'), { signal: new AbortController().signal }))
        .rejects.toBeInstanceOf(ReleaseCommandError);
      await withoutCancellation(() => releaseCommand(directory, process.execPath, marker('cleanup'), { signal: AbortSignal.timeout(2000) }));
      expect(getExecutionSignal()).toBe(parent.signal);
      await expect(releaseCommand(directory, process.execPath, marker('after'))).rejects.toThrow('cancelled workflow');
    });
    expect(await readdir(directory)).toEqual(['cleanup']);
    expect(await readFile(join(directory, 'cleanup'), 'utf8')).toBe('retained');
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it('propagates inherited cancellation to function pipeline steps with a separate explicit signal', async () => {
  const parent = new AbortController();
  const reason = new TypeError('workflow stopped');
  let observed: AbortSignal | undefined;
  const pipeline = Pipeline.create('cancelled').step('waiting', { run: async context => {
    observed = context.signal;
    parent.abort(reason);
    await delay(60_000, undefined, { signal: context.signal });
  } }).step('never', { dependsOn: ['waiting'], run: async () => { throw Error('must not execute'); } });
  const result = await within({ signal: parent.signal }, () => pipeline.run({}, { signal: new AbortController().signal }));
  expect(result.status).toBe('cancelled');
  expect(observed?.reason).toBe(reason);
  expect(result.steps[1]?.skipped).toBe(true);
});

it('cancels retry backoff promptly and preserves the explicit abort reason', async () => {
  const parent = new AbortController(), operation = new AbortController();
  const reason = new RangeError('retry stopped');
  let attempts = 0;
  await expect(within({ signal: parent.signal }, () => retry(() => {
    attempts++; throw Error('try again');
  }, { maxAttempts: 3, initialDelay: 60_000, abortSignal: operation.signal,
    onRetry: () => { operation.abort(reason); } }))).rejects.toBe(reason);
  expect(attempts).toBe(1);
  expect(parent.signal.aborted).toBe(false);
});
