import { DockerError } from '../../core/error.js';

import type { ExecutionResult } from '../../core/result.js';
import type { ProcessPromise, ExecutionEngine } from '../../core/execution-engine.js';
import type { DockerAdapter, DockerLogsOptions, DockerHealthCheckOptions } from './index.js';

/**
 * Docker container configuration
 */
export interface DockerContainerConfig {
  image: string;
  name?: string;
  volumes?: Record<string, string> | string[];
  env?: Record<string, string>;
  ports?: Record<string, string> | string[];
  network?: string;
  healthcheck?: DockerHealthCheckOptions;
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  command?: string | string[];
  workdir?: string;
  user?: string;
  labels?: Record<string, string>;
  privileged?: boolean;
}

/**
 * Docker container instance with lifecycle management
 */
export class DockerContainer {
  private containerName: string;
  private isStarted = false;
  private isRemoved = false;

  constructor(
    private engine: ExecutionEngine,
    private adapter: DockerAdapter,
    private config: DockerContainerConfig
  ) {
    // Generate container name if not provided
    this.containerName = config.name || `xec-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  get name(): string {
    return this.containerName;
  }

  get started(): boolean {
    return this.isStarted;
  }

  get removed(): boolean {
    return this.isRemoved;
  }

  private isContainerCreated = false;

  /**
   * Create and start the container
   */
  async start(): Promise<DockerContainer> {
    if (this.isRemoved) {
      throw new DockerError(this.containerName, 'start', new Error('Container has been removed'));
    }

    if (this.isStarted) {
      return this;
    }

    try {
      // Check if container already exists (e.g., after stop)
      if (this.isContainerCreated) {
        // Container exists, just start it
        await this.adapter.startContainer(this.containerName);
      } else {
        // Container doesn't exist, create and start it
        if ('runContainer' in this.adapter) {
          // Use runContainer method if available (docker run)
          await (this.adapter as any).runContainer({
            name: this.containerName,
            image: this.config.image,
            volumes: this.config.volumes ? this.formatVolumes(this.config.volumes) : undefined,
            env: this.config.env,
            ports: this.config.ports ? this.formatPorts(this.config.ports) : undefined,
            network: this.config.network,
            restart: this.config.restart,
            workdir: this.config.workdir,
            user: this.config.user,
            labels: this.config.labels,
            privileged: this.config.privileged,
            healthcheck: this.config.healthcheck,
            command: this.config.command ? (Array.isArray(this.config.command) ? this.config.command : ['sh', '-c', this.config.command]) : undefined
          });
        } else {
          // Fallback to create then start (with limited options)
          const createOptions: any = {
            name: this.containerName,
            image: this.config.image,
            volumes: this.config.volumes ? this.formatVolumes(this.config.volumes) : undefined,
            env: this.config.env,
            ports: this.config.ports ? this.formatPorts(this.config.ports) : undefined
          };
          await (this.adapter as any).createContainer(createOptions);
          await (this.adapter as any).startContainer(this.containerName);
        }
        this.isContainerCreated = true;
      }

      this.isStarted = true;
      return this;
    } catch (error) {
      if (error instanceof DockerError) throw error;
      throw new DockerError(this.containerName, 'start', error instanceof Error ? error : new Error(String(error)));
    }
  }

  /**
   * Execute a command in the container
   */
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'exec', new Error('Container is not started'));
    }

    const dockerEngine = this.engine.docker({
      container: this.containerName,
      user: this.config.user,
      workdir: this.config.workdir
    });

    return dockerEngine.run(strings, ...values);
  }

  /**
   * Execute a raw command
   */
  async execRaw(command: string, args?: string[]): Promise<ExecutionResult> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'exec', new Error('Container is not started'));
    }

    const dockerEngine = this.engine.docker({
      container: this.containerName,
      user: this.config.user,
      workdir: this.config.workdir
    });

    // Build the full command - when shell is false, we need to pass the command and args separately
    const fullCommand = args && args.length > 0 ? `${command} ${args.join(' ')}` : command;

    // Execute using template literal to match the exec() implementation
    const result = await (dockerEngine as any).run([fullCommand], ...[]);
    return result;
  }

  /**
   * Get container logs
   */
  async logs(options?: DockerLogsOptions): Promise<string> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'logs', new Error('Container is not started'));
    }

    return this.adapter.getLogs(this.containerName, options);
  }

  /**
   * Stream container logs
   */
  async streamLogs(onData: (data: string) => void, options?: DockerLogsOptions): Promise<void> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'streamLogs', new Error('Container is not started'));
    }

    return this.adapter.streamLogs(this.containerName, onData, options);
  }

  /**
   * Follow container logs (alias for streamLogs with follow: true)
   */
  async follow(onData: (data: string) => void, options?: Omit<DockerLogsOptions, 'follow'>): Promise<void> {
    return this.streamLogs(onData, { ...options, follow: true });
  }

  /**
   * Stop the container
   */
  async stop(timeout?: number): Promise<void> {
    if (!this.isStarted || this.isRemoved) {
      return;
    }

    await this.adapter.stopContainer(this.containerName);
    this.isStarted = false;
  }

  /**
   * Remove the container
   */
  async remove(force = false): Promise<void> {
    if (this.isRemoved) {
      return;
    }

    if (this.isStarted && !force) {
      await this.stop();
    }

    await this.adapter.removeContainer(this.containerName, force);
    this.isRemoved = true;
    this.isContainerCreated = false;
  }

  /**
   * Restart the container
   */
  async restart(): Promise<void> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'restart', new Error('Container is not started'));
    }

    await this.stop();
    await this.start();
  }

  /**
   * Wait for container to be healthy
   */
  async waitForHealthy(timeout = 30000): Promise<void> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'waitForHealthy', new Error('Container is not started'));
    }

    return this.adapter.waitForHealthy(this.containerName, timeout);
  }

  /**
   * Get container stats
   */
  async stats(): Promise<any> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'stats', new Error('Container is not started'));
    }

    return this.adapter.getStats(this.containerName);
  }

  /**
   * Inspect container
   */
  async inspect(): Promise<any> {
    return this.adapter.inspectContainer(this.containerName);
  }

  /**
   * Copy file to container
   */
  async copyTo(localPath: string, containerPath: string): Promise<void> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'copyTo', new Error('Container is not started'));
    }

    return this.adapter.copyToContainer(localPath, this.containerName, containerPath);
  }

  /**
   * Copy file from container
   */
  async copyFrom(containerPath: string, localPath: string): Promise<void> {
    if (!this.isStarted) {
      throw new DockerError(this.containerName, 'copyFrom', new Error('Container is not started'));
    }

    return this.adapter.copyFromContainer(this.containerName, containerPath, localPath);
  }

  /**
   * Get container IP address
   */
  async getIpAddress(network?: string): Promise<string | null> {
    const info = await this.inspect();
    const networks = info.NetworkSettings?.Networks;

    if (!networks) {
      return null;
    }

    if (network) {
      return networks[network]?.IPAddress || null;
    }

    // Return first available IP
    for (const net of Object.values(networks)) {
      if ((net as any).IPAddress) {
        return (net as any).IPAddress;
      }
    }

    return null;
  }

  /**
   * Format volumes from various input formats
   */
  private formatVolumes(volumes?: Record<string, string> | string[]): string[] {
    if (!volumes) return [];

    if (Array.isArray(volumes)) {
      return volumes;
    }

    // Convert object format to array format
    return Object.entries(volumes).map(([host, container]) => `${host}:${container}`);
  }

  /**
   * Format ports from various input formats
   */
  private formatPorts(ports?: Record<string, string> | string[]): string[] {
    if (!ports) return [];

    if (Array.isArray(ports)) {
      return ports;
    }

    // Convert object format to array format
    return Object.entries(ports).map(([host, container]) => `${host}:${container}`);
  }
}

