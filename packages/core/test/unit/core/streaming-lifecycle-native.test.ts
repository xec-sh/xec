import type { Command } from '../../../src/types/command.js';
import type { ProcessPromise } from '../../../src/types/process.js';

import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Writable, PassThrough } from 'node:stream';
import { rm, access, mkdtemp, readFile } from 'node:fs/promises';

import { ExecutionEngine } from '../../../src/core/execution-engine.js';

function alive(pid: number | undefined): boolean {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === 'ESRCH') return false; throw error; }
}

describe('native line iterator lifetime and backpressure', () => {
  let directory: string;
  let engine: ExecutionEngine;
  const commands: ProcessPromise[] = [];
  const run = (source: string, options: Partial<Command> = {}) => {
    const command = engine.exec(process.execPath, { args: ['-e', source], shell: false, ...options });
    commands.push(command);
    return command;
  };

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'xec-iterator-'));
    engine = new ExecutionEngine({ defaultTimeout: 5000, maxBuffer: 16 * 1024 * 1024 });
  });
  afterEach(async () => {
    for (const command of commands.splice(0)) {
      command.kill();
      await command.catch(() => {});
      expect(alive(command.pid)).toBe(false);
    }
    await engine.dispose();
    await rm(directory, { recursive: true, force: true });
  });

  it('joins termination before an early break returns, including a process ignoring TERM', async () => {
    const command = run('process.on("SIGTERM",()=>{});process.stdout.write("ready\\n");setInterval(()=>{},1000)');
    let pid: number | undefined;
    for await (const line of command) {
      expect(line).toBe('ready');
      pid = command.pid;
      expect(alive(pid)).toBe(true);
      break;
    }
    expect(alive(pid)).toBe(false);
  });

  it('pauses a fast producer while the consumer holds one line', async () => {
    const marker = join(directory, 'producer-finished');
    const command = run(`
      const fs=require('node:fs');let count=0;const line='x'.repeat(1023)+'\\n';
      function pump(){while(count<4096){count++;if(!process.stdout.write(line)){process.stdout.once('drain',pump);return;}}
      fs.writeFileSync(${JSON.stringify(marker)},'complete');}pump();
    `);
    const iterator = command[Symbol.asyncIterator]();
    expect((await iterator.next()).value).toHaveLength(1023);
    const handle = await command.spawned;
    await vi.waitFor(() => expect(handle.stdout?.isPaused()).toBe(true), { timeout: 1500 });
    await expect(access(marker)).rejects.toMatchObject({ code: 'ENOENT' });
    await iterator.return!();
    expect(alive(handle.pid)).toBe(false);
  });

  it('joins return while next is waiting for output', async () => {
    const command = run('setInterval(()=>{},1000)');
    const iterator = command[Symbol.asyncIterator]();
    const next = iterator.next();
    const handle = await command.spawned;
    await iterator.return!();
    expect(alive(handle.pid)).toBe(false);
    await expect(next).resolves.toMatchObject({ done: true });
  });

  it('surfaces a stdout read error only after stopping its command', async () => {
    const command = run('setInterval(()=>{},1000)');
    const iterator = command[Symbol.asyncIterator]();
    const next = iterator.next();
    const failure = expect(next).rejects.toThrow('synthetic stdout read failure');
    const handle = await command.spawned;
    handle.stdout!.destroy(new Error('synthetic stdout read failure'));
    await failure;
    expect(alive(handle.pid)).toBe(false);
  });

  it('yields all complete lines and the tail before reporting nonzero', async () => {
    const command = run('process.stdout.write("one\\n\\nlast");process.exitCode=7');
    const lines: string[] = [];
    await expect((async () => { for await (const line of command) lines.push(line); })()).rejects.toThrow('exit code 7');
    expect(lines).toEqual(['one', '', 'last']);
    expect(alive(command.pid)).toBe(false);
  });

  it('honors nothrow and reconstructs split UTF-8 and CRLF without dropping blank lines', async () => {
    const command = run('process.stdout.write(Buffer.from([0xe2,0x82]));setTimeout(()=>{process.stdout.write(Buffer.from([0xac,13,10,10]));process.exitCode=7},20)', { nothrow: true });
    const lines: string[] = [];
    for await (const line of command) lines.push(line);
    expect(lines).toEqual(['€', '']);
    expect((await command).exitCode).toBe(7);
  });

  it('does not abort a sibling sharing the caller signal when one iterator breaks', async () => {
    const controller = new AbortController();
    const sibling = engine.exec(process.execPath, { args: ['-e', 'process.stdin.once("data",()=>{process.stdout.write("sibling survived");process.exitCode=0;process.stdin.pause()})'], shell: false, stdin: new PassThrough() }).signal(controller.signal);
    commands.push(sibling);
    const siblingResult = sibling.then(result => result);
    void siblingResult.catch(() => {});
    const siblingHandle = await sibling.spawned;
    const command = engine.exec(process.execPath, { args: ['-e', 'process.stdout.write("ready\\n");setInterval(()=>{},1000)'], shell: false }).signal(controller.signal);
    commands.push(command);
    for await (const line of command) { expect(line).toBe('ready'); break; }
    expect(controller.signal.aborted).toBe(false);
    expect(alive(siblingHandle.pid)).toBe(true);
    siblingHandle.stdin!.end('complete');
    await expect(siblingResult).resolves.toMatchObject({ stdout: 'sibling survived', exitCode: 0 });
  });

  it('preserves a signal supplied directly to exec options', async () => {
    const controller = new AbortController();
    controller.abort(new Error('explicit exec cancellation'));
    const command = run('process.stdout.write("must not execute")', { signal: controller.signal });
    await expect(command).rejects.toThrow('explicit exec cancellation');
    expect(command.pid).toBeUndefined();
  });

  it('joins a buffered pipe source when its iterator is returned before output', async () => {
    const marker = join(directory, 'pipe-pid');
    const source = engine.exec(process.execPath, { args: ['-e', `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid));setInterval(()=>{},1000)`], shell: false });
    const destination = engine.exec(process.execPath, { args: ['-e', 'process.stdin.pipe(process.stdout)'], shell: false });
    const command = source.pipe(destination);
    commands.push(command);
    const iterator = command[Symbol.asyncIterator]();
    const next = iterator.next();
    void next.catch(() => {});
    await vi.waitFor(() => access(marker), { timeout: 2000 });
    const pid = Number(await readFile(marker, 'utf8'));
    expect(alive(pid)).toBe(true);
    await iterator.return!();
    await expect(next).resolves.toMatchObject({ done: true });
    expect(alive(pid)).toBe(false);
  });

  it('does not hide an unconfirmed output destination when returning', async () => {
    const sink = new Writable({ write() {} });
    const command = run('process.stdout.write("ready\\n");setInterval(()=>{},1000)', { stdout: sink });
    const iterator = command[Symbol.asyncIterator]();
    try {
      await expect(iterator.next()).resolves.toMatchObject({ value: 'ready' });
      await expect(iterator.return!()).rejects.toThrow('Output destination did not finish');
      expect(alive(command.pid)).toBe(false);
    } finally { sink.destroy(); }
  });

  it('supports its iterable contract after the command has already completed', async () => {
    const command = run('process.stdout.write("finished\\nlast")');
    await command;
    const lines: string[] = [];
    for await (const line of command[Symbol.asyncIterator]()) lines.push(line);
    expect(lines).toEqual(['finished', 'last']);
  });

  it('joins return before any request for a line', async () => {
    const command = run('setInterval(()=>{},1000)');
    const iterator = command[Symbol.asyncIterator]();
    await iterator.return!();
    expect(alive(command.pid)).toBe(false);
  });

  it('rejects a failure before spawn without waiting for a nonexistent handle', async () => {
    const command = engine.exec(join(directory, 'missing-executable'), { shell: false });
    commands.push(command);
    await expect(command[Symbol.asyncIterator]().next()).rejects.toThrow(/ENOENT|not found/);
  });
});
