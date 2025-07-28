import { z } from 'zod';
import chalk from 'chalk';
import { Command } from 'commander';
import { $ , ConvenienceAPI } from '@xec-sh/core';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface ForwardOptions {
  namespace?: string;
  container?: string;
  host?: string;
  dynamic?: boolean;
  background?: boolean;
  verbose?: boolean;
}

interface ActiveForward {
  id: string;
  type: 'ssh' | 'kubernetes' | 'docker';
  source: string;
  localPort: number;
  remotePort: number;
  forward: any; // SSH tunnel or K8s port forward
  startTime: Date;
}

class ForwardCommand extends BaseCommand {
  private static activeForwards: Map<string, ActiveForward> = new Map();

  constructor() {
    super({
      name: 'forward',
      description: 'Set up port forwarding (SSH tunnels, K8s port forwards)',
      arguments: '<source> [localPort]',
      options: [
        {
          flags: '-n, --namespace <namespace>',
          description: 'Kubernetes namespace (for pod forwarding)'
        },
        {
          flags: '-d, --dynamic',
          description: 'Use dynamic local port allocation'
        },
        {
          flags: '-b, --background',
          description: 'Run in background (return immediately)'
        },
        {
          flags: '--list',
          description: 'List active port forwards'
        },
        {
          flags: '--stop <id>',
          description: 'Stop a specific port forward'
        },
        {
          flags: '--stop-all',
          description: 'Stop all active port forwards'
        }
      ],
      examples: [
        {
          command: 'xec forward prod:3306 3307',
          description: 'SSH tunnel: prod server port 3306 to local 3307'
        },
        {
          command: 'xec forward staging:5432',
          description: 'SSH tunnel with same local port as remote'
        },
        {
          command: 'xec forward pod:web:80 8080',
          description: 'K8s: forward pod web port 80 to local 8080'
        },
        {
          command: 'xec forward pod:db:5432 -n production -d',
          description: 'K8s: dynamic local port for production pod'
        },
        {
          command: 'xec forward container:redis:6379',
          description: 'Docker: forward container port to local'
        },
        {
          command: 'xec forward --list',
          description: 'List all active port forwards'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          namespace: z.string().optional(),
          container: z.string().optional(),
          host: z.string().optional(),
          dynamic: z.boolean().optional(),
          background: z.boolean().optional(),
          verbose: z.boolean().optional(),
          list: z.boolean().optional(),
          stop: z.string().optional(),
          stopAll: z.boolean().optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  override async execute(args: any[]): Promise<void> {
    const [source, localPortStr] = args.slice(0, 2);
    const options = args[args.length - 1] as ForwardOptions & { list?: boolean; stop?: string; stopAll?: boolean };

    // Handle special operations
    if (options.list) {
      return this.listForwards();
    }

    if (options.stopAll) {
      return this.stopAllForwards();
    }

    if (options.stop) {
      return this.stopForward(options.stop);
    }

    // Normal port forwarding
    if (!source) {
      throw new Error('Source is required (e.g., host:port, pod:name:port)');
    }

    // Parse source and determine local port
    const localPort = options.dynamic ? undefined : (localPortStr ? parseInt(localPortStr, 10) : undefined);
    
    // Set up the forward
    await this.setupForward(source, localPort, options);
  }

  private async setupForward(source: string, localPort: number | undefined, options: ForwardOptions): Promise<void> {
    const config = getConfig();
    const helpers = new ConvenienceAPI($ as any);

    // Create progress indicator
    this.startSpinner(`Setting up port forward for ${source}...`);

    try {
      // Use convenience helper to set up forwarding
      const forward = await helpers.forward(source, localPort);
      
      // Determine forward type and details
      let type: 'ssh' | 'kubernetes' | 'docker';
      let remotePort: number;
      let actualLocalPort: number;

      if (source.includes('pod:')) {
        type = 'kubernetes';
        const parts = source.split(':');
        remotePort = parseInt(parts[2] || '80', 10);
        actualLocalPort = forward.localPort;
      } else if (source.includes('container:')) {
        type = 'docker';
        const parts = source.split(':');
        remotePort = parseInt(parts[2] || '80', 10);
        actualLocalPort = forward.localPort;
      } else {
        type = 'ssh';
        const parts = source.split(':');
        remotePort = parseInt(parts[1] || '22', 10);
        actualLocalPort = forward.localPort;
      }

      // Generate ID
      const id = `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Store active forward
      const activeForward: ActiveForward = {
        id,
        type,
        source,
        localPort: actualLocalPort,
        remotePort,
        forward,
        startTime: new Date()
      };
      ForwardCommand.activeForwards.set(id, activeForward);

      this.stopSpinner();
      
      // Display success message
      this.log(chalk.green('✓') + ' Port forward established:', 'success');
      this.log(`  Type: ${type}`, 'info');
      this.log(`  Source: ${source}`, 'info');
      this.log(`  Local: localhost:${actualLocalPort}`, 'info');
      this.log(`  Remote: port ${remotePort}`, 'info');
      this.log(`  ID: ${id}`, 'info');
      
      // Additional info based on type
      if (type === 'ssh') {
        this.log(`\n  Access: ${chalk.cyan(`http://localhost:${actualLocalPort}`)}`, 'info');
      } else if (type === 'kubernetes') {
        this.log(`\n  Access: ${chalk.cyan(`kubectl port-forward ${source.split(':')[1]} ${actualLocalPort}:${remotePort}`)}`, 'info');
      }

      // Handle background mode
      if (!options.background) {
        this.log('\nPort forward is active. Press Ctrl+C to stop...', 'info');
        
        // Set up graceful shutdown
        process.on('SIGINT', async () => {
          this.log('\n\nStopping port forward...', 'info');
          await this.stopForward(id);
          process.exit(0);
        });

        // Keep process alive
        await new Promise(() => {}); // Wait forever
      } else {
        this.log('\nRunning in background. Use --list to see active forwards.', 'info');
        this.log(`To stop: ${chalk.cyan(`xec forward --stop ${id}`)}`, 'info');
        
        // Detach the forward so it continues after CLI exits
        // In a real implementation, we'd need a daemon process
        this.log(chalk.yellow('\nNote: Background mode requires the terminal to stay open.'), 'warn');
      }
    } catch (error) {
      this.stopSpinner();
      if (error instanceof Error) {
        throw new Error(`Failed to set up port forward: ${error.message}`);
      }
      throw error;
    }
  }

  private async listForwards(): Promise<void> {
    if (ForwardCommand.activeForwards.size === 0) {
      this.log('No active port forwards.', 'info');
      return;
    }

    this.log('Active port forwards:', 'info');
    this.log('', 'info');
    
    const now = new Date();
    
    ForwardCommand.activeForwards.forEach((forward) => {
      const duration = Math.floor((now.getTime() - forward.startTime.getTime()) / 1000);
      const durationStr = this.formatDuration(duration);
      
      this.log(`  ${chalk.cyan(forward.id)}`, 'info');
      this.log(`    Type: ${forward.type}`, 'info');
      this.log(`    Source: ${forward.source}`, 'info');
      this.log(`    Local Port: ${forward.localPort}`, 'info');
      this.log(`    Remote Port: ${forward.remotePort}`, 'info');
      this.log(`    Duration: ${durationStr}`, 'info');
      this.log(`    Status: ${chalk.green('Active')}`, 'info');
      this.log('', 'info');
    });
    
    this.log(`Total: ${ForwardCommand.activeForwards.size} active forward(s)`, 'info');
  }

  private async stopForward(id: string): Promise<void> {
    const forward = ForwardCommand.activeForwards.get(id);
    
    if (!forward) {
      throw new Error(`No active forward found with ID: ${id}`);
    }
    
    this.startSpinner(`Stopping port forward ${id}...`);
    
    try {
      // Close the forward
      if (forward.forward && typeof forward.forward.close === 'function') {
        await forward.forward.close();
      }
      
      // Remove from active list
      ForwardCommand.activeForwards.delete(id);
      
      this.stopSpinner();
      this.log(`${chalk.green('✓')} Port forward ${id} stopped`, 'success');
    } catch (error) {
      this.stopSpinner();
      throw new Error(`Failed to stop port forward: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async stopAllForwards(): Promise<void> {
    if (ForwardCommand.activeForwards.size === 0) {
      this.log('No active port forwards to stop.', 'info');
      return;
    }
    
    const count = ForwardCommand.activeForwards.size;
    this.startSpinner(`Stopping ${count} port forward(s)...`);
    
    const errors: string[] = [];
    
    for (const [id, forward] of ForwardCommand.activeForwards) {
      try {
        if (forward.forward && typeof forward.forward.close === 'function') {
          await forward.forward.close();
        }
      } catch (error) {
        errors.push(`${id}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    
    ForwardCommand.activeForwards.clear();
    
    this.stopSpinner();
    
    if (errors.length > 0) {
      this.log(`${chalk.yellow('⚠')} Stopped with ${errors.length} error(s):`, 'warn');
      errors.forEach(err => this.log(`  - ${err}`, 'error'));
    } else {
      this.log(`${chalk.green('✓')} All ${count} port forward(s) stopped`, 'success');
    }
  }

  private formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`;
    } else {
      return `${secs}s`;
    }
  }
}

export default function forwardCommand(program: Command): void {
  const cmd = new ForwardCommand();
  program.addCommand(cmd.create());
}