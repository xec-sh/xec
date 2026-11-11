import { Writable } from 'node:stream';
import { ExecutionEngine } from '@xec-sh/core';
import { finished } from 'node:stream/promises';

import { ReleaseOutput } from './output.js';
import { windowsPackageManager } from './package-manager.js';

export type ReleaseCommandEvent =
  | { type: 'command-start'; executable: string; at: number }
  | { type: 'command-output'; executable: string; at: number; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'command-complete'; executable: string; at: number; status: number | string | null;
      durationMs: number; cancelled: boolean; outputTruncated: boolean };

export interface ReleaseCommandOptions {
  timeoutMs?: number;
  env?: Record<string, string>;
  redact?: readonly string[];
  signal?: AbortSignal;
  /** Opt into streaming with backpressure. Arguments and environment are never included. */
  onEvent?: (event: ReleaseCommandEvent) => void | Promise<void>;
  /** Opt into bounded, redacted output tails; defaults to 8 MiB per stream with onEvent. */
  outputLimit?: number;
  /** Give an interactive command the operator's real terminal descriptors. Output is not captured. */
  interactive?: boolean;
}
export type ReleaseCommand = (cwd: string, executable: string, args: readonly string[], options?: ReleaseCommandOptions) => Promise<string>;

export class ReleaseCommandError extends Error {
  constructor(
    executable: string,
    public readonly status: number | string | null,
    public readonly stdout: string,
    public readonly stderr: string,
  ) { super(`${executable} failed (${status ?? 'terminated'}): ${stderr.trim() || stdout.trim()}`); }
}

/** Bounded argv execution through Xec; old callers retain the original capture contract. */
export const releaseCommand: ReleaseCommand = async (cwd, executable, args, options = {}) => {
  if (options.outputLimit !== undefined && (!Number.isSafeInteger(options.outputLimit) || options.outputLimit < 1))
    throw new Error('Output limit must be a positive integer');
  const clean = (text: string) => (options.redact ?? []).filter(Boolean).reduce((value, secret) => value.split(secret).join('[redacted]'), text);
  const controller = new AbortController();
  const signal = options.signal ? AbortSignal.any([options.signal, controller.signal]) : controller.signal;
  const started = Date.now();
  const streaming = !options.interactive && (options.onEvent !== undefined || options.outputLimit !== undefined);
  const output = {
    stdout: new ReleaseOutput(options.outputLimit ?? 8 * 1024 * 1024, options.redact ?? []),
    stderr: new ReleaseOutput(options.outputLimit ?? 8 * 1024 * 1024, options.redact ?? []),
  };
  let observerFailure: unknown;
  let notifications = Promise.resolve();
  const emit = (event: ReleaseCommandEvent): Promise<void> => {
    const notification = notifications.then(async () => {
      if (observerFailure !== undefined) throw observerFailure;
      try { await options.onEvent?.(event); }
      catch (error) { observerFailure = error; controller.abort(error); throw error; }
    });
    notifications = notification.catch(() => undefined);
    return notification;
  };
  const streams = streaming ? (['stdout', 'stderr'] as const).map(stream => {
    const send = async (text: string) => {
      if (text) await emit({ type: 'command-output', executable, at: Date.now(), stream, text });
    };
    return new Writable({
      write(chunk: Buffer, _encoding, callback) {
        send(output[stream].append(chunk)).then(() => callback(), callback);
      },
      final(callback) { send(output[stream].finish()).then(() => callback(), callback); },
    });
  }) : [];
  const drains = streams.map(stream => finished(stream, { cleanup: true }));
  const drained = Promise.all(drains);
  void drained.catch(() => undefined);
  // Each call owns its engine and uses the existing process-tree termination.
  const engine = new ExecutionEngine({ adapters: { local: { killSignal: 'SIGKILL' } } });
  let stdout = '';
  let failure: ReleaseCommandError | undefined;
  try {
    signal.throwIfAborted();
    await emit({ type: 'command-start', executable, at: started });
    const manager = process.platform === 'win32' && (executable === 'npm' || executable === 'pnpm')
      ? windowsPackageManager(executable, { ...process.env, ...options.env })
      : undefined;
    let result;
    try {
      result = await engine.execute({ command: manager?.executable ?? executable,
        args: manager?.script ? [manager.script, ...args] : [...args], cwd, shell: false, adapter: 'local', signal,
        ...(options.interactive ? { stdin: process.stdin, stdout: 'inherit' as const, stderr: 'inherit' as const, detached: false }
          : streaming ? { stdout: streams[0]!, stderr: streams[1]! } : {}),
        timeout: options.timeoutMs ?? 120000, maxBuffer: 8 * 1024 * 1024, env: options.env, nothrow: true });
    } finally {
      for (const stream of streams) if (!stream.writableEnded && !stream.destroyed) stream.end();
      await drained;
    }
    signal.throwIfAborted();
    // With custom sinks the adapter returns stderr only for its own failures
    // (for example spawn errors and timeouts), not the already streamed bytes.
    if (streaming && result.exitCode !== 0 && result.stderr) {
      const text = output.stderr.append((output.stderr.text ? '\n' : '') + result.stderr) + output.stderr.finish();
      if (text) await emit({ type: 'command-output', executable, at: Date.now(), stream: 'stderr', text });
    }
    stdout = streaming ? output.stdout.text : result.stdout;
    if (result.exitCode !== 0) throw new ReleaseCommandError(executable, result.exitCode,
      streaming ? stdout : clean(stdout), streaming ? output.stderr.text : clean(result.stderr));
  } catch (error) {
    if (error instanceof ReleaseCommandError && observerFailure === undefined) failure = error;
    else {
      const detail = error as { code?: string; stdout?: string; stderr?: string; message?: string } | null;
      const diagnostic = clean(detail?.stderr ?? detail?.message ?? String(error));
      if (streaming) {
        output.stderr.append((output.stderr.text ? '\n' : '') + diagnostic);
        output.stderr.finish();
      }
      failure = new ReleaseCommandError(executable, detail?.code ?? null,
        streaming ? output.stdout.text : clean(detail?.stdout ?? ''), streaming ? output.stderr.text : diagnostic);
    }
  } finally {
    for (const stream of streams) if (!stream.writableEnded && !stream.destroyed) stream.end();
    await Promise.allSettled(drains);
    await engine.dispose();
  }
  try {
    await emit({ type: 'command-complete', executable, at: Date.now(), status: failure?.status ?? (failure ? null : 0),
      durationMs: Date.now() - started, cancelled: signal.aborted, outputTruncated: output.stdout.truncated || output.stderr.truncated });
  } catch (error) {
    if (failure) throw failure;
    const diagnostic = clean(error instanceof Error ? error.message : String(error));
    if (streaming) {
      output.stderr.append((output.stderr.text ? '\n' : '') + diagnostic);
      output.stderr.finish();
    }
    throw new ReleaseCommandError(executable, null, output.stdout.text, streaming ? output.stderr.text : diagnostic);
  }
  if (failure) throw failure;
  return stdout.trim();
};
