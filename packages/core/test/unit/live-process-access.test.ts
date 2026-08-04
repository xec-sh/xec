import { $ } from '../../src/index.js';

/**
 * A running command must be reachable while it runs.
 *
 * `ProcessPromise.child` was a hardcoded `undefined` and `stdin` a hardcoded
 * `null`: the public type advertised access to the process and delivered
 * nothing, so answering an interactive prompt, streaming output as it
 * arrived, or reading a pid were all impossible. zx exposes these as live
 * getters; this pins the same capability behind one handle that is uniform
 * across local, docker, kubernetes and ssh.
 */
describe('live access to a running command', () => {
  it('exposes a pid and a handle once spawned', async () => {
    const promise = $.exec('sleep 0.3').nothrow();

    const handle = await promise.spawned;

    expect(handle.pid).toBeGreaterThan(0);
    expect(typeof handle.kill).toBe('function');
    // The synchronous accessors agree once the process exists.
    expect(promise.pid).toBe(handle.pid);
    expect(promise.child).toBe(handle);

    await promise;
  }, 15_000);

  it('accepts input written to stdin while the command runs', async () => {
    // The point of live stdin: a command that reads input the caller only
    // has after the process exists.
    const promise = $.exec('cat').nothrow();

    promise.stdin!.write('written-live\n');
    promise.stdin!.end();

    const result = await promise;
    expect(result.stdout.trim()).toBe('written-live');
  }, 15_000);

  it('streams output through the handle as it arrives', async () => {
    const promise = $.exec(`node -e "process.stdout.write('a'); setTimeout(()=>process.stdout.write('b'), 80)"`)
      .nothrow();

    const handle = await promise.spawned;
    const chunks: string[] = [];
    handle.stdout!.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

    await promise;

    // Arriving in pieces is the point: a single joined string would prove
    // nothing about liveness.
    expect(chunks.join('')).toBe('ab');
  }, 15_000);

  it('reaching for the process starts a lazy command', async () => {
    // Commands are lazy so the whole chain applies before anything runs;
    // awaiting `spawned` must therefore launch it rather than hang.
    const promise = $.exec('sleep 0.2').nothrow();

    const handle = await promise.spawned;
    expect(handle.pid).toBeGreaterThan(0);

    await promise;
  }, 15_000);
});

describe('configuration after start is refused, not ignored', () => {
  it('throws instead of returning an unstarted twin', async () => {
    // Configuration returns a *new* command, so applying it to a running one
    // used to hand back a command that had not started — `p.start().signal(ac)`
    // aborted nothing at all, silently.
    const promise = $.exec('sleep 0.2').nothrow().start();

    expect(() => promise.timeout(50)).toThrow('already running');
    expect(() => promise.env({ A: '1' })).toThrow('already running');

    await promise;
  }, 15_000);

  it('allows the same configuration before start', async () => {
    const result = await $.exec('echo configured').nothrow().env({ A: '1' }).timeout(10_000);

    expect(result.stdout.trim()).toBe('configured');
  }, 15_000);
});
