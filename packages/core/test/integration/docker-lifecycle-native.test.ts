import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inspect } from 'node:util';
import { Writable } from 'node:stream';
import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { DockerAdapter } from '../../src/adapters/docker/index.js';
import { ExecutionEngine } from '../../src/core/execution-engine.js';
import * as dockerUtils from '../../src/adapters/docker/docker-utils.js';
import { DockerContainer } from '../../src/adapters/docker/docker-api.js';
import { TimeoutError, MaxBufferExceededError } from '../../src/core/error.js';

// Execute only this private fake binary through the ordinary Docker APIs. No
// Docker daemon, image, real container or external service participates.
describe.skipIf(process.platform === 'win32')('Docker native lifecycle', () => {
  let directory: string;
  let binary: string;
  let adapter: DockerAdapter;
  let fluentEngine: ExecutionEngine;
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
fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify({pid:process.pid,args,localEnv:process.env['REMOTE_ONLY']??null})+'\\n');
const hang = () => { process.on('SIGTERM',()=>{}); setInterval(()=>{},1000); };
const kind = args.at(-1);
if (args[0] === 'ps') {
  if (fs.existsSync(path.join(__dirname,'offline'))) { process.stderr.write('daemon unavailable');process.exitCode=1; }
  else if (fs.existsSync(path.join(__dirname,'malformed'))) process.stdout.write('invalid-json');
  else if (fs.existsSync(path.join(__dirname,'created'))) process.stdout.write(JSON.stringify({ID:(fs.existsSync(path.join(__dirname,'replaced'))?'b':'a').repeat(64),Names:fs.readFileSync(path.join(__dirname,'created'),'utf8')}));
} else if (args[0] === 'create') {
  fs.writeFileSync(path.join(__dirname,'created'),args[args.indexOf('--name')+1]);
} else if (args[0] === 'inspect') {
  const state = fs.existsSync(path.join(__dirname,'stopped')) ? 'exited' : 'running';
  process.stdout.write(JSON.stringify([{Id:'a'.repeat(64), Name:'/fixture',
    State:{Running:state==='running',Status:state,Health:{Status:'healthy'}},
    Config:{Image:'fixture-image',Labels:{token:'synthetic-fixture-value'}},
    Created:'2026-01-01T00:00:00Z',NetworkSettings:{Ports:{'80/tcp':[{HostIp:'127.0.0.1',HostPort:'32768'}],'53/udp':[{HostIp:'::1',HostPort:'32769'}]},Networks:{}}}]));
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
  if (args.includes('-d')) {
    fs.writeFileSync(path.join(__dirname,'created'),args[args.indexOf('--name')+1]);
    process.stdout.write('a'.repeat(64));
  } else if (kind === 'hang') hang();
  else if (kind === 'iterate') { hang();process.stdout.write('ready\\n'); }
  else if (kind === 'failed') { process.stderr.write('command failed');process.exitCode=7; }
  else if (kind === 'stdin') { let data='';process.stdin.on('data',c=>data+=c);process.stdin.on('end',()=>process.stdout.write(data||'EOF')); }
  else if (kind === 'masked') process.stdout.write('password=synthetic-fixture-value');
  else process.stdout.write(JSON.stringify({args,cwd:process.cwd(),localEnv:process.env['REMOTE_ONLY']??null}));
} else if (args[0] === 'exec') {
  process.stdout.write(JSON.stringify({args,localEnv:process.env['REMOTE_ONLY']??null}));
} else if (args[0] === 'stop' && fs.existsSync(path.join(__dirname,'lifecycle'))) {
  if (fs.existsSync(path.join(__dirname,'refuse-stop'))) {process.stderr.write('stop refused');process.exitCode=7;}
  else { fs.writeFileSync(path.join(__dirname,'stopped'),'yes'); if(fs.existsSync(path.join(__dirname,'replace-on-stop'))) fs.writeFileSync(path.join(__dirname,'replaced'),'yes'); }
} else if (args[0] === 'start') fs.rmSync(path.join(__dirname,'stopped'),{force:true});
else if (args[0] === 'network') {
  if (fs.existsSync(path.join(__dirname,'offline'))) {process.stderr.write('daemon unavailable');process.exitCode=1;}
  else process.stdout.write(JSON.stringify({Name:'fixture-network'}));
} else if (args[0] === 'stop') hang();
else if (args[0] === 'compose') process.stdout.write('done');
else if (args[0] === 'rm') {
  if (fs.existsSync(path.join(__dirname,'replaced')) && args.at(-1)==='a'.repeat(64)) process.stdout.write('removed original');
  else if (fs.existsSync(path.join(__dirname,'remove-success'))) fs.rmSync(path.join(__dirname,'created'),{force:true});
  else { process.stderr.write('cleanup refused'); process.exitCode=7; }
}
`, { mode: 0o700 });
    vi.spyOn(dockerUtils, 'findDockerPath').mockReturnValue(binary);
    adapter = new DockerAdapter({ managementTimeout: 3000, maxBuffer: 64 * 1024 });
    fluentEngine = new ExecutionEngine({ defaultTimeout: 3000 });
    fluentEngine.registerAdapter('docker', adapter);
  });

  afterEach(async () => {
    await fluentEngine.dispose();
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

  it('joins the native helper when an ordinary command iterator breaks', async () => {
    const engine = new ExecutionEngine();
    engine.registerAdapter('docker', adapter);
    try {
      const command = engine.exec('iterate', { adapter: 'docker', adapterOptions: target, shell: false, timeout: 3000 });
      for await (const line of command) { expect(line).toBe('ready'); break; }
      for (const { pid } of await records()) expect(alive(pid)).toBe(false);
    } finally { await engine.dispose(); }
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
    expect((await records())[0]?.args).toEqual(['logs', '--tail', '4', '--since', '2026-01-01', '--until', '2026-01-02', '-t', 'lines']);
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
    expect((await records())[0]?.localEnv).toBe('compose-only');
    expect(process.env['REMOTE_ONLY']).toBeUndefined();
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

  it.each(['ephemeral', 'persistent'] as const)('keeps %s management failures observable', async kind => {
    await writeFile(join(directory, 'offline'), 'yes');
    const fluent = kind === 'ephemeral'
      ? fluentEngine.docker().ephemeral('fixture-image').name('fixture')
      : fluentEngine.docker().container('fixture');
    const afterStart = vi.fn();
    fluent.lifecycle({ afterStart });
    await expect(fluent.info()).rejects.toThrow('daemon unavailable');
    await expect(fluent.isRunning()).rejects.toThrow('daemon unavailable');
    await expect(fluent.start()).rejects.toThrow('daemon unavailable');
    expect(afterStart).not.toHaveBeenCalled();
    expect((await records()).every(call => call.args[0] === 'ps')).toBe(true);
  });

  it('rejects malformed observations instead of authorizing a new container', async () => {
    await writeFile(join(directory, 'malformed'), 'yes');
    const fluent = fluentEngine.docker().ephemeral('fixture-image').name('fixture');
    await expect(fluent.start()).rejects.toThrow('Malformed Docker container inventory');
    expect((await records()).map(call => call.args[0])).toEqual(['ps']);
  });

  it('restarts a stopped ephemeral service with its immutable existing identity', async () => {
    await writeFile(join(directory, 'created'), 'fixture');
    await writeFile(join(directory, 'lifecycle'), 'yes');
    const fluent = fluentEngine.docker().ephemeral('fixture-image').name('fixture');
    const afterStop = vi.fn();
    const afterStart = vi.fn();
    fluent.lifecycle({ afterStop, afterStart });
    await fluent.restart();
    const mutations = (await records()).filter(call => ['stop', 'start', 'run'].includes(call.args[0]!));
    expect(mutations.map(call => call.args)).toEqual([
      ['stop', '--', 'a'.repeat(64)], ['start', '--', 'a'.repeat(64)],
    ]);
    expect(afterStop).toHaveBeenCalledOnce();
    expect(afterStart).toHaveBeenCalledOnce();
    expect((await fluent.info())?.labels?.['token']).toBe('synthetic-fixture-value');
    expect((await fluent.status()).endpoints).toEqual(['127.0.0.1:32768', '[::1]:32769/udp']);
  });

  it('does not report successful stop or removal after a refused operation', async () => {
    await writeFile(join(directory, 'created'), 'fixture');
    await writeFile(join(directory, 'lifecycle'), 'yes');
    await writeFile(join(directory, 'refuse-stop'), 'yes');
    const fluent = fluentEngine.with({ nothrow: true, throwOnNonZeroExit: false }).docker().ephemeral('fixture-image').name('fixture');
    const afterStop = vi.fn();
    fluent.lifecycle({ afterStop });
    await expect(fluent.stop()).rejects.toThrow('stop refused');
    expect(afterStop).not.toHaveBeenCalled();
    await expect(fluent.remove()).rejects.toThrow('cleanup refused');
    expect((await records()).find(call => call.args[0] === 'rm')?.args).toEqual(['rm', '-f', '--', 'a'.repeat(64)]);
  });

  it('acknowledges absence before and after idempotent removal', async () => {
    const fluent = fluentEngine.docker().ephemeral('fixture-image').name('fixture');
    expect(await fluent.info()).toBeNull();
    await fluent.remove();
    expect((await records()).some(call => call.args[0] === 'rm')).toBe(false);
    await writeFile(join(directory, 'created'), 'fixture');
    await writeFile(join(directory, 'remove-success'), 'yes');
    await fluent.remove();
    expect(await fluent.info()).toBeNull();
    expect((await records()).filter(call => call.args[0] === 'rm')).toHaveLength(1);
  });

  it.each(['ephemeral', 'persistent'] as const)('routes named %s exec through the Docker adapter with its environment', async kind => {
    await writeFile(join(directory, 'created'), 'fixture');
    const fluent = (kind === 'ephemeral'
      ? fluentEngine.docker().ephemeral('fixture-image').name('fixture')
      : fluentEngine.docker().container('fixture'))
      .env({ REMOTE_ONLY: 'container-only' }).workdir('/workspace').user('1000');
    const literal = 'space ; $(echo unsafe)';
    const result = await fluent.exec`printf ${literal}`;
    const observed = JSON.parse(result.stdout);
    expect(observed.args).toEqual(expect.arrayContaining(['-e', 'REMOTE_ONLY=container-only', '-w', '/workspace', '-u', '1000']));
    expect(observed.localEnv).toBeNull();
    expect(observed.args.slice(-3)).toEqual(['sh', '-c', "printf 'space ; $(echo unsafe)'"]);
  });

  it('keeps unnamed exec settings and replaces its configured command exactly once', async () => {
    const fluent = fluentEngine.docker().ephemeral('fixture-image')
      .memory('64m').cpus('0.5').command('this must not execute');
    const result = await fluent.exec`printf ${'literal ; data'}`;
    const observed = JSON.parse(result.stdout);
    expect(observed.args).toEqual(expect.arrayContaining(['-m', '64m', '--cpus', '0.5', '--rm']));
    expect(observed.args).not.toContain('-d');
    expect(observed.args).not.toContain('this must not execute');
    expect(observed.args.slice(-3)).toEqual(['sh', '-c', "printf 'literal ; data'"]);
  });

  it('retains a generated service name for subsequent management', async () => {
    const fluent = fluentEngine.docker().ephemeral('fixture-image').command(['sleep', '10']);
    await fluent.start();
    expect(fluent.build().name).toMatch(/^xec-[a-f0-9-]+$/);
    expect(await readFile(join(directory, 'created'), 'utf8')).toBe(fluent.build().name);
  });

  it('distinguishes network absence from a failed inventory read', async () => {
    expect(await fluentEngine.docker().network('fixture-network').exists()).toBe(true);
    expect(await fluentEngine.docker().network('absent').exists()).toBe(false);
    await writeFile(join(directory, 'offline'), 'yes');
    await expect(fluentEngine.docker().network('fixture-network').exists()).rejects.toThrow('daemon unavailable');
  });


  it('never removes a replacement container that appears during a persistent stop', async () => {
    await writeFile(join(directory, 'created'), 'fixture');
    await writeFile(join(directory, 'lifecycle'), 'yes');
    await writeFile(join(directory, 'replace-on-stop'), 'yes');
    const service = fluentEngine.docker().container('fixture');
    await expect(service.remove()).rejects.toThrow('replaced during removal');
    const mutations = (await records()).filter(({ args }) => ['stop', 'rm'].includes(args[0]!));
    expect(mutations.map(({ args }) => args.at(-1))).toEqual(['a'.repeat(64), 'a'.repeat(64)]);
  });

  it('preserves executable argument boundaries in the DockerContainer API', async () => {
    const container = new DockerContainer(fluentEngine, adapter, {
      name: 'fixture', image: 'fixture-image', command: ['sleep', '10'],
    });
    await container.start();
    const literal = 'space ; $(echo unsafe)';
    const result = await container.execRaw('printf', ['%s', literal]);
    expect(JSON.parse(result.stdout).args.slice(-3)).toEqual(['printf', '%s', literal]);
  });

});
