/**
 * Base Runtime Adapter
 * Abstract base class for runtime-specific implementations
 */

import type { ChildProcess, RuntimeAdapter } from '../core/types.js';

export abstract class BaseRuntimeAdapter implements RuntimeAdapter {
  abstract exec(command: string): Promise<{ stdout: string; stderr: string; code: number }>;
  abstract spawn(command: string, args: string[]): Promise<ChildProcess>;
  abstract readFile(path: string): Promise<string>;
  abstract writeFile(path: string, content: string): Promise<void>;
  abstract exists(path: string): Promise<boolean>;
  abstract mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  
  /**
   * Cross-platform sleep implementation
   */
  sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Execute command with timeout
   */
  async execWithTimeout(
    command: string,
    timeoutMs: number = 30000
  ): Promise<{ stdout: string; stderr: string; code: number }> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Command timeout: ${command}`)), timeoutMs);
    });
    
    return Promise.race([
      this.exec(command),
      timeoutPromise
    ]);
  }
  
  /**
   * Try to execute command, return null on failure
   */
  async tryExec(command: string): Promise<{ stdout: string; stderr: string; code: number } | null> {
    try {
      return await this.exec(command);
    } catch {
      return null;
    }
  }
  
  /**
   * Check if command is available
   */
  async commandExists(command: string): Promise<boolean> {
    const result = await this.tryExec(`which ${command} 2>/dev/null`);
    return result !== null && result.code === 0;
  }
  
  /**
   * Get environment variable
   */
  getEnv(key: string): string | undefined {
    if (typeof process !== 'undefined') {
      return process.env[key];
    }
    // @ts-ignore
    if (typeof Deno !== 'undefined') {
      // @ts-ignore
      return Deno.env.get(key);
    }
    // @ts-ignore
    if (typeof Bun !== 'undefined') {
      // @ts-ignore
      return Bun.env[key];
    }
    return undefined;
  }
  
  /**
   * Set environment variable
   */
  setEnv(key: string, value: string): void {
    if (typeof process !== 'undefined') {
      process.env[key] = value;
    }
    // @ts-ignore
    if (typeof Deno !== 'undefined') {
      // @ts-ignore
      Deno.env.set(key, value);
    }
    // @ts-ignore
    if (typeof Bun !== 'undefined') {
      // @ts-ignore
      Bun.env[key] = value;
    }
  }
  
  /**
   * Get current working directory
   */
  getCwd(): string {
    if (typeof process !== 'undefined') {
      return process.cwd();
    }
    // @ts-ignore
    if (typeof Deno !== 'undefined') {
      // @ts-ignore
      return Deno.cwd();
    }
    // @ts-ignore
    if (typeof Bun !== 'undefined') {
      // @ts-ignore
      return (globalThis as any).process?.cwd() || '/';
    }
    return '/';
  }
  
  /**
   * Get platform
   */
  getPlatform(): string {
    if (typeof process !== 'undefined') {
      return process.platform;
    }
    // @ts-ignore
    if (typeof Deno !== 'undefined') {
      // @ts-ignore
      return Deno.build.os;
    }
    // @ts-ignore
    if (typeof Bun !== 'undefined') {
      // @ts-ignore
      return (globalThis as any).process?.platform || 'unknown';
    }
    return 'unknown';
  }
  
  /**
   * Check if running on Windows
   */
  isWindows(): boolean {
    const platform = this.getPlatform();
    return platform === 'win32' || platform === 'windows';
  }
  
  /**
   * Check if running in CI environment
   */
  isCI(): boolean {
    return !!(
      this.getEnv('CI') ||
      this.getEnv('CONTINUOUS_INTEGRATION') ||
      this.getEnv('GITHUB_ACTIONS') ||
      this.getEnv('GITLAB_CI') ||
      this.getEnv('CIRCLECI') ||
      this.getEnv('TRAVIS') ||
      this.getEnv('JENKINS_URL')
    );
  }
}