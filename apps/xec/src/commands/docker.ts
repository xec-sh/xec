import chalk from 'chalk';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';

import { BaseCommand } from '../utils/command-base.js';

interface DockerExecOptions {
  interactive?: boolean;
  tty?: boolean;
  user?: string;
  workdir?: string;
  env?: string[];
  detach?: boolean;
}

interface DockerRunOptions {
  detach?: boolean;
  port?: string[];
  volume?: string[];
  env?: string[];
  name?: string;
  rm?: boolean;
  network?: string;
  restart?: string;
  user?: string;
  workdir?: string;
  memory?: string;
  cpus?: string;
  interactive?: boolean;
  tty?: boolean;
}

interface DockerLogsOptions {
  follow?: boolean;
  tail?: number;
  timestamps?: boolean;
  since?: string;
  until?: string;
}

class DockerCommand extends BaseCommand {
  constructor() {
    super({
      name: 'docker',
      description: 'Docker container operations'
    });
  }

  override create(): Command {
    const docker = super.create();

    // Subcommands
    this.addExecCommand(docker);
    this.addPsCommand(docker);
    this.addLogsCommand(docker);
    this.addStartStopCommands(docker);
    this.addRunCommand(docker);
    this.addComposeCommand(docker);
    this.addInspectCommand(docker);

    return docker;
  }

