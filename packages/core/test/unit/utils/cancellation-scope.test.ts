import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { rm, mkdtemp, realpath } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';

import { sleep, within, withinSync, ExecutionEngine, getExecutionSignal, withoutCancellation } from '../../../src/index.js';

it.each(['parent', 'nested'] as const)('combines %s cancellation through nested and synchronous scopes', async source => {
  const parent = new AbortController(), nested = new AbortController();
  const reason = new TypeError('cancelled scope');
  await within({ signal: parent.signal }, async () => {
    await within({ cwd: process.cwd(), signal: nested.signal }, async () => {
      const signal = withinSync({ defaultEnv: { SCOPE: 'nested' } }, () => getExecutionSignal());
      expect(signal?.aborted).toBe(false);
      (source === 'parent' ? parent : nested).abort(reason);
      expect(signal?.aborted).toBe(true);
      expect(signal?.reason).toBe(reason);
    });
    expect(getExecutionSignal()?.aborted).toBe(source === 'parent');
  });
  expect(getExecutionSignal()).toBeUndefined();
});

it('refuses dispatch after cancellation even with a fresh explicit command signal', async () => {
  const parent = new AbortController(), command = new AbortController();
  const reason = new SyntaxError('parent stopped');
  const engine = new ExecutionEngine();
  let spawned = false;
  try {
    await within({ signal: parent.signal }, async () => {
      parent.abort(reason);
      await expect(engine.execute({ command: process.execPath, args: ['-e', 'process.exit(0)'], shell: false,
        signal: command.signal, onSpawn: () => { spawned = true; } })).rejects.toBe(reason);
    });
    expect(spawned).toBe(false);
  } finally { await engine.dispose(); }
});

it('does not cancel a concurrent sibling scope or its native command', async () => {
  const stopped = new AbortController(), healthy = new AbortController();
  const engine = new ExecutionEngine();
  try {
    await Promise.all([
      within({ signal: stopped.signal }, async () => { stopped.abort(new Error('one scope')); await delay(25); }),
      within({ signal: healthy.signal }, async () => {
        await delay(10);
        expect(getExecutionSignal()?.aborted).toBe(false);
        const result = await engine.execute({ command: process.execPath, args: ['-e', 'console.log("healthy")'], shell: false });
        expect(result.stdout.trim()).toBe('healthy');
      }),
    ]);
  } finally { await engine.dispose(); }
});

it('restores cancellation after explicit cleanup while preserving scoped defaults and new cancellation', async () => {
  const parent = new AbortController(), cleanup = new AbortController();
  await within({ signal: parent.signal, cwd: process.cwd(), defaultEnv: { CLEANUP_SCOPE: 'retained' } }, async () => {
    parent.abort(new Error('parent stopped'));
    await withoutCancellation(async () => {
      expect(getExecutionSignal()).toBeUndefined();
      await within({ signal: cleanup.signal }, async () => {
        const reason = new RangeError('cleanup stopped');
        cleanup.abort(reason);
        expect(getExecutionSignal()?.reason).toBe(reason);
      });
      const engine = new ExecutionEngine();
      try {
        const result = await engine.execute({ command: process.execPath,
          args: ['-e', 'console.log(JSON.stringify({cwd:process.cwd(),env:process.env.CLEANUP_SCOPE}))'], shell: false });
        expect(JSON.parse(result.stdout)).toEqual({ cwd: process.cwd(), env: 'retained' });
      } finally { await engine.dispose(); }
    });
    expect(getExecutionSignal()).toBe(parent.signal);
    expect(getExecutionSignal()?.aborted).toBe(true);
  });
});

it('inherits object-scope cwd and environment while isolating nested overrides', async () => {
  const engine = new ExecutionEngine();
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'xec-nested-scope-')));
  const read = async () => JSON.parse((await engine.execute({ command: process.execPath,
    args: ['-e', 'console.log(JSON.stringify({cwd:process.cwd(),outer:process.env.XEC_SCOPE_OUTER,value:process.env.XEC_SCOPE_VALUE}))'],
    shell: false })).stdout);
  try {
    await within({ cwd: directory, defaultEnv: { XEC_SCOPE_OUTER: 'retained', XEC_SCOPE_VALUE: 'outer' } }, async () => {
      await within({ defaultEnv: { XEC_SCOPE_VALUE: 'inner' } }, async () => {
        expect(await read()).toEqual({ cwd: directory, outer: 'retained', value: 'inner' });
      });
      expect(await read()).toEqual({ cwd: directory, outer: 'retained', value: 'outer' });
    });
  } finally { await engine.dispose(); await rm(directory, { recursive: true, force: true }); }
});

it('cancels scoped sleep promptly with the original abort reason', async () => {
  const cancellation = new AbortController();
  const reason = new SyntaxError('scope interrupted');
  const waiting = within({ signal: cancellation.signal }, () => sleep(60_000));
  cancellation.abort(reason);
  await expect(waiting).rejects.toBe(reason);
});
