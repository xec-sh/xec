import type { Command } from '../../../src/types/command.js';

import { execFileSync } from 'node:child_process';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { SSHError, SSHClient, SSHOutputLimitError, SSHOutcomeUnknownError } from '@xec-sh/ssh';

import { globalCache } from '../../../src/utils/cache.js';
import { SSHAdapter } from '../../../src/adapters/ssh/index.js';
import { ExecutionEngine, createCallableEngine } from '../../../src/index.js';
import {
  AdapterError,
  ConnectionError,
  MaxBufferExceededError,
  ExecutionOutcomeUnknownError,
} from '../../../src/core/error.js';

const target = { type: 'ssh' as const, host: 'example.invalid', username: 'operator', password: 'fixture' };
const success = { code: 0, signal: null, stdout: '  completed\n', stderr: 'diagnostic\n' };
const adapters: SSHAdapter[] = [];
const engines: ExecutionEngine[] = [];
let live: WeakSet<SSHClient>;
beforeEach(() => {
  globalCache.clear();
  live = new WeakSet();
  vi.spyOn(SSHClient.prototype, 'connect').mockImplementation(async function (this: SSHClient) {
    live.add(this);
    return this;
  });
  vi.spyOn(SSHClient.prototype, 'isConnected').mockImplementation(function (this: SSHClient) {
    return live.has(this);
  });
  vi.spyOn(SSHClient.prototype, 'dispose').mockImplementation(function (this: SSHClient) {
    live.delete(this);
  });
  vi.spyOn(SSHClient.prototype, 'revalidateTrust').mockResolvedValue();
  vi.spyOn(SSHClient.prototype, 'exec').mockImplementation(async () => ({ ...success }));
});
afterEach(async () => {
  await Promise.all(engines.splice(0).map((value) => value.dispose()));
  await Promise.all(adapters.splice(0).map((value) => value.dispose()));
  globalCache.clear();
  vi.restoreAllMocks();
});
function adapter(options: ConstructorParameters<typeof SSHAdapter>[0] = {}) {
  const value = new SSHAdapter({ ...options, connectionPool: { reconnectDelay: 0, ...options.connectionPool } });
  adapters.push(value);
  return value;
}
function execute(value: SSHAdapter, options: Partial<Command> = {}) {
  return value.execute({ command: 'printf', args: ['%s', 'literal'], adapterOptions: target, ...options });
}

