import { access } from 'node:fs/promises';

import { within } from '../../../src/utils/within.js';
import { MockAdapter } from '../../../src/adapters/mock/index.js';
import { ExecutionEngine } from '../../../src/core/execution-engine.js';
import { AdapterError, TimeoutError } from '../../../src/core/error.js';

describe('command lookup distinguishes absence from an unavailable observation', () => {
  let engine: ExecutionEngine;
  let adapter: MockAdapter;
  beforeEach(() => {
    engine = new ExecutionEngine({ defaultAdapter: 'mock' });
    adapter = new MockAdapter({ defaultDelay: 0 });
    engine.registerAdapter('mock', adapter);
  });
  afterEach(async () => { await engine.dispose(); });

  it('returns the first executable and null only for a confirmed absence', async () => {
    adapter.mockDefault({ stdout: 'found\n/bin/first\n/bin/second\n', exitCode: 0 });
    await expect(engine.which('tool')).resolves.toBe('/bin/first');
    adapter.mockDefault({ exitCode: 0, stdout: 'missing\n' });
    await expect(engine.which('missing')).resolves.toBeNull();
    await expect(engine.isCommandAvailable('missing')).resolves.toBe(false);
  });

  it('rejects an invalid lookup, including an empty successful response', async () => {
    adapter.mockDefault({ exitCode: 2, stderr: 'invalid invocation' });
    await expect(engine.which('tool')).rejects.toMatchObject({ exitCode: 2 });
    adapter.mockDefault({ exitCode: 0, stdout: '' });
    await expect(engine.which('tool')).rejects.toThrow(/empty|without.*path|no.*path/i);
  });

  it('does not interpret an unacknowledged remote exit 1 as a missing command', async () => {
    adapter.mockDefault({ exitCode: 1, stderr: 'cluster authorization refused' });
    await expect(engine.which('tool')).rejects.toMatchObject({ exitCode: 1 });
    adapter.mockDefault({ exitCode: 0, stdout: 'missing\nextra data' });
    await expect(engine.which('tool')).rejects.toThrow(/valid path observation/);
  });

  it('surfaces transport and authorization errors unchanged', async () => {
    for (const reason of ['transport unavailable', 'authentication refused']) {
      const error = new AdapterError('ssh', 'connect', new Error(reason));
      adapter.mockDefault({ error });
      await expect(engine.which('tool')).rejects.toBe(error);
      await expect(engine.isCommandAvailable('tool')).rejects.toBe(error);
    }
  });

  it('does not classify timeout or signal termination as missing', async () => {
    const error = new TimeoutError('which tool', 10);
    adapter.mockDefault({ error });
    await expect(engine.which('tool')).rejects.toBe(error);
    adapter.mockDefault({ exitCode: 1, signal: 'SIGTERM' });
    await expect(engine.which('tool')).rejects.toMatchObject({ signal: 'SIGTERM' });
  });

  it('preserves inherited cancellation even when the caller disables ordinary nonzero throwing', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel lookup');
    controller.abort(reason);
    await expect(within({ signal: controller.signal }, () => engine.with({ throwOnNonZeroExit: false }).which('tool'))).rejects.toBe(reason);
    expect(adapter.getExecutedCommands()).toEqual([]);
  });

  it('resolves the current executable through the native local target', async () => {
    const local = new ExecutionEngine();
    try {
      const resolved = await local.which(process.execPath);
      expect(resolved).not.toBeNull();
      await expect(access(resolved!)).resolves.toBeUndefined();
      await expect(local.which('xec-command-definitely-not-installed-71c08c')).resolves.toBeNull();
    } finally { await local.dispose(); }
  });
});
