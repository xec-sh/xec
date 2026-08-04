import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { TimeoutError, ConnectionError } from '../../../src/core/error.js';

import type { Command } from '../../../src/types/command.js';
import type { ExecutionResult } from '../../../src/core/result.js';

const OPTIONS = {
  type: 'ssh' as const,
  host: 'example.invalid',
  username: 'deploy',
  password: 'secret',
};

/**
 * A pooled connection can die between being handed out and the command
 * finishing. Callers used to have to detect that and retry themselves — one
 * production consumer did it by regex-matching error text — so the pool now
 * owns its own liveness.
 */
describe('SSH adapter recovers from a transport that dies in flight', () => {
  /** Adapter whose single attempt is scripted, so no server is needed. */
  class ScriptedAdapter extends SSHAdapter {
    public attempts = 0;
    public poolRemovals: string[] = [];

    constructor(private readonly script: Array<Error | 'ok'>) {
      super();
    }

    protected override async executeOnce(_command: Command): Promise<ExecutionResult> {
      const step = this.script[this.attempts];
      this.attempts += 1;

      if (step instanceof Error) {
        throw step;
      }

      return { exitCode: 0, stdout: 'recovered', stderr: '' } as ExecutionResult;
    }

    protected override removeFromPool(key: string): void {
      this.poolRemovals.push(key);
    }
  }

  const droppedTransport = () =>
    new ConnectionError(
      'example.invalid',
      Object.assign(new Error('Connection lost before handshake'), { code: 'ECONNRESET' })
    );

  it('retries once on a fresh connection and succeeds', async () => {
    const adapter = new ScriptedAdapter([droppedTransport(), 'ok']);

    const result = await adapter.execute({ command: 'uptime', adapterOptions: OPTIONS });

    expect(result.stdout).toBe('recovered');
    expect(adapter.attempts).toBe(2);
    // The dead connection must be evicted, or the retry gets handed it again.
    expect(adapter.poolRemovals).toHaveLength(1);
  });

  it('gives up after one retry rather than looping', async () => {
    const adapter = new ScriptedAdapter([droppedTransport(), droppedTransport()]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(adapter.attempts).toBe(2);
  });

  it('does not retry a command that failed on its own merits', async () => {
    const adapter = new ScriptedAdapter([new Error('grep: no match'), 'ok']);

    await expect(adapter.execute({ command: 'grep x f', adapterOptions: OPTIONS })).rejects.toThrow(
      'grep: no match'
    );
    expect(adapter.attempts).toBe(1);
  });

  it('does not retry rejected credentials', async () => {
    // Retrying with the same credentials cannot succeed, and repeated attempts
    // can trip account lockouts.
    const adapter = new ScriptedAdapter([
      new ConnectionError('example.invalid', new Error('All configured authentication methods failed')),
      'ok',
    ]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(adapter.attempts).toBe(1);
  });

  it('does not retry a host key mismatch', async () => {
    // The peer may be an impostor; reconnecting hands it another attempt.
    const adapter = new ScriptedAdapter([
      new ConnectionError(
        'example.invalid',
        Object.assign(new Error('HOST KEY VERIFICATION FAILED'), { code: 'EHOSTKEY' })
      ),
      'ok',
    ]);

    await expect(adapter.execute({ command: 'uptime', adapterOptions: OPTIONS })).rejects.toThrow(
      ConnectionError
    );
    expect(adapter.attempts).toBe(1);
  });

  it('does not retry after a timeout', async () => {
    // The command may still be running on the server; re-issuing it would run
    // it a second time.
    const adapter = new ScriptedAdapter([new TimeoutError('sleep 60', 1000), 'ok']);

    await expect(adapter.execute({ command: 'sleep 60', adapterOptions: OPTIONS })).rejects.toThrow(
      TimeoutError
    );
    expect(adapter.attempts).toBe(1);
  });

  it('emits a reconnect event so the recovery is observable', async () => {
    const adapter = new ScriptedAdapter([droppedTransport(), 'ok']);
    const events: Array<{ host: string; attempts: number }> = [];

    adapter.on('ssh:reconnect', event => events.push(event));
    await adapter.execute({ command: 'uptime', adapterOptions: OPTIONS });

    expect(events).toHaveLength(1);
    expect(events[0]!.host).toBe('example.invalid');
  });
});
