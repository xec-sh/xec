import { z } from 'zod';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import { log, note, text, intro, outro, prism, select, cancel, spinner, isCancel } from '@xec-sh/kit';

import { validateOptions } from '../utils/validation.js';
import { InteractiveOptions } from '../utils/interactive-helpers.js';
import { SubcommandBase, ConfigAwareOptions } from '../utils/command-base.js';

import type { CommandConfig, DockerDefaults } from '../config/types.js';

interface DockerOptions extends ConfigAwareOptions, InteractiveOptions {
  verbose?: boolean;
}

interface ContainerOptions extends ConfigAwareOptions {
  name?: string;
  image?: string;
  ports?: string[];
  volumes?: string[];
  env?: string[];
  network?: string;
  workdir?: string;
  user?: string;
  detached?: boolean;
  rm?: boolean;
  interactive?: boolean;
  tty?: boolean;
  restart?: string;
  labels?: string[];
  command?: string;
  entrypoint?: string;
  privileged?: boolean;
}

interface ServiceOptions extends ConfigAwareOptions {
  name?: string;
  port?: string;
  password?: string;
  user?: string;
  database?: string;
  version?: string;
  persistent?: boolean;
  dataPath?: string;
  configPath?: string;
  network?: string;
  env?: string[];
  labels?: string[];
  // Redis cluster specific
  masters?: string;
  replicas?: string;
  basePort?: string;
  // MongoDB specific
  rootUser?: string;
  rootPassword?: string;
  replicaSet?: string;
  // MySQL specific
  charset?: string;
  collation?: string;
  // PostgreSQL specific
  extensions?: string[];
  // Kafka specific
  zookeeper?: string;
  brokerId?: string;
  // RabbitMQ specific
  managementPort?: string;
  vhost?: string;
  // SSH specific
  pubkey?: string;
  privateKey?: string;
  authorizedKeys?: string;
}

interface ComposeOptions extends ConfigAwareOptions {
  file?: string;
  project?: string;
  profiles?: string[];
  env?: string[];
}

interface NetworkOptions extends ConfigAwareOptions {
  driver?: string;
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  attachable?: boolean;
  internal?: boolean;
  labels?: string[];
}

interface VolumeOptions extends ConfigAwareOptions {
  driver?: string;
  labels?: string[];
  opts?: string[];
}

interface SwarmOptions extends ConfigAwareOptions {
  advertiseAddr?: string;
  listenAddr?: string;
  dataPathAddr?: string;
}

/**
 * Parse key=value pairs from array of strings
 */
