import { z } from 'zod';
import { $, configure, ExecutionResult as UshExecutionResult } from '@xec-js/ush';

import { BaseAdapter, ExecutionResult } from './base-adapter.js';

export interface UshConfig {
  shell?: string;
  env?: Record<string, string>;
  cwd?: string;
  timeout?: number;
  retries?: number;
  sudo?: boolean;
  user?: string;
}

export const UshConfigSchema = z.object({
  shell: z.string().optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
  timeout: z.number().optional(),
  retries: z.number().optional(),
  sudo: z.boolean().optional(),
  user: z.string().optional(),
});

export interface UshCommand {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  stdin?: string;
  captureOutput?: boolean;
  timeout?: number;
}


export class UshAdapter extends BaseAdapter {
  private ushConfig: UshConfig;
  private ush: typeof $;

  constructor(config: UshConfig) {
    super({
      name: 'ush',
      type: 'executor',
      timeout: config.timeout || 30000,
      retries: config.retries || 0,
    });

    this.ushConfig = config;

    // Configure ush with provided options
    if (config.env || config.cwd || config.timeout || config.shell) {
      configure({
        defaultShell: config.shell || '/bin/bash',
        defaultTimeout: config.timeout,
        defaultEnv: config.env,
        defaultCwd: config.cwd
      });
    }

    this.ush = $;
  }

  async connect(): Promise<void> {
    try {
      // Test basic command execution
      const result = await this._executeInternal('echo "test"');
      if (!result.success) {
        throw new Error('Failed to execute test command');
      }

      this.connected = true;
      this.connectionTime = Date.now();

      this.emitEvent({
        type: 'connected',
        timestamp: Date.now(),
        data: {
          shell: this.ushConfig.shell || process.env['SHELL'] || '/bin/sh',
          platform: process.platform,
          arch: process.arch,
        },
      });
    } catch (error) {
      this.lastError = error as Error;
      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        error: error as Error,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    this.emitEvent({
      type: 'disconnected',
      timestamp: Date.now(),
    });
  }

  async execute(command: string, options?: UshCommand): Promise<ExecutionResult> {
    if (!this.connected) {
      throw new Error('Adapter not connected');
    }

    return this._executeInternal(command, options);
  }

  private async _executeInternal(command: string, options?: UshCommand): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      // Build the full command with arguments if provided
      const fullCommand = options?.args
        ? `${command} ${options.args.map(arg => this.escapeArg(arg)).join(' ')}`
        : command;

      // Build execution engine with options
      let engine = this.ush;

      if (options?.cwd) {
        engine = engine.cd(options.cwd);
      }

      if (options?.env) {
        engine = engine.env(options.env);
      }

      if (options?.timeout) {
        engine = engine.timeout(options.timeout);
      }

      // Execute with or without stdin, with sudo if configured
      let result;
      if (this.ushConfig.sudo) {
        result = options?.stdin
          ? await engine`echo ${options.stdin} | sudo ${fullCommand}`
          : await engine`sudo ${fullCommand}`;
      } else {
        result = options?.stdin
          ? await engine`echo ${options.stdin} | ${fullCommand}`
          : await engine`${fullCommand}`;
      }

      return {
        success: result.exitCode === 0,
        output: result.stdout,
        error: result.exitCode !== 0 ? new Error(result.stderr || `Command failed with exit code ${result.exitCode}`) : undefined,
        duration: Date.now() - startTime,
        metadata: {
          command,
          exitCode: result.exitCode,
          stderr: result.stderr,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        duration: Date.now() - startTime,
      };
    }
  }

