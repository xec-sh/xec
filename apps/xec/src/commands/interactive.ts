import { z } from 'zod';
import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';
import { validateOptions } from '../utils/validation.js';

interface InteractiveOptions {
  verbose?: boolean;
}

type TaskType = 'execute' | 'copy' | 'forward' | 'logs';
type LocationType = 'local' | 'ssh' | 'docker' | 'kubernetes';

class InteractiveCommand extends BaseCommand {
  constructor() {
    super({
      name: 'interactive',
      description: 'Interactive mode for building and executing commands',
      aliases: ['i'],
      arguments: '',
      options: [],
      examples: [
        {
          command: 'xec interactive',
          description: 'Start interactive mode'
        },
        {
          command: 'xec i',
          description: 'Start interactive mode (alias)'
        }
      ],
      validateOptions: (options) => {
        const schema = z.object({
          verbose: z.boolean().optional()
        });
        validateOptions(options, schema);
      }
    });
  }

  override async execute(args: any[]): Promise<void> {
    const options = args[args.length - 1] as InteractiveOptions;
    
    clack.intro(chalk.bgBlue(' Xec Interactive Mode '));
    
    try {
      await this.runInteractive();
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        clack.outro(chalk.gray('Cancelled'));
      } else {
        throw error;
      }
    }
  }

  private async runInteractive(): Promise<void> {
    const config = getConfig();
    
    // Main task selection
    const taskType = await clack.select({
      message: 'What do you want to do?',
      options: [
        { value: 'execute', label: 'Execute a command' },
        { value: 'copy', label: 'Copy files' },
        { value: 'forward', label: 'Set up port forwarding' },
        { value: 'logs', label: 'View logs' },
        { value: 'exit', label: 'Exit' }
      ]
    }) as TaskType | 'exit';

    if (taskType === 'exit' || clack.isCancel(taskType)) {
      clack.outro(chalk.gray('Goodbye!'));
      return;
    }

    switch (taskType) {
      case 'execute':
        await this.executeCommand();
        break;
      case 'copy':
        await this.copyFiles();
        break;
      case 'forward':
        await this.portForward();
        break;
      case 'logs':
        await this.viewLogs();
        break;
    }

    // Ask if user wants to continue
    const continueChoice = await clack.confirm({
      message: 'Do you want to perform another task?'
    });

    if (continueChoice) {
      await this.runInteractive();
    } else {
      clack.outro(chalk.green('✓ Done!'));
    }
  }

  private async executeCommand(): Promise<void> {
    const config = getConfig();
    
    // Select location
    const locationType = await clack.select({
      message: 'Where do you want to run the command?',
      options: [
        { value: 'local', label: 'Local machine' },
        { value: 'ssh', label: 'SSH host' },
        { value: 'docker', label: 'Docker container' },
        { value: 'kubernetes', label: 'Kubernetes pod' }
      ]
    }) as LocationType;

    if (clack.isCancel(locationType)) return;

    let executionContext: any;
    let displayName: string;

    switch (locationType) {
      case 'ssh':
        const sshHost = await this.selectSSHHost();
        if (!sshHost) return;
        executionContext = $.ssh(sshHost.config);
        displayName = sshHost.name;
        break;

      case 'docker':
        const container = await this.selectDockerContainer();
        if (!container) return;
        executionContext = $.docker({ container });
        displayName = container;
        break;

      case 'kubernetes':
        const pod = await this.selectKubernetesPod();
        if (!pod) return;
        executionContext = $.k8s(pod.options);
        displayName = `${pod.name} (${pod.namespace})`;
        break;

      default:
        executionContext = $;
        displayName = 'local';
    }

    // Get command to execute
    const command = await clack.text({
      message: 'Enter the command to execute:',
      placeholder: 'ls -la',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Command cannot be empty';
        }
        return undefined;
      }
    });

    if (clack.isCancel(command)) return;

    // Execute command
    const spinner = clack.spinner();
    spinner.start(`Executing on ${displayName}...`);

    try {
      const result = await executionContext`${command}`;
      spinner.stop(`Executed on ${displayName}`);
      
      if (result.stdout) {
        clack.log.success('Output:');
        console.log(result.stdout);
      }
      
      if (result.stderr) {
        clack.log.warning('Errors:');
        console.log(result.stderr);
      }
    } catch (error) {
      spinner.stop('Execution failed');
      clack.log.error(error instanceof Error ? error.message : String(error));
    }
  }

  private async copyFiles(): Promise<void> {
    // Get source
    const source = await clack.text({
      message: 'Enter source path:',
      placeholder: './file.txt or host:/path/file.txt',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Source path cannot be empty';
        }
        return undefined;
      }
    });

    if (clack.isCancel(source)) return;

    // Get destination
    const destination = await clack.text({
      message: 'Enter destination path:',
      placeholder: './dest/ or host:/path/dest/',
      validate: (value) => {
        if (!value || value.trim().length === 0) {
          return 'Destination path cannot be empty';
        }
        return undefined;
      }
    });

    if (clack.isCancel(destination)) return;

    // Copy options
    const recursive = await clack.confirm({
      message: 'Copy recursively?',
      initialValue: false
    });

    if (clack.isCancel(recursive)) return;

    // Build command
    const command = ['xec', 'copy'];
    if (recursive) command.push('-r');
    command.push(source, destination);

    // Show command
    clack.log.info(`Command: ${chalk.cyan(command.join(' '))}`);

    const execute = await clack.confirm({
      message: 'Execute this command?'
    });

    if (execute) {
      const spinner = clack.spinner();
      spinner.start('Copying files...');

      try {
        // Execute using child process to run actual xec command
        const { execSync } = await import('child_process');
        execSync(command.join(' '), { stdio: 'pipe' });
        spinner.stop('Files copied successfully');
      } catch (error) {
        spinner.stop('Copy failed');
        clack.log.error(error instanceof Error ? error.message : String(error));
      }
    }
  }

  private async portForward(): Promise<void> {
    // Select source type
    const sourceType = await clack.select({
      message: 'What do you want to forward?',
      options: [
        { value: 'ssh', label: 'SSH tunnel' },
        { value: 'kubernetes', label: 'Kubernetes pod' },
        { value: 'docker', label: 'Docker container' }
      ]
    }) as 'ssh' | 'kubernetes' | 'docker';

    if (clack.isCancel(sourceType)) return;

    let source: string;
    
    switch (sourceType) {
      case 'ssh':
        const sshHost = await this.selectSSHHost();
        if (!sshHost) return;
        
        const remotePort = await clack.text({
          message: 'Enter remote port:',
          placeholder: '3306',
          validate: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1 || port > 65535) {
              return 'Please enter a valid port number (1-65535)';
            }
            return undefined;
          }
        });
        
        if (clack.isCancel(remotePort)) return;
        source = `${sshHost.name}:${remotePort}`;
        break;

      case 'kubernetes':
        const pod = await this.selectKubernetesPod();
        if (!pod) return;
        
        const podPort = await clack.text({
          message: 'Enter pod port:',
          placeholder: '80',
          validate: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1 || port > 65535) {
              return 'Please enter a valid port number (1-65535)';
            }
            return undefined;
          }
        });
        
        if (clack.isCancel(podPort)) return;
        source = `pod:${pod.name}:${podPort}`;
        break;

      case 'docker':
        const container = await this.selectDockerContainer();
        if (!container) return;
        
        const containerPort = await clack.text({
          message: 'Enter container port:',
          placeholder: '8080',
          validate: (value) => {
            const port = parseInt(value);
            if (isNaN(port) || port < 1 || port > 65535) {
              return 'Please enter a valid port number (1-65535)';
            }
            return undefined;
          }
        });
        
        if (clack.isCancel(containerPort)) return;
        source = `container:${container}:${containerPort}`;
        break;
    }

    // Get local port
    const localPortChoice = await clack.select({
      message: 'Local port configuration:',
      options: [
        { value: 'same', label: 'Use same port as remote' },
        { value: 'custom', label: 'Specify custom port' },
        { value: 'dynamic', label: 'Use dynamic port allocation' }
      ]
    }) as 'same' | 'custom' | 'dynamic';

    if (clack.isCancel(localPortChoice)) return;

    let localPort: string | undefined;
    
    if (localPortChoice === 'custom') {
      localPort = await clack.text({
        message: 'Enter local port:',
        placeholder: '8080',
        validate: (value) => {
          const port = parseInt(value);
          if (isNaN(port) || port < 1 || port > 65535) {
            return 'Please enter a valid port number (1-65535)';
          }
          return undefined;
        }
      }) as string;
      
      if (clack.isCancel(localPort)) return;
    }

    // Build command
    const command = ['xec', 'forward'];
    if (localPortChoice === 'dynamic') command.push('-d');
    command.push(source!);
    if (localPort) command.push(localPort);

    // Show command
    clack.log.info(`Command: ${chalk.cyan(command.join(' '))}`);

    const execute = await clack.confirm({
      message: 'Set up this port forward?'
    });

    if (execute) {
      clack.log.info('Port forward command prepared. Run it in a separate terminal:');
      console.log(chalk.green(command.join(' ')));
    }
  }

  private async viewLogs(): Promise<void> {
    // Select source type
    const sourceType = await clack.select({
      message: 'Where do you want to view logs from?',
      options: [
        { value: 'docker', label: 'Docker container' },
        { value: 'kubernetes', label: 'Kubernetes pod' },
        { value: 'ssh', label: 'Remote file (SSH)' }
      ]
    }) as 'docker' | 'kubernetes' | 'ssh';

    if (clack.isCancel(sourceType)) return;

    let source: string;
    
    switch (sourceType) {
      case 'docker':
        const container = await this.selectDockerContainer();
        if (!container) return;
        source = `container:${container}`;
        break;

      case 'kubernetes':
        const pod = await this.selectKubernetesPod();
        if (!pod) return;
        source = `pod:${pod.name}`;
        break;

      case 'ssh':
        const sshHost = await this.selectSSHHost();
        if (!sshHost) return;
        
        const logPath = await clack.text({
          message: 'Enter log file path:',
          placeholder: '/var/log/app.log'
        });
        
        if (clack.isCancel(logPath)) return;
        source = `${sshHost.name}:${logPath}`;
        break;
    }

    // Log options
    const follow = await clack.confirm({
      message: 'Follow log output (stream new logs)?',
      initialValue: false
    });

    if (clack.isCancel(follow)) return;

    const tail = await clack.text({
      message: 'Number of lines to show:',
      placeholder: '10',
      initialValue: '10'
    });

    if (clack.isCancel(tail)) return;

    // Build command
    const command = ['xec', 'logs'];
    if (follow) command.push('-f');
    command.push('--tail', tail);
    command.push(source!);

    // Show command
    clack.log.info(`Command: ${chalk.cyan(command.join(' '))}`);

    const execute = await clack.confirm({
      message: 'View these logs?'
    });

    if (execute) {
      if (follow) {
        clack.log.info('Log streaming command prepared. Run it in a separate terminal:');
        console.log(chalk.green(command.join(' ')));
      } else {
        // For non-streaming logs, we can execute directly
        const spinner = clack.spinner();
        spinner.start('Fetching logs...');

        try {
          const { execSync } = await import('child_process');
          const output = execSync(command.join(' '), { encoding: 'utf-8' });
          spinner.stop('Logs fetched');
          console.log(output);
        } catch (error) {
          spinner.stop('Failed to fetch logs');
          clack.log.error(error instanceof Error ? error.message : String(error));
        }
      }
    }
  }

  private async selectSSHHost(): Promise<{ name: string; config: any } | null> {
    const config = getConfig();
    const hosts = config.getHosts();

    if (Object.keys(hosts).length === 0) {
      const customHost = await clack.text({
        message: 'Enter SSH host:',
        placeholder: 'user@hostname or hostname'
      });

      if (clack.isCancel(customHost)) return null;

      const [user, host] = customHost.includes('@') 
        ? customHost.split('@') 
        : [process.env['USER'] || 'root', customHost];

      return {
        name: customHost,
        config: { host, username: user }
      };
    }

    const hostChoices = [
      ...Object.keys(hosts).map((name: string) => ({ value: name, label: name })),
      { value: '_custom_', label: 'Enter custom host...' }
    ];

    const selected = await clack.select({
      message: 'Select SSH host:',
      options: hostChoices
    }) as string;

    if (clack.isCancel(selected)) return null;

    if (selected === '_custom_') {
      const customHost = await clack.text({
        message: 'Enter SSH host:',
        placeholder: 'user@hostname or hostname'
      });

      if (clack.isCancel(customHost)) return null;

      const [user, host] = customHost.includes('@') 
        ? customHost.split('@') 
        : [process.env['USER'] || 'root', customHost];

      return {
        name: customHost,
        config: { host, username: user }
      };
    }

    const hostConfig = config.getSSHHost(selected);
    return { name: selected, config: hostConfig };
  }

  private async selectDockerContainer(): Promise<string | null> {
    const config = getConfig();
    const containers = config.getContainers();

    if (Object.keys(containers).length === 0) {
      const containerName = await clack.text({
        message: 'Enter container name:',
        placeholder: 'myapp'
      });

      return clack.isCancel(containerName) ? null : containerName;
    }

    const containerChoices = [
      ...Object.keys(containers).map((name: string) => ({ value: name, label: name })),
      { value: '_custom_', label: 'Enter custom container...' }
    ];

    const selected = await clack.select({
      message: 'Select Docker container:',
      options: containerChoices
    }) as string;

    if (clack.isCancel(selected)) return null;

    if (selected === '_custom_') {
      const containerName = await clack.text({
        message: 'Enter container name:',
        placeholder: 'myapp'
      });

      return clack.isCancel(containerName) ? null : containerName;
    }

    return selected;
  }

  private async selectKubernetesPod(): Promise<{ name: string; namespace: string; options: any } | null> {
    const config = getConfig();
    const pods = config.getPods();

    const namespace = await clack.text({
      message: 'Enter namespace:',
      placeholder: 'default',
      initialValue: 'default'
    });

    if (clack.isCancel(namespace)) return null;

    if (Object.keys(pods).length === 0) {
      const podName = await clack.text({
        message: 'Enter pod name:',
        placeholder: 'myapp-pod'
      });

      if (clack.isCancel(podName)) return null;

      return {
        name: podName,
        namespace,
        options: { pod: podName, namespace }
      };
    }

    const podChoices = [
      ...Object.keys(pods).map((name: string) => ({ value: name, label: name })),
      { value: '_custom_', label: 'Enter custom pod...' }
    ];

    const selected = await clack.select({
      message: 'Select Kubernetes pod:',
      options: podChoices
    }) as string;

    if (clack.isCancel(selected)) return null;

    if (selected === '_custom_') {
      const podName = await clack.text({
        message: 'Enter pod name:',
        placeholder: 'myapp-pod'
      });

      if (clack.isCancel(podName)) return null;

      return {
        name: podName,
        namespace,
        options: { pod: podName, namespace }
      };
    }

    const podConfig = config.getPods()[selected];
    return {
      name: selected,
      namespace: podConfig?.namespace || namespace,
      options: { pod: podConfig?.name || selected, namespace: podConfig?.namespace || namespace }
    };
  }
}

export default function interactiveCommand(program: Command): void {
  const cmd = new InteractiveCommand();
  program.addCommand(cmd.create());
}