  private addExecCommand(docker: Command): void {
    docker
      .command('exec <container> [command...]')
      .description('Execute command in a running container')
      .option('-i, --interactive', 'Keep STDIN open')
      .option('-t, --tty', 'Allocate a pseudo-TTY')
      .option('-u, --user <user>', 'Username or UID')
      .option('-w, --workdir <path>', 'Working directory inside the container')
      .option('-e, --env <key=value>', 'Set environment variables', (val, acc: string[]) => [...acc, val], [])
      .option('-d, --detach', 'Detached mode: run command in the background')
      .action(async (container: string, command: string[], options: DockerExecOptions) => {
        try {
          if (command.length === 0) {
            command = ['/bin/sh']; // Default to shell if no command
            options.interactive = true;
            options.tty = true;
          }

          const dockerEngine = $.docker({ container });

          // Build docker exec arguments
          const execArgs = ['exec'];
          
          if (options.interactive && options.tty) {
            execArgs.push('-it');
          } else {
            if (options.interactive) execArgs.push('-i');
            if (options.tty) execArgs.push('-t');
          }

          if (options.detach) execArgs.push('-d');
          if (options.user) execArgs.push('-u', options.user);
          if (options.workdir) execArgs.push('-w', options.workdir);
          
          if (options.env) {
            options.env.forEach(env => execArgs.push('-e', env));
          }

          execArgs.push(container, ...command);

          // For interactive mode, use local docker directly
          if (options.interactive && options.tty) {
            const result = await $`docker ${execArgs.join(' ')}`.interactive();
            if (result.exitCode !== 0) {
              throw new Error(`Command failed with exit code ${result.exitCode}`);
            }
          } else {
            const result = await dockerEngine`${command.join(' ')}`;
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

  private addPsCommand(docker: Command): void {
    docker
      .command('ps')
      .alias('list')
      .description('List containers')
      .option('-a, --all', 'Show all containers (default shows just running)')
      .option('-q, --quiet', 'Only display container IDs')
      .option('-s, --size', 'Display total file sizes')
      .option('-f, --filter <filter>', 'Filter output based on conditions', (val, acc: string[]) => [...acc, val], [])
      .option('--format <format>', 'Format the output')
      .action(async (options) => {
        try {
          const args = ['ps'];
          if (options.all) args.push('-a');
          if (options.quiet) args.push('-q');
          if (options.size) args.push('-s');
          if (options.filter) {
            options.filter.forEach((f: string) => args.push('-f', f));
          }
          if (options.format) args.push('--format', options.format);

          const result = await $`docker ${args.join(' ')}`;
          console.log(result.stdout);
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addLogsCommand(docker: Command): void {
    docker
      .command('logs <container>')
      .description('Fetch container logs')
      .option('-f, --follow', 'Follow log output')
      .option('-t, --timestamps', 'Show timestamps')
      .option('--tail <lines>', 'Number of lines to show from the end', '50')
      .option('--since <timestamp>', 'Show logs since timestamp')
      .option('--until <timestamp>', 'Show logs before timestamp')
      .action(async (container: string, options: DockerLogsOptions) => {
        try {
          const args = ['logs'];
          if (options.follow) args.push('-f');
          if (options.timestamps) args.push('-t');
          if (options.tail) args.push('--tail', String(options.tail));
          if (options.since) args.push('--since', options.since);
          if (options.until) args.push('--until', options.until);
          args.push(container);

          if (options.follow) {
            // For follow mode, stream the output
            this.log(`Following logs for ${container} (Ctrl+C to stop)...`, 'info');
            await $`docker ${args.join(' ')}`.interactive();
          } else {
            const result = await $`docker ${args.join(' ')}`;
            console.log(result.stdout);
            if (result.stderr) {
              console.error(chalk.yellow(result.stderr));
            }
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addStartStopCommands(docker: Command): void {
    // Start command
    docker
      .command('start <containers...>')
      .description('Start one or more stopped containers')
      .option('-a, --attach', 'Attach to container output')
      .option('-i, --interactive', 'Attach container\'s STDIN')
      .action(async (containers: string[], options) => {
        try {
          for (const container of containers) {
            this.startSpinner(`Starting ${container}...`);
            const args = ['start'];
            if (options.attach) args.push('-a');
            if (options.interactive) args.push('-i');
            args.push(container);
            
            await $`docker ${args.join(' ')}`;
            this.stopSpinner();
            this.log(`${chalk.green('✓')} Started ${container}`, 'success');
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Stop command
    docker
      .command('stop <containers...>')
      .description('Stop one or more running containers')
      .option('-t, --time <seconds>', 'Seconds to wait before killing', '10')
      .action(async (containers: string[], options) => {
        try {
          for (const container of containers) {
            this.startSpinner(`Stopping ${container}...`);
            const args = ['stop'];
            if (options.time) args.push('-t', options.time);
            args.push(container);
            
            await $`docker ${args.join(' ')}`;
            this.stopSpinner();
            this.log(`${chalk.green('✓')} Stopped ${container}`, 'success');
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Restart command
    docker
      .command('restart <containers...>')
      .description('Restart one or more containers')
      .option('-t, --time <seconds>', 'Seconds to wait before killing', '10')
      .action(async (containers: string[], options) => {
        try {
          for (const container of containers) {
            this.startSpinner(`Restarting ${container}...`);
            const args = ['restart'];
            if (options.time) args.push('-t', options.time);
            args.push(container);
            
            await $`docker ${args.join(' ')}`;
            this.stopSpinner();
            this.log(`${chalk.green('✓')} Restarted ${container}`, 'success');
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addRunCommand(docker: Command): void {
    docker
      .command('run <image> [command...]')
      .description('Run a new container from an image')
      .option('-d, --detach', 'Run container in background')
      .option('-p, --port <mapping>', 'Publish a container\'s port(s)', (val, acc: string[]) => [...acc, val], [])
      .option('-v, --volume <mapping>', 'Bind mount a volume', (val, acc: string[]) => [...acc, val], [])
      .option('-e, --env <key=value>', 'Set environment variables', (val, acc: string[]) => [...acc, val], [])
      .option('--name <name>', 'Container name')
      .option('--rm', 'Remove container after exit')
      .option('--network <network>', 'Connect to a network')
      .option('--restart <policy>', 'Restart policy')
      .option('-u, --user <user>', 'Username or UID')
      .option('-w, --workdir <path>', 'Working directory')
      .option('-m, --memory <limit>', 'Memory limit')
      .option('--cpus <number>', 'Number of CPUs')
      .option('-i, --interactive', 'Keep STDIN open')
      .option('-t, --tty', 'Allocate a pseudo-TTY')
      .action(async (image: string, command: string[], options: DockerRunOptions) => {
        try {
          const args = ['run'];

          // Interactive/TTY handling
          if (command.length === 0 && !options.detach) {
            options.interactive = true;
            options.tty = true;
          }

          if (options.interactive && options.tty) {
            args.push('-it');
          } else {
            if (options.interactive) args.push('-i');
            if (options.tty) args.push('-t');
          }

          if (options.detach) args.push('-d');
          if (options.rm) args.push('--rm');
          if (options.name) args.push('--name', options.name);
          if (options.network) args.push('--network', options.network);
          if (options.restart) args.push('--restart', options.restart);
          if (options.user) args.push('-u', options.user);
          if (options.workdir) args.push('-w', options.workdir);
          if (options.memory) args.push('-m', options.memory);
          if (options.cpus) args.push('--cpus', options.cpus);

          if (options.port) {
            options.port.forEach(p => args.push('-p', p));
          }
          if (options.volume) {
            options.volume.forEach(v => args.push('-v', v));
          }
          if (options.env) {
            options.env.forEach(e => args.push('-e', e));
          }

          args.push(image);
          if (command.length > 0) {
            args.push(...command);
          }

          this.startSpinner(`Running container from ${image}...`);
          
          if (options.interactive && options.tty) {
            this.stopSpinner();
            await $`docker ${args.join(' ')}`.interactive();
          } else {
            const result = await $`docker ${args.join(' ')}`;
            this.stopSpinner();
            
            if (options.detach) {
              this.log(`${chalk.green('✓')} Container started: ${result.stdout.trim()}`, 'success');
            } else {
              console.log(result.stdout);
              if (result.stderr) {
                console.error(chalk.yellow(result.stderr));
              }
            }
          }
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addComposeCommand(docker: Command): void {
    const compose = docker
      .command('compose')
      .alias('dc')
      .description('Docker Compose operations');

    // Compose up
    compose
      .command('up')
      .description('Create and start containers')
      .option('-d, --detach', 'Detached mode')
      .option('-f, --file <file>', 'Compose file', 'docker-compose.yml')
      .option('--build', 'Build images before starting')
      .option('--force-recreate', 'Recreate containers')
      .option('--no-deps', 'Don\'t start linked services')
      .action(async (options) => {
        try {
          const args = ['compose'];
          if (options.file) args.push('-f', options.file);
          args.push('up');
          if (options.detach) args.push('-d');
          if (options.build) args.push('--build');
          if (options.forceRecreate) args.push('--force-recreate');
          if (options.noDeps) args.push('--no-deps');

          this.startSpinner('Starting services...');
          await $`docker ${args.join(' ')}`;
          this.stopSpinner();
          this.log(chalk.green('✓ Services started'), 'success');
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Compose down
    compose
      .command('down')
      .description('Stop and remove containers')
      .option('-f, --file <file>', 'Compose file', 'docker-compose.yml')
      .option('-v, --volumes', 'Remove volumes')
      .option('--rmi <type>', 'Remove images (all|local)')
      .action(async (options) => {
        try {
          const args = ['compose'];
          if (options.file) args.push('-f', options.file);
          args.push('down');
          if (options.volumes) args.push('-v');
          if (options.rmi) args.push('--rmi', options.rmi);

          this.startSpinner('Stopping services...');
          await $`docker ${args.join(' ')}`;
          this.stopSpinner();
          this.log(chalk.green('✓ Services stopped'), 'success');
        } catch (error) {
          this.stopSpinner();
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Compose ps
    compose
      .command('ps')
      .description('List containers')
      .option('-f, --file <file>', 'Compose file', 'docker-compose.yml')
      .option('-a, --all', 'Show all containers')
      .action(async (options) => {
        try {
          const args = ['compose'];
          if (options.file) args.push('-f', options.file);
          args.push('ps');
          if (options.all) args.push('-a');

          const result = await $`docker ${args.join(' ')}`;
          console.log(result.stdout);
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });

    // Compose logs
    compose
      .command('logs [service]')
      .description('View service logs')
      .option('--file <file>', 'Compose file', 'docker-compose.yml')
      .option('-f, --follow', 'Follow log output')
      .option('--tail <lines>', 'Number of lines to show')
      .action(async (service: string | undefined, options) => {
        try {
          const args = ['compose'];
          if (options.file) args.push('-f', options.file);
          args.push('logs');
          if (options.follow) args.push('-f');
          if (options.tail) args.push('--tail', options.tail);
          if (service) args.push(service);

          if (options.follow) {
            this.log('Following logs (Ctrl+C to stop)...', 'info');
            await $`docker ${args.join(' ')}`.interactive();
          } else {
            const result = await $`docker ${args.join(' ')}`;
            console.log(result.stdout);
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  private addInspectCommand(docker: Command): void {
    docker
      .command('inspect <object>')
      .description('Display detailed information about a container or image')
      .option('-f, --format <format>', 'Format the output using Go template')
      .action(async (object: string, options) => {
        try {
          const args = ['inspect'];
          if (options.format) args.push('-f', options.format);
          args.push(object);

          const result = await $`docker ${args.join(' ')}`;
          
          if (options.format) {
            console.log(result.stdout);
          } else {
            // Pretty print JSON
            const data = JSON.parse(result.stdout);
            console.log(JSON.stringify(data, null, 2));
          }
        } catch (error) {
          this.log(error instanceof Error ? error.message : String(error), 'error');
          process.exit(1);
        }
      });
  }

  override async execute(): Promise<void> {
    // This is called when 'docker' is run without subcommands
    const program = this.create();
    program.outputHelp();
  }
}

export default function dockerCommand(program: Command): void {
  const docker = new DockerCommand();
  program.addCommand(docker.create());
}