describe('Core delegates SSH transport ownership to its package', () => {
  it('owns argv, cwd and environment quoting and preserves exact payload', async () => {
    const value = adapter();
    const result = await execute(value, { cwd: "/work/a'b", env: { WORD: 'a; $(unsafe)' } });
    expect(result.stdout).toBe(success.stdout);
    expect(result.stderr).toBe(success.stderr);
    expect(SSHClient.prototype.exec).toHaveBeenCalledWith(
      "cd -- '/work/a'\\''b' && (\nexport WORD='a; $(unsafe)'; printf %s literal\n)",
      expect.objectContaining({ collectStdout: true, collectStderr: true })
    );
    expect(SSHClient.prototype.connect).toHaveBeenCalledWith(expect.objectContaining({ hostKeyChecking: 'strict' }));
    expect(value.getConnectionPoolMetrics()).toMatchObject({ totalConnections: 1, idleConnections: 1 });
  });
  it('never runs the command after cd fails, including an environment prefix', async () => {
    const value = adapter();
    await execute(value, {
      cwd: '/nonexistent-xec-cwd-boundary',
      env: { FIXTURE: 'set' },
      command: 'printf ran',
      args: [],
    });
    const shell = vi.mocked(SSHClient.prototype.exec).mock.calls[0]![0];
    try {
      execFileSync('/bin/sh', ['-c', shell], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      throw new Error('cd unexpectedly succeeded');
    } catch (error) {
      expect((error as { stdout: string }).stdout).toBe('');
    }
  });
  it('quotes argv metacharacters at the Core boundary instead of invoking them remotely', async () => {
    const value = adapter();
    const payload = "a b; $(printf injected) ' \\ `printf injected`\nline";
    await execute(value, { args: ['%s', payload] });
    const shell = vi.mocked(SSHClient.prototype.exec).mock.calls[0]![0];
    expect(execFileSync('/bin/sh', ['-c', shell], { encoding: 'utf8' })).toBe(payload);
  });
  it('forwards declared adapter environment defaults with command precedence', async () => {
    const value = adapter({ defaultEnv: { DEFAULT: 'from-adapter', SHARED: 'old' } });
    await execute(value, { env: { SHARED: 'from-command' } });
    expect(vi.mocked(SSHClient.prototype.exec).mock.calls[0]![0]).toBe(
      'export DEFAULT=from-adapter; export SHARED=from-command; printf %s literal'
    );
  });
  it('shares pool leases for concurrent commands without interrupting the older channel', async () => {
    const value = adapter({ connectionPool: { maxConnections: 1 } });
    let finish!: () => void;
    vi.mocked(SSHClient.prototype.exec).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(success);
        })
    );
    const running = execute(value);
    await vi.waitFor(() => expect(SSHClient.prototype.exec).toHaveBeenCalledOnce());
    await execute(value);
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
    expect(value.getConnectionPoolMetrics().activeConnections).toBe(1);
    finish();
    await running;
    expect(value.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
  it('retries a failed handshake within the configured bound, but dispatches only once', async () => {
    const value = adapter({ connectionPool: { maxReconnectAttempts: 2 } });
    vi.mocked(SSHClient.prototype.connect).mockRejectedValueOnce(new SSHError('reset', 'ECONNRESET'));
    const reconnect = vi.fn();
    value.on('ssh:reconnect', reconnect);
    await execute(value);
    expect(SSHClient.prototype.connect).toHaveBeenCalledTimes(2);
    expect(SSHClient.prototype.exec).toHaveBeenCalledOnce();
    expect(reconnect).toHaveBeenCalledWith(expect.objectContaining({ host: target.host, attempts: 1 }));
  });
  it.each(['EAUTH', 'EHOSTKEY', 'ABORT_ERR'])('never retries handshake rejection %s', async (code) => {
    const value = adapter();
    vi.mocked(SSHClient.prototype.connect).mockRejectedValue(new SSHError('rejected', code));
    await expect(execute(value)).rejects.toBeInstanceOf(ConnectionError);
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
    expect(SSHClient.prototype.exec).not.toHaveBeenCalled();
  });
  it('maps unknown dispatch outcomes without replay, even in nothrow mode', async () => {
    const value = adapter();
    const cause = new SSHOutcomeUnknownError({ cause: new SSHError('lost', 'ECONNRESET') });
    vi.mocked(SSHClient.prototype.exec).mockRejectedValue(cause);
    await expect(execute(value, { nothrow: true })).rejects.toMatchObject({ kind: 'outcome-unknown' });
    expect(SSHClient.prototype.exec).toHaveBeenCalledOnce();
    expect(value.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
  it('passes deadlines to the owning request and never fabricates timeout completion', async () => {
    const value = adapter();
    vi.mocked(SSHClient.prototype.exec).mockImplementation(
      (_command, options) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener(
            'abort',
            () => reject(new SSHOutcomeUnknownError({ cause: new SSHError('deadline', 'ABORT_ERR') })),
            { once: true }
          );
        })
    );
    await expect(execute(value, { timeout: 5, nothrow: true })).rejects.toBeInstanceOf(ExecutionOutcomeUnknownError);
    expect(SSHClient.prototype.exec).toHaveBeenCalledOnce();
    expect(value.getConnectionPoolMetrics().activeConnections).toBe(0);
  });
  it('maps bounded output failures without discarding the captured head', async () => {
    const value = adapter();
    vi.mocked(SSHClient.prototype.exec).mockRejectedValue(new SSHOutputLimitError(4, 'stdout', 'head', 'err'));
    const error = await execute(value).catch((error) => error);
    expect(error).toBeInstanceOf(MaxBufferExceededError);
    expect(error).toMatchObject({
      limit: 4,
      stream: 'stdout',
      partialStdout: 'head',
      partialStderr: 'err',
      outcome: 'unknown',
      kind: 'outcome-unknown',
    });
    expect(SSHClient.prototype.exec).toHaveBeenCalledOnce();
  });
  it.each([NaN, Infinity, -1, 2_147_483_648, 'Infinity', '-1', '30d'])('rejects invalid deadline %s before connecting', async timeout => {
    const value = adapter();
    await expect(execute(value, { timeout })).rejects.toThrow('Command timeout must be finite');
    expect(SSHClient.prototype.connect).not.toHaveBeenCalled();
    expect(SSHClient.prototype.exec).not.toHaveBeenCalled();
  });
  it('rejects obsolete multiplexing before creating any transport', () => {
    expect(() => new SSHAdapter({ multiplexing: { enabled: true } } as never)).toThrow('multiplexing is unsupported');
    expect(SSHClient.prototype.connect).not.toHaveBeenCalled();
  });
  it('rejects missing target instead of inferring the last used host', async () => {
    const value = adapter();
    await execute(value);
    await expect(value.execute({ command: 'echo' })).rejects.toBeInstanceOf(AdapterError);
    // @ts-expect-error Exercise the runtime boundary for untyped callers.
    await expect(value.tunnel({ remoteHost: 'localhost', remotePort: 80 })).rejects.toThrow();
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
  });
});


describe('Public SSH promises preserve failure authority', () => {
  function run() {
    const engine = new ExecutionEngine();
    engines.push(engine);
    return createCallableEngine(engine).ssh(target);
  }

  it.each(['direct', 'text', 'cache'] as const)(
    'nothrow keeps an unknown outcome rejected through %s',
    async (mode) => {
      const failure = new SSHOutcomeUnknownError({ cause: new SSHError('lost acknowledgement', 'ECONNRESET') });
      vi.mocked(SSHClient.prototype.exec).mockRejectedValue(failure);
      const remote = run();
      const request = () => {
        const command = remote.exec('change-once').nothrow();
        if (mode === 'text') return command.text();
        if (mode === 'cache') return command.cache({ key: 'uncertain-operation' });
        return command;
      };
      await expect(request()).rejects.toMatchObject({ kind: 'outcome-unknown', cause: failure });
      expect(SSHClient.prototype.exec).toHaveBeenCalledOnce();
      if (mode === 'cache') {
        expect(globalCache.get('uncertain-operation')).toBeNull();
        expect(globalCache.getInflight('uncertain-operation')).toBeNull();
        // An explicitly new request must not receive a fabricated cached exit.
        await expect(request()).rejects.toMatchObject({ kind: 'outcome-unknown' });
        expect(SSHClient.prototype.exec).toHaveBeenCalledTimes(2);
      }
    }
  );

  it('nothrow does not hide authentication rejection before dispatch', async () => {
    vi.mocked(SSHClient.prototype.connect).mockRejectedValue(new SSHError('authentication refused', 'EAUTH'));
    await expect(run().exec('change-once').nothrow()).rejects.toBeInstanceOf(ConnectionError);
    expect(SSHClient.prototype.connect).toHaveBeenCalledOnce();
    expect(SSHClient.prototype.exec).not.toHaveBeenCalled();
  });

  it('nothrow preserves caller cancellation before dispatch', async () => {
    const reason = new Error('caller cancelled this operation');
    await expect(run().exec('change-once').signal(AbortSignal.abort(reason)).nothrow()).rejects.toBe(reason);
    expect(SSHClient.prototype.connect).not.toHaveBeenCalled();
    expect(SSHClient.prototype.exec).not.toHaveBeenCalled();
  });

  it('nothrow preserves command-resolution rejection before dispatch', async () => {
    const reason = new Error('input resolution failed');
    const remote = run();
    const input = Promise.reject(reason);
    await expect(remote`printf ${input}`.nothrow()).rejects.toBe(reason);
    expect(SSHClient.prototype.connect).not.toHaveBeenCalled();
    expect(SSHClient.prototype.exec).not.toHaveBeenCalled();
  });

  it('returns only completed nonzero results and respects explicit command precedence', async () => {
    vi.mocked(SSHClient.prototype.exec).mockResolvedValue({ ...success, code: 42 });
    const remote = run().with({ nothrow: true });
    expect(await remote.exec('known-failure')).toMatchObject({ exitCode: 42, stdout: success.stdout, stderr: success.stderr });
    await expect(remote.exec('known-failure', { nothrow: false })).rejects.toMatchObject({ exitCode: 42 });
    expect(await remote.exec('known-failure', { nothrow: false }).nothrow().text()).toBe(success.stdout.trim());
  });
});
