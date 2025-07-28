import { z } from 'zod';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';

import { getConfig } from '../utils/config.js';
import { parseTimeout } from '../utils/time.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface OnOptions {
  parallel?: boolean;
  timeout?: string;
  env?: string[];
  cwd?: string;
  user?: string;
  key?: string;
  port?: number;
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

interface SSHConnectionConfig {
  host: string;
  username?: string;
  port?: number;
  privateKey?: string;
  password?: string;
  passphrase?: string;
}

class OnCommand extends BaseCommand {
  constructor() {
    super({
      name: 'on',
      description: 'Execute commands on remote hosts via SSH',
      arguments: '<hosts> [command...]',
      options: [
        {
          flags: '-p, --parallel',
          description: 'Execute on hosts in parallel',
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
          description: 'Working directory on remote host',
        },
        {
          flags: '-u, --user <user>',
          description: 'SSH user (overrides config)',
        },
        {
          flags: '-k, --key <path>',
          description: 'SSH private key path (overrides config)',
        },
        {
          flags: '--port <port>',
          description: 'SSH port (overrides config)',
          defaultValue: '22',
        },
      ],
      examples: [
        {
          command: 'xec on server1 "uptime"',
          description: 'Execute command on single host',
        },
        {
          command: 'xec on server1,server2 "uptime" --parallel',
          description: 'Execute on multiple hosts in parallel',
        },
        {
          command: 'xec on prod "systemctl status nginx"',
          description: 'Execute using configured host alias',
        },
        {
          command: 'xec on web-* "npm restart" --parallel',
          description: 'Execute on hosts matching pattern',
        },
        {
          command: 'xec on staging -e NODE_ENV=production "npm test"',
          description: 'Execute with environment variables',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          parallel: z.boolean().optional(),
          timeout: z.string().optional(),
          env: z.array(z.string()).optional(),
          cwd: z.string().optional(),
          user: z.string().optional(),
          key: z.string().optional(),
          port: z.coerce.number().positive().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  async execute(args: any[]): Promise<void> {
    const [hostsArg, ...commandParts] = args.slice(0, -1);
    const options = args[args.length - 1] as OnOptions;

    if (!hostsArg) {
      throw new Error('Host specification is required');
    }

    if (commandParts.length === 0) {
      throw new Error('Command is required');
    }

    const command = commandParts.join(' ');
    const hosts = await this.resolveHosts(hostsArg);

    if (hosts.length === 0) {
      throw new Error('No hosts found matching specification');
    }

    // Execute command
    if (options.parallel && hosts.length > 1) {
      await this.executeParallel(hosts, command, options);
    } else {
      await this.executeSequential(hosts, command, options);
    }
  }

  private async resolveHosts(hostsSpec: string): Promise<SSHConnectionConfig[]> {
    const config = getConfig();
    const hosts: SSHConnectionConfig[] = [];
    
    // Split by comma for multiple hosts
    const hostSpecs = hostsSpec.split(',').map(h => h.trim());
    
    for (const spec of hostSpecs) {
      if (spec.includes('*')) {
        // Pattern matching
        const pattern = new RegExp('^' + spec.replace(/\*/g, '.*') + '$');
        const sshHosts = config.getValue('adapters.ssh.hosts') || {};
        const configuredHosts = config.getValue('hosts') || {};
        
        // Check SSH adapter hosts
        for (const [name, hostConfig] of Object.entries(sshHosts)) {
          if (pattern.test(name)) {
            hosts.push(this.normalizeHostConfig(name, hostConfig));
          }
        }
        
        // Check new unified hosts configuration
        for (const [name, hostConfig] of Object.entries(configuredHosts)) {
          if (pattern.test(name)) {
            hosts.push(this.normalizeHostConfig(name, hostConfig));
          }
        }
      } else {
        // Check if it's a configured host alias
        const sshHostConfig = config.getSSHHost(spec);
        const unifiedHostConfig = config.getValue(`hosts.${spec}`);
        
        if (sshHostConfig) {
          hosts.push(this.normalizeHostConfig(spec, sshHostConfig));
        } else if (unifiedHostConfig) {
          hosts.push(this.normalizeHostConfig(spec, unifiedHostConfig));
        } else {
          // Treat as direct hostname
          hosts.push({
            host: spec,
            username: process.env['USER'] || 'root',
            port: 22,
          });
        }
      }
    }
    
    return hosts;
  }

  private normalizeHostConfig(name: string, config: any): SSHConnectionConfig {
    return {
      host: config.host || config.hostname || name,
      username: config.username || config.user || process.env['USER'] || 'root',
      port: config.port || 22,
      privateKey: config.privateKey || config.key || config.identityFile,
      password: config.password,
      passphrase: config.passphrase,
    };
  }

  private async executeSequential(
    hosts: SSHConnectionConfig[],
    command: string,
    options: OnOptions
  ): Promise<void> {
    for (const host of hosts) {
      await this.executeOnHost(host, command, options);
    }
  }

  private async executeParallel(
    hosts: SSHConnectionConfig[],
    command: string,
    options: OnOptions
  ): Promise<void> {
    if (!options.quiet) {
      this.log(`Executing on ${hosts.length} hosts in parallel...`, 'info');
    }

    const promises = hosts.map(host => 
      this.executeOnHost(host, command, { ...options, quiet: true })
        .then(() => ({ host: host.host, success: true, error: null }))
        .catch(error => ({ 
          host: host.host, 
          success: false, 
          error: error instanceof Error ? error.message : String(error) 
        }))
    );

    const results = await Promise.all(promises);

    // Summary
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    if (!options.quiet) {
      this.log('\nExecution summary:', 'info');
      this.log(`  Successful: ${chalk.green(successful)}`, 'info');
      if (failed > 0) {
        this.log(`  Failed: ${chalk.red(failed)}`, 'error');
        
        if (options.verbose) {
          this.log('\nFailed hosts:', 'error');
          results.filter(r => !r.success).forEach(r => {
            this.log(`  ${r.host}: ${r.error}`, 'error');
          });
        }
      }
    }

    if (failed > 0) {
      throw new Error(`Command failed on ${failed} host(s)`);
    }
  }

  private async executeOnHost(
    hostConfig: SSHConnectionConfig,
    command: string,
    options: OnOptions
  ): Promise<void> {
    const hostDisplay = chalk.cyan(hostConfig.host);

    if (options.dryRun) {
      this.log(`[DRY RUN] Would execute on ${hostDisplay}: ${chalk.yellow(command)}`, 'info');
      return;
    }

    if (!options.quiet) {
      this.startSpinner(`Executing on ${hostDisplay}...`);
    }

    try {
      // Build SSH connection options
      const sshOptions: any = {
        host: hostConfig.host,
        username: options.user || hostConfig.username,
        port: options.port || hostConfig.port,
        privateKey: options.key || hostConfig.privateKey,
        password: hostConfig.password,
        passphrase: hostConfig.passphrase,
      };

      // Create SSH engine with options
      const engine = $.ssh(sshOptions);
      
      // Build command options
      const commandOptions: any = {};
      
      // Apply environment variables
      if (options.env && options.env.length > 0) {
        const envVars: Record<string, string> = {};
        for (const envVar of options.env) {
          const [key, value] = envVar.split('=');
          if (key && value !== undefined) {
            envVars[key] = value;
          }
        }
        commandOptions.env = envVars;
      }

      // Apply working directory
      if (options.cwd) {
        commandOptions.cwd = options.cwd;
      }

      // Apply timeout
      if (options.timeout) {
        const timeoutMs = parseTimeout(options.timeout);
        commandOptions.timeout = timeoutMs;
      }
      
      // Apply shell
      commandOptions.shell = true;

      // Execute command with options
      const result = await engine.exec`${command}`;

      if (!options.quiet) {
        this.stopSpinner();
        this.log(`${chalk.green('✓')} ${hostDisplay}`, 'success');
        
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
      
      if (!options.quiet || !options.parallel) {
        this.log(`${chalk.red('✗')} ${hostDisplay}: ${errorMessage}`, 'error');
      }
      
      throw error;
    }
  }
}

export default function onCommand(program: Command): void {
  const cmd = new OnCommand();
  program.addCommand(cmd.create());
}