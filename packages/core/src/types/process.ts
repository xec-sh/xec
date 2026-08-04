import type { ExecutionResult } from './result.js';
import type { Duration } from '../utils/helpers.js';
import type { CacheOptions } from '../utils/cache.js';
import type { Writable, Transform } from 'node:stream';
import type { ProcessHandle } from './process-handle.js';
import type { Command, StreamOption } from './command.js';

/**
 * Options for creating ProcessOutput instances
 */
export interface ProcessOutputOptions {
  stdout?: string | Buffer;
  stderr?: string | Buffer;
  stdall?: string | Buffer;
  exitCode: number | null;
  signal?: NodeJS.Signals | null;
  duration?: number;
  command?: string;
  cwd?: string;
}

/**
 * Target types for pipe operations
 */
export type PipeTarget = 
  | TemplateStringsArray                                      // Template literal
  | string                                                    // Command string
  | Command                                                   // Command object
  | ProcessPromise                                           // Another ProcessPromise
  | Transform                                                 // Transform stream
  | Writable                                                  // Writable stream
  | ((line: string) => void | Promise<void>)                 // Line processor function
  | ((result: ExecutionResult) => Command | string | null);  // Conditional function

/**
 * Options for pipe operations
 */
export interface PipeOptions {
  /**
   * Whether to throw an error if the source command fails
   * @default true
   */
  throwOnError?: boolean;
  
  /**
   * Encoding to use for text operations
   * @default 'utf8'
   */
  encoding?: BufferEncoding;
  
  /**
   * Whether to process output line by line when piping to functions
   * @default true
   */
  lineByLine?: boolean;
  
  /**
   * Line separator for line-by-line processing
   * @default '\n'
   */
  lineSeparator?: string;
}

/**
 * Promise-like interface for process execution with additional methods
 */
export interface ProcessPromise extends Promise<ExecutionResult> {
  /**
   * Begin execution without awaiting the result.
   *
   * Commands are lazy so the whole chain is applied before anything runs;
   * this starts one you intend to interact with or kill later.
   *
   * @returns The same promise, now running.
   */
  start(): ProcessPromise;

  /**
   * Input stream. Writable before the process exists: writes are buffered
   * and forwarded on spawn, so `p.stdin.write(x)` needs no start step.
   */
  readonly stdin: NodeJS.WritableStream;

  /** Process id, once the command is running; see {@link spawned}. */
  readonly pid?: number;

  /**
   * Resolves with the live handle once the command is running.
   *
   * Spawning is asynchronous by construction — adapter selection is async,
   * and an SSH "process" needs a connection first — so this is the reliable
   * way to reach the process, rather than a synchronous read that may be
   * a tick early.
   */
  readonly spawned: Promise<ProcessHandle>;

  pipe(target: PipeTarget | TemplateStringsArray, ...args: any[]): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  /**
   * Fail the command after a duration.
   *
   * @param duration - Milliseconds, or a string like `'30s'`, `'5m'`.
   * @param timeoutSignal - Signal to deliver; defaults to SIGTERM.
   */
  timeout(duration: Duration, timeoutSignal?: string): ProcessPromise;
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  kill(signal?: NodeJS.Signals): void;
  
  // Configuration methods
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  
  // Stream configuration methods
  interactive(): ProcessPromise;
  /**
   * Where stdout goes.
   *
   * A callback is accepted and invoked per chunk; it used to be silently
   * dropped, so a caller got a command that ran perfectly while their handler
   * was never called.
   */
  stdout(stream: StreamOption | ((chunk: string) => void)): ProcessPromise;
  stderr(stream: StreamOption | ((chunk: string) => void)): ProcessPromise;
  
  // Convenience methods
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  lines(): Promise<string[]>;
  buffer(): Promise<Buffer>;
  
  // Caching
  cache(options?: CacheOptions): ProcessPromise;
  
  // Async iteration over output lines: for await (const line of $`cmd`) { ... }
  [Symbol.asyncIterator](): AsyncIterableIterator<string>;

  /**
   * Live handle to the running command: pid, streams and a tree-aware kill.
   * Uniform across local, docker, kubernetes and ssh.
   */
  readonly child?: ProcessHandle;
  exitCode: Promise<number | null>;
}