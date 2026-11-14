import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import { rm, mkdtemp, realpath } from 'node:fs/promises';

import { LocalAdapter } from '../../src/adapters/local/index.js';
import { ExecutionEngine } from '../../src/core/execution-engine.js';
import { TimeoutError, MaxBufferExceededError } from '../../src/core/error.js';

const probe = 'process.stdout.write(JSON.stringify({cwd:require("node:fs").realpathSync.native(process.cwd()),value:process.env["XEC_CONFIG_NATIVE"]??null,extra:process.env.XEC_CONFIG_EXTRA??null}))';
const command = { command: process.execPath, args: ['-e', probe], shell: false };

describe('engine configuration through native execution', () => {
  let directory: string;
  const engines: ExecutionEngine[] = [];
  const create = (config: ConstructorParameters<typeof ExecutionEngine>[0] = {}) => {
    const engine = new ExecutionEngine(config);
    engines.push(engine);
    return engine;
  };
  beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'xec-engine-config-')); });
  afterEach(async () => { for (const engine of engines.splice(0)) await engine.dispose(); await rm(directory, { recursive: true, force: true }); });

  it('normalizes constructor aliases and preserves parsed duration values', async () => {
    const engine = create({ cwd: directory, env: { XEC_CONFIG_NATIVE: 'constructor' }, timeout: '2s', shell: false });
    expect(engine.config.get()).toMatchObject({ defaultTimeout: 2000, defaultCwd: directory, defaultShell: false });
    expect(JSON.parse((await engine.execute(command)).stdout)).toEqual({ cwd: await realpath(directory), value: 'constructor', extra: null });
    expect(create({ defaultTimeout: '2s' }).config.get().defaultTimeout).toBe(2000);
  });

  it('applies global defaults without changing the adapter or the caller input', async () => {
    const engine = create({ defaultEnv: { XEC_CONFIG_EXTRA: 'retained' } });
    const adapter = engine.getAdapter('local');
    const update = Object.freeze({ cwd: directory, env: Object.freeze({ XEC_CONFIG_NATIVE: 'mutable' }), timeout: '3s' as const, shell: false });
    engine.config.set(update);
    expect(update).toEqual({ cwd: directory, env: { XEC_CONFIG_NATIVE: 'mutable' }, timeout: '3s', shell: false });
    expect(engine.getAdapter('local')).toBe(adapter);
    expect(JSON.parse((await engine.execute(command)).stdout)).toEqual({ cwd: await realpath(directory), value: 'mutable', extra: 'retained' });
    const defaults = Object.freeze({ defaultEnv: Object.freeze({ XEC_CONFIG_NATIVE: 'second' }) });
    engine.config.set(defaults);
    expect(defaults.defaultEnv.XEC_CONFIG_NATIVE).toBe('second');
    expect(JSON.parse((await engine.execute(command)).stdout).value).toBe('second');
  });

  it('rejects an invalid update atomically and isolates returned env snapshots', async () => {
    const engine = create({ defaultEnv: { XEC_CONFIG_NATIVE: 'original' }, defaultTimeout: 2000 });
    const before = engine.config.get();
    expect(() => engine.config.set({ defaultEnv: { XEC_CONFIG_NATIVE: 'bad' }, timeout: -1 })).toThrow(/timeout/);
    expect(engine.config.get()).toEqual(before);
    expect(() => engine.config.set({ maxBuffer: NaN })).toThrow(/buffer/i);
    const exposed = engine.config.get();
    exposed.defaultEnv!['XEC_CONFIG_NATIVE'] = 'tampered';
    expect(JSON.parse((await engine.execute(command)).stdout).value).toBe('original');
  });

  it('updates timeout, output bounds and nonzero policy on the ordinary engine', async () => {
    const engine = create();
    engine.config.set({ maxBuffer: 64, throwOnNonZeroExit: false, timeout: '300ms' });
    await expect(engine.execute({ command: process.execPath, args: ['-e', 'process.stdout.write("x".repeat(1024))'], shell: false })).rejects.toBeInstanceOf(MaxBufferExceededError);
    await expect(engine.execute({ command: process.execPath, args: ['-e', 'process.exitCode=7'], shell: false })).resolves.toMatchObject({ exitCode: 7 });
    await expect(engine.execute({ command: process.execPath, args: ['-e', 'setInterval(()=>{},1000)'], shell: false })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('captures output encoding for each command while retaining derived-engine isolation', async () => {
    const engine = create({ encoding: 'latin1' });
    const derived = engine.with({});
    const bytes = { command: process.execPath, args: ['-e', 'setTimeout(()=>process.stdout.write(Buffer.from([0xc3,0xa9])),100)'], shell: false };
    const pending = engine.execute(bytes);
    engine.config.set({ encoding: 'utf8' });
    expect((await pending).stdout).toBe('Ã©');
    expect((await engine.execute(bytes)).stdout).toBe('é');
    expect((await derived.execute(bytes)).stdout).toBe('Ã©');
  });

  it('keeps raw command results exact and sanitizes structured diagnostics independently', async () => {
    const secret = 'synthetic-event-value';
    const events: unknown[] = [];
    const engine = create({ adapters: { local: { sensitiveDataMasking: { enabled: false } } } });
    engine.on('command:start', event => events.push(event));
    engine.on('command:complete', event => events.push(event));
    const result = await engine.execute({ command: process.execPath, shell: false,
      args: ['-e', 'process.stdout.write(JSON.stringify({token:process.argv[2]}))', '--', '--password', secret] });
    expect(result.stdout).toBe(JSON.stringify({ token: secret }));
    expect(events).toHaveLength(2);
    expect(inspect(events, { depth: null })).not.toContain(secret);
    expect(events[0]).toMatchObject({ args: expect.arrayContaining(['--password', '[REDACTED]']) });
    class Probe extends LocalAdapter {
      report(command: string) { this.emitAdapterEvent('k8s:exec', { pod: 'fixture', namespace: 'test', command }); }
    }
    const adapter = new Probe({ sensitiveDataMasking: { enabled: false } });
    adapter.on('k8s:exec', event => events.push(event));
    adapter.report('echo --password ' + secret);
    expect(events).toHaveLength(3);
    expect(inspect(events, { depth: null })).not.toContain(secret);
  });

  it('refuses unsupported adapter reconfiguration before applying any other setting', () => {
    const engine = create();
    const before = engine.config.get();
    expect(() => engine.config.set({ timeout: 1, adapters: { kubernetes: { context: 'other-cluster' } } })).toThrow(/new.*engine|immutable|fixed/i);
    expect(engine.config.get()).toEqual(before);
  });
});