  private escapeArg(arg: string): string {
    // Escape shell special characters
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.execute('echo "health check"');
      return result.success;
    } catch {
      return false;
    }
  }

  validateConfig(config: any): boolean {
    try {
      UshConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }

  // Convenience methods
  async runScript(script: string, options?: {
    interpreter?: string;
    env?: Record<string, string>;
    cwd?: string;
  }): Promise<ExecutionResult> {
    const interpreter = options?.interpreter || this.ushConfig.shell || '/bin/sh';

    return this.execute(script, {
      command: script,
      env: { ...this.ushConfig.env, ...options?.env },
      cwd: options?.cwd || this.ushConfig.cwd,
    });
  }

  async runCommand(command: string, args: string[], options?: {
    env?: Record<string, string>;
    cwd?: string;
    stdin?: string;
  }): Promise<ExecutionResult> {
    return this.execute(command, {
      command,
      args,
      env: { ...this.ushConfig.env, ...options?.env },
      cwd: options?.cwd || this.ushConfig.cwd,
      stdin: options?.stdin,
      captureOutput: true,
    });
  }

  async fileExists(path: string): Promise<boolean> {
    const result = await this.execute(`test -e "${path}"`);
    return result.success;
  }

  async fileIsDirectory(path: string): Promise<boolean> {
    const result = await this.execute(`test -d "${path}"`);
    return result.success;
  }

  async fileIsFile(path: string): Promise<boolean> {
    const result = await this.execute(`test -f "${path}"`);
    return result.success;
  }

  async readFile(path: string): Promise<string> {
    const result = await this.execute(`cat "${path}"`);
    if (!result.success) {
      throw new Error(`Failed to read file: ${path}`);
    }
    return result.output || '';
  }

  async writeFile(path: string, content: string): Promise<void> {
    const result = await this.execute(`cat > "${path}"`, {
      command: `cat > "${path}"`,
      stdin: content,
    });

    if (!result.success) {
      throw new Error(`Failed to write file: ${path}`);
    }
  }

  async appendFile(path: string, content: string): Promise<void> {
    const result = await this.execute(`cat >> "${path}"`, {
      command: `cat >> "${path}"`,
      stdin: content,
    });

    if (!result.success) {
      throw new Error(`Failed to append to file: ${path}`);
    }
  }

  async createDirectory(path: string, options?: { recursive?: boolean }): Promise<void> {
    const args = options?.recursive ? '-p' : '';
    const result = await this.execute(`mkdir ${args} "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to create directory: ${path}`);
    }
  }

  async removeFile(path: string): Promise<void> {
    const result = await this.execute(`rm -f "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to remove file: ${path}`);
    }
  }

  async removeDirectory(path: string, options?: { recursive?: boolean }): Promise<void> {
    const args = options?.recursive ? '-rf' : '-f';
    const result = await this.execute(`rm ${args} "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to remove directory: ${path}`);
    }
  }

  async copyFile(source: string, destination: string): Promise<void> {
    const result = await this.execute(`cp "${source}" "${destination}"`);

    if (!result.success) {
      throw new Error(`Failed to copy file from ${source} to ${destination}`);
    }
  }

  async moveFile(source: string, destination: string): Promise<void> {
    const result = await this.execute(`mv "${source}" "${destination}"`);

    if (!result.success) {
      throw new Error(`Failed to move file from ${source} to ${destination}`);
    }
  }

  async chmod(path: string, mode: string): Promise<void> {
    const result = await this.execute(`chmod ${mode} "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to change permissions on ${path}`);
    }
  }

  async chown(path: string, owner: string, options?: { recursive?: boolean }): Promise<void> {
    const args = options?.recursive ? '-R' : '';
    const result = await this.execute(`chown ${args} ${owner} "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to change ownership on ${path}`);
    }
  }

  async listDirectory(path: string): Promise<string[]> {
    const result = await this.execute(`ls -1 "${path}"`);

    if (!result.success) {
      throw new Error(`Failed to list directory: ${path}`);
    }

    return (result.output || '').split('\n').filter((line: string) => line.trim());
  }

  async getEnvironmentVariable(name: string): Promise<string | undefined> {
    const result = await this.execute(`echo "$${name}"`);

    if (!result.success) {
      return undefined;
    }

    const value = (result.output || '').trim();
    return value || undefined;
  }

  async which(command: string): Promise<string | null> {
    const result = await this.execute(`which ${command}`);

    if (!result.success) {
      return null;
    }

    return (result.output || '').trim() || null;
  }

  private buildExecOptions(options?: UshCommand): any {
    const execOptions: any = {
      env: { ...process.env, ...this.ushConfig.env, ...options?.env },
      cwd: options?.cwd || this.ushConfig.cwd || process.cwd(),
      timeout: options?.timeout || this.config.timeout,
      shell: this.ushConfig.shell,
    };

    if (this.ushConfig.user) {
      execOptions.uid = this.ushConfig.user;
    }

    return execOptions;
  }

  private async executeCommand(command: string, args: string[], options: any): Promise<UshExecutionResult> {
    this.log('debug', `Executing command: ${command} ${args.join(' ')}`);

    // Build the full command with arguments
    const fullCommand = `${command} ${args.join(' ')}`;

    // Execute using ush with the provided options
    let engine = this.ush;

    if (options.cwd) {
      engine = engine.cd(options.cwd);
    }

    if (options.env) {
      engine = engine.env(options.env);
    }

    if (options.timeout) {
      engine = engine.timeout(options.timeout);
    }

    if (this.ushConfig.sudo) {
      const result = await engine`sudo ${fullCommand}`;
      return result;
    }

    const result = await engine`${fullCommand}`;
    return result;
  }

  private async executeShell(script: string, options: any): Promise<UshExecutionResult> {
    this.log('debug', `Executing shell script: ${script.substring(0, 100)}...`);

    // Execute using ush with the provided options
    let engine = this.ush;

    if (options.cwd) {
      engine = engine.cd(options.cwd);
    }

    if (options.env) {
      engine = engine.env(options.env);
    }

    if (options.timeout) {
      engine = engine.timeout(options.timeout);
    }

    if (options.shell) {
      engine = engine.shell(options.shell);
    }

    if (this.ushConfig.sudo) {
      const result = await engine`sudo ${options.shell || '/bin/sh'} -c '${script}'`;
      return result;
    }

    const result = await engine`${script}`;
    return result;
  }
}