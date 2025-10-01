/**
 * Target API
 * 
 * Provides programmatic access to xec target management.
 * Supports listing, resolving, and executing commands on targets.
 */

import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

import { TargetResolver } from '../config/target-resolver.js';
import { createTargetEngine } from '../utils/direct-execution.js';
import { ConfigurationManager } from '../config/configuration-manager.js';

import type {
  PodConfig,
  HostConfig,
  ContainerConfig
} from '../config/types.js';
import type { 
  Target, 
  CopyOptions, 
  PortForward, 
  ForwardOptions,
  ExecutionResult 
} from './types.js';

export class TargetAPI {
  private configManager: ConfigurationManager;
  private resolver?: TargetResolver;
  private activeForwards: Map<string, PortForward> = new Map();

  constructor() {
    this.configManager = new ConfigurationManager();
  }

  /**
   * Initialize the target API
   */
  private async initialize(): Promise<void> {
    if (!this.resolver) {
      await this.configManager.load();
      this.resolver = new TargetResolver(this.configManager.getConfig());
    }
  }

  /**
   * List all configured targets
   * @param type - Filter by target type
   */
  async list(type?: 'ssh' | 'docker' | 'kubernetes'): Promise<Target[]> {
    await this.initialize();
    const config = this.configManager.getConfig();
    const targets: Target[] = [];

    // Add SSH hosts
    if (!type || type === 'ssh') {
      const hosts = config.targets?.hosts || {};
      for (const [name, hostConfig] of Object.entries(hosts)) {
        targets.push({
          id: `hosts.${name}`,
          type: 'ssh',
          name,
          config: { ...hostConfig, type: 'ssh' } as HostConfig,
          source: 'configured'
        });
      }
    }

    // Add Docker containers
    if (!type || type === 'docker') {
      const containers = config.targets?.containers || {};
      for (const [name, containerConfig] of Object.entries(containers)) {
        targets.push({
          id: `containers.${name}`,
          type: 'docker',
          name,
          config: { ...containerConfig, type: 'docker' } as ContainerConfig,
          source: 'configured'
        });
      }
    }

    // Add Kubernetes pods
    if (!type || type === 'kubernetes') {
      const pods = config.targets?.pods || {};
      for (const [name, podConfig] of Object.entries(pods)) {
        targets.push({
          id: `pods.${name}`,
          type: 'kubernetes',
          name,
          config: { ...podConfig, type: 'kubernetes' } as PodConfig,
          source: 'configured'
        });
      }
    }

    return targets;
  }

  /**
   * Get a specific target
   * @param ref - Target reference
   */
  async get(ref: string): Promise<Target | undefined> {
    await this.initialize();
    
    try {
      return await this.resolver!.resolve(ref);
    } catch {
      return undefined;
    }
  }

  /**
   * Find targets by pattern
   * @param pattern - Target pattern (supports wildcards)
   */
  async find(pattern: string): Promise<Target[]> {
    await this.initialize();
    
    // Handle different pattern types
    if (pattern.includes('*') || pattern.includes(',')) {
      return this.resolver!.find(pattern);
    }

    // Single target
    const target = await this.get(pattern);
    return target ? [target] : [];
  }

  /**
   * Execute a command on a target
   * @param ref - Target reference
   * @param command - Command to execute
   * @param options - Execution options
   */
  async exec(
    ref: string, 
    command: string, 
    options: Record<string, any> = {}
  ): Promise<ExecutionResult> {
    await this.initialize();
    
    // Resolve target
    const target = await this.resolver!.resolve(ref);
    
    // Create execution engine for target
    const engine = await createTargetEngine(target, options);
    
    // Execute command
    const result = await engine`${command}`;
    
    return {
      ...result,
      target
    };
  }

