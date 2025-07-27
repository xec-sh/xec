import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { getConfig } from '../utils/config.js';
import { BaseCommand } from '../utils/command-base.js';

interface K8sExecOptions {
  namespace?: string;
  container?: string;
  interactive?: boolean;
  tty?: boolean;
  stdin?: boolean;
}

interface K8sLogsOptions {
  namespace?: string;
  container?: string;
  follow?: boolean;
  tail?: number;
  timestamps?: boolean;
  previous?: boolean;
  since?: string;
  sinceTime?: string;
}

interface K8sPortForwardOptions {
  namespace?: string;
  local?: number;
}

interface K8sGetOptions {
  namespace?: string;
  output?: 'json' | 'yaml' | 'wide' | 'name';
  selector?: string;
  allNamespaces?: boolean;
  watch?: boolean;
}

class K8sCommand extends BaseCommand {
  constructor() {
    super({
      name: 'k8s',
      description: 'Kubernetes operations'
    });
  }

  override create(): Command {
    const k8s = super.create();

    // Subcommands
    this.addExecCommand(k8s);
    this.addLogsCommand(k8s);
    this.addPortForwardCommand(k8s);
    this.addGetCommand(k8s);
    this.addDescribeCommand(k8s);
    this.addApplyCommand(k8s);
    this.addDeleteCommand(k8s);
    this.addScaleCommand(k8s);

    return k8s;
  }

