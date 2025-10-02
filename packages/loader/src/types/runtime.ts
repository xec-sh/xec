/**
 * Runtime utilities and REPL types
 * @module @xec-sh/loader/types/runtime
 */

import type * as repl from 'node:repl';

/**
 * Runtime options
 */
export interface RuntimeOptions {
  /** Working directory */
  workingDirectory?: string;

  /** Inject global utilities */
  injectGlobals?: boolean;

  /** Select which utilities to inject */
  utilities?: RuntimeUtilities;
}

/**
 * Runtime utilities configuration
 */
export interface RuntimeUtilities {
  /** File system utilities (fs, glob, path, os) */
  filesystem?: boolean;

  /** Process utilities (exit, kill, ps, env) */
  process?: boolean;

  /** Helper functions (retry, sleep, template, quote) */
  helpers?: boolean;

  /** Parsers (yaml, csv, diff, parseArgs) */
  parsers?: boolean;

  /** Logging (log, echo, spinner) */
  logging?: boolean;
}

/**
 * Spinner options
 */
export interface SpinnerOptions {
  /** Spinner text */
  text?: string;

  /** Spinner color */
  color?: string;
}

/**
 * Retry options
 */
export interface RetryOptions {
  /** Number of retry attempts */
  retries?: number;

  /** Delay between retries (ms) */
  delay?: number;

  /** Backoff multiplier */
  backoff?: number;

  /** Callback on retry */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Process information
 */
export interface ProcessInfo {
  /** Process ID */
  pid: number;

  /** Process name */
  name: string;

  /** CPU usage (%) */
  cpu: number;

  /** Memory usage (bytes) */
  memory: number;
}

/**
 * REPL options
 */
export interface REPLOptions {
  /** REPL prompt */
  prompt?: string;

  /** Initial context */
  context?: Record<string, any>;

  /** Custom commands */
  commands?: REPLCommand[];

  /** History file path */
  history?: string;

  /** Enable colors */
  useColors?: boolean;

  /** Break on SIGINT */
  breakEvalOnSigint?: boolean;
}

/**
 * REPL command definition
 */
export interface REPLCommand {
  /** Command name (without dot) */
  name: string;

  /** Help text */
  help: string;

  /** Command action */
  action: (this: repl.REPLServer, arg: string) => void;
}

/**
 * Global injector options
 */
export interface InjectorOptions {
  /** Warn on global collision */
  warnOnCollision?: boolean;

  /** Prefix for globals */
  prefix?: string;

  /** Allow overriding existing globals */
  allowOverride?: boolean;
}

/**
 * Inject options
 */
export interface InjectOptions {
  /** Override existing global */
  override?: boolean;
}
