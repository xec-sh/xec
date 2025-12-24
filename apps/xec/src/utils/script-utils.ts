import os from 'os';
import path from 'path';
import which from 'which';
import fs from 'fs-extra';
import { glob } from 'glob';
import fetch from 'node-fetch';
import * as kit from '@xec-sh/kit';
import { $ as xecDollar } from '@xec-sh/core';
import { ScriptRuntime, createRuntime } from '@xec-sh/loader';

// Re-export USH $ with enhanced features
export const $ = xecDollar;

// Singleton runtime instance for consistent state
const runtime = createRuntime();

/**
 * Change current directory
 * Uses ScriptRuntime from @xec-sh/loader + process.chdir for CLI context
 */
export function cd(dir?: string): string {
  if (dir === undefined) {
    return runtime.pwd();
  }

  const newDir = path.resolve(runtime.pwd(), dir);

  if (!fs.existsSync(newDir)) {
    throw new Error(`Directory not found: ${newDir}`);
  }

  if (!fs.statSync(newDir).isDirectory()) {
    throw new Error(`Not a directory: ${newDir}`);
  }

  // Use runtime's chdir which updates both internal state and process.cwd()
  runtime.chdir(newDir);
  return runtime.pwd();
}

/**
 * Get current directory
 * Delegates to ScriptRuntime from @xec-sh/loader
 */
export function pwd(): string {
  return runtime.pwd();
}

// Enhanced echo with color support
export const echo = Object.assign(
  function echo(...args: any[]): void {
    console.log(...args);
  },
  {
    info: (message: string) => {
      kit.log.info(message);
    },
    success: (message: string) => {
      kit.log.success(message);
    },
    warning: (message: string) => {
      kit.log.warning(message);
    },
    error: (message: string) => {
      kit.log.error(message);
    },
    debug: (message: string) => console.log(kit.prism.gray(`[DEBUG] ${message}`)),
    step: (message: string) => {
      kit.log.step(message);
    },
  }
);

// Spinner utility
export function spinner(options?: string | { text?: string; color?: string }) {
  const s = kit.spinner();
  const message = typeof options === 'string' ? options : options?.text;
  if (message) {
    s.start(message);
  }
  return s;
}

// Question/prompt utilities
// export const question = kitText;
// export const confirm = kitConfirm;
// export const select = kitSelect;
// export const multiselect = kitMultiselect;
// export const password = kitPassword;

// File system utilities
export { os, path };
export { fs, glob };

// HTTP utilities
export { fetch };

// Process utilities - delegate to ScriptRuntime
export function exit(code: number = 0): void {
  runtime.exit(code);
}

export function env(key: string, defaultValue?: string): string | undefined {
  return runtime.env(key, defaultValue);
}

export function setEnv(key: string, value: string): void {
  runtime.setEnv(key, value);
}

// Re-export retry options type from loader
export type { RetryOptions } from '@xec-sh/loader';

// Retry utility - delegate to ScriptRuntime
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  return runtime.retry(fn, options);
}

// Sleep utility - delegate to ScriptRuntime
export function sleep(ms: number): Promise<void> {
  return runtime.sleep(ms);
}

// Template utility - delegate to ScriptRuntime
export function template(strings: TemplateStringsArray, ...values: unknown[]): string {
  return runtime.template(strings, ...values);
}

// Which utility
export { which };

// Quote utility for shell arguments - delegate to ScriptRuntime
export function quote(arg: string): string {
  return runtime.quote(arg);
}

// Temporary file/directory utilities - delegate to ScriptRuntime
export function tmpdir(): string {
  return runtime.tmpdir();
}

export function tmpfile(prefix: string = 'xec-', suffix: string = ''): string {
  return runtime.tmpfile(prefix, suffix);
}

// YAML utilities
export async function yaml() {
  const jsYaml = await import('js-yaml');
  return {
    parse: jsYaml.default.load,
    stringify: jsYaml.default.dump,
  };
}

// CSV utilities
export async function csv() {
  const parse = await import('csv-parse/sync');
  const stringify = await import('csv-stringify/sync');
  return { parse: parse.parse, stringify: stringify.stringify };
}

// Diff utility
export async function diff(a: string, b: string, options?: any) {
  const { diffLines } = await import('diff');
  return diffLines(a, b, options);
}

// Minimist for argument parsing
export async function parseArgs(args: string[]) {
  const { default: minimist } = await import('minimist');
  return minimist(args);
}

// Dotenv support
export async function loadEnv(envPath?: string) {
  const { config } = await import('dotenv');
  return config({ path: envPath });
}

// Kill process utility - delegate to ScriptRuntime
export function kill(pid: number, signal: string = 'SIGTERM'): void {
  runtime.kill(pid, signal);
}

// Process list (CLI-specific, not in loader)
export async function ps(): Promise<unknown[]> {
  const { default: pslist } = await import('ps-list');
  return pslist();
}

// Within utility for scoped execution - delegate to ScriptRuntime
export async function within<T>(
  options: { cwd?: string; env?: Record<string, string> },
  fn: () => Promise<T>
): Promise<T> {
  return runtime.within(options, fn);
}

// Logging utilities
export const log = {
  info: (message: string) => {
    kit.log.info(message);
  },
  success: (message: string) => {
    kit.log.success(message);
  },
  warning: (message: string) => {
    kit.log.warning(message);
  },
  error: (message: string) => {
    kit.log.error(message);
  },
  step: (message: string) => {
    kit.log.step(message);
  },
};

// Color utilities
export const prism: typeof kit.prism = kit.prism;

/**
 * Script utilities object containing all available utilities
 * Core utilities delegate to @xec-sh/loader's ScriptRuntime
 * CLI-specific utilities (echo, spinner, log, yaml, csv, etc.) are added here
 */
const scriptUtils: Record<string, unknown> = {
  // Core execution
  $,
  // Directory management (delegates to ScriptRuntime)
  cd,
  pwd,
  // CLI-specific output utilities
  echo,
  spinner,
  kit,
  prism: kit.prism,
  // File system
  fs,
  glob,
  path,
  os,
  // HTTP
  fetch,
  // Process utilities (delegates to ScriptRuntime)
  exit,
  env,
  setEnv,
  retry,
  sleep,
  template,
  // Shell utilities
  which,
  quote,
  tmpdir,
  tmpfile,
  // CLI-specific utilities
  yaml,
  csv,
  diff,
  parseArgs,
  loadEnv,
  kill,
  ps,
  within,
  log,
  // Expose runtime for advanced usage
  runtime,
};

// Export kit as named export
export { kit };

// Export the runtime singleton for advanced usage
export { runtime };

export default scriptUtils;
