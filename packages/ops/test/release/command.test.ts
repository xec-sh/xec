import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdtemp, readFile } from 'node:fs/promises';
import { setTimeout as delay } from 'node:timers/promises';
import { it, vi, expect, describe, afterEach } from 'vitest';
import { ExecutionEngine, type ExecutionResult } from '@xec-sh/core';

import { ReleaseOutput } from '../../src/release/output.js';
import { releaseCommand, ReleaseCommandError, type ReleaseCommandEvent } from '../../src/release/command.js';

const directories: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true });
});

describe('release command execution context', () => {
  it('preserves the legacy trimmed stdout and redacted nonzero error contracts', async () => {
    expect(await releaseCommand(process.cwd(), process.execPath, ['-e', 'console.log("  answer  ")'])).toBe('answer');
    await expect(releaseCommand(process.cwd(), process.execPath,
      ['-e', 'console.log("out");console.error("fixture-token");process.exit(7)'], { redact: ['fixture-token'] }))
      .rejects.toMatchObject({ status: 7, stdout: 'out\n', stderr: '[redacted]\n' });
  });

  it('streams output before completion and awaits asynchronous observers', async () => {
    const events: ReleaseCommandEvent[] = [];
    let readyBeforeExit = false;
    const output = await releaseCommand(process.cwd(), process.execPath,
      ['-e', 'console.log("ready:"+process.pid);setTimeout(()=>console.error("done"),500)'], {
        onEvent: async event => {
          if (event.type === 'command-output') {
            await delay(10);
            if (event.text.includes('ready:')) {
              const pid = Number(event.text.trim().split(':')[1]);
              expect(() => process.kill(pid, 0)).not.toThrow();
              readyBeforeExit = true;
            }
          }
          events.push(event);
        },
      });
    expect(output).toMatch(/^ready:\d+$/);
    expect(readyBeforeExit).toBe(true);
    expect(events[0]?.type).toBe('command-start');
    expect(events.at(-1)).toMatchObject({ type: 'command-complete', status: 0, cancelled: false, outputTruncated: false });
    expect(events.filter(event => event.type === 'command-output').map(event => event.stream)).toEqual(['stdout', 'stderr']);
    expect(events.every(event => !('args' in event) && !('env' in event))).toBe(true);
  });

  it('redacts exact overlapping, multiline, and Unicode literals across arbitrary byte boundaries', () => {
    const collector = new ReleaseOutput(1024, ['token', 'token😀tail', 'sensitive\nvalue']);
    const input = Buffer.from('prefix 😀 token😀tail | sensitive\nvalue | end');
    let observed = '';
    for (const byte of input) observed += collector.append(Buffer.from([byte]));
    observed += collector.finish();
    expect(observed).toBe('prefix 😀 [redacted] | [redacted] | end');
    expect(collector.text).toBe(observed);
    expect(collector.truncated).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])('keeps a Unicode tail within a %s-byte limit without replacement artifacts', limit => {
    const collector = new ReleaseOutput(limit, []);
    collector.append('😀😀');
    collector.finish();
    expect(Buffer.byteLength(collector.text)).toBeLessThanOrEqual(limit);
    expect(collector.text).toBe(limit >= 4 ? '😀' : '');
    const replacement = new ReleaseOutput(3, []);
    replacement.append('xx\uFFFD');
    expect(replacement.text).toBe('\uFFFD');
  });

  it('redacts streamed literals and flushes the final withheld tail', async () => {
    let observed = '';
    const output = await releaseCommand(process.cwd(), process.execPath,
      ['-e', 'process.stdout.write("prefix fix");setTimeout(()=>process.stdout.write("ture-token end"),30)'], {
        redact: ['fixture-token'], onEvent: event => { if (event.type === 'command-output') observed += event.text; },
      });
    expect(observed).toBe('prefix [redacted] end');
    expect(output).toBe(observed);
  });

  it('streams verbose output while retaining bounded tails without overflowing', async () => {
    let bytes = 0;
    let complete: ReleaseCommandEvent | undefined;
    const output = await releaseCommand(process.cwd(), process.execPath,
      ['-e', 'process.stdout.write("x".repeat(2*1024*1024)+"END");process.stderr.write("y".repeat(2048))'], {
        outputLimit: 1024,
        onEvent: event => {
          if (event.type === 'command-output') bytes += Buffer.byteLength(event.text);
          if (event.type === 'command-complete') complete = event;
        },
      });
    expect(bytes).toBe(2 * 1024 * 1024 + 3 + 2048);
    expect(Buffer.byteLength(output)).toBe(1024);
    expect(output.endsWith('END')).toBe(true);
    expect(complete).toMatchObject({ status: 0, outputTruncated: true });
  });

  it('keeps failure output bounded and redacted in the opt-in capture mode', async () => {
    let failure: unknown;
    try {
      await releaseCommand(process.cwd(), process.execPath,
        ['-e', 'console.error("x".repeat(4096)+"fixture-token");process.exit(9)'], { outputLimit: 64, redact: ['fixture-token'] });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ReleaseCommandError);
    const error = failure as ReleaseCommandError;
    expect(error.status).toBe(9);
    expect(Buffer.byteLength(error.stderr)).toBeLessThanOrEqual(64);
    expect(error.stderr.endsWith('[redacted]\n')).toBe(true);
    expect(error.message).not.toContain('fixture-token');
  });

  it('retains bounded engine diagnostics when a command cannot start', async () => {
    let diagnostic = '';
    await expect(releaseCommand(process.cwd(), 'xec-fixture-command-that-does-not-exist', [], {
      outputLimit: 256, onEvent: event => { if (event.type === 'command-output') diagnostic += event.text; },
    })).rejects.toThrow(/ENOENT|not found/i);
    expect(diagnostic).toMatch(/ENOENT|not found/i);
    expect(Buffer.byteLength(diagnostic)).toBeLessThanOrEqual(256);
  });

  it('cancels a live process before reporting completion', async () => {
    const controller = new AbortController();
    let pid = 0;
    const events: ReleaseCommandEvent[] = [];
    await expect(releaseCommand(process.cwd(), process.execPath,
      ['-e', 'console.log(process.pid);setInterval(()=>{},1000)'], {
        signal: controller.signal, timeoutMs: 5000,
        onEvent: event => {
          events.push(event);
          if (event.type === 'command-output') { pid = Number(event.text.trim()); controller.abort(); }
        },
      })).rejects.toBeInstanceOf(ReleaseCommandError);
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
    expect(events.at(-1)).toMatchObject({ type: 'command-complete', cancelled: true });
  });

  it('does not start a command when cancellation was already requested', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xec-command-cancel-'));
    directories.push(directory);
    const file = join(directory, 'started');
    await expect(releaseCommand(directory, process.execPath,
      ['-e', `require('node:fs').writeFileSync(${JSON.stringify(file)}, 'started')`], { signal: AbortSignal.abort() }))
      .rejects.toBeInstanceOf(ReleaseCommandError);
    await expect(readFile(file)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('terminates the owned process when a progress observer fails', async () => {
    let pid = 0;
    await expect(releaseCommand(process.cwd(), process.execPath,
      ['-e', 'console.log(process.pid);setInterval(()=>{},1000)'], {
        timeoutMs: 5000,
        onEvent: event => {
          if (event.type === 'command-output') { pid = Number(event.text.trim()); throw new Error('journal unavailable'); }
        },
      })).rejects.toThrow('journal unavailable');
    expect(pid).toBeGreaterThan(0);
    expect(() => process.kill(pid, 0)).toThrow();
  });

  it.each(['command-output', 'command-complete'])('bounds and redacts %s observer diagnostics', async eventType => {
    let failure: unknown;
    try {
      await releaseCommand(process.cwd(), process.execPath, ['-e', 'console.log("ready with enough output for the redaction window");' + (eventType === 'command-output' ? 'setInterval(()=>{},1000)' : '')], {
        timeoutMs: 5000, outputLimit: 64, redact: ['fixture-token'],
        onEvent: event => { if (event.type === eventType) throw new Error('x'.repeat(1024) + 'fixture-token'); },
      });
    } catch (error) { failure = error; }
    expect(failure).toBeInstanceOf(ReleaseCommandError);
    const error = failure as ReleaseCommandError;
    expect(Buffer.byteLength(error.stderr)).toBeLessThanOrEqual(64);
    expect(error.stderr.endsWith('[redacted]')).toBe(true);
    expect(error.message).not.toContain('fixture-token');
  });

  it('preserves inherited interactive descriptors and emits lifecycle events only', async () => {
    const execute = vi.spyOn(ExecutionEngine.prototype, 'execute').mockResolvedValue({ exitCode: 0, stdout: '', stderr: '' } as ExecutionResult);
    const events: ReleaseCommandEvent[] = [];
    expect(await releaseCommand(process.cwd(), 'interactive-fixture', [], {
      interactive: true, outputLimit: 64, onEvent: event => { events.push(event); },
    })).toBe('');
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      stdin: process.stdin, stdout: 'inherit', stderr: 'inherit', detached: false,
    }));
    expect(events.map(event => event.type)).toEqual(['command-start', 'command-complete']);
  });

  it.each([0, -1, 1.5, Infinity, NaN])('rejects invalid outputLimit %s before engine execution', async outputLimit => {
    const execute = vi.spyOn(ExecutionEngine.prototype, 'execute');
    await expect(releaseCommand(process.cwd(), 'never-start', [], { outputLimit })).rejects.toThrow('Output limit');
    expect(execute).not.toHaveBeenCalled();
  });
});
