import { z } from 'zod';
import fs from 'fs-extra';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import Handlebars from 'handlebars';

import { getConfig } from '../utils/config.js';
import { parseTimeout } from '../utils/time.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface ExecOptions {
  adapter?: 'local' | 'ssh' | 'docker' | 'kubernetes' | 'remote-docker';
  host?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  env?: string[];
  cwd?: string;
  shell?: boolean | string;
  timeout?: string;
  retry?: number;
  file?: string;
  template?: string;
  data?: string;
  parallel?: number;
  quiet?: boolean;
  verbose?: boolean;
  dryRun?: boolean;
  output?: 'text' | 'json' | 'yaml';
}

interface ExecContext {
  adapter: string;
  options: any;
  env?: Record<string, string>;
  cwd?: string;
  shell?: boolean | string;
  timeout?: number;
}

class ExecCommand extends BaseCommand {
  constructor() {
    super({
      name: 'exec',
      description: 'Execute commands in various environments',
      arguments: '[command...]',
      options: [
        {
          flags: '-a, --adapter <type>',
          description: 'Execution adapter (local|ssh|docker|kubernetes|remote-docker)',
          defaultValue: 'local'
        },
        {
          flags: '-h, --host <host>',
          description: 'SSH host'
        },
        {
          flags: '--container <name>',
          description: 'Docker container name/ID'
        },
        {
          flags: '--pod <name>',
          description: 'Kubernetes pod name'
        },
        {
          flags: '-n, --namespace <name>',
          description: 'Kubernetes namespace',
          defaultValue: 'default'
        },
        {
          flags: '-e, --env <key=value>',
          description: 'Environment variables (can be used multiple times)'
        },
        {
          flags: '-d, --cwd <path>',
          description: 'Working directory'
        },
        {
          flags: '-s, --shell [shell]',
          description: 'Use shell (optional: specify shell path)'
        },
        {
          flags: '-t, --timeout <duration>',
          description: 'Command timeout (e.g., 30s, 5m)',
          defaultValue: '30s'
        },
        {
          flags: '-r, --retry <count>',
          description: 'Number of retry attempts',
          defaultValue: '0'
        },
        {
          flags: '-f, --file <path>',
          description: 'Execute commands from file'
        },
        {
          flags: '--template <template>',
          description: 'Command template'
        },
        {
          flags: '--data <json>',
          description: 'Data for template (JSON format)'
        },
        {
          flags: '-P, --parallel <count>',
          description: 'Max parallel executions (for file mode)',
          defaultValue: '1'
        }
      ],
      examples: [
        {
          command: 'xec exec "ls -la"',
          description: 'Execute command locally'
        },
        {
          command: 'xec exec -a ssh -h server.com "uptime"',
          description: 'Execute on SSH server'
        },
        {
          command: 'xec exec -a docker -c myapp "npm test"',
          description: 'Execute in Docker container'
        },
        {
          command: 'xec exec -a kubernetes --pod webapp "date"',
          description: 'Execute in Kubernetes pod'
        },
        {
          command: 'xec exec -f commands.txt --parallel 5',
          description: 'Execute commands from file in parallel'
        },
        {
          command: 'xec exec --template "echo Hello {{name}}" --data \'{"name":"World"}\'',
          description: 'Execute template command'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          adapter: z.enum(['local', 'ssh', 'docker', 'kubernetes', 'remote-docker']).optional(),
          host: z.string().optional(),
          container: z.string().optional(),
          pod: z.string().optional(),
          namespace: z.string().optional(),
          env: z.array(z.string()).optional(),
          cwd: z.string().optional(),
          shell: z.union([z.boolean(), z.string()]).optional(),
          timeout: z.string().optional(),
          retry: z.coerce.number().min(0).optional(),
          file: z.string().optional(),
          template: z.string().optional(),
          data: z.string().optional(),
          parallel: z.coerce.number().min(1).optional(),
          quiet: z.boolean().optional(),
          verbose: z.boolean().optional(),
          dryRun: z.boolean().optional(),
          output: z.enum(['text', 'json', 'yaml']).optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  async execute(args: any[]): Promise<void> {
    const commandParts = args.slice(0, -1);
    const options = args[args.length - 1] as ExecOptions;

    // Build execution context
    const context = await this.buildContext(options);

    // Determine what to execute
    if (options.file) {
      await this.executeFromFile(options.file, context, options);
    } else if (options.template) {
      await this.executeTemplate(options.template, options.data, context, options);
    } else if (commandParts.length > 0) {
      const command = commandParts.join(' ');
      await this.executeCommand(command, context, options);
    } else {
      throw new Error('No command specified. Use positional arguments, --file, or --template');
    }
  }

  private async buildContext(options: ExecOptions): Promise<ExecContext> {
    const config = getConfig();
    const defaults = config.getValue('defaults') || {};

    // Determine adapter
    const adapter = options.adapter || defaults.adapter || 'local';

    // Parse environment variables
    const env: Record<string, string> = {};
    if (options.env) {
      for (const envVar of options.env) {
        const [key, value] = envVar.split('=');
        if (key && value !== undefined) {
          env[key] = value;
        }
      }
    }

    // Build adapter-specific options
    const adapterOptions = await this.buildAdapterOptions(adapter, options);

    // Parse timeout
    const timeout = options.timeout ? parseTimeout(options.timeout) : undefined;

    return {
      adapter,
      options: adapterOptions,
      env: Object.keys(env).length > 0 ? env : undefined,
      cwd: options.cwd,
      shell: options.shell,
      timeout
    };
  }

  private async buildAdapterOptions(adapter: string, options: ExecOptions): Promise<any> {
    const config = getConfig();

    switch (adapter) {
      case 'ssh':
        if (!options.host) {
          throw new Error('SSH adapter requires --host option');
        }

        // Check if host is configured
        const hostConfig = config.getSSHHost(options.host);
        if (hostConfig) {
          return {
            ...hostConfig,
            host: hostConfig.host || options.host
          };
        }

        return {
          host: options.host,
          username: process.env['USER'] || 'root'
        };

      case 'docker':
        if (!options.container) {
          throw new Error('Docker adapter requires --container option');
        }
        return {
          container: options.container
        };

      case 'kubernetes':
        if (!options.pod) {
          throw new Error('Kubernetes adapter requires --pod option');
        }
        return {
          pod: options.pod,
          namespace: options.namespace || 'default'
        };

      case 'remote-docker':
        if (!options.host || !options.container) {
          throw new Error('Remote Docker adapter requires --host and --container options');
        }
        return {
          host: options.host,
          container: options.container
        };

      case 'local':
      default:
        return {};
    }
  }

  private async executeCommand(command: string, context: ExecContext, options: ExecOptions): Promise<void> {
    if (options.dryRun) {
      this.log(`[DRY RUN] Would execute: ${chalk.cyan(command)}`, 'info');
      this.log(`  Adapter: ${context.adapter}`, 'info');
      if (context.cwd) this.log(`  Working directory: ${context.cwd}`, 'info');
      if (context.env) this.log(`  Environment: ${JSON.stringify(context.env)}`, 'info');
      return;
    }

    if (!options.quiet) {
      this.startSpinner(`Executing command...`);
    }

    try {
      // Create execution engine
      let engine = this.createEngine(context);

      // Apply options
      if (context.env) {
        engine = engine.env(context.env);
      }
      if (context.cwd) {
        engine = engine.cd(context.cwd);
      }
      if (context.timeout) {
        engine = engine.timeout(context.timeout);
      }
      if (context.shell !== undefined) {
        engine = engine.shell(context.shell);
      }

      // Execute with retry
      let result;
      let attempts = 0;
      const maxAttempts = (options.retry || 0) + 1;

      while (attempts < maxAttempts) {
        attempts++;
        
        try {
          result = await engine`${command}`;
          break;
        } catch (error) {
          if (attempts < maxAttempts) {
            if (options.verbose) {
              this.log(`Attempt ${attempts} failed, retrying...`, 'warn');
            }
            await new Promise(resolve => setTimeout(resolve, 1000 * attempts));
          } else {
            throw error;
          }
        }
      }

      if (!options.quiet) {
        this.stopSpinner();
      }

      // Output results
      if (result && !options.quiet) {
        switch (options.output) {
          case 'json':
            console.log(JSON.stringify({
              command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr
            }, null, 2));
            break;

          case 'yaml':
            const yaml = await import('js-yaml');
            console.log(yaml.dump({
              command,
              exitCode: result.exitCode,
              stdout: result.stdout,
              stderr: result.stderr
            }));
            break;

          default:
            if (result.stdout) {
              console.log(result.stdout.trim());
            }
            if (result.stderr && options.verbose) {
              console.error(chalk.red(result.stderr.trim()));
            }
        }
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }
      throw error;
    }
  }

  private async executeFromFile(filePath: string, context: ExecContext, options: ExecOptions): Promise<void> {
    if (!await fs.pathExists(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    const commands = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'));

    if (commands.length === 0) {
      this.log('No commands found in file', 'warn');
      return;
    }

    const parallel = options.parallel || 1;

    if (parallel > 1) {
      // Parallel execution
      this.log(`Executing ${commands.length} commands with parallelism ${parallel}`, 'info');
      
      const results: Array<{ command: string; success: boolean; error?: string }> = [];
      
      for (let i = 0; i < commands.length; i += parallel) {
        const batch = commands.slice(i, i + parallel);
        const promises = batch.map(async (command) => {
          try {
            await this.executeCommand(command, context, { ...options, quiet: true });
            return { command, success: true };
          } catch (error) {
            return { 
              command, 
              success: false, 
              error: error instanceof Error ? error.message : String(error)
            };
          }
        });
        
        const batchResults = await Promise.all(promises);
        results.push(...batchResults);
      }

      // Summary
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      
      this.log(`\nExecution summary:`, 'info');
      this.log(`  Successful: ${chalk.green(successful)}`, 'info');
      if (failed > 0) {
        this.log(`  Failed: ${chalk.red(failed)}`, 'error');
        
        if (options.verbose) {
          this.log('\nFailed commands:', 'error');
          results.filter(r => !r.success).forEach(r => {
            this.log(`  ${r.command}`, 'error');
            if (r.error) {
              this.log(`    ${chalk.dim(r.error)}`, 'error');
            }
          });
        }
      }
    } else {
      // Sequential execution
      for (const command of commands) {
        await this.executeCommand(command, context, options);
      }
    }
  }

  private async executeTemplate(template: string, dataJson: string | undefined, context: ExecContext, options: ExecOptions): Promise<void> {
    let data = {};
    
    if (dataJson) {
      try {
        data = JSON.parse(dataJson);
      } catch (error) {
        throw new Error(`Invalid JSON data: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Compile template
    const compiled = Handlebars.compile(template);
    const command = compiled(data);

    await this.executeCommand(command, context, options);
  }

  private createEngine(context: ExecContext): any {
    switch (context.adapter) {
      case 'ssh':
        return $.ssh(context.options);
      
      case 'docker':
        return $.docker(context.options);
      
      case 'kubernetes':
        return $.k8s(context.options);
      
      case 'remote-docker':
        return $.remoteDocker(context.options);
      
      case 'local':
      default:
        return $.local();
    }
  }
}

export default function execCommand(program: Command): void {
  const cmd = new ExecCommand();
  program.addCommand(cmd.create());
}