  private addExecCommand(k8s: Command): void {
    k8s
      .command('exec <pod> [command...]')
      .description('Execute command in a pod')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('--container <container>', 'Container name')
      .option('-i, --interactive', 'Keep stdin open')
      .option('-t, --tty', 'Allocate a TTY')
      .option('--stdin', 'Pass stdin to the container')
      .action(async (pod: string, command: string[], options: K8sExecOptions) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          if (command.length === 0) {
            command = ['/bin/sh']; // Default to shell
            options.interactive = true;
            options.tty = true;
          }

          const k8sEngine = $.k8s({
            pod,
            namespace,
            container: options.container,
            tty: options.tty
          });

          if (options.interactive && options.tty) {
            // For interactive mode, use kubectl directly
            const args = ['exec', '-n', namespace];
            if (options.container) args.push('-c', options.container);
            args.push('-it', pod, '--', ...command);
            
            const result = await $`kubectl ${args.join(' ')}`.interactive();
            if (result.exitCode !== 0) {
              throw new Error(`Command failed with exit code ${result.exitCode}`);
            }
          } else {
            const result = await k8sEngine`${command.join(' ')}`;
            console.log(result.stdout);
            if (result.stderr && this.isVerbose()) {
              console.error(chalk.yellow(result.stderr));
            }
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addLogsCommand(k8s: Command): void {
    k8s
      .command('logs <pod>')
      .description('Print pod logs')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('--container <container>', 'Container name')
      .option('-f, --follow', 'Follow log output')
      .option('--tail <lines>', 'Lines of recent log to display', '50')
      .option('-t, --timestamps', 'Include timestamps')
      .option('-p, --previous', 'Print previous container logs')
      .option('--since <duration>', 'Only return logs newer than duration (e.g. 5m, 2h)')
      .option('--since-time <timestamp>', 'Only return logs after a specific date')
      .action(async (pod: string, options: K8sLogsOptions) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const k8s = $.k8s({ namespace, pod } as any);
          const podInstance = k8s.pod(pod);

          if (options.follow) {
            this.log(`Following logs for ${pod} (Ctrl+C to stop)...`, 'info');
            
            const stream = await podInstance.follow(
              (line: string) => console.log(line.trim()),
              {
                container: options.container,
                tail: options.tail ? Number(options.tail) : undefined,
                timestamps: options.timestamps
              }
            );

            // Handle Ctrl+C
            process.on('SIGINT', () => {
              stream.stop();
              process.exit(0);
            });

            // Keep process alive
            await new Promise(() => {});
          } else {
            const logs = await podInstance.logs({
              container: options.container,
              tail: options.tail,
              previous: options.previous,
              timestamps: options.timestamps
            });

            console.log(logs);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addPortForwardCommand(k8s: Command): void {
    k8s
      .command('port-forward <pod> <ports...>')
      .alias('forward')
      .description('Forward local ports to a pod')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('-l, --local <port>', 'Local port (for single port forward)')
      .action(async (pod: string, ports: string[], options: K8sPortForwardOptions) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const k8s = $.k8s({ namespace, pod } as any);
          const podInstance = k8s.pod(pod);

          // Parse port mappings
          const portMappings: Array<{ local: number; remote: number }> = [];
          
          for (const port of ports) {
            if (port.includes(':')) {
              const parts = port.split(':');
              if (parts.length >= 2 && parts[0] && parts[1]) {
                const local = parseInt(parts[0], 10);
                const remote = parseInt(parts[1], 10);
                if (!isNaN(local) && !isNaN(remote)) {
                  portMappings.push({ local, remote });
                }
              }
            } else {
              const remotePort = parseInt(port, 10);
              if (!isNaN(remotePort)) {
                const localPort = typeof options.local === 'number' ? options.local : remotePort;
                portMappings.push({ local: localPort, remote: remotePort });
              }
            }
          }

          this.log(`Setting up port forwarding for ${pod}...`, 'info');

          // Create port forwards
          const forwards = await Promise.all(
            portMappings.map(async ({ local, remote }) => {
              const forward = local === 0 
                ? await podInstance.portForwardDynamic(remote)
                : await podInstance.portForward(local, remote);
              
              this.log(
                `  ${chalk.green('✓')} Forwarding localhost:${forward.localPort} → ${pod}:${remote}`,
                'success'
              );
              
              return forward;
            })
          );

          this.log('\nPort forwarding established. Press Ctrl+C to stop.', 'info');

          // Handle cleanup on exit
          const cleanup = async () => {
            this.log('\nClosing port forwards...', 'info');
            await Promise.all(forwards.map(f => f.close()));
            process.exit(0);
          };

          process.on('SIGINT', cleanup);
          process.on('SIGTERM', cleanup);

          // Keep process alive
          await new Promise(() => {});
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addGetCommand(k8s: Command): void {
    k8s
      .command('get <resource> [name]')
      .description('Display resources')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('-o, --output <format>', 'Output format (json|yaml|wide|name)')
      .option('-l, --selector <selector>', 'Label selector')
      .option('-A, --all-namespaces', 'List objects across all namespaces')
      .option('-w, --watch', 'Watch for changes')
      .action(async (resource: string, name: string | undefined, options: K8sGetOptions) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const args = ['get', resource];
          if (name) args.push(name);
          
          if (!options.allNamespaces) {
            args.push('-n', namespace);
          } else {
            args.push('-A');
          }

          if (options.output) args.push('-o', options.output);
          if (options.selector) args.push('-l', options.selector);
          if (options.watch) args.push('-w');

          if (options.watch) {
            this.log(`Watching ${resource} (Ctrl+C to stop)...`, 'info');
            await $`kubectl ${args.join(' ')}`.interactive();
          } else {
            const result = await $`kubectl ${args.join(' ')}`;
            console.log(result.stdout);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addDescribeCommand(k8s: Command): void {
    k8s
      .command('describe <resource> <name>')
      .description('Show details of a specific resource')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .action(async (resource: string, name: string, options) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const args = ['describe', resource, name, '-n', namespace];
          const result = await $`kubectl ${args.join(' ')}`;
          console.log(result.stdout);
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addApplyCommand(k8s: Command): void {
    k8s
      .command('apply <file>')
      .description('Apply a configuration to a resource')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('-f, --filename <filename>', 'Filename, directory, or URL to files')
      .option('--dry-run', 'Print object that would be sent')
      .action(async (file: string, options) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const args = ['apply', '-f', file, '-n', namespace];
          if (options.dryRun) args.push('--dry-run=client', '-o', 'yaml');

          this.startSpinner(`Applying ${file}...`);
          const result = await $`kubectl ${args.join(' ')}`;
          this.stopSpinner();

          if (options.dryRun) {
            console.log(result.stdout);
          } else {
            this.log(chalk.green('✓ Configuration applied'), 'success');
            if (result.stdout) {
              console.log(result.stdout);
            }
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addDeleteCommand(k8s: Command): void {
    k8s
      .command('delete <resource> <name>')
      .description('Delete resources')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('-f, --filename <filename>', 'Delete resources from file')
      .option('--force', 'Force deletion')
      .option('--grace-period <seconds>', 'Grace period for deletion')
      .action(async (resource: string, name: string, options) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const confirmed = await clack.confirm({
            message: `Delete ${resource}/${name} in namespace ${namespace}?`,
            initialValue: false
          });

          if (!confirmed) {
            this.log('Deletion cancelled', 'info');
            return;
          }

          const args = ['delete', resource, name, '-n', namespace];
          if (options.force) args.push('--force');
          if (options.gracePeriod) args.push('--grace-period', options.gracePeriod);

          this.startSpinner(`Deleting ${resource}/${name}...`);
          const result = await $`kubectl ${args.join(' ')}`;
          this.stopSpinner();

          this.log(chalk.green(`✓ ${result.stdout.trim()}`), 'success');
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addScaleCommand(k8s: Command): void {
    k8s
      .command('scale <resource> <name>')
      .description('Scale a deployment, replicaset, or statefulset')
      .option('-n, --namespace <namespace>', 'Kubernetes namespace')
      .option('--replicas <count>', 'Number of replicas', '1')
      .action(async (resource: string, name: string, options) => {
        try {
          const config = getConfig();
          const namespace = options.namespace || 
                          config.getValue('kubernetes.defaults.namespace') || 
                          'default';

          const args = [
            'scale',
            resource,
            name,
            '--replicas',
            options.replicas,
            '-n',
            namespace
          ];

          this.startSpinner(`Scaling ${resource}/${name} to ${options.replicas} replicas...`);
          const result = await $`kubectl ${args.join(' ')}`;
          this.stopSpinner();

          this.log(chalk.green(`✓ ${result.stdout.trim()}`), 'success');
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  override async execute(): Promise<void> {
    // This is called when 'k8s' is run without subcommands
    const program = this.create();
    program.outputHelp();
  }
}

export default function k8sCommand(program: Command): void {
  const k8s = new K8sCommand();
  program.addCommand(k8s.create());
}