function parseKeyValuePairs(pairs?: string[]): Record<string, string> {
  if (!pairs) return {};
  return pairs.reduce((acc, pair) => {
    const [key, ...values] = pair.split('=');
    if (key) {
      acc[key] = values.join('=');
    }
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Docker command with comprehensive subcommands
 */
export class DockerCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'docker',
      aliases: ['d'],
      description: '🐳 Comprehensive Docker management using fluent API',
      validateOptions: (options) => {
        const schema = z.object({
          profile: z.string().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'docker';
  }

  protected setupSubcommands(command: Command): void {
    // Container management commands
    this.setupContainerCommands(command);

    // Image management commands
    this.setupImageCommands(command);

    // Service commands
    this.setupServiceCommands(command);

    // Compose commands
    this.setupComposeCommands(command);

    // Network commands
    this.setupNetworkCommands(command);

    // Volume commands
    this.setupVolumeCommands(command);

    // Swarm commands
    this.setupSwarmCommands(command);

    // Utility commands
    this.setupUtilityCommands(command);

    // Interactive quick start
    this.setupQuickStart(command);
  }

  private setupContainerCommands(docker: Command): void {
    const container = docker
      .command('container')
      .alias('c')
      .description('Manage Docker containers');

    container
      .command('run')
      .description('Run a new container')
      .argument('<image>', 'Docker image to run')
      .option('-n, --name <name>', 'Container name')
      .option('-p, --ports <ports...>', 'Port mappings (e.g., 8080:80)')
      .option('-v, --volumes <volumes...>', 'Volume mounts')
      .option('-e, --env <env...>', 'Environment variables')
      .option('--network <network>', 'Network to connect to')
      .option('--workdir <dir>', 'Working directory')
      .option('--user <user>', 'User to run as')
      .option('-d, --detached', 'Run in background', false)
      .option('--rm', 'Remove container after exit', false)
      .option('-i, --interactive', 'Keep STDIN open', false)
      .option('-t, --tty', 'Allocate a pseudo-TTY', false)
      .option('--restart <policy>', 'Restart policy')
      .option('--label <labels...>', 'Container labels')
      .option('--entrypoint <cmd>', 'Override entrypoint')
      .option('--privileged', 'Run in privileged mode', false)
      .action(async (image: string, options: ContainerOptions, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.runContainer(image, mergedOpts);
      });

    container
      .command('exec')
      .description('Execute command in running container')
      .argument('<container>', 'Container name or ID')
      .argument('<command...>', 'Command to execute')
      .option('-i, --interactive', 'Interactive mode', false)
      .option('-t, --tty', 'Allocate pseudo-TTY', false)
      .option('--user <user>', 'User to run as')
      .option('--workdir <dir>', 'Working directory')
      .action(async (containerName: string, cmdParts: string[], options: any, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.execInContainer(containerName, cmdParts, mergedOpts);
      });

    container
      .command('stop')
      .description('Stop running containers')
      .argument('<containers...>', 'Container names or IDs')
      .option('-t, --time <seconds>', 'Seconds before killing', '10')
      .action(async (containers: string[], options: any, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.stopContainers(containers, mergedOpts);
      });

    container
      .command('remove')
      .alias('rm')
      .description('Remove containers')
      .argument('<containers...>', 'Container names or IDs')
      .option('-f, --force', 'Force removal', false)
      .action(async (containers: string[], options: any, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.removeContainers(containers, mergedOpts);
      });

    container
      .command('logs')
      .description('View container logs')
      .argument('<container>', 'Container name or ID')
      .option('-f, --follow', 'Follow log output', false)
      .option('--tail <lines>', 'Number of lines to show from the end')
      .option('--since <time>', 'Show logs since timestamp')
      .option('--timestamps', 'Show timestamps', false)
      .action(async (containerName: string, options: any) => {
        await this.viewContainerLogs(containerName, options);
      });
  }

  private setupImageCommands(docker: Command): void {
    const image = docker
      .command('image')
      .alias('i')
      .description('Manage Docker images');

    image
      .command('build')
      .description('Build an image from a Dockerfile')
      .argument('<context>', 'Build context path')
      .option('-t, --tag <tag>', 'Image tag')
      .option('-f, --file <dockerfile>', 'Dockerfile path')
      .option('--no-cache', 'Do not use cache', false)
      .option('--pull', 'Always pull base image', false)
      .option('--platform <platform>', 'Target platform')
      .option('--build-arg <args...>', 'Build arguments')
      .option('--target <stage>', 'Target build stage')
      .option('--quiet', 'Suppress output', false)
      .action(async (context: string, options: any) => {
        await this.buildImage(context, options);
      });

    image
      .command('pull')
      .description('Pull an image from registry')
      .argument('<image>', 'Image to pull')
      .action(async (imageName: string, options: ConfigAwareOptions) => {
        await this.pullImage(imageName, options);
      });

    image
      .command('remove')
      .alias('rmi')
      .description('Remove images')
      .argument('<images...>', 'Images to remove')
      .option('-f, --force', 'Force removal', false)
      .action(async (images: string[], options: any) => {
        await this.removeImages(images, options);
      });

    image
      .command('list')
      .alias('ls')
      .description('List images')
      .action(async (options: ConfigAwareOptions) => {
        await this.listImages(options);
      });
  }

  private setupServiceCommands(docker: Command): void {
    const service = docker
      .command('service')
      .alias('s')
      .description('Manage pre-configured services');

    service
      .command('redis')
      .description('Start Redis service')
      .option('-p, --port <port>', 'Redis port', '6379')
      .option('-n, --name <name>', 'Container name', 'xec-redis')
      .option('--password <password>', 'Redis password')
      .option('--version <tag>', 'Redis version', 'alpine')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .option('--config-path <path>', 'Config file path')
      .action(async (options: ServiceOptions, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startRedisService(mergedOpts);
      });

    service
      .command('postgres')
      .description('Start PostgreSQL service')
      .option('-p, --port <port>', 'PostgreSQL port', '5432')
      .option('-n, --name <name>', 'Container name', 'xec-postgres')
      .option('--password <password>', 'Database password', 'postgres')
      .option('--user <user>', 'Database user', 'postgres')
      .option('--database <db>', 'Database name', 'postgres')
      .option('--version <tag>', 'PostgreSQL version', 'alpine')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .action(async (options: ServiceOptions, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startPostgresService(mergedOpts);
      });

    service
      .command('mysql')
      .description('Start MySQL service')
      .option('-p, --port <port>', 'MySQL port', '3306')
      .option('-n, --name <name>', 'Container name', 'xec-mysql')
      .option('--password <password>', 'Root password', 'mysql')
      .option('--database <db>', 'Database name', 'mysql')
      .option('--version <tag>', 'MySQL version', 'latest')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .action(async (options: ServiceOptions, cmd: any) => {
        // Merge parent options (like dry-run)
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startMysqlService(mergedOpts);
      });

    service
      .command('mongodb')
      .description('Start MongoDB service')
      .option('-p, --port <port>', 'MongoDB port', '27017')
      .option('-n, --name <name>', 'Container name', 'xec-mongodb')
      .option('--root-user <user>', 'Root username', 'admin')
      .option('--root-password <password>', 'Root password', 'admin')
      .option('--database <db>', 'Database name', 'test')
      .option('--version <tag>', 'MongoDB version', '6')
      .option('--replica-set <name>', 'Enable replica set')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startMongoDBService(mergedOpts);
      });

    service
      .command('redis-cluster')
      .description('Start Redis cluster')
      .option('-m, --masters <n>', 'Number of master nodes', '3')
      .option('-r, --replicas <n>', 'Replicas per master', '1')
      .option('-p, --base-port <port>', 'Starting port', '7001')
      .option('-n, --name <name>', 'Cluster name prefix', 'redis-cluster')
      .option('--password <password>', 'Redis password')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .option('--network <network>', 'Network name')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startRedisClusterService(mergedOpts);
      });

    service
      .command('kafka')
      .description('Start Apache Kafka with Zookeeper')
      .option('-p, --port <port>', 'Kafka port', '9092')
      .option('-n, --name <name>', 'Container name', 'xec-kafka')
      .option('--zookeeper <connection>', 'Zookeeper connection', 'xec-zookeeper:2181')
      .option('--broker-id <id>', 'Broker ID', '1')
      .option('--version <tag>', 'Kafka version', 'latest')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .option('--network <network>', 'Network name', 'xec-kafka-network')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startKafkaService(mergedOpts);
      });

    service
      .command('rabbitmq')
      .description('Start RabbitMQ message broker')
      .option('-p, --port <port>', 'AMQP port', '5672')
      .option('-m, --management-port <port>', 'Management port', '15672')
      .option('-n, --name <name>', 'Container name', 'xec-rabbitmq')
      .option('--user <user>', 'Admin username', 'admin')
      .option('--password <password>', 'Admin password', 'admin')
      .option('--vhost <vhost>', 'Virtual host', '/')
      .option('--version <tag>', 'RabbitMQ version', 'management-alpine')
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startRabbitMQService(mergedOpts);
      });

    service
      .command('elasticsearch')
      .description('Start Elasticsearch')
      .option('-p, --port <port>', 'HTTP port', '9200')
      .option('-n, --name <name>', 'Container name', 'xec-elasticsearch')
      .option('--version <tag>', 'Elasticsearch version', '8.11.0')
      .option('--single-node', 'Single node mode', true)
      .option('--persistent', 'Enable persistence', false)
      .option('--data-path <path>', 'Data directory')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startElasticsearchService(mergedOpts);
      });

    service
      .command('ssh')
      .description('Start SSH server container')
      .option('-p, --port <port>', 'SSH port', '2222')
      .option('-n, --name <name>', 'Container name', 'xec-ssh')
      .option('--user <user>', 'SSH username', 'user')
      .option('--password <password>', 'SSH password', 'password')
      .option('--pubkey <path>', 'Public key file')
      .option('--authorized-keys <path>', 'Authorized keys file')
      .option('--version <tag>', 'Image version', 'alpine')
      .action(async (options: ServiceOptions, cmd: any) => {
        const parentOpts = cmd.parent?.parent?.opts() || {};
        const mergedOpts = { ...parentOpts, ...options };
        await this.startSSHService(mergedOpts);
      });

    // Add list command for services
    service
      .command('list')
      .alias('ls')
      .description('List available services')
      .action(async () => {
        await this.listAvailableServices();
      });
  }

  private setupComposeCommands(docker: Command): void {
    const compose = docker
      .command('compose')
      .alias('dc')
      .description('Docker Compose operations');

    compose
      .command('up')
      .description('Create and start services')
      .option('-f, --file <file>', 'Compose file', 'docker-compose.yml')
      .option('-p, --project <name>', 'Project name')
      .option('-d, --detached', 'Run in background', true)
      .option('--build', 'Build images before starting', false)
      .option('--profile <profiles...>', 'Activate profiles')
      .action(async (options: ComposeOptions & { detached?: boolean; build?: boolean }) => {
        await this.composeUp(options);
      });

    compose
      .command('down')
      .description('Stop and remove services')
      .option('-f, --file <file>', 'Compose file', 'docker-compose.yml')
      .option('-p, --project <name>', 'Project name')
      .option('-v, --volumes', 'Remove volumes', false)
      .option('--rmi', 'Remove images', false)
      .action(async (options: ComposeOptions & { volumes?: boolean; rmi?: boolean }) => {
        await this.composeDown(options);
      });
  }

  private setupNetworkCommands(docker: Command): void {
    const network = docker
      .command('network')
      .alias('n')
      .description('Manage Docker networks');

    network
      .command('create')
      .description('Create a network')
      .argument('<name>', 'Network name')
      .option('-d, --driver <driver>', 'Network driver', 'bridge')
      .option('--subnet <subnet>', 'Subnet CIDR')
      .option('--gateway <gateway>', 'Gateway IP')
      .option('--ip-range <range>', 'IP range')
      .option('--attachable', 'Enable attachable', false)
      .option('--internal', 'Internal network', false)
      .option('--label <labels...>', 'Network labels')
      .action(async (name: string, options: NetworkOptions) => {
        await this.createNetwork(name, options);
      });

    network
      .command('remove')
      .alias('rm')
      .description('Remove a network')
      .argument('<name>', 'Network name')
      .action(async (name: string, options: ConfigAwareOptions) => {
        await this.removeNetwork(name, options);
      });
  }

  private setupVolumeCommands(docker: Command): void {
    const volume = docker
      .command('volume')
      .alias('v')
      .description('Manage Docker volumes');

    volume
      .command('create')
      .description('Create a volume')
      .argument('<name>', 'Volume name')
      .option('-d, --driver <driver>', 'Volume driver')
      .option('--label <labels...>', 'Volume labels')
      .option('--opt <options...>', 'Driver options')
      .action(async (name: string, options: VolumeOptions) => {
        await this.createVolume(name, options);
      });

    volume
      .command('remove')
      .alias('rm')
      .description('Remove a volume')
      .argument('<name>', 'Volume name')
      .option('-f, --force', 'Force removal', false)
      .action(async (name: string, options: any) => {
        await this.removeVolume(name, options);
      });
  }

  private setupSwarmCommands(docker: Command): void {
    const swarm = docker
      .command('swarm')
      .description('Manage Docker Swarm');

    swarm
      .command('init')
      .description('Initialize swarm')
      .option('--advertise-addr <addr>', 'Advertise address')
      .option('--listen-addr <addr>', 'Listen address')
      .option('--data-path-addr <addr>', 'Data path address')
      .action(async (options: SwarmOptions) => {
        await this.swarmInit(options);
      });

    swarm
      .command('leave')
      .description('Leave the swarm')
      .option('-f, --force', 'Force leave', false)
      .action(async (options: any) => {
        await this.swarmLeave(options);
      });
  }

  private setupUtilityCommands(docker: Command): void {
    docker
      .command('ps')
      .description('List containers')
      .option('-a, --all', 'Show all containers', false)
      .action(async (options: any) => {
        await this.listContainers(options);
      });

    docker
      .command('images')
      .description('List images')
      .action(async (options: ConfigAwareOptions) => {
        await this.listImages(options);
      });

    docker
      .command('prune')
      .description('Remove unused data')
      .option('-a, --all', 'Remove all unused images', false)
      .option('-v, --volumes', 'Prune volumes too', false)
      .action(async (options: any) => {
        await this.pruneDocker(options);
      });
  }

  private setupQuickStart(docker: Command): void {
    docker
      .command('quick-start')
      .description('Interactive service starter')
      .action(async (options: ConfigAwareOptions) => {
        await this.quickStart(options);
      });
  }

  // Implementation methods
  private async runContainer(image: string, options: ContainerOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const defaults = this.getDockerDefaults();
    const mergedOptions = this.applyDefaults(options, defaults);

    const s = spinner();
    s.start(prism.blue('Starting container...'));

    try {
      const dockerApi = $.docker();
      let container = dockerApi.ephemeral(image);

      // Apply options
      if (mergedOptions.name) container = container.name(mergedOptions.name);
      if (mergedOptions.workdir) container = container.workdir(mergedOptions.workdir);
      if (mergedOptions.user) container = container.user(mergedOptions.user);
      if (mergedOptions.network) container = container.network(mergedOptions.network);
      if (mergedOptions.rm) container = container.autoRemove();
      if (mergedOptions.privileged) container = container.privileged();

      // Add ports
      if (mergedOptions.ports) {
        for (const port of mergedOptions.ports) {
          const [hostPort, containerPort] = port.split(':');
          if (hostPort && containerPort) {
            container = container.port(parseInt(hostPort), parseInt(containerPort));
          } else if (hostPort) {
            container = container.port(parseInt(hostPort), parseInt(hostPort));
          }
        }
      }

      // Add volumes
      if (mergedOptions.volumes) {
        for (const vol of mergedOptions.volumes) {
          const [hostPath, containerPath] = vol.split(':');
          if (hostPath && containerPath) {
            container = container.volume(hostPath, containerPath);
          } else if (hostPath) {
            container = container.volume(hostPath, hostPath);
          }
        }
      }

      // Add env vars
      if (mergedOptions.env) {
        const envObj = parseKeyValuePairs(mergedOptions.env);
        container = container.env(envObj);
      }

      // Add labels
      if (mergedOptions.labels) {
        const labelObj = parseKeyValuePairs(mergedOptions.labels);
        container = container.labels(labelObj);
      }

      if (mergedOptions.dryRun) {
        s.stop(prism.green('[DRY RUN] Would start container'));
        this.log(`[DRY RUN] Image: ${image}`, 'info');
        if (mergedOptions.name) this.log(`[DRY RUN] Name: ${mergedOptions.name}`, 'info');
        return;
      }

      // Run container
      if (options.command) {
        const result = await container.exec`${options.command}`;
        s.stop(prism.green('✓ Container started successfully'));
        console.log(result.stdout);
        if (result.stderr) console.error(result.stderr);
      } else {
        const result = await container.exec``;
        s.stop(prism.green('✓ Container started successfully'));
        if (!mergedOptions.detached) {
          console.log(result.stdout);
          if (result.stderr) console.error(result.stderr);
        } else {
          note(`Container ID: ${mergedOptions.name || 'ephemeral'}\nStatus: Running`, 'Container Info');
        }
      }
    } catch (error) {
      s.stop(prism.red('✗ Failed to start container'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async execInContainer(containerName: string, cmdParts: string[], options: any): Promise<void> {
    await this.initializeConfig(options);

    try {
      const dockerApi = $.docker();
      let container = dockerApi.container(containerName);

      if (options.user) container = container.user(options.user);
      if (options.workdir) container = container.workdir(options.workdir);

      const command = cmdParts.join(' ');

      if (this.isDryRun()) {
        this.log(`[DRY RUN] Would execute: ${command} in container ${containerName}`, 'info');
        return;
      }

      const result = await container.exec`${command}`;
      console.log(result.stdout);
      if (result.stderr) console.error(result.stderr);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async stopContainers(containers: string[], options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Stopping containers...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would stop containers'));
        containers.forEach(c => this.log(`[DRY RUN] Would stop: ${c}`, 'info'));
        return;
      }

      for (const name of containers) {
        await $.docker().container(name).stop();
      }

      s.stop(prism.green(`✓ Stopped ${containers.length} container(s)`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to stop containers'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async removeContainers(containers: string[], options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Removing containers...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would remove containers'));
        containers.forEach(c => this.log(`[DRY RUN] Would remove: ${c}`, 'info'));
        return;
      }

      for (const name of containers) {
        await $.docker().rm(name, options.force);
      }

      s.stop(prism.green(`✓ Removed ${containers.length} container(s)`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to remove containers'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async viewContainerLogs(containerName: string, options: any): Promise<void> {
    await this.initializeConfig(options);

    try {
      const container = $.docker().container(containerName);

      if (this.isDryRun()) {
        this.log(`[DRY RUN] Would view logs for container: ${containerName}`, 'info');
        return;
      }

      const result = await container.logs({
        follow: options.follow,
        tail: options.tail ? parseInt(options.tail) : undefined,
        since: options.since,
        timestamps: options.timestamps
      });

      console.log(result);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async buildImage(context: string, options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Building image...'));

    try {
      const dockerApi = $.docker();
      let builder = dockerApi.build(context, options.tag);

      if (options.file) builder = builder.dockerfile(options.file);
      if (options.noCache) builder = builder.noCache();
      if (options.pull) builder = builder.pull();
      if (options.platform) builder = builder.platform(options.platform);
      if (options.target) builder = builder.target(options.target);

      if (options.buildArg) {
        const argsObj = parseKeyValuePairs(options.buildArg);
        builder = builder.buildArgs(argsObj);
      }

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would build image'));
        this.log(`[DRY RUN] Context: ${context}`, 'info');
        if (options.tag) this.log(`[DRY RUN] Tag: ${options.tag}`, 'info');
        return;
      }

      await builder.build();
      s.stop(prism.green(`✓ Successfully built ${options.tag || 'image'}`));
    } catch (error) {
      s.stop(prism.red('✗ Build failed'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async pullImage(imageName: string, options: ConfigAwareOptions): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue(`Pulling ${imageName}...`));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would pull image'));
        this.log(`[DRY RUN] Image: ${imageName}`, 'info');
        return;
      }

      await $.docker().pull(imageName);
      s.stop(prism.green(`✓ Successfully pulled ${imageName}`));
    } catch (error) {
      s.stop(prism.red('✗ Pull failed'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async removeImages(images: string[], options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Removing images...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would remove images'));
        images.forEach(img => this.log(`[DRY RUN] Would remove: ${img}`, 'info'));
        return;
      }

      for (const img of images) {
        await $.docker().rmi(img, options.force);
      }

      s.stop(prism.green(`✓ Removed ${images.length} image(s)`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to remove images'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async listImages(options: ConfigAwareOptions): Promise<void> {
    await this.initializeConfig(options);

    try {
      const images = await $.docker().images();
      console.log(images);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startRedisService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting Redis...'));

    try {
      const defaults = this.getServiceDefaults('redis');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start Redis'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '6379'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-redis'}`, 'info');
        return;
      }

      const redis = $.docker().redis({
        port: mergedOptions.port,
        name: mergedOptions.name,
        password: mergedOptions.password,
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath,
        configPath: mergedOptions.configPath
      });

      await redis.start();

      const info = redis.getConnectionInfo();
      s.stop(prism.green('✓ Redis started'));

      note(`
Host: ${info['host']}
Port: ${info['port']}
Password: ${info['password'] || '(none)'}
Connection: ${info['connectionString']}
      `, 'Redis Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start Redis'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startPostgresService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting PostgreSQL...'));

    try {
      const defaults = this.getServiceDefaults('postgres');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start PostgreSQL'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '5432'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-postgres'}`, 'info');
        return;
      }

      const postgres = $.docker().postgresql({
        port: mergedOptions.port,
        name: mergedOptions.name,
        password: mergedOptions.password,
        user: mergedOptions.user,
        database: mergedOptions.database,
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath
      });

      await postgres.start();

      const info = postgres.getConnectionInfo();
      s.stop(prism.green('✓ PostgreSQL started'));

      note(`
Host: ${info['host']}
Port: ${info['port']}
Database: ${info['database']}
User: ${info['username']}
Password: ${info['password']}
Connection: ${info['connectionString']}
      `, 'PostgreSQL Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start PostgreSQL'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startMysqlService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting MySQL...'));

    try {
      const defaults = this.getServiceDefaults('mysql');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start MySQL'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '3306'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-mysql'}`, 'info');
        return;
      }

      const mysql = $.docker().mysql({
        port: mergedOptions.port,
        name: mergedOptions.name,
        rootPassword: mergedOptions.password,
        database: mergedOptions.database,
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath
      });

      await mysql.start();

      const info = mysql.getConnectionInfo();
      s.stop(prism.green('✓ MySQL started'));

      note(`
Host: ${info['host']}
Port: ${info['port']}
Database: ${info['database']}
User: root
Password: ${info['password']}
Connection: ${info['connectionString']}
      `, 'MySQL Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start MySQL'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startMongoDBService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting MongoDB...'));

    try {
      const defaults = this.getServiceDefaults('mongodb');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start MongoDB'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '27017'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-mongodb'}`, 'info');
        return;
      }

      const mongodb = $.docker().mongodb({
        port: mergedOptions.port,
        name: mergedOptions.name,
        rootUser: mergedOptions.rootUser,
        rootPassword: mergedOptions.rootPassword,
        database: mergedOptions.database,
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath,
        replicaSet: mergedOptions.replicaSet
      });

      await mongodb.start();

      const info = mongodb.getConnectionInfo();
      s.stop(prism.green('✓ MongoDB started'));

      note(`
Host: ${info['host']}
Port: ${info['port']}
Database: ${info['database']}
User: ${info['user']}
Password: ${info['password']}
Connection: ${info['connectionString']}
      `, 'MongoDB Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start MongoDB'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startRedisClusterService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting Redis Cluster...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start Redis Cluster'));
        this.log(`[DRY RUN] Masters: ${options.masters || '3'}`, 'info');
        this.log(`[DRY RUN] Replicas: ${options.replicas || '1'}`, 'info');
        return;
      }

      const cluster = $.docker().redisCluster({
        cluster: {
          enabled: true,
          masters: parseInt(options.masters || '3'),
          replicas: parseInt(options.replicas || '1')
        },
        port: options.basePort,
        name: options.name,
        password: options.password,
        persistent: options.persistent,
        dataPath: options.dataPath,
        network: options.network
      });

      await cluster.start();

      const endpoints = cluster.getEndpoints();
      s.stop(prism.green('✓ Redis Cluster started'));

      note(`
Endpoints: ${endpoints.join(', ')}
Masters: ${options.masters || '3'}
Replicas: ${options.replicas || '1'} per master

Connect with:
  redis-cli -c -p ${options.basePort || '7001'}
      `, 'Redis Cluster Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start Redis Cluster'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startKafkaService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting Kafka with Zookeeper...'));

    try {
      const defaults = this.getServiceDefaults('kafka');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start Kafka'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '9092'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-kafka'}`, 'info');
        return;
      }

      const kafka = $.docker().kafka({
        port: mergedOptions.port,
        name: mergedOptions.name,
        zookeeper: mergedOptions.zookeeper,
        brokerId: parseInt(mergedOptions.brokerId || '1'),
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath,
        network: mergedOptions.network
      });

      await kafka.startWithZookeeper();

      const info = kafka.getConnectionInfo();
      s.stop(prism.green('✓ Kafka started with Zookeeper'));

      note(`
Bootstrap Server: ${info['bootstrapServers']}
Zookeeper: ${mergedOptions.zookeeper || 'xec-zookeeper:2181'}
Broker ID: ${mergedOptions.brokerId || '1'}

Connect with:
  kafka-topics --bootstrap-server localhost:${mergedOptions.port || '9092'} --list
      `, 'Kafka Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start Kafka'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startRabbitMQService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting RabbitMQ...'));

    try {
      const defaults = this.getServiceDefaults('rabbitmq');
      const mergedOptions = this.applyDefaults(options, defaults);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start RabbitMQ'));
        this.log(`[DRY RUN] Port: ${mergedOptions.port || '5672'}`, 'info');
        this.log(`[DRY RUN] Name: ${mergedOptions.name || 'xec-rabbitmq'}`, 'info');
        return;
      }

      const rabbitmq = $.docker().rabbitmq({
        port: mergedOptions.port,
        management: true,
        name: mergedOptions.name,
        user: mergedOptions.user,
        password: mergedOptions.password,
        vhost: mergedOptions.vhost,
        version: mergedOptions.version,
        persistent: mergedOptions.persistent,
        dataPath: mergedOptions.dataPath
      });

      await rabbitmq.start();

      const info = rabbitmq.getConnectionInfo();
      s.stop(prism.green('✓ RabbitMQ started'));

      note(`
AMQP URL: ${info['amqpUrl']}
Management UI: http://localhost:${mergedOptions.managementPort || '15672'}
User: ${mergedOptions.user || 'admin'}
Password: ${mergedOptions.password || 'admin'}
      `, 'RabbitMQ Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start RabbitMQ'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startElasticsearchService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting Elasticsearch...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start Elasticsearch'));
        this.log(`[DRY RUN] Port: ${options.port || '9200'}`, 'info');
        this.log(`[DRY RUN] Name: ${options.name || 'xec-elasticsearch'}`, 'info');
        return;
      }

      // Elasticsearch is not yet implemented as a fluent API service
      // Using ephemeral container directly
      const elasticsearch = $.docker().ephemeral(`elasticsearch:${options.version || '8.11.0'}`)
        .name(options.name || 'xec-elasticsearch')
        .port(parseInt(options.port || '9200'), 9200)
        .port(9300, 9300)
        .env({
          'discovery.type': 'single-node',
          'xpack.security.enabled': 'false',
          'ES_JAVA_OPTS': '-Xms512m -Xmx512m'
        });

      if (options.persistent && options.dataPath) {
        elasticsearch.volume(options.dataPath, '/usr/share/elasticsearch/data');
      }

      await elasticsearch.start();

      const info = {
        httpUrl: `http://localhost:${options.port || '9200'}`,
        clusterName: 'elasticsearch'
      };
      s.stop(prism.green('✓ Elasticsearch started'));

      note(`
HTTP URL: ${info['httpUrl']}
Cluster: ${info['clusterName']}

Check health:
  curl http://localhost:${options.port || '9200'}/_cluster/health?pretty
      `, 'Elasticsearch Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start Elasticsearch'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async startSSHService(options: ServiceOptions): Promise<void> {
    // Set options for this command execution
    this.options = { ...this.options, ...options };

    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting SSH server...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start SSH server'));
        this.log(`[DRY RUN] Port: ${options.port || '2222'}`, 'info');
        this.log(`[DRY RUN] Name: ${options.name || 'xec-ssh'}`, 'info');
        return;
      }

      const ssh = $.docker().ssh({
        port: options.port,
        name: options.name,
        user: options.user,
        password: options.password,
        distro: options.version || 'alpine'
      });

      await ssh.start();

      const info = ssh.getConnectionConfig();
      s.stop(prism.green('✓ SSH server started'));

      note(`
Host: localhost
Port: ${info['port']}
Username: ${info['username']}
Password: ${info['password'] || '(key-based auth)'}

Connect with:
  ssh -p ${info['port']} ${info['username']}@localhost
      `, 'SSH Connection Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to start SSH server'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async listAvailableServices(): Promise<void> {
    const services = [
      { name: 'redis', description: '🔴 Redis - In-memory data store' },
      { name: 'redis-cluster', description: '🔴 Redis Cluster - Distributed Redis' },
      { name: 'postgres', description: '🐘 PostgreSQL - Relational database' },
      { name: 'mysql', description: '🐬 MySQL - Relational database' },
      { name: 'mongodb', description: '🍃 MongoDB - NoSQL database' },
      { name: 'kafka', description: '📨 Kafka - Message streaming platform' },
      { name: 'rabbitmq', description: '🐰 RabbitMQ - Message broker' },
      { name: 'elasticsearch', description: '🔍 Elasticsearch - Search engine' },
      { name: 'ssh', description: '🔐 SSH - SSH server container' }
    ];

    intro(prism.blue('🐳 Available Docker Services'));

    for (const service of services) {
      console.log(`  ${prism.cyan(service.name.padEnd(15))} ${service.description}`);
    }

    outro(prism.gray('\nUse: xec docker service <service-name> --help for options'));
  }

  private async composeUp(options: ComposeOptions & { detached?: boolean; build?: boolean }): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Starting services...'));

    try {
      let compose = $.docker().compose(options.file);

      if (options.project) compose = compose.withProject(options.project);
      if (options.profiles) compose = compose.withProfiles(...options.profiles);
      if (options.env) {
        const envObj = parseKeyValuePairs(options.env);
        compose = compose.withEnv(envObj);
      }

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would start compose services'));
        this.log(`[DRY RUN] File: ${options.file || 'docker-compose.yml'}`, 'info');
        if (options.project) this.log(`[DRY RUN] Project: ${options.project}`, 'info');
        return;
      }

      await compose.up(options.detached, options.build);
      s.stop(prism.green('✓ Services started'));
    } catch (error) {
      s.stop(prism.red('✗ Failed to start services'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async composeDown(options: ComposeOptions & { volumes?: boolean; rmi?: boolean }): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Stopping services...'));

    try {
      let compose = $.docker().compose(options.file);

      if (options.project) compose = compose.withProject(options.project);

      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would stop compose services'));
        this.log(`[DRY RUN] File: ${options.file || 'docker-compose.yml'}`, 'info');
        if (options.project) this.log(`[DRY RUN] Project: ${options.project}`, 'info');
        return;
      }

      await compose.down(options.volumes, options.rmi);
      s.stop(prism.green('✓ Services stopped'));
    } catch (error) {
      s.stop(prism.red('✗ Failed to stop services'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async createNetwork(name: string, options: NetworkOptions): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue(`Creating network ${name}...`));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would create network'));
        this.log(`[DRY RUN] Network: ${name}`, 'info');
        if (options.driver) this.log(`[DRY RUN] Driver: ${options.driver}`, 'info');
        return;
      }

      const network = $.docker().network(name);
      await network.create({
        driver: options.driver as any,
        subnet: options.subnet,
        gateway: options.gateway,
        ipRange: options.ipRange,
        attachable: options.attachable,
        internal: options.internal,
        labels: options.labels ? parseKeyValuePairs(options.labels) : undefined
      });

      s.stop(prism.green(`✓ Network ${name} created`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to create network'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async removeNetwork(name: string, options: ConfigAwareOptions): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue(`Removing network ${name}...`));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would remove network'));
        this.log(`[DRY RUN] Network: ${name}`, 'info');
        return;
      }

      await $.docker().network(name).remove();
      s.stop(prism.green(`✓ Network ${name} removed`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to remove network'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async createVolume(name: string, options: VolumeOptions): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue(`Creating volume ${name}...`));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would create volume'));
        this.log(`[DRY RUN] Volume: ${name}`, 'info');
        if (options.driver) this.log(`[DRY RUN] Driver: ${options.driver}`, 'info');
        return;
      }

      const volume = $.docker().volume(name);
      await volume.create({
        driver: options.driver,
        labels: options.labels ? parseKeyValuePairs(options.labels) : undefined,
        driverOpts: options.opts ? parseKeyValuePairs(options.opts) : undefined
      });

      s.stop(prism.green(`✓ Volume ${name} created`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to create volume'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async removeVolume(name: string, options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue(`Removing volume ${name}...`));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would remove volume'));
        this.log(`[DRY RUN] Volume: ${name}`, 'info');
        return;
      }

      await $.docker().volume(name).remove(options.force);
      s.stop(prism.green(`✓ Volume ${name} removed`));
    } catch (error) {
      s.stop(prism.red('✗ Failed to remove volume'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async swarmInit(options: SwarmOptions): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Initializing swarm...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would initialize swarm'));
        if (options.advertiseAddr) this.log(`[DRY RUN] Advertise: ${options.advertiseAddr}`, 'info');
        return;
      }

      const token = await $.docker().swarm().init({
        advertiseAddr: options.advertiseAddr,
        listenAddr: options.listenAddr,
        dataPathAddr: options.dataPathAddr
      });

      s.stop(prism.green('✓ Swarm initialized'));
      note(`Join token: ${token}`, 'Swarm Info');
    } catch (error) {
      s.stop(prism.red('✗ Failed to initialize swarm'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async swarmLeave(options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Leaving swarm...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would leave swarm'));
        return;
      }

      await $.docker().swarm().leave(options.force);
      s.stop(prism.green('✓ Left swarm'));
    } catch (error) {
      s.stop(prism.red('✗ Failed to leave swarm'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async listContainers(options: any): Promise<void> {
    await this.initializeConfig(options);

    try {
      const containers = await $.docker().ps(options.all);
      console.log(containers);
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async pruneDocker(options: any): Promise<void> {
    await this.initializeConfig(options);

    const s = spinner();
    s.start(prism.blue('Cleaning up Docker...'));

    try {
      if (this.isDryRun()) {
        s.stop(prism.green('[DRY RUN] Would prune Docker'));
        this.log('[DRY RUN] Would remove unused containers, images, networks', 'info');
        if (options.volumes) this.log('[DRY RUN] Would also remove volumes', 'info');
        return;
      }

      await $.docker().prune(options.all, options.volumes);
      s.stop(prism.green('✓ Cleanup complete'));
    } catch (error) {
      s.stop(prism.red('✗ Cleanup failed'));
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  private async quickStart(options: ConfigAwareOptions): Promise<void> {
    await this.initializeConfig(options);

    intro(prism.blue('🐳 Docker Quick Start'));

    const serviceType = await select({
      message: 'What service would you like to start?',
      options: [
        { value: 'redis', label: '🔴 Redis - In-memory data store' },
        { value: 'redis-cluster', label: '🔴 Redis Cluster - Distributed Redis' },
        { value: 'postgres', label: '🐘 PostgreSQL - Relational database' },
        { value: 'mysql', label: '🐬 MySQL - Relational database' },
        { value: 'mongodb', label: '🍃 MongoDB - NoSQL database' },
        { value: 'kafka', label: '📨 Kafka - Message streaming platform' },
        { value: 'rabbitmq', label: '🐰 RabbitMQ - Message broker' },
        { value: 'elasticsearch', label: '🔍 Elasticsearch - Search engine' },
        { value: 'ssh', label: '🔐 SSH - SSH server' },
        { value: 'custom', label: '📦 Custom - Run any image' }
      ]
    });

    if (isCancel(serviceType)) {
      cancel('Operation cancelled');
      process.exit(0);
    }

    try {
      switch (serviceType) {
        case 'redis': {
          const port = await text({
            message: 'Port?',
            placeholder: '6379',
            defaultValue: '6379'
          });

          const password = await text({
            message: 'Password? (optional)',
            placeholder: 'Leave empty for no password'
          });

          await this.startRedisService({
            port: port as string,
            password: password as string || undefined
          });
          break;
        }

        case 'postgres': {
          const port = await text({
            message: 'Port?',
            placeholder: '5432',
            defaultValue: '5432'
          });

          const database = await text({
            message: 'Database name?',
            placeholder: 'postgres',
            defaultValue: 'postgres'
          });

          const password = await text({
            message: 'Password?',
            placeholder: 'postgres',
            defaultValue: 'postgres'
          });

          await this.startPostgresService({
            port: port as string,
            database: database as string,
            password: password as string
          });
          break;
        }

        case 'custom': {
          const image = await text({
            message: 'Docker image?',
            placeholder: 'nginx:alpine'
          });

          if (isCancel(image)) {
            cancel('Operation cancelled');
            process.exit(0);
          }

          const ports = await text({
            message: 'Port mapping? (optional)',
            placeholder: '8080:80'
          });

          if (isCancel(ports)) {
            cancel('Operation cancelled');
            process.exit(0);
          }

          const portList = ports && String(ports).trim() ? [String(ports)] : undefined;
          await this.runContainer(String(image), {
            ports: portList,
            detached: true
          });
          break;
        }

        case 'mysql': {
          const port = await text({
            message: 'Port?',
            placeholder: '3306',
            defaultValue: '3306'
          });

          const database = await text({
            message: 'Database name?',
            placeholder: 'mysql',
            defaultValue: 'mysql'
          });

          const password = await text({
            message: 'Root password?',
            placeholder: 'mysql',
            defaultValue: 'mysql'
          });

          await this.startMysqlService({
            port: port as string,
            database: database as string,
            password: password as string
          });
          break;
        }

        case 'mongodb': {
          const port = await text({
            message: 'Port?',
            placeholder: '27017',
            defaultValue: '27017'
          });

          const database = await text({
            message: 'Database name?',
            placeholder: 'test',
            defaultValue: 'test'
          });

          await this.startMongoDBService({
            port: port as string,
            database: database as string
          });
          break;
        }

        case 'redis-cluster': {
          const masters = await text({
            message: 'Number of masters?',
            placeholder: '3',
            defaultValue: '3'
          });

          const replicas = await text({
            message: 'Replicas per master?',
            placeholder: '1',
            defaultValue: '1'
          });

          await this.startRedisClusterService({
            masters: masters as string,
            replicas: replicas as string
          });
          break;
        }

        case 'kafka': {
          const port = await text({
            message: 'Kafka port?',
            placeholder: '9092',
            defaultValue: '9092'
          });

          await this.startKafkaService({
            port: port as string
          });
          break;
        }

        case 'rabbitmq': {
          const port = await text({
            message: 'AMQP port?',
            placeholder: '5672',
            defaultValue: '5672'
          });

          const managementPort = await text({
            message: 'Management UI port?',
            placeholder: '15672',
            defaultValue: '15672'
          });

          await this.startRabbitMQService({
            port: port as string,
            managementPort: managementPort as string
          });
          break;
        }

        case 'elasticsearch': {
          const port = await text({
            message: 'HTTP port?',
            placeholder: '9200',
            defaultValue: '9200'
          });

          await this.startElasticsearchService({
            port: port as string
          });
          break;
        }

        case 'ssh': {
          const port = await text({
            message: 'SSH port?',
            placeholder: '2222',
            defaultValue: '2222'
          });

          const username = await text({
            message: 'SSH username?',
            placeholder: 'user',
            defaultValue: 'user'
          });

          const password = await text({
            message: 'SSH password?',
            placeholder: 'password',
            defaultValue: 'password'
          });

          await this.startSSHService({
            port: port as string,
            user: username as string,
            password: password as string
          });
          break;
        }

        default:
          log.error(`Service ${serviceType} not yet implemented in quick-start`);
          break;
      }

      outro(prism.green('Service is running!'));
    } catch (error) {
      log.error(error instanceof Error ? error.message : String(error));
      process.exit(1);
    }
  }

  // Helper methods
  private getDockerDefaults(): DockerDefaults {
    const defaults = this.getCommandDefaults();
    return {
      tty: defaults['tty'],
      workdir: defaults['workdir'],
      autoRemove: defaults['autoRemove'] ?? true,
      user: defaults['user'],
      runMode: defaults['runMode'] as any,
      ...defaults
    };
  }

  private getServiceDefaults(service: string): CommandConfig {
    const commandDefaults = this.getCommandDefaults();
    const serviceKey = `services.${service}`;
    const serviceDefaults = (commandDefaults as any)[serviceKey] || {};

    return {
      ...commandDefaults,
      ...serviceDefaults
    };
  }
}

// Export default function for command registration
export default function dockerCommand(program: Command): void {
  const cmd = new DockerCommand();
  program.addCommand(cmd.create());
}