  /**
   * Copy files to/from a target
   * @param source - Source path (can include target prefix)
   * @param destination - Destination path (can include target prefix)
   * @param options - Copy options
   */
  async copy(
    source: string, 
    destination: string, 
    options: CopyOptions = {}
  ): Promise<void> {
    await this.initialize();
    
    // Parse source and destination
    const { target: sourceTarget, path: sourcePath } = this.parseTargetPath(source);
    const { target: destTarget, path: destPath } = this.parseTargetPath(destination);
    
    // Both can't be remote
    if (sourceTarget && destTarget) {
      throw new Error('Cannot copy between two remote targets directly');
    }
    
    // Determine direction and target
    const isUpload = !sourceTarget && Boolean(destTarget);
    const target = sourceTarget || destTarget;
    
    if (!target) {
      // Local to local copy
      if (options.recursive) {
        // Use fs.cp for directory copy
        await fs.cp(sourcePath, destPath, { recursive: true });
      } else {
        // Use fs.copyFile for single file copy
        await fs.copyFile(sourcePath, destPath);
      }
      return;
    }
    
    // Resolve target
    const resolvedTarget = await this.resolver!.resolve(target);
    
    // Perform copy based on target type
    switch (resolvedTarget.type) {
      case 'ssh':
        await this.copySSH(resolvedTarget, sourcePath, destPath, isUpload, options);
        break;
      case 'docker':
        await this.copyDocker(resolvedTarget, sourcePath, destPath, isUpload, options);
        break;
      case 'kubernetes':
        await this.copyKubernetes(resolvedTarget, sourcePath, destPath, isUpload, options);
        break;
      default:
        throw new Error(`Copy not supported for target type: ${resolvedTarget.type}`);
    }
  }

  /**
   * Forward ports from a target
   * @param target - Target reference with port
   * @param localPort - Local port (optional, auto-assigned if not provided)
   * @param options - Forward options
   */
  async forward(
    target: string, 
    localPort?: number,
    options: ForwardOptions = {}
  ): Promise<PortForward> {
    await this.initialize();
    
    // Parse target and remote port
    const match = target.match(/^(.+):(\d+)$/);
    if (!match) {
      throw new Error('Target must include port (e.g., hosts.web:8080)');
    }
    
    const targetRef = match[1];
    const remotePortStr = match[2];
    if (!targetRef || !remotePortStr) {
      throw new Error('Invalid target format');
    }
    const remotePort = parseInt(remotePortStr, 10);
    
    // Resolve target
    const resolvedTarget = await this.resolver!.resolve(targetRef);
    
    // Auto-assign local port if not provided
    if (!localPort && options.dynamic) {
      localPort = await this.findAvailablePort();
    } else if (!localPort) {
      localPort = remotePort; // Default to same port
    }
    
    // Create forward based on target type
    let forwardProcess: any;
    
    switch (resolvedTarget.type) {
      case 'ssh':
        forwardProcess = await this.forwardSSH(resolvedTarget, localPort, remotePort);
        break;
      case 'kubernetes':
        forwardProcess = await this.forwardKubernetes(resolvedTarget, localPort, remotePort);
        break;
      default:
        throw new Error(`Port forwarding not supported for target type: ${resolvedTarget.type}`);
    }
    
    // Create forward object
    const forward: PortForward = {
      localPort,
      remotePort,
      target: resolvedTarget,
      close: async () => {
        if (forwardProcess) {
          forwardProcess.kill();
        }
        this.activeForwards.delete(`${targetRef}:${remotePort}`);
      }
    };
    
    // Track active forward
    this.activeForwards.set(`${targetRef}:${remotePort}`, forward);
    
    return forward;
  }

  /**
   * Create a new target dynamically
   * @param definition - Target definition
   */
  async create(definition: Partial<Target> & { type: string; name: string }): Promise<Target> {
    await this.initialize();
    
    // Create appropriate config based on type
    const config: any = definition.config || {};
    config.type = definition.type;
    
    const target: Target = {
      id: `dynamic.${definition.name}`,
      type: definition.type as any,
      name: definition.name,
      config,
      source: 'created'
    };
    
    // Validate target can be created
    const engine = await createTargetEngine(target);
    
    return target;
  }

