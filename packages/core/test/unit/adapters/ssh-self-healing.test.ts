import type { ExecutionResult } from '../../../src/core/result.js';

import { vi, afterEach } from 'vitest';

import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { TimeoutError, ConnectionError } from '../../../src/core/error.js';

const OPTIONS = {
  type: 'ssh' as const,
  host: 'example.invalid',
  username: 'deploy',
  password: 'secret',
};

/** Retry acquisition failures only; a dispatched command must not be repeated. */
describe('SSH adapter recovers before command dispatch', () => {
  const adapters: SSHAdapter[] = [];
  afterEach(async () => {
    await Promise.all(adapters.splice(0).map(adapter => adapter.dispose()));
    vi.restoreAllMocks();
  });

  function scriptedAdapter(script: Array<Error | 'ok'>) {
    const adapter = new SSHAdapter({ connectionPool: { reconnectDelay: 0 } });
    adapters.push(adapter);
    let index = 0;
    const attempt = vi.spyOn(adapter as any, 'executeOnce').mockImplementation(async () => {
      const step = script[index++];
      if (step instanceof Error) throw step;
      if (step !== 'ok') throw new Error('Unexpected SSH attempt');
      return { exitCode: 0, stdout: 'recovered', stderr: '' } as ExecutionResult;
    });
    const remove = vi.spyOn(adapter as any, 'removeFromPool');
    return { adapter, attempt, remove };
  }

  const droppedTransport = () =>
    new ConnectionError(
      'example.invalid',
      Object.assign(new Error('Connection lost before handshake'), { code: 'ECONNRESET' })
    );

  it('retries once on a fresh connection and succeeds', async () => {
    const { adapter, attempt, remove } = scriptedAdapter([droppedTransport(), 'ok']);

    const result = await adapter.execute({ command: 'uptime', adapterOptions: OPTIONS });

    expect(result.stdout).toBe('recovered');
    expect(attempt).toHaveBeenCalledTimes(2);
    // Acquisition retires the failed identity. The outer retry must not evict
    // a replacement connection already acquired by another caller.
    expect(remove).not.toHaveBeenCalled();
  });

  it('gives up after one retry rather than looping', async () => {
    const { adapter, attempt } = scriptedAdapter([droppedTransport(), droppedTransport()]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(attempt).toHaveBeenCalledTimes(2);
  });

  it('does not retry a command that failed on its own merits', async () => {
    const { adapter, attempt } = scriptedAdapter([new Error('grep: no match'), 'ok']);

    await expect(adapter.execute({ command: 'grep x f', adapterOptions: OPTIONS })).rejects.toThrow(
      'grep: no match'
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('does not retry rejected credentials', async () => {
    // Retrying with the same credentials cannot succeed, and repeated attempts
    // can trip account lockouts.
    const { adapter, attempt } = scriptedAdapter([
      new ConnectionError('example.invalid', new Error('All configured authentication methods failed')),
      'ok',
    ]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('does not retry a host key mismatch', async () => {
    // The peer may be an impostor; reconnecting hands it another attempt.
    const { adapter, attempt } = scriptedAdapter([
      new ConnectionError(
        'example.invalid',
        Object.assign(new Error('HOST KEY VERIFICATION FAILED'), { code: 'EHOSTKEY' })
      ),
      'ok',
    ]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('does not retry after a timeout', async () => {
    // The command may still be running on the server; re-issuing it would run
    // it a second time.
    const { adapter, attempt } = scriptedAdapter([new TimeoutError('sleep 60', 1000), 'ok']);

    await expect(adapter.execute({ command: 'sleep 60', adapterOptions: OPTIONS })).rejects.toThrow(
      TimeoutError
    );
    expect(attempt).toHaveBeenCalledTimes(1);
  });

  it('emits a reconnect event so the recovery is observable', async () => {
    const { adapter } = scriptedAdapter([droppedTransport(), 'ok']);
    const events: Array<{ host: string; attempts: number }> = [];

    adapter.on('ssh:reconnect', event => events.push(event));
    await adapter.execute({ command: 'uptime', adapterOptions: OPTIONS });

    expect(events).toHaveLength(1);
    expect(events[0]!.host).toBe('example.invalid');
  });
});
