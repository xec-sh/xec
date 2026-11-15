import type { Command } from '../../../src/types/command.js';
import type { ProcessHandle } from '../../../src/types/process-handle.js';

import { TimeoutError } from '../../../src/core/error.js';
import { DockerAdapter } from '../../../src/adapters/docker/index.js';

const id = 'a'.repeat(64);
const replacement = 'b'.repeat(64);
const output = (stdout = '', exitCode = 0, stderr = '') => ({ stdout, stderr, stdall: stdout, exitCode, signal: null });
class ProtocolDocker extends DockerAdapter {
  calls: Array<{ args: string[]; options: Partial<Command> }> = [];
  state = { Running: false, Status: 'created', Pid: 0 };
  present = true;
  createReply = id;
  createFailure: Error | undefined;
  executionId = '';
  reportedLabel: string | undefined;
  multipleCreations = false;
  invisibleCreationPolls = 0;
  creationPolls = 0;
  failure: Error | undefined;
  detached = false;
  stopFailure = false;
  exitDuringStop = false;
  inventoryFailure = false;
  stateFailure = false;
  removalFailure = false;
  replacementPresent = false;
  onAttach?: (handle: ProcessHandle) => void | Promise<void>;
  protected override async executeDockerCommand(args: string[], options: Partial<Command>) {
    this.calls.push({ args, options });
    switch (args[0]) {
      case 'create': {
        this.executionId = args.find(value => value.startsWith('sh.xec.execution='))!.slice('sh.xec.execution='.length);
        if (this.createFailure) throw this.createFailure;
        return output(this.createReply);
      }
      case 'start': {
        this.state = { Running: true, Status: 'running', Pid: 123 };
        const handle: ProcessHandle = { stdin: null, stdout: null, stderr: null, kill: () => {} };
        options.onSpawn?.(handle);
        await this.onAttach?.(handle);
        if (this.failure) throw this.failure;
        if (!this.detached) this.state = { Running: false, Status: 'exited', Pid: 0 };
        return output('complete');
      }
      case 'ps': {
        if (this.inventoryFailure) return output('', 1, 'daemon unavailable');
        if (args.includes('{{.ID}}')) {
          if (this.creationPolls++ < this.invisibleCreationPolls) return output();
          return output(this.present ? this.multipleCreations ? `${id}\n${replacement}` : id : '');
        }
        return output(this.present
        ? JSON.stringify({ ID: id, Names: 'owned' })
        : this.replacementPresent ? JSON.stringify({ ID: replacement, Names: 'owned' }) : '');
      }
      case 'inspect': return this.stateFailure ? output('', 1, 'No such container') : output(JSON.stringify(args.includes('{{json .Config.Labels}}')
        ? { 'sh.xec.execution': this.reportedLabel ?? this.executionId } : this.state));
      case 'stop': {
        if (!this.stopFailure || this.exitDuringStop) this.state = { Running: false, Status: 'exited', Pid: 0 };
        return this.stopFailure ? output('', 1, 'stop denied') : output();
      }
      case 'rm': if (!this.removalFailure) this.present = false; return this.removalFailure ? output('', 1, 'remove denied') : output();
      case 'exec': throw new TimeoutError('exec', 50);
      default: throw new Error(`Unexpected Docker operation ${args[0]}`);
    }
  }
}
const command: Command = { command: 'fixture', shell: false,
  adapterOptions: { type: 'docker', container: 'owned', image: 'fixture', runMode: 'run' } };

