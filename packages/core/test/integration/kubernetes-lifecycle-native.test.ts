import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { rm, mkdtemp, readFile, writeFile } from 'node:fs/promises';

import { ExecutionEngine } from '../../src/core/execution-engine.js';
import { KubernetesAdapter } from '../../src/adapters/kubernetes/index.js';
import { createK8sExecutionContext } from '../../src/adapters/kubernetes/kubernetes-api.js';

// The fake binary is a POSIX executable script. Every call executes a native
// process and the ordinary public API, without a Kubernetes cluster.
describe.skipIf(process.platform === 'win32')('Kubernetes native lifecycle', () => {
  let directory: string;
  let binary: string;
  let adapter: KubernetesAdapter;
  let engine: ExecutionEngine;

  const records = async (): Promise<Array<{ pid: number; args: string[] }>> => {
    const text = await readFile(join(directory, 'calls.jsonl'), 'utf8').catch(error => {
      if (error.code === 'ENOENT') return '';
      throw error;
    });
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line));
  };
  const isAlive = (pid: number): boolean => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  };
  const waitForCalls = async (count = 1) => {
    await vi.waitFor(async () => expect((await records()).length).toBeGreaterThanOrEqual(count), { timeout: 3000, interval: 20 });
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-kubernetes-native-'));
    binary = join(directory, 'kubectl');
    await writeFile(binary, `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(__dirname, 'calls.jsonl'), JSON.stringify({pid: process.pid, args: argv}) + '\\n');
const args = [...argv];
while (args[0] === '--context' || args[0] === '--kubeconfig') args.splice(0, 2);
const command = args[0];
const pod = args.at(-1);
const hang = () => { process.on('SIGTERM', () => {}); setInterval(() => {}, 1000); };
if (command === 'raw-json' || command === 'failed-json') {
  process.stdout.write(JSON.stringify({token: 'synthetic-fixture-value'}));
  process.stderr.write('password=synthetic-fixture-value');
  process.exitCode = command === 'failed-json' ? 7 : 0;
} else if (command === 'exec') {
  if (args.includes('late-exec')) {
    require('node:child_process').spawn(process.execPath, ['-e', "setTimeout(() => process.stdout.write('exec trailing output'), 100)"], {stdio: ['ignore', 1, 2]}).unref();
    process.exit(0);
  } else if (args.includes('hang-exec')) hang();
  else if (args.includes('failed-exec')) { process.stderr.write('failed command'); process.exitCode = 7; }
  else process.stdout.write(JSON.stringify({args: argv, env: process.env.REMOTE_ONLY ?? null, cwd: process.cwd()}));
} else if (command === 'literal') {
  process.stdout.write(JSON.stringify(argv)); process.stderr.write('diagnostic'); process.exitCode = 7;
} else if (command === 'flood') {
  process.stdout.write(Buffer.alloc(1024 * 1024, 'x')); hang();
} else if (command === 'hang') {
  hang();
} else if (command === 'trailing') {
  require('node:child_process').spawn(process.execPath, ['-e', "setTimeout(() => process.stdout.write('after parent exit'), 100)"], {stdio: ['ignore', 1, 2]}).unref();
  process.exit(0);
} else if (command === 'logs') {
  if (pod === 'lines') {
    const text = Buffer.from('Ж🙂\\n\\n  \\r\\nunterminated');
    process.stdout.write(text.subarray(0, 1));
    setTimeout(() => { process.stdout.write(text.subarray(1, 4)); setTimeout(() => process.stdout.write(text.subarray(4)), 10); }, 10);
  } else if (pod === 'failure') {
    process.stderr.write('permission denied'); process.exitCode = 9;
  } else if (pod === 'overflow') {
    process.stdout.write(Buffer.alloc(32768, 'x')); hang();
  } else if (pod === 'callback') {
    process.stdout.write('first\\nsecond\\n'); hang();
  } else { process.stdout.write('ready\\n'); if (args.includes('-f')) hang(); }
} else if (command === 'port-forward') {
  const target = args.at(-2);
  if (target === 'early-exit') process.exit(0);
  else if (target === 'failure') { process.stderr.write('permission denied'); process.exitCode = 3; }
  else if (target === 'pending') hang();
  else {
    const [local, remote] = args.at(-1).split(':').map(Number);
    const server = require('node:net').createServer();
    server.listen(local, '127.0.0.1', () => {
      process.stderr.write('Warning: synthetic warning\\n');
      process.stdout.write('Forwarding from 127.0.0.1:');
      setTimeout(() => process.stdout.write(server.address().port + ' -> ' + remote + '\\n'), 10);
    });
  }
}
`, { mode: 0o700 });
    engine = new ExecutionEngine({ adapters: { kubernetes: { // Finite protocol checks have a startup budget; deadline behavior uses explicit 80ms probes below.
    kubectlPath: binary, kubectlTimeout: 3000, maxBuffer: 64 * 1024 } } });
    adapter = engine.getAdapter('kubernetes') as KubernetesAdapter;
  });

  afterEach(async () => {
    await adapter.dispose();
    await vi.waitFor(async () => {
      for (const entry of await records()) expect(isAlive(entry.pid), `kubectl PID ${entry.pid} survived completion`).toBe(false);
    }, { timeout: 3000, interval: 20 });
    await rm(directory, { recursive: true, force: true });
  });

  it('returns byte-exact valid JSON and stderr while redacting error diagnostics', async () => {
    const result = await adapter.executeKubectl(['raw-json']);
    expect(result.stdout).toBe('{"token":"synthetic-fixture-value"}');
    expect(JSON.parse(result.stdout)).toEqual({ token: 'synthetic-fixture-value' });
    expect(result.stderr).toBe('password=synthetic-fixture-value');
    const failure = await adapter.executeKubectl(['failed-json'], { throwOnNonZeroExit: true }).catch(error => error);
    expect(failure.code).toBe('KUBERNETES_ERROR');
    expect(failure.message).toContain('[REDACTED]');
    expect(JSON.stringify(failure)).not.toContain('synthetic-fixture-value');
  });

  it('uses the ordinary pod exec API with exact target argv, remote env and remote cwd', async () => {
    const result = await adapter.execute({
      command: 'printf', args: ['a literal ; $PATH'], env: { REMOTE_ONLY: 'synthetic-env' }, cwd: '/inside/pod',
      adapterOptions: { type: 'kubernetes', pod: 'exec-probe', namespace: 'ns', context: 'exact cluster' },
    });
    const observed = JSON.parse(result.stdout);
    expect(observed.args.slice(0, 2)).toEqual(['--context', 'exact cluster']);
    expect(observed.args).toContain('/bin/sh');
    expect(observed.args.at(-1)).toContain('REMOTE_ONLY=');
    expect(observed.args.at(-1)).toContain('/inside/pod');
    expect(observed.env).toBe(null);
    expect(observed.cwd).not.toBe('/inside/pod');
    const pod = createK8sExecutionContext(engine, {}).pod('late-exec');
    await expect(pod.exec`echo ordinary`).resolves.toMatchObject({ stdout: 'exec trailing output' });
  });

  it('retains exec nonzero/timeout policies and sanitized events', async () => {
    const adapterOptions = { type: 'kubernetes' as const, pod: 'failed-exec' };
    await expect(adapter.execute({ command: 'false', adapterOptions })).rejects.toMatchObject({ code: 'KUBERNETES_ERROR' });
    await expect(adapter.execute({ command: 'false', adapterOptions, nothrow: true })).resolves.toMatchObject({ exitCode: 7 });
    await expect(adapter.execute({ command: 'hang', timeout: 80, nothrow: true,
      adapterOptions: { type: 'kubernetes', pod: 'hang-exec' } })).resolves.toMatchObject({ exitCode: 124 });
    const events: unknown[] = [];
    adapter.on('k8s:exec', event => events.push(event));
    const masked = await adapter.execute({ command: 'echo password=synthetic-fixture-value', adapterOptions: { type: 'kubernetes', pod: 'exec-probe' } });
    expect(masked.stdout).not.toContain('synthetic-fixture-value');
    expect(events).toHaveLength(1);
    expect(JSON.stringify(events)).not.toContain('synthetic-fixture-value');
    expect(JSON.stringify(events)).toContain('[REDACTED]');
  });

  it('uses literal argv, preserves nonzero results by default and rejects requested failures', async () => {
    const args = ['literal', 'spaces ; $(echo unsafe) & |', '"quoted"'];
    const result = await adapter.executeKubectl(args);
    expect(JSON.parse(result.stdout)).toEqual(args);
    expect(result).toMatchObject({ exitCode: 7, stderr: 'diagnostic' });
    await expect(adapter.executeKubectl(args, { throwOnNonZeroExit: true })).rejects.toThrow();
  });

  it('drains output written after the direct child exits', async () => {
    await expect(adapter.executeKubectl(['trailing'])).resolves.toMatchObject({ stdout: 'after parent exit', exitCode: 0 });
  });

  it('bounds collected output and honors kubectl configuration and per-call timeouts', async () => {
    await expect(adapter.executeKubectl(['flood'], { maxBuffer: 256 })).rejects.toMatchObject({ code: 'MAX_BUFFER_EXCEEDED' });
    await expect(adapter.executeKubectl(['hang'], { timeout: 80 })).rejects.toThrow(/timed out/);
    const configured = new KubernetesAdapter({ kubectlPath: binary, kubectlTimeout: 80 });
    try {
      await expect(configured.executeKubectl(['hang'])).rejects.toThrow(/timed out/);
    } finally { await configured.dispose(); }
  });

  it('propagates spawn errors and aborts without turning them into successful output', async () => {
    const missing = new KubernetesAdapter({ kubectlPath: join(directory, 'missing') });
    await expect(missing.executeKubectl(['version'])).rejects.toThrow(/ENOENT/);
    const controller = new AbortController();
    controller.abort(new Error('cancelled before spawn'));
    await expect(adapter.executeKubectl(['literal'], { signal: controller.signal })).rejects.toThrow(/cancelled before spawn/);
    expect(await records()).toEqual([]);
  });

  it('preserves UTF-8, blank lines, line boundaries and the final unterminated log', async () => {
    const chunks: string[] = [];
    const stream = await createK8sExecutionContext(engine, { namespace: 'test' }).pod('lines').streamLogs(line => chunks.push(line));
    await stream.completion;
    expect(chunks).toEqual(['Ж🙂\n', '\n', '  \r\n', 'unterminated']);
    await stream.stop();
  });

  it('exposes log command failure and callback failure through completion', async () => {
    const failed = await adapter.streamLogs('failure', () => {});
    await expect(failed.completion).rejects.toThrow(/permission denied/);
    const callback = await adapter.streamLogs('callback', () => { throw new Error('consumer rejected'); }, { follow: true });
    await expect(callback.completion).rejects.toThrow('consumer rejected');
    const overflow = await adapter.streamLogs('overflow', () => {}, { follow: true, maxBuffer: 256 });
    await expect(overflow.completion).rejects.toMatchObject({ code: 'MAX_BUFFER_EXCEEDED' });
  });

  it('stops a followed stream only after its native process exits', async () => {
    const stream = await createK8sExecutionContext(engine, {}).pod('pending').follow(() => {});
    await waitForCalls();
    const [{ pid }] = await records();
    expect(isAlive(pid)).toBe(true);
    await stream.stop();
    expect(isAlive(pid)).toBe(false);
    await expect(stream.completion).resolves.toBeUndefined();
  });

  it('aborts active streams and observes operation deadlines', async () => {
    const controller = new AbortController();
    const stream = await adapter.streamLogs('pending', () => {}, { follow: true, signal: controller.signal });
    await waitForCalls();
    controller.abort(new Error('caller cancelled'));
    await expect(stream.completion).rejects.toThrow('caller cancelled');
    const timed = await adapter.streamLogs('pending', () => {}, { follow: true, timeout: 80 });
    await expect(timed.completion).rejects.toThrow(/timed out/);
  });

  it('parses fragmented readiness, tolerates warnings and reports the real dynamic port', async () => {
    const forward = await adapter.portForward('ready', 12345, 80, { dynamicLocalPort: true });
    await forward.open();
    expect(forward.isOpen).toBe(true);
    expect(forward.localPort).toBeGreaterThan(0);
    expect((await records())[0].args.at(-1)).toBe(':80');
    const [{ pid }] = await records();
    await forward.close();
    expect(forward.isOpen).toBe(false);
    expect(isAlive(pid)).toBe(false);
  });

  it('rejects an early zero exit, nonzero exit, spawn failure and readiness timeout', async () => {
    for (const pod of ['early-exit', 'failure', 'pending']) {
      const forward = await adapter.portForward(pod, 0, 80, { timeout: 80 });
      await expect(forward.open()).rejects.toThrow();
    }
    const missing = new KubernetesAdapter({ kubectlPath: join(directory, 'missing') });
    const forward = await missing.portForward('ready', 0, 80);
    await expect(forward.open()).rejects.toThrow(/ENOENT/);
    await missing.dispose();
  });

  it('tracks pending forwards and log streams for disposal and refuses a duplicate open', async () => {
    const forward = await adapter.portForward('pending', 0, 80);
    const opening = forward.open();
    const rejected = opening.catch(error => error);
    await expect(forward.open()).rejects.toThrow(/already opening/);
    const stream = await adapter.streamLogs('pending', () => {}, { follow: true });
    await waitForCalls(2);
    await adapter.dispose();
    expect(await rejected).toMatchObject({ message: 'Port forward exited before becoming ready' });
    await stream.completion;
    for (const { pid } of await records()) expect(isAlive(pid)).toBe(false);
  });

  it('owns a pending finite command during adapter disposal', async () => {
    const pending = adapter.executeKubectl(['hang']);
    const refused = pending.catch(error => error);
    await waitForCalls();
    await adapter.dispose();
    expect(await refused).toMatchObject({ message: 'kubectl operation stopped before completion' });
    for (const { pid } of await records()) expect(isAlive(pid)).toBe(false);
  });

  it('preserves explicit cluster identity for logs, streaming, forwarding and file copies', async () => {
    const pod = createK8sExecutionContext(engine, { namespace: 'ns', context: 'exact cluster', kubeconfig: '/a path/config' }).pod('ready');
    await pod.logs();
    const stream = await pod.streamLogs(() => {}, { follow: true });
    const forward = await pod.portForwardDynamic(80);
    await pod.copyTo('/local file', '/remote file', 'container');
    await pod.copyFrom('/remote file', '/local file', 'container');
    await stream.stop();
    await forward.close();
    const calls = await records();
    expect(calls).toHaveLength(5);
    for (const { args } of calls) expect(args.slice(0, 4)).toEqual(['--kubeconfig', '/a path/config', '--context', 'exact cluster']);
    for (const { args } of calls.filter(call => call.args.includes('cp'))) {
      expect(args).toContain('ready:/remote file');
      expect(args.filter(arg => arg === '-c')).toHaveLength(1);
    }
  });
});
