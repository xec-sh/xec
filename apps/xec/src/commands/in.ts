import { z } from 'zod';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';

import { getConfig } from '../utils/config.js';
import { parseTimeout } from '../utils/time.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface InOptions {
  namespace?: string;
  container?: string;
  timeout?: string;
  env?: string[];
  cwd?: string;
  user?: string;
  interactive?: boolean;
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

interface ExecutionTarget {
  type: 'docker' | 'kubernetes';
  name: string;
  namespace?: string;
  container?: string;
}

class InCommand extends BaseCommand {
  constructor() {
    super({
      name: 'in',
      description: 'Execute commands in containers or Kubernetes pods',
      arguments: '<target> [command...]',
      options: [
        {
          flags: '-n, --namespace <namespace>',
          description: 'Kubernetes namespace',
          defaultValue: 'default',
        },
        {
          flags: '-C, --container <container>',
          description: 'Container name (for multi-container pods)',
        },
        {
          flags: '-t, --timeout <duration>',
          description: 'Command timeout (e.g., 30s, 5m)',
          defaultValue: '30s',
        },
        {
          flags: '-e, --env <key=value>',
          description: 'Environment variables (can be used multiple times)',
        },
        {
          flags: '-d, --cwd <path>',
          description: 'Working directory in container',
        },
        {
          flags: '-u, --user <user>',
          description: 'User to run command as',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive mode (attach to container)',
        },
      ],
      examples: [
        {
          command: 'xec in myapp "npm test"',
          description: 'Execute in Docker container',
        },
        {
          command: 'xec in pod:webapp "date"',
          description: 'Execute in Kubernetes pod',
        },
        {
          command: 'xec in pod:webapp -n production "kubectl version"',
          description: 'Execute in pod with namespace',
        },
        {
          command: 'xec in webapp -C nginx "nginx -t"',
          description: 'Execute in specific container',
        },
        {
          command: 'xec in myapp',
          description: 'Interactive shell in container',
        },
        {
          command: 'xec in pod:debug -i',
          description: 'Interactive shell in pod',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          namespace: z.string().optional(),
          container: z.string().optional(),
          timeout: z.string().optional(),
          env: z.array(z.string()).optional(),
          cwd: z.string().optional(),
          user: z.string().optional(),
          interactive: z.boolean().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  async execute(args: any[]): Promise<void> {
    const [targetSpec, ...commandParts] = args.slice(0, -1);
    const options = args[args.length - 1] as InOptions;

    if (!targetSpec) {
      throw new Error('Target specification is required');
    }

    // If no command provided, default to interactive mode
    const command = commandParts.length > 0 ? commandParts.join(' ') : null;
    const interactive = options.interactive || !command;

    // Resolve target
    const target = await this.resolveTarget(targetSpec, options);

    // Execute command
    if (interactive) {
      await this.executeInteractive(target, options);
    } else {
      await this.executeCommand(target, command!, options);
    }
  }

  private async resolveTarget(targetSpec: string, options: InOptions): Promise<ExecutionTarget> {
    const config = getConfig();

    // Check for explicit pod: prefix
    if (targetSpec.startsWith('pod:')) {
      return {
        type: 'kubernetes',
        name: targetSpec.substring(4),
        namespace: options.namespace || 'default',
        container: options.container,
      };
    }

    // Check if it's a configured container
    const containers = config.getValue('containers') || {};
    if (containers[targetSpec]) {
      const containerConfig = containers[targetSpec];
      return {
        type: 'docker',
        name: containerConfig.name || targetSpec,
      };
    }

    // Check if it's a configured pod
    const pods = config.getValue('pods') || {};
    if (pods[targetSpec]) {
      const podConfig = pods[targetSpec];
      return {
        type: 'kubernetes',
        name: podConfig.name || targetSpec,
        namespace: options.namespace || podConfig.namespace || 'default',
        container: options.container || podConfig.container,
      };
    }

    // Try to auto-detect by checking Docker first, then Kubernetes
    try {
      // Check if it's a running Docker container
      const dockerResult = await $.local()`docker ps --format "{{.Names}}" | grep -E "^${targetSpec}$"`.quiet().nothrow();
      if (dockerResult.isSuccess() && dockerResult.stdout.trim()) {
        return {
          type: 'docker',
          name: targetSpec,
        };
      }
    } catch {
      // Ignore Docker check errors
    }

    // Check if kubectl is available and try to find pod
    try {
      const namespace = options.namespace || 'default';
      const kubectlResult = await $.local()`kubectl get pod ${targetSpec} -n ${namespace} -o name`.quiet().nothrow();
      if (kubectlResult.isSuccess() && kubectlResult.stdout.trim()) {
        return {
          type: 'kubernetes',
          name: targetSpec,
          namespace,
          container: options.container,
        };
      }
    } catch {
      // Ignore kubectl check errors
    }

    // Default to Docker container
    return {
      type: 'docker',
      name: targetSpec,
    };
  }

  private async executeCommand(
    target: ExecutionTarget,
    command: string,
    options: InOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);

    if (options.dryRun) {
      this.log(`[DRY RUN] Would execute in ${targetDisplay}: ${chalk.yellow(command)}`, 'info');
      this.log(`  Type: ${target.type}`, 'info');
      if (target.namespace) this.log(`  Namespace: ${target.namespace}`, 'info');
      if (target.container) this.log(`  Container: ${target.container}`, 'info');
      return;
    }

    if (!options.quiet) {
      this.startSpinner(`Executing in ${targetDisplay}...`);
    }

    try {
      let engine: any;

      if (target.type === 'docker') {
        // Docker execution
        engine = $.docker({ container: target.name });
      } else {
        // Kubernetes execution
        const k8sOptions: any = {
          pod: target.name,
          namespace: target.namespace,
        };
        if (target.container) {
          k8sOptions.container = target.container;
        }
        engine = $.k8s(k8sOptions);
      }

      // Apply environment variables
      if (options.env && options.env.length > 0) {
        const envVars: Record<string, string> = {};
        for (const envVar of options.env) {
          const [key, value] = envVar.split('=');
          if (key && value !== undefined) {
            envVars[key] = value;
          }
        }
        engine = engine.env(envVars);
      }

      // Apply working directory
      if (options.cwd) {
        engine = engine.cd(options.cwd);
      }

      // Apply user
      if (options.user) {
        if (target.type === 'docker') {
          // Docker supports user option
          engine = $.docker({ container: target.name, user: options.user });
        }
        // Note: Kubernetes doesn't support changing user at exec time
      }

      // Apply timeout
      if (options.timeout) {
        const timeoutMs = parseTimeout(options.timeout);
        engine = engine.timeout(timeoutMs);
      }

      // Execute command
      const result = await engine`${command}`;

      if (!options.quiet) {
        this.stopSpinner();
        this.log(`${chalk.green('✓')} ${targetDisplay}`, 'success');
        
        if (result.stdout) {
          console.log(result.stdout.trim());
        }
        
        if (result.stderr && options.verbose) {
          console.error(chalk.yellow(result.stderr.trim()));
        }
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }
      
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${chalk.red('✗')} ${targetDisplay}: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async executeInteractive(
    target: ExecutionTarget,
    options: InOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);

    if (options.dryRun) {
      this.log(`[DRY RUN] Would start interactive session in ${targetDisplay}`, 'info');
      return;
    }

    this.log(`Starting interactive session in ${targetDisplay}...`, 'info');

    try {
      let command: string[];

      if (target.type === 'docker') {
        // Docker interactive
        command = ['docker', 'exec', '-it'];
        
        if (options.user) {
          command.push('-u', options.user);
        }
        
        if (options.cwd) {
          command.push('-w', options.cwd);
        }
        
        if (options.env) {
          for (const envVar of options.env) {
            command.push('-e', envVar);
          }
        }
        
        command.push(target.name);
        
        // Default shell
        command.push('/bin/sh');
      } else {
        // Kubernetes interactive
        command = ['kubectl', 'exec', '-it'];
        
        command.push('-n', target.namespace || 'default');
        
        if (target.container) {
          command.push('-c', target.container);
        }
        
        command.push(target.name);
        command.push('--');
        
        // Default shell
        command.push('/bin/sh');
      }

      // Use local execution for interactive mode
      const result = await $.local()`${command.join(' ')}`.interactive();

      if (result.exitCode !== 0 && result.exitCode !== 130) { // 130 is Ctrl+C
        throw new Error(`Interactive session ended with exit code ${result.exitCode}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${chalk.red('✗')} Failed to start interactive session: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private formatTargetDisplay(target: ExecutionTarget): string {
    if (target.type === 'kubernetes') {
      let display = `pod:${chalk.cyan(target.name)}`;
      if (target.namespace && target.namespace !== 'default') {
        display += ` (ns: ${target.namespace})`;
      }
      if (target.container) {
        display += ` [${target.container}]`;
      }
      return display;
    } else {
      return chalk.cyan(target.name);
    }
  }
}

export default function inCommand(program: Command): void {
  const cmd = new InCommand();
  program.addCommand(cmd.create());
}