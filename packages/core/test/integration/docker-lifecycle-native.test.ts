import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import { Writable } from 'node:stream';
import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { DockerAdapter } from '../../src/adapters/docker/index.js';
import * as dockerUtils from '../../src/adapters/docker/docker-utils.js';
import { TimeoutError, MaxBufferExceededError } from '../../src/core/error.js';

// Execute only this private fake binary through the ordinary Docker APIs. No
// Docker daemon, image, real container or external service participates.
describe.skipIf(process.platform === 'win32')('Docker native lifecycle', () => {
  let directory: string;
  let binary: string;
  let adapter: DockerAdapter;
  const target = { type: 'docker' as const, container: 'fixture', image: 'fixture-image', runMode: 'run' as const };
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
  const records = async (): Promise<Array<{ pid: number; args: string[]; localEnv: string | null }>> => {
    const text = await readFile(join(directory, 'calls.jsonl'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  };
  const waitForCalls = async (count = 1) => {
    await vi.waitFor(async () => expect((await records()).length).toBeGreaterThanOrEqual(count), { timeout: 3000, interval: 20 });
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-docker-native-'));
    binary = join(directory, 'docker');
    await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify({pid:process.pid,args,localEnv:process.env.REMOTE_ONLY??null})+'\\n');
const hang = () => { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); };
const kind = args.at(-1);
if (args[0] === 'ps') {
  if (fs.existsSync(path.join(__dirname,'offline'))) { process.stderr.write('daemon unavailable');process.exitCode=1; }
  else if (fs.existsSync(path.join(__dirname,'created'))) process.stdout.write(JSON.stringify({ID:'a'.repeat(64),Names:fs.readFileSync(path.join(__dirname,'created'),'utf8')}));
} else if (args[0] === 'create') {
  fs.writeFileSync(path.join(__dirname,'created'),args[args.indexOf('--name')+1]);
} else if (args[0] === 'inspect') {
  process.stdout.write(JSON.stringify([{State:{Running:true},Config:{Labels:{token:'synthetic-fixture-value'}}}]));
} else if (args[0] === 'logs') {
  if (kind === 'lines') {
    const text = Buffer.from('Ж🙂\\n\\n  \\r\\nunterminated');
    process.stdout.write(text.subarray(0,1));
    setTimeout(()=>{process.stdout.write(text.subarray(1,4));setTimeout(()=>process.stdout.write(text.subarray(4)),10);},10);
    process.stderr.write('stderr\\n\\n');
  } else if (kind === 'failed') { process.stderr.write('password=synthetic-fixture-value'); process.exitCode=7; }
  else if (kind === 'overflow') { process.stdout.write('password=synthetic-fixture-value\\n');setTimeout(()=>{process.stdout.write('x'.repeat(8192));hang();},20); }
  else if (kind === 'callback') { process.stdout.write('first\\nsecond\\n');hang(); }
  else if (kind === 'hang') hang();
  else if (kind === 'trailing') {
    require('node:child_process').spawn(process.execPath,['-e',"setTimeout(()=>process.stdout.write('after exit'),100)"],{stdio:['ignore',1,2]}).unref();process.exit(0);
  } else process.stdout.write(JSON.stringify(args));
} else if (args[0] === 'run') {
  if (kind === 'hang') hang();
  else if (kind === 'failed') { process.stderr.write('command failed');process.exitCode=7; }
  else if (kind === 'stdin') { let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>process.stdout.write(data||'EOF')); }
  else if (kind === 'masked') process.stdout.write('password=synthetic-fixture-value');
  else process.stdout.write(JSON.stringify({args,cwd:process.cwd(),localEnv:process.env.REMOTE_ONLY??null}));
} else if (args[0] === 'stop') hang();
else if (args[0] === 'compose') process.stdout.write('done');
else if (args[0] === 'rm') { process.stderr.write('cleanup refused'); process.exitCode=7; }
`, { mode: 0o700 });
    vi.spyOn(dockerUtils, 'findDockerPath').mockReturnValue(binary);
    adapter = new DockerAdapter({ managementTimeout: 3000, maxBuffer: 64 * 1024 });
  });

  afterEach(async () => {
    await adapter.dispose();
    await vi.waitFor(async () => {
      for (const { pid } of await records()) expect(alive(pid), `Docker helper ${pid} survived completion`).toBe(false);
    }, { timeout: 3000, interval: 20 });
    vi.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  it('preserves literal argv, raw management JSON and the public exec masking boundary', async () => {
    const argument = 'spaces ; $(echo unsafe) & |';
    const result = await adapter.execute({ command: 'printf', args: [argument], shell: false,
      env: { REMOTE_ONLY: 'remote=value' }, cwd: '/container-only', adapterOptions: target });
    const observed = JSON.parse(result.stdout);
    expect(observed.args.slice(-2)).toEqual(['printf', argument]);
    expect(observed.args).toEqual(expect.arrayContaining(['-e', 'REMOTE_ONLY=remote=value', '-w', '/container-only']));
    expect(observed.localEnv).toBeNull();
    expect(observed.cwd).not.toBe('/container-only');
    const info = await adapter.inspectContainer('fixture');
    expect(info.Config.Labels.token).toBe('synthetic-fixture-value');
    const masked = await adapter.execute({ command: 'masked', shell: false, adapterOptions: target });
    expect(masked.stdout).toContain('[REDACTED]');
    expect(masked.stdout).not.toContain('synthetic-fixture-value');
  });

  it('closes absent and empty stdin and preserves supplied input', async () => {
    for (const stdin of [undefined, '', Buffer.alloc(0), 'input']) {
      const result = await adapter.execute({ command: 'stdin', stdin, shell: false, timeout: 3000, adapterOptions: target });
      expect(result.stdout).toBe(stdin === 'input' ? 'input' : 'EOF');
    }
  });

  it('awaits trailing child output and custom Writable finalization', async () => {
    await expect(adapter.getLogs('trailing')).resolves.toBe('after exit');
    let finished = false;
    let text = '';
    const stdout = new Writable({
      write(chunk, _encoding, done) { setTimeout(() => { text += chunk.toString(); done(); }, 20); },
      final(done) { setTimeout(() => { finished = true; done(); }, 20); },
    });
    await adapter.execute({ command: 'printf', args: ['sink'], stdout, shell: false, adapterOptions: target });
    expect(finished).toBe(true);
    expect(JSON.parse(text).args.at(-1)).toBe('sink');
  });

  it('preserves nonzero and timeout policies after confirmed process termination', async () => {
    await expect(adapter.execute({ command: 'failed', shell: false, adapterOptions: target })).rejects.toMatchObject({ code: 'DOCKER_ERROR' });
    await expect(adapter.execute({ command: 'failed', shell: false, nothrow: true, adapterOptions: target })).resolves.toMatchObject({ exitCode: 7 });
    const result = await adapter.execute({ command: 'hang', shell: false, nothrow: true, timeout: 300, adapterOptions: target });
    expect(result.exitCode).toBe(124);
    for (const { pid } of await records()) expect(alive(pid)).toBe(false);
    await expect(adapter.execute({ command: 'hang', shell: false, timeout: 300, adapterOptions: target })).rejects.toBeInstanceOf(TimeoutError);
  });

  it('retains every UTF-8 log line from both streams and exact filter argv', async () => {
    const lines: string[] = [];
    await adapter.streamLogs('lines', line => lines.push(line), { since: '2026-01-01', until: '2026-01-02', tail: 4, timestamps: true });
    expect(lines.filter(line => !line.startsWith('stderr'))).toEqual(expect.arrayContaining(['Ж🙂\n', '\n', '  \r\n', 'unterminated']));
    expect(lines.filter(line => line === '\n')).toHaveLength(2);
    expect(lines).toContain('stderr\n');
    expect((await records())[0].args).toEqual(['logs', '--tail', '4', '--since', '2026-01-01', '--until', '2026-01-02', '-t', 'lines']);
  });

  it('fails on log callback errors and bounded output without losing the cleanup result', async () => {
    await expect(adapter.streamLogs('callback', () => { throw new Error('consumer rejected'); }, { follow: true })).rejects.toThrow('consumer rejected');
    const failure = await adapter.getLogs('overflow', { maxBuffer: 128 }).catch(error => error);
    expect(failure).toBeInstanceOf(MaxBufferExceededError);
    expect(inspect(failure, { depth: null })).not.toContain('synthetic-fixture-value');
    await expect(adapter.streamLogs('overflow', () => {}, { follow: true, maxBuffer: 128 })).rejects.toMatchObject({ originalError: { code: 'MAX_BUFFER_EXCEEDED' } });
    for (const { pid } of await records()) expect(alive(pid)).toBe(false);
  });

  it('honors abort before spawning and during a followed stream', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled before spawn'));
    await expect(adapter.getLogs('hang', { signal: controller.signal })).rejects.toThrow('cancelled before spawn');
    expect(await records()).toEqual([]);
    const active = new AbortController();
    const failure = adapter.streamLogs('hang', () => {}, { follow: true, signal: active.signal }).catch(error => error);
    await waitForCalls();
    active.abort(new Error('caller cancelled'));
    expect(await failure).toMatchObject({ originalError: { message: 'caller cancelled' } });
    for (const { pid } of await records()) expect(alive(pid)).toBe(false);
  });

  it('owns pending management calls and followed streams during disposal', async () => {
    const finite = adapter.getLogs('hang').catch(error => error);
    const followed = adapter.streamLogs('hang', () => {}, { follow: true });
    await waitForCalls(2);
    await adapter.dispose();
    expect(await finite).toMatchObject({ message: expect.stringContaining('stopped before completion') });
    await expect(followed).resolves.toBeUndefined();
    for (const { pid } of await records()) expect(alive(pid)).toBe(false);
    await expect(adapter.getLogs('anything')).rejects.toThrow('disposed');
  });

  it('passes compose env only to its local helper and masks error diagnostics', async () => {
    await adapter.composeDown({ env: { REMOTE_ONLY: 'compose-only' } });
    expect((await records())[0].localEnv).toBe('compose-only');
    expect(process.env.REMOTE_ONLY).toBeUndefined();
    const error = await adapter.getLogs('failed').catch(error => error);
    expect(error.message).toContain('[REDACTED]');
    expect(inspect(error, { depth: null })).not.toContain('synthetic-fixture-value');
  });

  it('never creates a container after an unconfirmed inventory failure', async () => {
    await writeFile(join(directory, 'offline'), 'fixture');
    const managed = new DockerAdapter({ autoCreate: { enabled: true, image: 'fixture', autoRemove: true } });
    try {
      await expect(managed.execute({ command: 'true', shell: false,
        adapterOptions: { type: 'docker', container: 'absent' } })).rejects.toThrow('daemon unavailable');
      expect((await records()).map(call => call.args[0])).toEqual(['ps']);
    } finally { await managed.dispose(); }
  });

  it('reports failed cleanup of its automatically created resource', async () => {
    const managed = new DockerAdapter({ autoCreate: { enabled: true, image: 'fixture', autoRemove: true } });
    await managed.execute({ command: 'true', shell: false, adapterOptions: { type: 'docker', container: 'absent' } });
    const failure = await managed.dispose().catch(error => error);
    expect(failure).toBeInstanceOf(AggregateError);
    expect(failure.errors[0]).toMatchObject({ originalError: { message: 'cleanup refused' } });
    await expect(managed.dispose()).rejects.toBe(failure);
    expect((await records()).filter(call => call.args[0] === 'rm')).toHaveLength(1);
  });

  it('exposes missing binary failure instead of an empty successful result', async () => {
    vi.mocked(dockerUtils.findDockerPath).mockReturnValue(join(directory, 'missing'));
    await expect(adapter.getLogs('anything')).rejects.toThrow(/ENOENT/);
  });
});
