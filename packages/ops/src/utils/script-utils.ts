import os from 'node:os';
import fs from 'fs-extra';
import { glob } from 'glob';
import path from 'node:path';
import * as kit from '@xec-sh/kit';
import { createRuntime } from '@xec-sh/loader';
import { $ as xecDollar, sleep as coreSleep } from '@xec-sh/core';

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
  function printMessage(...args: any[]): void {
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

// HTTP utilities — use native fetch (Node 18+)
export const fetch = globalThis.fetch;

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

// Share the core execution scope, including cancellation.
export function sleep(ms: number): Promise<void> {
  return coreSleep(ms);
}

// Template utility - delegate to ScriptRuntime
export function template(strings: TemplateStringsArray, ...values: unknown[]): string {
  return runtime.template(strings, ...values);
}

/** Resolve an executable through the shared execution engine. */
export function which(command: string): Promise<string | null> {
  return xecDollar.which(command);
}

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
  // js-yaml 4.3 dropped its ESM default export; named exports hold on
  // every version this repo has met.
  const jsYaml = await import('js-yaml');
  return {
    parse: jsYaml.load,
    stringify: jsYaml.dump,
  };
}

// Simple CSV parsing (no external dependency)
export function csv() {
  return {
    parse: (input: string, options?: { columns?: boolean; delimiter?: string }) => {
      const delim = options?.delimiter ?? ',';
      const lines = input.trim().split('\n');
      const rows = lines.map(line => line.split(delim).map(cell => cell.trim().replace(/^"|"$/g, '')));
      if (options?.columns && rows.length > 0) {
        const headers = rows.shift()!;
        return rows.map(row => Object.fromEntries(headers.map((h, i) => [h, row[i] ?? ''])));
      }
      return rows;
    },
    stringify: (data: unknown[][], options?: { delimiter?: string }) => {
      const delim = options?.delimiter ?? ',';
      return data.map(row => row.map(cell => {
        const s = String(cell ?? '');
        return s.includes(delim) || s.includes('"') || s.includes('\n')
          ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(delim)).join('\n');
    }
  };
}

// Simple text diff (no external dependency)
export function diff(a: string, b: string): { added?: boolean; removed?: boolean; value: string }[] {
  const aLines = a.split('\n');
  const bLines = b.split('\n');
  const result: { added?: boolean; removed?: boolean; value: string }[] = [];
  const maxLen = Math.max(aLines.length, bLines.length);
  for (let i = 0; i < maxLen; i++) {
    if (i >= aLines.length) result.push({ added: true, value: bLines[i]! });
    else if (i >= bLines.length) result.push({ removed: true, value: aLines[i]! });
    else if (aLines[i] !== bLines[i]) {
      result.push({ removed: true, value: aLines[i]! });
      result.push({ added: true, value: bLines[i]! });
    } else {
      result.push({ value: aLines[i]! });
    }
  }
  return result;
}

/** Parse schema-free script flags while preserving option boundaries and literal values. */
export function parseArgs(args: string[]): Record<string, string | boolean | string[]> {
  const result: Record<string, string | boolean | string[]> = Object.create(null);
  const positional: string[] = [];
  result['_'] = positional;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--') {
      positional.push(...args.slice(i + 1));
      break;
    }
    if (arg === '-' || !arg.startsWith('-') || /^-\d/.test(arg)) {
      positional.push(arg);
      continue;
    }
    const option = arg.replace(/^--?/, '');
    const equals = option.indexOf('=');
    const key = equals < 0 ? option : option.slice(0, equals);
    if (!key || key === '_') throw new Error('Option name must be nonempty and cannot be _');
    if (equals >= 0) {
      result[key] = option.slice(equals + 1);
      continue;
    }
    const next = args[i + 1];
    if (next !== undefined && (!next.startsWith('-') || /^-\d/.test(next))) {
      result[key] = next;
      i++;
    } else {
      result[key] = true;
    }
  }
  return result;
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

/** List processes through the shared execution engine. */
export async function ps(): Promise<{ pid: number; name: string }[]> {
  if (process.platform === 'win32') {
    const script = 'Get-Process | Select-Object Id,ProcessName | ConvertTo-Json -Compress';
    const result = await xecDollar`powershell.exe -NoProfile -NonInteractive -Command ${script}`;
    const records: unknown = JSON.parse(result.stdout);
    const processes: unknown[] = Array.isArray(records) ? records : [records];
    return processes.map(record => {
      if (!record || typeof record !== 'object' || !("Id" in record) || !("ProcessName" in record) || !Number.isSafeInteger(record.Id) || typeof record.ProcessName !== 'string') {
        throw new Error('Process listing returned an invalid record');
      }
      return { pid: record.Id as number, name: record.ProcessName };
    });
  }
  const result = await xecDollar`ps -eo pid=,comm=`;
  return result.stdout.split('\n').filter(line => line.trim()).map(line => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    if (!match) throw new Error('Process listing returned an invalid record');
    return { pid: Number(match[1]), name: match[2]! };
  });
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
