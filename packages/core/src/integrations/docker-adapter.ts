import { z } from 'zod';

import { BaseAdapter, ExecutionResult } from './base-adapter.js';

export interface DockerConfig {
  socketPath?: string;
  host?: string;
  port?: number;
  version?: string;
  tlsVerify?: boolean;
  tlsCert?: string;
  tlsKey?: string;
  tlsCa?: string;
}

export const DockerConfigSchema = z.object({
  socketPath: z.string().optional(),
  host: z.string().optional(),
  port: z.number().optional(),
  version: z.string().optional(),
  tlsVerify: z.boolean().optional(),
  tlsCert: z.string().optional(),
  tlsKey: z.string().optional(),
  tlsCa: z.string().optional(),
});

export interface ContainerConfig {
  image: string;
  name?: string;
  command?: string[];
  env?: Record<string, string>;
  volumes?: Array<{ host: string; container: string; mode?: 'ro' | 'rw' }>;
  ports?: Array<{ host: number; container: number; protocol?: 'tcp' | 'udp' }>;
  networks?: string[];
  labels?: Record<string, string>;
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  workingDir?: string;
  user?: string;
  cpuShares?: number;
  memory?: string;
}

// Mock Docker API client for now
interface DockerClient {
  ping(): Promise<void>;
  createContainer(config: any): Promise<{ id: string }>;
  startContainer(id: string): Promise<void>;
  stopContainer(id: string, timeout?: number): Promise<void>;
  removeContainer(id: string, force?: boolean): Promise<void>;
  inspectContainer(id: string): Promise<any>;
  listContainers(all?: boolean): Promise<any[]>;
  getContainerLogs(id: string, options?: any): Promise<string>;
  execCreate(id: string, config: any): Promise<{ id: string }>;
  execStart(execId: string, options?: any): Promise<any>;
  pullImage(image: string, options?: any): Promise<void>;
  listImages(): Promise<any[]>;
  removeImage(id: string, force?: boolean): Promise<void>;
}

class MockDockerClient implements DockerClient {
  private containers: Map<string, any> = new Map();
  private images: Set<string> = new Set(['alpine:latest', 'nginx:latest']);

  async ping(): Promise<void> {
    // Simulate successful ping
  }

  async createContainer(config: any): Promise<{ id: string }> {
    const id = Math.random().toString(36).substring(7);
    this.containers.set(id, {
      id,
      config,
      state: 'created',
      name: config.name || `container_${id}`,
    });
    return { id };
  }

  async startContainer(id: string): Promise<void> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    container.state = 'running';
  }

  async stopContainer(id: string, timeout?: number): Promise<void> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    container.state = 'stopped';
  }

  async removeContainer(id: string, force?: boolean): Promise<void> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    if (container.state === 'running' && !force) {
      throw new Error('Cannot remove running container');
    }
    this.containers.delete(id);
  }

  async inspectContainer(id: string): Promise<any> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    return container;
  }

  async listContainers(all?: boolean): Promise<any[]> {
    return Array.from(this.containers.values()).filter(c => 
      all || c.state === 'running'
    );
  }

  async getContainerLogs(id: string, options?: any): Promise<string> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    return `Mock logs for container ${id}\n`;
  }

  async execCreate(id: string, config: any): Promise<{ id: string }> {
    const container = this.containers.get(id);
    if (!container) throw new Error(`Container ${id} not found`);
    return { id: Math.random().toString(36).substring(7) };
  }

  async execStart(execId: string, options?: any): Promise<any> {
    return { stdout: 'Mock exec output\n', stderr: '' };
  }

  async pullImage(image: string, options?: any): Promise<void> {
    this.images.add(image);
  }

  async listImages(): Promise<any[]> {
    return Array.from(this.images).map(tag => ({
      id: Math.random().toString(36).substring(7),
      repoTags: [tag],
      size: Math.floor(Math.random() * 100000000),
    }));
  }

  async removeImage(id: string, force?: boolean): Promise<void> {
    // Mock implementation
  }
}

export class DockerAdapter extends BaseAdapter {
  private dockerConfig: DockerConfig;
  private client: DockerClient;

  constructor(config: DockerConfig) {
    super({
      name: 'docker',
      type: 'container',
      timeout: 30000,
      retries: 3,
    });

    this.dockerConfig = config;
    // TODO: Replace with actual Docker client
    this.client = new MockDockerClient();
  }