describe('owned Docker execution contract', () => {
  it('exposes one immutable resource on the ordinary process handle and preserves retained exit state', async () => {
    const adapter = new ProtocolDocker();
    const onSpawn = vi.fn();
    await adapter.execute({ ...command, onSpawn, adapterOptions: { ...command.adapterOptions as Extract<Command['adapterOptions'], { type: 'docker' }>, autoRemove: false } });
    expect(onSpawn).toHaveBeenCalledOnce();
    expect(onSpawn.mock.calls[0]![0].resource).toEqual({ type: 'docker-container', id });
    expect(adapter.calls.find(call => call.args[0] === 'start')!.args).toEqual(['start', '--attach', '--', id]);
    expect(adapter.calls.some(call => ['rm', 'stop'].includes(call.args[0]!))).toBe(false);
  });

  it.each(['', 'owned', 'not-an-id'])('never starts an unacknowledged creation: %j', async createReply => {
    const adapter = new ProtocolDocker();
    adapter.createReply = createReply;
    await expect(adapter.execute({ ...command, nothrow: true })).rejects.toMatchObject({ operation: 'create' });
    expect(adapter.calls.some(call => ['start', 'stop'].includes(call.args[0]!))).toBe(false);
    expect(adapter.present).toBe(false);
  });

  it('reserves an unforgeable creation label before making any request', async () => {
    const adapter = new ProtocolDocker();
    await expect(adapter.execute({ ...command, adapterOptions: { type: 'docker', container: 'owned', image: 'fixture',
      runMode: 'run', labels: { 'sh.xec.execution': 'foreign' } } })).rejects.toThrow('reserved');
    expect(adapter.calls).toEqual([]);
  });

  it('waits for a delayed creation after losing the response, then removes only its verified ID', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new ProtocolDocker();
      adapter.createFailure = new Error('connection lost after request');
      adapter.invisibleCreationPolls = 2;
      const pending = adapter.execute(command).catch(error => error);
      await vi.advanceTimersByTimeAsync(2000);
      expect(await pending).toMatchObject({ operation: 'create', container: id, message: expect.stringContaining('unstarted container removed') });
      expect(adapter.creationPolls).toBe(3);
      expect(adapter.executionId).toMatch(/^[a-f0-9-]{36}$/);
      expect(adapter.calls.filter(call => ['start', 'stop', 'rm'].includes(call.args[0]!)).map(call => call.args)).toEqual([['rm', '--', id]]);
    } finally { vi.useRealTimers(); }
  });

  it.each(['foreign label', 'ambiguous IDs', 'running resource', 'daemon unavailable'])('does not adopt %s after losing create acknowledgement', async mode => {
    const adapter = new ProtocolDocker();
    adapter.createFailure = new Error('lost response');
    if (mode === 'foreign label') adapter.reportedLabel = 'someone-else';
    if (mode === 'ambiguous IDs') adapter.multipleCreations = true;
    if (mode === 'running resource') adapter.state = { Running: true, Status: 'running', Pid: 42 };
    if (mode === 'daemon unavailable') adapter.inventoryFailure = true;
    const failure = await adapter.execute({ ...command, nothrow: true }).catch(error => error);
    expect(failure).toMatchObject({ operation: 'terminate', message: expect.stringContaining('cleanup remains unconfirmed') });
    expect(failure.container).toBe(`sh.xec.execution=${adapter.executionId}`);
    expect(adapter.calls.some(call => ['start', 'stop', 'rm'].includes(call.args[0]!))).toBe(false);
  });

  it('does not mistake an empty inventory for proof that a pending creation cannot complete', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new ProtocolDocker({ managementTimeout: 20 });
      adapter.createFailure = new Error('lost response');
      adapter.present = false;
      const pending = adapter.execute(command).catch(error => error);
      await vi.advanceTimersByTimeAsync(20);
      expect(await pending).toMatchObject({ operation: 'terminate', message: expect.stringContaining('cleanup remains unconfirmed') });
      expect(adapter.calls.some(call => ['start', 'stop', 'rm'].includes(call.args[0]!))).toBe(false);
    } finally { vi.useRealTimers(); }
  });

  it('does not let disposal hide an unconfirmed creation outcome', async () => {
    vi.useFakeTimers();
    try {
      const adapter = new ProtocolDocker({ managementTimeout: 20 });
      adapter.createFailure = new Error('lost response');
      adapter.present = false;
      const pending = adapter.execute(command).catch(error => error);
      const disposal = adapter.dispose().catch(error => error);
      await vi.advanceTimersByTimeAsync(20);
      expect(await pending).toMatchObject({ operation: 'terminate' });
      expect(await disposal).toBeInstanceOf(AggregateError);
    } finally { vi.useRealTimers(); }
  });

  it.each([false, true])('joins remote cleanup during disposal (cleanup failure: %s)', async refuseCleanup => {
    const adapter = new ProtocolDocker();
    let ready!: () => void;
    const started = new Promise<void>(resolve => { ready = resolve; });
    let finish!: () => void;
    const blocked = new Promise<void>(resolve => { finish = resolve; });
    adapter.onAttach = async () => { ready(); await blocked; };
    const pending = adapter.execute(command).catch(error => error);
    await started;
    let disposed = false;
    const disposal = adapter.dispose().then(() => { disposed = true; }, error => error);
    await Promise.resolve();
    expect(disposed).toBe(false);
    adapter.inventoryFailure = refuseCleanup;
    finish();
    if (refuseCleanup) {
      expect(await disposal).toBeInstanceOf(AggregateError);
      expect(await pending).toMatchObject({ operation: 'terminate' });
    } else {
      await disposal;
      expect(disposed).toBe(true);
      expect(adapter.present).toBe(false);
      expect(await pending).toMatchObject({ stdout: 'complete' });
    }
  });

  it('waits for remote stop and removal before exposing a transport timeout', async () => {
    const adapter = new ProtocolDocker();
    adapter.failure = new TimeoutError('fixture', 50);
    const result = await adapter.execute({ ...command, nothrow: true });
    expect(result.exitCode).toBe(124);
    expect(adapter.present).toBe(false);
    expect(adapter.calls.filter(call => ['stop', 'rm'].includes(call.args[0]!)).map(call => call.args.at(-1))).toEqual([id, id]);
    expect(adapter.calls.at(-1)!.args[0]).toBe('ps');
  });

  it.each(['inventoryFailure', 'stateFailure', 'stopFailure', 'removalFailure'] as const)('never masks %s with nothrow', async field => {
    const adapter = new ProtocolDocker();
    adapter.failure = new TimeoutError('fixture', 50);
    adapter[field] = true;
    await expect(adapter.execute({ ...command, nothrow: true })).rejects.toMatchObject({ operation: 'terminate' });
  });

  it('accepts natural exit racing cancellation only after observing the stopped state', async () => {
    const adapter = new ProtocolDocker();
    adapter.failure = new TimeoutError('fixture', 50);
    adapter.stopFailure = true;
    adapter.exitDuringStop = true;
    await expect(adapter.execute({ ...command, nothrow: true })).resolves.toMatchObject({ exitCode: 124 });
    expect(adapter.present).toBe(false);
  });

  it('does not report success when an attachment exits while its command still runs', async () => {
    const adapter = new ProtocolDocker();
    adapter.detached = true;
    await expect(adapter.execute({ ...command, nothrow: true })).rejects.toThrow('before its container command finished');
    expect(adapter.present).toBe(false);
  });

  it('never retargets a replacement with the same name', async () => {
    const adapter = new ProtocolDocker();
    adapter.replacementPresent = true;
    await adapter.execute(command);
    expect(adapter.calls.filter(call => ['stop', 'rm'].includes(call.args[0]!)).map(call => call.args.at(-1))).toEqual([id]);
  });

  it('does not stop a foreign exec container after the local transport times out', async () => {
    const adapter = new ProtocolDocker();
    await expect(adapter.execute({ ...command, adapterOptions: { type: 'docker', container: 'owned', runMode: 'exec' } })).rejects.toBeInstanceOf(TimeoutError);
    expect(adapter.calls.map(call => call.args[0])).toEqual(['ps', 'exec']);
  });
});
