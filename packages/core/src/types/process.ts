import type { Writable, Transform } from 'node:stream';

import type { ExecutionResult } from './result.js';
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
  stdin: NodeJS.WritableStream;
  pipe(target: PipeTarget | TemplateStringsArray, ...args: any[]): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  kill(signal?: string): void;
  
  // Configuration methods
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  
  // Stream configuration methods
  interactive(): ProcessPromise;
  stdout(stream: StreamOption): ProcessPromise;
  stderr(stream: StreamOption): ProcessPromise;
  
  // Convenience methods
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  lines(): Promise<string[]>;
  buffer(): Promise<Buffer>;
  
  // Caching
  cache(options?: any): ProcessPromise; // CacheOptions
  
  // Process-related properties
  child?: any;
  exitCode: Promise<number | null>;
}