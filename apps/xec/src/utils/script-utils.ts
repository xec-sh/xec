import os from 'os';
import path from 'path';
import which from 'which';
import fs from 'fs-extra';
import { glob } from 'glob';
import fetch from 'node-fetch';
import * as kit from '@xec-sh/kit';
import { $ as xecDollar } from '@xec-sh/core';

// Re-export USH $ with enhanced features
export const $ = xecDollar;

// Current working directory management
let currentDir = process.cwd();

export function cd(dir?: string): string {
  if (dir === undefined) {
    return currentDir;
  }

  const newDir = path.resolve(currentDir, dir);

  if (!fs.existsSync(newDir)) {
    throw new Error(`Directory not found: ${newDir}`);
  }

  if (!fs.statSync(newDir).isDirectory()) {
    throw new Error(`Not a directory: ${newDir}`);
  }

  currentDir = newDir;
  process.chdir(newDir);
  return currentDir;
}

export function pwd(): string {
  return currentDir;
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

// Process utilities
export function exit(code: number = 0): void {
  process.exit(code);
}

export function env(key: string, defaultValue?: string): string | undefined {
  return process.env[key] || defaultValue;
}

export function setEnv(key: string, value: string): void {
  process.env[key] = value;
}

// Retry utility
export async function retry<T>(
  fn: () => Promise<T>,
  options: {
    retries?: number;
    delay?: number;
    backoff?: number;
    onRetry?: (error: Error, attempt: number) => void;
  } = {}
): Promise<T> {
  const {
    retries = 3,
    delay = 1000,
    backoff = 2,
    onRetry = () => { },
  } = options;

  let lastError: Error;

  for (let i = 0; i <= retries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < retries) {
        onRetry(lastError, i + 1);
        await sleep(delay * Math.pow(backoff, i));
      }
    }
  }

  throw lastError!;
}

// Sleep utility
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Template utility
export function template(strings: TemplateStringsArray, ...values: any[]): string {
  return strings.reduce((result, str, i) => {
    const value = values[i - 1];
    return result + (value !== undefined ? value : '') + str;
  });
}

// Which utility
export { which };

// Quote utility for shell arguments
export function quote(arg: string): string {
  if (!/[\s"'$`\\]/.test(arg)) {
    return arg;
  }

  return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
}

// Temporary file/directory utilities
export function tmpdir(): string {
  return os.tmpdir();
}

export function tmpfile(prefix: string = 'xec-', suffix: string = ''): string {
  const random = Math.random().toString(36).substring(2, 15);
  return path.join(os.tmpdir(), `${prefix}${random}${suffix}`);
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

// Kill process utility
export function kill(pid: number, signal: string = 'SIGTERM'): void {
  process.kill(pid, signal);
}

// Process list
export async function ps(): Promise<any[]> {
  const { default: pslist } = await import('ps-list');
  return pslist();
}

// Within utility for scoped execution
export async function within<T>(
  options: { cwd?: string; env?: Record<string, string> },
  fn: () => Promise<T>
): Promise<T> {
  const originalCwd = process.cwd();
  const originalEnv = { ...process.env };

  try {
    if (options.cwd) {
      cd(options.cwd);
    }

    if (options.env) {
      Object.assign(process.env, options.env);
    }

    return await fn();
  } finally {
    cd(originalCwd);
    process.env = originalEnv;
  }
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

// Export all utilities as default
const scriptUtils: any = {
  $,
  cd,
  pwd,
  echo,
  spinner,
  kit,
  prism: kit.prism,
  fs,
  glob,
  path,
  os,
  fetch,
  exit,
  env,
  setEnv,
  retry,
  sleep,
  template,
  which,
  quote,
  tmpdir,
  tmpfile,
  yaml,
  csv,
  diff,
  parseArgs,
  loadEnv,
  kill,
  ps,
  within,
  log,
};

// Export kit as named export
export { kit };

export default scriptUtils;
