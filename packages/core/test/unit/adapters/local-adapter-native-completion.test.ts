import type { ProcessHandle } from '../../../src/types/process-handle.js';

import { Writable } from 'node:stream';

import { LocalAdapter } from '../../../src/adapters/local/index.js';

const command = (body: string) => ({ command: process.execPath, args: ['-e', body], shell: false, timeout: 3000 });
const alive = (pid: number): boolean => {
  try { process.kill(pid, 0); return true; } catch { return false; }
};

describe('local native completion', () => {
  it('waits for asynchronous writes and finalization in caller-owned output destinations', async () => {
    const output: string[] = [];
    let flushed = false;
    const sink = new Writable({
      write(chunk, _encoding, callback) {
        setTimeout(() => { output.push(chunk.toString()); callback(); }, 40);
      },
      final(callback) { setTimeout(() => { flushed = true; callback(); }, 40); },
    });
    const adapter = new LocalAdapter({ forceImplementation: 'node' });
    await adapter.execute({ ...command('process.stdout.write("complete")'), stdout: sink });
    expect(output.join('')).toBe('complete');
    expect(flushed).toBe(true);
  });

  it('publishes stdin before feeding the configured command input', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node' });
    const result = await adapter.execute({
      ...command('let input=""; process.stdin.on("data",part=>input+=part); process.stdin.on("end",()=>process.stdout.write(input))'),
      stdin: 'suffix', onSpawn: child => { child.stdin!.write('prefix'); },
    });
    expect(result.stdout).toBe('prefixsuffix');
  });

  it('drains global stdout and stderr without ending either stream', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node' });
    await adapter.execute({
      ...command('process.stdout.write("native stdout\\n"); process.stderr.write("native stderr\\n")'),
      stdout: process.stdout, stderr: process.stderr,
    });
    expect(process.stdout.writableEnded).toBe(false);
    expect(process.stderr.writableEnded).toBe(false);
  });

  it('reports a destination error and confirms native cleanup before rejecting', async () => {
    let child: ProcessHandle | undefined;
    const sink = new Writable({ write(_chunk, _encoding, callback) { callback(new Error('destination failed')); } });
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 50 });
    await expect(adapter.execute({
      ...command('process.stdout.write("ready"); setInterval(()=>{},1000)'),
      stdout: sink, onSpawn: handle => { child = handle; },
    })).rejects.toThrow('destination failed');
    expect(alive(child!.pid!)).toBe(false);
  });

  it('cleans up when the spawn observer refuses the process', async () => {
    let child: ProcessHandle | undefined;
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 50 });
    await expect(adapter.execute({
      ...command('setInterval(()=>{},1000)'),
      onSpawn: handle => { child = handle; throw new Error('observer refused'); },
    })).rejects.toThrow('observer refused');
    expect(alive(child!.pid!)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('delivers SIGTERM and the last graceful output before completion', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 200 });
    let child: ProcessHandle | undefined;
    const result = await adapter.execute({
      ...command('process.on("SIGTERM",()=>{process.stdout.write("finished",()=>process.exit(0))}); process.stdout.write("ready"); setInterval(()=>{},1000)'),
      onSpawn: handle => { child = handle; handle.stdout!.once('data', () => handle.kill()); },
    });
    expect(result.stdout).toBe('readyfinished');
    expect(result.exitCode).toBe(0);
    expect(alive(child!.pid!)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('escalates an ignored SIGTERM and waits for the exact native PID to exit', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 50 });
    const controller = new AbortController();
    let child: ProcessHandle | undefined;
    const result = await adapter.execute({
      ...command('process.on("SIGTERM",()=>{}); process.stdout.write("ready"); setInterval(()=>{},1000)'),
      signal: controller.signal, throwOnNonZeroExit: false,
      onSpawn: handle => { child = handle; handle.stdout!.once('data', () => controller.abort()); },
    });
    expect(result.signal).toBe('SIGKILL');
    expect(alive(child!.pid!)).toBe(false);
  });

  it.skipIf(process.platform === 'win32')('waits for termination after a real command deadline', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 50 });
    let child: ProcessHandle | undefined;
    await expect(adapter.execute({
      ...command('process.on("SIGTERM",()=>{}); setInterval(()=>{},1000)'),
      timeout: 200, onSpawn: handle => { child = handle; },
    })).rejects.toThrow(/timed out/);
    expect(alive(child!.pid!)).toBe(false);
  });

  it('reports an uncompleted output destination within the cleanup bound', async () => {
    const adapter = new LocalAdapter({ forceImplementation: 'node', forceKillAfterDelay: 10 });
    const controller = new AbortController();
    const sink = new Writable({ write(_chunk, _encoding, _callback) { controller.abort(); } });
    try {
      await expect(adapter.execute({
        ...command('process.stdout.write("pending")'), stdout: sink, timeout: 0, signal: controller.signal,
      })).rejects.toMatchObject({ operation: 'terminate' });
    } finally { sink.destroy(); }
  });
});
