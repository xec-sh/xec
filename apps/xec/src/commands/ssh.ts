import { z } from 'zod';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';

import { parseTimeout } from '../utils/time.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';
import { errorMessages } from '../utils/error-handler.js';

interface SSHOptions {
  user?: string;
  port?: number;
  key?: string;
  password?: string;
  passphrase?: string;
  command?: string;
  script?: string;
  parallel?: boolean;
  timeout?: string;
  interactive?: boolean;
  copyId?: boolean;
  tunnel?: string;
  forward?: string;
  reverse?: string;
}

class SSHCommand extends BaseCommand {
  constructor() {
    super({
      name: 'ssh',
      description: 'Execute commands on remote hosts via SSH',
      arguments: '<hosts...>',
      options: [
        {
          flags: '-u, --user <user>',
          description: 'SSH user',
          defaultValue: process.env['USER'],
        },
        {
          flags: '-p, --port <port>',
          description: 'SSH port',
          defaultValue: '22',
        },
        {
          flags: '-k, --key <path>',
          description: 'SSH private key path',
        },
        {
          flags: '--password <password>',
          description: 'SSH password (use with caution)',
        },
        {
          flags: '--passphrase <passphrase>',
          description: 'SSH key passphrase',
        },
        {
          flags: '--command <command>',
          description: 'Command to execute',
        },
        {
          flags: '-s, --script <path>',
          description: 'Script file to execute',
        },
        {
          flags: '--parallel',
          description: 'Execute on hosts in parallel',
        },
        {
          flags: '--timeout <duration>',
          description: 'Command timeout',
          defaultValue: '30s',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive SSH session',
        },
        {
          flags: '--copy-id',
          description: 'Copy SSH key to remote hosts',
        },
        {
          flags: '-L, --forward <spec>',
          description: 'Local port forwarding (local:remote)',
        },
        {
          flags: '-R, --reverse <spec>',
          description: 'Reverse port forwarding (remote:local)',
        },
        {
          flags: '-D, --tunnel <port>',
          description: 'Dynamic SOCKS proxy tunnel',
        },
      ],
      examples: [
        {
          command: 'xec ssh server1.example.com -c "uptime"',
          description: 'Execute command on single host',
        },
        {
          command: 'xec ssh web1 web2 web3 -c "sudo systemctl restart nginx" --parallel',
          description: 'Execute command on multiple hosts in parallel',
        },
        {
          command: 'xec ssh server1.example.com -s ./deploy.sh',
          description: 'Execute script on remote host',
        },
        {
          command: 'xec ssh server1.example.com -i',
          description: 'Start interactive SSH session',
        },
        {
          command: 'xec ssh server1.example.com --copy-id',
          description: 'Copy SSH key to remote host',
        },
        {
          command: 'xec ssh server1.example.com -L 8080:localhost:80',
          description: 'Forward local port 8080 to remote port 80',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          user: z.string().optional(),
          port: z.coerce.number().positive().optional(),
          key: z.string().optional(),
          password: z.string().optional(),
          passphrase: z.string().optional(),
          command: z.string().optional(),
          script: z.string().optional(),
          parallel: z.boolean().optional(),
          timeout: z.string().optional(),
          interactive: z.boolean().optional(),
          copyId: z.boolean().optional(),
          tunnel: z.coerce.number().optional(),
          forward: z.string().optional(),
          reverse: z.string().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  async execute(args: any[]): Promise<void> {
    const hosts = args.slice(0, -1);
    const options = args[args.length - 1] as SSHOptions;

    if (hosts.length === 0) {
      throw errorMessages.configurationInvalid('hosts', 'At least one host is required');
    }

    // Validate options
    if (!options.command && !options.script && !options.interactive && !options.copyId) {
      throw errorMessages.configurationInvalid('command', 'Specify --command, --script, --interactive, or --copy-id');
    }

    this.intro(chalk.bgBlue(' SSH Execution '));

    // Handle different modes
    if (options.copyId) {
      await this.copySSHKey(hosts, options);
    } else if (options.interactive) {
      if (hosts.length > 1) {
        throw errorMessages.configurationInvalid('hosts', 'Interactive mode supports only one host');
      }
      await this.interactiveSession(hosts[0], options);
    } else if (options.parallel && hosts.length > 1) {
      await this.executeParallel(hosts, options);
    } else {
      await this.executeSequential(hosts, options);
    }

    this.outro(chalk.green('✓ SSH execution completed'));
  }

  private async executeSequential(hosts: string[], options: SSHOptions): Promise<void> {
    for (const host of hosts) {
      await this.executeOnHost(host, options);
    }
  }

  private async executeParallel(hosts: string[], options: SSHOptions): Promise<void> {
    const promises = hosts.map(host => this.executeOnHost(host, options));
    await Promise.all(promises);
  }

  private async executeOnHost(host: string, options: SSHOptions): Promise<void> {
    this.startSpinner(`Connecting to ${host}`);

    try {
      // Create SSH engine
      const $ssh = $.ssh({
        host,
        username: options.user || process.env['USER'] || 'root',
        port: options.port,
        privateKey: options.key,
        password: options.password,
        passphrase: options.passphrase,
      });

      // Set timeout if specified
      const engine = $ssh;
      if (options.timeout) {
        const timeoutMs = parseTimeout(options.timeout);
        // Note: SSH adapter may handle timeout differently
        // engine = engine.timeout(timeoutMs);
      }

      // Execute command or script
      let result;
      if (options.command) {
        result = await engine`${options.command}`;
      } else if (options.script) {
        const script = await this.readScript(options.script);
        result = await engine`${script}`;
      }

      this.stopSpinner();

      if (result) {
        this.log(`${chalk.green('✓')} ${host}:`, 'success');
        if (result.stdout) {
          this.output(result.stdout.trim(), 'Output');
        }
        if (result.stderr && this.isVerbose()) {
          this.log(result.stderr.trim(), 'error');
        }
      }
    } catch (error) {
      this.stopSpinner();
      this.log(`${chalk.red('✗')} ${host}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      if (!options.parallel) {
        throw error;
      }
    }
  }

  private async interactiveSession(host: string, options: SSHOptions): Promise<void> {
    this.log(`Starting interactive session to ${host}...`, 'info');

    // Build SSH command
    const sshArgs = ['ssh'];

    if (options.port && options.port !== 22) {
      sshArgs.push('-p', options.port.toString());
    }

    if (options.key) {
      sshArgs.push('-i', options.key);
    }

    if (options.forward) {
      sshArgs.push('-L', options.forward);
    }

    if (options.reverse) {
      sshArgs.push('-R', options.reverse);
    }

    if (options.tunnel) {
      sshArgs.push('-D', options.tunnel.toString());
    }

    sshArgs.push(`${options.user || process.env['USER'] || 'root'}@${host}`);

    // Use local $ for interactive session
    const result = await $.local()`${sshArgs.join(' ')}`.interactive();

    if (result.exitCode !== 0) {
      throw new Error(`SSH session ended with exit code ${result.exitCode}`);
    }
  }

  private async copySSHKey(hosts: string[], options: SSHOptions): Promise<void> {
    for (const host of hosts) {
      this.startSpinner(`Copying SSH key to ${host}`);

      try {
        const sshCopyArgs = ['ssh-copy-id'];

        if (options.port && options.port !== 22) {
          sshCopyArgs.push('-p', options.port.toString());
        }

        if (options.key) {
          sshCopyArgs.push('-i', options.key);
        }

        sshCopyArgs.push(`${options.user || process.env['USER'] || 'root'}@${host}`);

        const result = await $`${sshCopyArgs.join(' ')}`;

        this.stopSpinner();

        if (result.exitCode === 0) {
          this.log(`${chalk.green('✓')} SSH key copied to ${host}`, 'success');
        } else {
          throw new Error(result.stderr || 'Failed to copy SSH key');
        }
      } catch (error) {
        this.stopSpinner();
        this.log(`${chalk.red('✗')} Failed to copy key to ${host}: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    }
  }

  private async readScript(scriptPath: string): Promise<string> {
    const fs = await import('fs/promises');
    try {
      return await fs.readFile(scriptPath, 'utf-8');
    } catch (error) {
      throw errorMessages.fileNotFound(scriptPath);
    }
  }

}

export default function sshCommand(program: Command): void {
  const sshCmd = new SSHCommand();
  program.addCommand(sshCmd.create());
}