  /**
   * Test connectivity to a target
   * @param ref - Target reference
   */
  async test(ref: string): Promise<boolean> {
    try {
      const result = await this.exec(ref, 'echo "test"', { 
        timeout: 5000,
        throwOnNonZeroExit: false 
      });
      return result.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get active port forwards
   */
  getActiveForwards(): PortForward[] {
    return Array.from(this.activeForwards.values());
  }

  /**
   * Close all active port forwards
   */
  async closeAllForwards(): Promise<void> {
    const forwards = Array.from(this.activeForwards.values());
    await Promise.all(forwards.map(f => f.close()));
  }

  // Private helper methods

  private parseTargetPath(path: string): { target?: string; path: string } {
    const match = path.match(/^([^:]+):(.+)$/);
    if (match) {
      return { target: match[1] || undefined, path: match[2] || '' };
    }
    return { path };
  }

  private async copySSH(
    target: Target, 
    source: string, 
    dest: string, 
    isUpload: boolean,
    options: CopyOptions
  ): Promise<void> {
    const config = target.config as HostConfig;
    const { host, user, port = 22, privateKey } = config;
    const sshDest = `${user}@${host}:`;
    
    const scpArgs = [
      port !== 22 ? `-P ${port}` : null,
      privateKey ? `-i ${privateKey}` : null,
      options.recursive === true ? '-r' : null,
      options.compress === true ? '-C' : null,
      isUpload ? source : `${sshDest}${source}`,
      isUpload ? `${sshDest}${dest}` : dest
    ].filter((arg): arg is string => arg !== null).join(' ');
    
    await $`scp ${scpArgs}`;
  }

  private async copyDocker(
    target: Target, 
    source: string, 
    dest: string, 
    isUpload: boolean,
    options: CopyOptions
  ): Promise<void> {
    const config = target.config as ContainerConfig;
    const container = config.container || target.name;
    
    if (isUpload) {
      await $`docker cp ${source} ${container}:${dest}`;
    } else {
      await $`docker cp ${container}:${source} ${dest}`;
    }
  }

  private async copyKubernetes(
    target: Target, 
    source: string, 
    dest: string, 
    isUpload: boolean,
    options: CopyOptions
  ): Promise<void> {
    const config = target.config as PodConfig;
    const { namespace = 'default', pod, container } = config;
    const containerFlag = container ? `-c ${container}` : '';
    
    if (isUpload) {
      await $`kubectl cp ${source} ${namespace}/${pod}:${dest} ${containerFlag}`;
    } else {
      await $`kubectl cp ${namespace}/${pod}:${source} ${dest} ${containerFlag}`;
    }
  }

  private async forwardSSH(
    target: Target, 
    localPort: number, 
    remotePort: number
  ): Promise<any> {
    const config = target.config as HostConfig;
    const { host, user, port = 22, privateKey } = config;
    
    const sshArgs = [
      '-N',
      '-L', `${localPort}:localhost:${remotePort}`,
      port !== 22 ? `-p ${port}` : null,
      privateKey ? `-i ${privateKey}` : null,
      `${user}@${host}`
    ].filter((arg): arg is string => arg !== null).join(' ');
    
    return $`ssh ${sshArgs}`.nothrow();
  }

  private async forwardKubernetes(
    target: Target, 
    localPort: number, 
    remotePort: number
  ): Promise<any> {
    const config = target.config as PodConfig;
    const { namespace = 'default', pod } = config;
    
    return $`kubectl port-forward -n ${namespace} ${pod} ${localPort}:${remotePort}`.nothrow();
  }

  private async findAvailablePort(): Promise<number> {
    // Simple implementation - in production would use proper port scanning
    return Math.floor(Math.random() * (65535 - 30000) + 30000);
  }
}

// Export singleton instance for convenience
export const targets = new TargetAPI();