import { z } from 'zod';
import { existsSync } from 'fs';
import { spawn, ChildProcess } from 'child_process';

import { BaseAdapter, ExecutionResult } from './base-adapter.js';

export interface TerraformConfig {
  workingDirectory: string;
  executablePath?: string;
  autoApprove?: boolean;
  parallelism?: number;
  lockTimeout?: string;
  backendConfig?: Record<string, string>;
  variables?: Record<string, any>;
  varFiles?: string[];
}

export const TerraformConfigSchema = z.object({
  workingDirectory: z.string(),
  executablePath: z.string().optional(),
  autoApprove: z.boolean().optional(),
  parallelism: z.number().optional(),
  lockTimeout: z.string().optional(),
  backendConfig: z.record(z.string()).optional(),
  variables: z.record(z.any()).optional(),
  varFiles: z.array(z.string()).optional(),
});

export class TerraformAdapter extends BaseAdapter {
  private terraformConfig: TerraformConfig;
  private executablePath: string;
  private process: ChildProcess | null = null;

  constructor(config: TerraformConfig) {
    super({
      name: 'terraform',
      type: 'infrastructure',
      timeout: 600000, // 10 minutes default
    });

    this.terraformConfig = config;
    this.executablePath = config.executablePath || 'terraform';
  }

  async connect(): Promise<void> {
    try {
      // Verify terraform executable
      const version = await this.execute('version', { capture: true });
      if (!version.success) {
        throw new Error('Terraform executable not found');
      }

      // Verify working directory
      if (!existsSync(this.terraformConfig.workingDirectory)) {
        throw new Error(`Working directory not found: ${this.terraformConfig.workingDirectory}`);
      }

      // Initialize terraform
      const init = await this.init();
      if (!init.success) {
        throw new Error('Terraform initialization failed');
      }

      this.connected = true;
      this.connectionTime = Date.now();

      this.emitEvent({
        type: 'connected',
        timestamp: Date.now(),
        data: { version: version.output },
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
    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.connected = false;
    this.emitEvent({
      type: 'disconnected',
      timestamp: Date.now(),
    });
  }

  async execute(command: string, options?: any): Promise<ExecutionResult> {
    const startTime = Date.now();

    try {
      const args = this.buildArgs(command, options);
      const result = await this.runCommand(args, options);

      return {
        success: result.exitCode === 0,
        output: result.output,
        duration: Date.now() - startTime,
        metadata: {
          command,
          args,
          exitCode: result.exitCode,
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

  async healthCheck(): Promise<boolean> {
    try {
      const result = await this.execute('version', { capture: true });
      return result.success;
    } catch {
      return false;
    }
  }

  validateConfig(config: any): boolean {
    try {
      TerraformConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }

  // Terraform-specific methods
  async init(options?: { upgrade?: boolean; reconfigure?: boolean }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (options?.upgrade) args.push('-upgrade');
    if (options?.reconfigure) args.push('-reconfigure');

    if (this.terraformConfig.backendConfig) {
      for (const [key, value] of Object.entries(this.terraformConfig.backendConfig)) {
        args.push(`-backend-config=${key}=${value}`);
      }
    }

    return this.execute('init', { additionalArgs: args });
  }

  async plan(options?: { destroy?: boolean; out?: string }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (options?.destroy) args.push('-destroy');
    if (options?.out) args.push(`-out=${options.out}`);

    this.addVariableArgs(args);

    return this.execute('plan', { additionalArgs: args });
  }

  async apply(options?: { planFile?: string }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (this.terraformConfig.autoApprove) {
      args.push('-auto-approve');
    }

    if (this.terraformConfig.parallelism) {
      args.push(`-parallelism=${this.terraformConfig.parallelism}`);
    }

    if (options?.planFile) {
      args.push(options.planFile);
    } else {
      this.addVariableArgs(args);
    }

    return this.execute('apply', { additionalArgs: args });
  }

  async destroy(options?: { force?: boolean }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (this.terraformConfig.autoApprove || options?.force) {
      args.push('-auto-approve');
    }

    this.addVariableArgs(args);

    return this.execute('destroy', { additionalArgs: args });
  }

  async output(name?: string, options?: { json?: boolean }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (options?.json) args.push('-json');
    if (name) args.push(name);

    return this.execute('output', { additionalArgs: args, capture: true });
  }

  async state(subcommand: string, args?: string[]): Promise<ExecutionResult> {
    return this.execute('state', {
      additionalArgs: [subcommand, ...(args || [])],
      capture: true,
    });
  }

  async workspace(subcommand: string, name?: string): Promise<ExecutionResult> {
    const args = [subcommand];
    if (name) args.push(name);

    return this.execute('workspace', { additionalArgs: args });
  }

  async import(address: string, id: string): Promise<ExecutionResult> {
    const args = [address, id];
    this.addVariableArgs(args);

    return this.execute('import', { additionalArgs: args });
  }

  async validate(): Promise<ExecutionResult> {
    return this.execute('validate', { capture: true });
  }

  async fmt(options?: { check?: boolean; recursive?: boolean }): Promise<ExecutionResult> {
    const args: string[] = [];

    if (options?.check) args.push('-check');
    if (options?.recursive) args.push('-recursive');

    return this.execute('fmt', { additionalArgs: args });
  }

  private buildArgs(command: string, options?: any): string[] {
    const args = [command];

    if (options?.additionalArgs) {
      args.push(...options.additionalArgs);
    }

    if (this.terraformConfig.lockTimeout) {
      args.push(`-lock-timeout=${this.terraformConfig.lockTimeout}`);
    }

    return args;
  }

  private addVariableArgs(args: string[]): void {
    if (this.terraformConfig.variables) {
      for (const [key, value] of Object.entries(this.terraformConfig.variables)) {
        args.push(`-var=${key}=${JSON.stringify(value)}`);
      }
    }

    if (this.terraformConfig.varFiles) {
      for (const file of this.terraformConfig.varFiles) {
        args.push(`-var-file=${file}`);
      }
    }
  }

  private runCommand(args: string[], options?: any): Promise<{ exitCode: number; output: string }> {
    return new Promise((resolve, reject) => {
      const output: string[] = [];
      const errors: string[] = [];

      this.log('debug', `Running terraform ${args.join(' ')}`);

      this.process = spawn(this.executablePath, args, {
        cwd: this.terraformConfig.workingDirectory,
        env: { ...process.env },
      });

      if (options?.capture) {
        this.process.stdout?.on('data', (data) => {
          output.push(data.toString());
        });

        this.process.stderr?.on('data', (data) => {
          errors.push(data.toString());
        });
      } else {
        this.process.stdout?.pipe(process.stdout);
        this.process.stderr?.pipe(process.stderr);
      }

      this.process.on('close', (code) => {
        this.process = null;

        if (code === 0) {
          resolve({
            exitCode: code,
            output: output.join(''),
          });
        } else {
          reject(new Error(`Terraform command failed with exit code ${code}: ${errors.join('')}`));
        }
      });

      this.process.on('error', (error) => {
        this.process = null;
        reject(error);
      });
    });
  }
}