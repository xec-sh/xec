/**
 * Streaming script executor for large scripts and real-time output.
 *
 * Instead of buffering entire output, streams stdout/stderr line-by-line
 * to user-provided handlers. Ideal for long-running deployment scripts,
 * log processing, and CI/CD pipelines.
 *
 * @module @xec-sh/loader/core/streaming-executor
 */

import { spawn, type ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';
import { Readable } from 'node:stream';

/**
 * Options for streaming execution
 */
export interface StreamingExecutionOptions {
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Timeout in milliseconds (0 = no timeout) */
  timeout?: number;
  /** AbortSignal for cancellation */
  signal?: AbortSignal;
  /** Custom node/bun/deno binary path */
  runtime?: string;
  /** Additional runtime flags (e.g., --experimental-specifier-resolution) */
  runtimeFlags?: string[];
}

/**
 * Streaming output event
 */
export interface StreamEvent {
  type: 'stdout' | 'stderr';
  line: string;
  timestamp: number;
}

/**
 * Streaming execution result
 */
export interface StreamingResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  duration: number;
}

/**
 * Execute a script with streaming output.
 *
 * @example
 * ```typescript
 * const result = await streamExecute('./deploy.ts', {
 *   onStdout: (line) => console.log('[deploy]', line),
 *   onStderr: (line) => console.error('[deploy:err]', line),
 *   timeout: 300_000, // 5 minutes
 * });
 *
 * if (result.exitCode !== 0) {
 *   throw new Error(`Deploy failed with code ${result.exitCode}`);
 * }
 * ```
 */
export async function streamExecute(
  scriptPath: string,
  options: StreamingExecutionOptions & {
    onStdout?: (line: string) => void;
    onStderr?: (line: string) => void;
    onEvent?: (event: StreamEvent) => void;
  } = {}
): Promise<StreamingResult> {
  const absolutePath = path.resolve(scriptPath);

  // Verify file exists
  await fs.access(absolutePath);

  const runtime = options.runtime ?? process.execPath;
  const flags = options.runtimeFlags ?? [];

  // Determine if TypeScript needs a loader
  const isTS = absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx');
  const args = [
    ...flags,
    ...(isTS ? ['--import', 'tsx'] : []),
    absolutePath,
  ];

  const startTime = Date.now();

  return new Promise<StreamingResult>((resolve, reject) => {
    let settled = false;
    let timeoutId: NodeJS.Timeout | undefined;

    const child: ChildProcess = spawn(runtime, args, {
      cwd: options.cwd ?? path.dirname(absolutePath),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const settle = (result: StreamingResult | Error) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      if (result instanceof Error) reject(result);
      else resolve(result);
    };

    // Process stdout line-by-line
    if (child.stdout) {
      processLines(child.stdout, (line) => {
        options.onStdout?.(line);
        options.onEvent?.({ type: 'stdout', line, timestamp: Date.now() });
      });
    }

    // Process stderr line-by-line
    if (child.stderr) {
      processLines(child.stderr, (line) => {
        options.onStderr?.(line);
        options.onEvent?.({ type: 'stderr', line, timestamp: Date.now() });
      });
    }

    child.on('error', (error) => {
      settle(error);
    });

    child.on('exit', (code, signal) => {
      settle({
        exitCode: code,
        signal: signal as NodeJS.Signals | null,
        duration: Date.now() - startTime,
      });
    });

    // Timeout
    if (options.timeout && options.timeout > 0) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => { if (!child.killed) child.kill('SIGKILL'); }, 1000);
        settle(new Error(`Script execution timed out after ${options.timeout}ms`));
      }, options.timeout);
    }

    // AbortSignal
    if (options.signal) {
      if (options.signal.aborted) {
        child.kill('SIGTERM');
        settle(new Error('Execution aborted'));
      } else {
        options.signal.addEventListener('abort', () => {
          child.kill('SIGTERM');
          settle(new Error('Execution aborted'));
        }, { once: true });
      }
    }
  });
}

/**
 * Create an async iterable that streams script output line-by-line.
 *
 * @example
 * ```typescript
 * for await (const event of streamLines('./process.ts')) {
 *   if (event.type === 'stdout') {
 *     console.log(event.line);
 *   }
 * }
 * ```
 */
export async function* streamLines(
  scriptPath: string,
  options: StreamingExecutionOptions = {}
): AsyncGenerator<StreamEvent> {
  const absolutePath = path.resolve(scriptPath);
  await fs.access(absolutePath);

  const runtime = options.runtime ?? process.execPath;
  const flags = options.runtimeFlags ?? [];
  const isTS = absolutePath.endsWith('.ts') || absolutePath.endsWith('.tsx');
  const args = [...flags, ...(isTS ? ['--import', 'tsx'] : []), absolutePath];

  const child = spawn(runtime, args, {
    cwd: options.cwd ?? path.dirname(absolutePath),
    env: { ...process.env, ...options.env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const events: StreamEvent[] = [];
  let done = false;
  let resolveWait: (() => void) | null = null;

  const pushEvent = (event: StreamEvent) => {
    events.push(event);
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  };

  if (child.stdout) {
    processLines(child.stdout, (line) => {
      pushEvent({ type: 'stdout', line, timestamp: Date.now() });
    });
  }

  if (child.stderr) {
    processLines(child.stderr, (line) => {
      pushEvent({ type: 'stderr', line, timestamp: Date.now() });
    });
  }

  child.on('exit', () => {
    done = true;
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  child.on('error', () => {
    done = true;
    if (resolveWait) {
      resolveWait();
      resolveWait = null;
    }
  });

  while (!done || events.length > 0) {
    if (events.length > 0) {
      yield events.shift()!;
    } else if (!done) {
      await new Promise<void>((r) => { resolveWait = r; });
    }
  }
}

/**
 * Process a readable stream line-by-line.
 */
function processLines(stream: Readable, handler: (line: string) => void): void {
  let buffer = '';
  stream.setEncoding('utf-8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (line) handler(line);
    }
  });
  stream.on('end', () => {
    if (buffer) handler(buffer);
  });
}