  async connect(): Promise<void> {
    try {
      await this.client.ping();
      
      this.connected = true;
      this.connectionTime = Date.now();

      this.emitEvent({
        type: 'connected',
        timestamp: Date.now(),
        data: {
          version: this.dockerConfig.version || 'latest',
          host: this.dockerConfig.host || 'localhost',
        },
      });
    } catch (error) {
      this.lastError = error as Error;
      this.emitEvent({
        type: 'error',
        timestamp: Date.now(),
        error: error as Error,
      });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;

    this.emitEvent({
      type: 'disconnected',
      timestamp: Date.now(),
    });
  }

  async execute(action: string, params?: any): Promise<ExecutionResult> {
    if (!this.connected) {
      throw new Error('Adapter not connected');
    }

    const startTime = Date.now();

    try {
      let result: any;

      switch (action) {
        case 'create':
          result = await this.createContainer(params);
          break;
        case 'start':
          result = await this.startContainer(params.id);
          break;
        case 'stop':
          result = await this.stopContainer(params.id, params.timeout);
          break;
        case 'remove':
          result = await this.removeContainer(params.id, params.force);
          break;
        case 'inspect':
          result = await this.inspectContainer(params.id);
          break;
        case 'list':
          result = await this.listContainers(params.all);
          break;
        case 'logs':
          result = await this.getContainerLogs(params.id, params.options);
          break;
        case 'exec':
          result = await this.execInContainer(params.id, params.command, params.options);
          break;
        case 'pull':
          result = await this.pullImage(params.image, params.options);
          break;
        case 'images':
          result = await this.listImages();
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        success: true,
        output: result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        error: error as Error,
        duration: Date.now() - startTime,
      };
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.ping();
      return true;
    } catch {
      return false;
    }
  }

  validateConfig(config: any): boolean {
    try {
      DockerConfigSchema.parse(config);
      return true;
    } catch {
      return false;
    }
  }

  // Container operations
  async createContainer(config: ContainerConfig): Promise<string> {
    const containerConfig = {
      Image: config.image,
      name: config.name,
      Cmd: config.command,
      Env: config.env ? Object.entries(config.env).map(([k, v]) => `${k}=${v}`) : undefined,
      WorkingDir: config.workingDir,
      User: config.user,
      Labels: config.labels,
      HostConfig: {
        Binds: config.volumes?.map(v => `${v.host}:${v.container}:${v.mode || 'rw'}`),
        PortBindings: config.ports?.reduce((acc, p) => {
          acc[`${p.container}/${p.protocol || 'tcp'}`] = [{ HostPort: p.host.toString() }];
          return acc;
        }, {} as any),
        RestartPolicy: config.restart ? { Name: config.restart } : undefined,
        CpuShares: config.cpuShares,
        Memory: config.memory ? this.parseMemory(config.memory) : undefined,
      },
      NetworkingConfig: config.networks ? {
        EndpointsConfig: config.networks.reduce((acc, net) => {
          acc[net] = {};
          return acc;
        }, {} as any),
      } : undefined,
    };

    const { id } = await this.client.createContainer(containerConfig);
    return id;
  }

  async startContainer(id: string): Promise<void> {
    await this.client.startContainer(id);
  }

  async stopContainer(id: string, timeout?: number): Promise<void> {
    await this.client.stopContainer(id, timeout);
  }

  async removeContainer(id: string, force?: boolean): Promise<void> {
    await this.client.removeContainer(id, force);
  }

  async inspectContainer(id: string): Promise<any> {
    return await this.client.inspectContainer(id);
  }

  async listContainers(all?: boolean): Promise<any[]> {
    return await this.client.listContainers(all);
  }

  async getContainerLogs(id: string, options?: {
    stdout?: boolean;
    stderr?: boolean;
    follow?: boolean;
    tail?: number;
    since?: number;
  }): Promise<string> {
    return await this.client.getContainerLogs(id, options);
  }

  async execInContainer(id: string, command: string[], options?: {
    env?: Record<string, string>;
    workingDir?: string;
    user?: string;
    tty?: boolean;
    stdin?: boolean;
  }): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const execConfig = {
      Cmd: command,
      Env: options?.env ? Object.entries(options.env).map(([k, v]) => `${k}=${v}`) : undefined,
      WorkingDir: options?.workingDir,
      User: options?.user,
      Tty: options?.tty,
      AttachStdin: options?.stdin,
      AttachStdout: true,
      AttachStderr: true,
    };

    const { id: execId } = await this.client.execCreate(id, execConfig);
    const result = await this.client.execStart(execId);

    return {
      stdout: result.stdout || '',
      stderr: result.stderr || '',
      exitCode: result.exitCode || 0,
    };
  }

  // Image operations
  async pullImage(image: string, options?: {
    tag?: string;
    auth?: { username: string; password: string };
  }): Promise<void> {
    const imageWithTag = options?.tag ? `${image}:${options.tag}` : image;
    await this.client.pullImage(imageWithTag, options);
  }

  async listImages(): Promise<any[]> {
    return await this.client.listImages();
  }

  async removeImage(id: string, force?: boolean): Promise<void> {
    await this.client.removeImage(id, force);
  }

  // Helper methods
  private parseMemory(memory: string): number {
    const units: Record<string, number> = {
      b: 1,
      k: 1024,
      m: 1024 * 1024,
      g: 1024 * 1024 * 1024,
    };

    const match = memory.toLowerCase().match(/^(\d+)([bkmg])?$/);
    if (!match) {
      throw new Error(`Invalid memory format: ${memory}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2] || 'b';

    return value * units[unit];
  }
}