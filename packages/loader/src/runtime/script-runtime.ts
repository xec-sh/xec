/**
 * ScriptRuntime provides utility functions for script execution
 * @module @xec-sh/loader/runtime/script-runtime
 */

import os from 'node:os';
import path from 'node:path';

/**
 * Options for retry operations
 */
export interface RetryOptions {
  retries?: number;
  delay?: number;
  backoff?: number;
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Options for within() scoped execution
 */
export interface WithinOptions {
  cwd?: string;
  env?: Record<string, string>;
}

/**
 * ScriptRuntime provides core utilities for script execution
 * without external dependencies like @xec-sh/kit
 */
export class ScriptRuntime {
  private currentDir: string;
  private originalEnv: NodeJS.ProcessEnv;

  constructor() {
    this.currentDir = process.cwd();
    this.originalEnv = { ...process.env };
  }

  /**
   * Change current directory
   */
  cd(dir?: string): string {
    if (dir === undefined) {
      return this.currentDir;
    }

    const newDir = path.resolve(this.currentDir, dir);

    // Note: In loader context, we track directory but don't actually change process.cwd()
    // to avoid side effects in module execution
    this.currentDir = newDir;
    return this.currentDir;
  }

  /**
   * Get current directory
   */
  pwd(): string {
    return this.currentDir;
  }

  /**
   * Get environment variable
   */
  env(key: string, defaultValue?: string): string | undefined {
    return process.env[key] || defaultValue;
  }

  /**
   * Set environment variable
   */
  setEnv(key: string, value: string): void {
    process.env[key] = value;
  }

  /**
   * Sleep for specified milliseconds
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Retry a function with exponential backoff
   */
  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {}
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
          await this.sleep(delay * Math.pow(backoff, i));
        }
      }
    }

    throw lastError!;
  }

  /**
   * Execute function within a specific context (cwd/env)
   */
  async within<T>(
    options: WithinOptions,
    fn: () => Promise<T>
  ): Promise<T> {
    const originalCwd = this.currentDir;
    const originalEnv = { ...process.env };

    try {
      if (options.cwd) {
        this.cd(options.cwd);
      }

      if (options.env) {
        Object.assign(process.env, options.env);
      }

      return await fn();
    } finally {
      this.currentDir = originalCwd;
      process.env = originalEnv;
    }
  }

  /**
   * Quote string for shell argument
   */
  quote(arg: string): string {
    if (!/[\s"'$`\\]/.test(arg)) {
      return arg;
    }

    return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
  }

  /**
   * Get temporary directory
   */
  tmpdir(): string {
    return os.tmpdir();
  }

  /**
   * Generate temporary file path
   */
  tmpfile(prefix: string = 'xec-loader-', suffix: string = ''): string {
    const random = Math.random().toString(36).substring(2, 15);
    return path.join(os.tmpdir(), `${prefix}${random}${suffix}`);
  }

  /**
   * Template string interpolation
   */
  template(strings: TemplateStringsArray, ...values: any[]): string {
    return strings.reduce((result, str, i) => {
      const value = values[i - 1];
      return result + (value !== undefined ? value : '') + str;
    });
  }

  /**
   * Kill process by PID
   */
  kill(pid: number, signal: string = 'SIGTERM'): void {
    process.kill(pid, signal);
  }

  /**
   * Exit process
   */
  exit(code: number = 0): void {
    process.exit(code);
  }

  /**
   * Reset environment to original state
   */
  resetEnv(): void {
    process.env = { ...this.originalEnv };
  }

  /**
   * Get current working directory (process-level)
   */
  getCwd(): string {
    return process.cwd();
  }

  /**
   * Change process working directory
   */
  chdir(dir: string): void {
    process.chdir(dir);
    this.currentDir = process.cwd();
  }
}

/**
 * Create a new ScriptRuntime instance
 */
export function createRuntime(): ScriptRuntime {
  return new ScriptRuntime();
}
