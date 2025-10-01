/**
 * Target Resolver - resolves and manages execution targets
 */

import * as path from 'path';
import { homedir } from 'os';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

import { deepMerge, matchPattern, expandBraces, parseTargetReference } from './utils.js';

import type {
  PodConfig,
  HostConfig,
  TargetConfig,
  Configuration,
  ResolvedTarget,
  TargetReference,
  ContainerConfig
} from './types.js';

/**
 * Target resolver implementation
 */
export class TargetResolver {
  private targetsCache: Map<string, ResolvedTarget> = new Map();

  constructor(
    private config: Configuration,
    private options: {
      autoDetect?: boolean;
      cacheTimeout?: number;
    } = {}
  ) {
    this.options.autoDetect = this.options.autoDetect ?? true;
    this.options.cacheTimeout = this.options.cacheTimeout ?? 60000; // 1 minute
  }

  /**
   * Resolve a target reference to full target configuration
   */
  async resolve(reference: string): Promise<ResolvedTarget> {
    // Check cache first
    const cached = this.targetsCache.get(reference);
    if (cached) {
      return cached;
    }

    // Parse reference
    const parsed = parseTargetReference(reference);

    let resolved: ResolvedTarget | undefined;

    // Try configured targets first
    if (parsed.type !== 'auto') {
      resolved = await this.resolveConfigured(parsed as TargetReference);
      if (!resolved) {
        // For specific type references, don't fall back to auto-detection
        throw new Error(`Target '${parsed.name}' not found in ${parsed.type}`);
      }
    } else {
      // For auto type, try auto-detection if enabled
      if (this.options.autoDetect) {
        resolved = await this.autoDetect(reference);
      }
    }

    if (!resolved) {
      throw new Error(`Target '${reference}' not found`);
    }

    // Cache result
    this.targetsCache.set(reference, resolved);

    // Clear cache after timeout
    setTimeout(() => {
      this.targetsCache.delete(reference);
    }, this.options.cacheTimeout!);

    return resolved;
  }

  /**
   * Find targets matching a pattern
   */
  async find(pattern: string): Promise<ResolvedTarget[]> {
    const parsed = parseTargetReference(pattern);
    const targets: ResolvedTarget[] = [];

    if (parsed.type === 'local') {
      return [await this.resolveLocal()];
    }

    // Expand braces first
    const patterns = expandBraces(parsed.name || pattern);

    for (const expandedPattern of patterns) {
      if (parsed.type === 'hosts' || parsed.type === 'auto') {
        targets.push(...await this.findHosts(expandedPattern));
      }

      if (parsed.type === 'containers' || parsed.type === 'auto') {
        targets.push(...await this.findContainers(expandedPattern));
      }

      if (parsed.type === 'pods' || parsed.type === 'auto') {
        targets.push(...await this.findPods(expandedPattern));
      }
    }

    // Remove duplicates
    const seen = new Set<string>();
    return targets.filter(target => {
      if (seen.has(target.id)) {
        return false;
      }
      seen.add(target.id);
      return true;
    });
  }

  /**
   * List all configured targets
   */
  async list(): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];

    // Add local
    targets.push(await this.resolveLocal());

    // Add hosts
    if (this.config.targets?.hosts) {
      for (const [name, config] of Object.entries(this.config.targets.hosts)) {
        targets.push({
          id: `hosts.${name}`,
          type: 'ssh',
          name,
          config: this.applyDefaults({ ...config, type: 'ssh' } as HostConfig),
          source: 'configured'
        });
      }
    }

    // Add containers
    if (this.config.targets?.containers) {
      for (const [name, config] of Object.entries(this.config.targets.containers)) {
        targets.push({
          id: `containers.${name}`,
          type: 'docker',
          name,
          config: this.applyDefaults({ ...config, type: 'docker' } as ContainerConfig),
          source: 'configured'
        });
      }
    }

    // Add pods
    if (this.config.targets?.pods) {
      for (const [name, config] of Object.entries(this.config.targets.pods)) {
        targets.push({
          id: `pods.${name}`,
          type: 'kubernetes',
          name,
          config: this.applyDefaults({ ...config, type: 'kubernetes' } as PodConfig),
          source: 'configured'
        });
      }
    }

    return targets;
  }

  /**
   * Create a dynamic target
   */
  async create(config: TargetConfig): Promise<ResolvedTarget> {
    const id = this.generateTargetId(config);

    const resolved: ResolvedTarget = {
      id,
      type: config.type,
      name: config.name,
      config,
      source: 'created'
    };

    // Cache it
    this.targetsCache.set(id, resolved);

    return resolved;
  }

  // Private methods

  private async resolveConfigured(ref: TargetReference): Promise<ResolvedTarget | undefined> {
    if (ref.type === 'local') {
      return this.resolveLocal();
    }

    const targets = this.config.targets;
    if (!targets) {
      return undefined;
    }

    let targetConfig: any;
    let targetType: 'ssh' | 'docker' | 'kubernetes';

    switch (ref.type) {
      case 'hosts':
        targetConfig = targets.hosts?.[ref.name!];
        targetType = 'ssh';
        break;

      case 'containers':
        targetConfig = targets.containers?.[ref.name!];
        targetType = 'docker';
        break;

      case 'pods':
        targetConfig = targets.pods?.[ref.name!];
        targetType = 'kubernetes';
        break;

      default:
        return undefined;
    }

    if (!targetConfig) {
      return undefined;
    }

    // Create full config object, only copying defined values (including null)
    const fullConfig: any = { type: targetType };

    // Copy all properties from targetConfig, excluding undefined values
    for (const key in targetConfig) {
      if (Object.prototype.hasOwnProperty.call(targetConfig, key)) {
        const value = targetConfig[key];
        if (value !== undefined) {
          fullConfig[key] = value;
        }
      }
    }

    return {
      id: `${ref.type}.${ref.name}`,
      type: targetType,
      name: ref.name,
      config: this.applyDefaults(fullConfig),
      source: 'configured'
    };
  }

  private async resolveLocal(): Promise<ResolvedTarget> {
    return {
      id: 'local',
      type: 'local',
      config: this.applyDefaults({
        type: 'local',
        ...this.config.targets?.local
      }),
      source: 'configured'
    };
  }

  private async findHosts(pattern: string): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];

    if (this.config.targets?.hosts) {
      for (const [name, config] of Object.entries(this.config.targets.hosts)) {
        if (matchPattern(pattern, name)) {
          targets.push({
            id: `hosts.${name}`,
            type: 'ssh',
            name,
            config: this.applyDefaults({ ...config, type: 'ssh' } as HostConfig),
            source: 'configured'
          });
        }
      }
    }

    return targets;
  }

  private async findContainers(pattern: string): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];

    // Check configured containers
    if (this.config.targets?.containers) {
      for (const [name, config] of Object.entries(this.config.targets.containers)) {
        if (matchPattern(pattern, name)) {
          targets.push({
            id: `containers.${name}`,
            type: 'docker',
            name,
            config: this.applyDefaults({ ...config, type: 'docker' } as ContainerConfig),
            source: 'configured'
          });
        }
      }
    }

    // Check Docker Compose integration
    if (this.config.targets?.$compose && this.options.autoDetect) {
      const composeTargets = await this.findComposeServices(pattern);
      targets.push(...composeTargets);
    }

    return targets;
  }

  private async findPods(pattern: string): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];

    if (this.config.targets?.pods) {
      for (const [name, config] of Object.entries(this.config.targets.pods)) {
        if (matchPattern(pattern, name)) {
          targets.push({
            id: `pods.${name}`,
            type: 'kubernetes',
            name,
            config: this.applyDefaults({ ...config, type: 'kubernetes' } as PodConfig),
            source: 'configured'
          });
        }
      }
    }

    return targets;
  }

  private async autoDetect(reference: string): Promise<ResolvedTarget | undefined> {
    // Try Docker first
    if (await this.isDockerContainer(reference)) {
      return {
        id: reference,
        type: 'docker',
        name: reference,
        config: this.applyDefaults({
          type: 'docker',
          container: reference
        }),
        source: 'detected'
      };
    }

    // Try Kubernetes
    if (await this.isKubernetesPod(reference)) {
      const namespace = this.config.targets?.kubernetes?.$namespace || 'default';
      return {
        id: reference,
        type: 'kubernetes',
        name: reference,
        config: this.applyDefaults({
          type: 'kubernetes',
          pod: reference,
          namespace
        }),
        source: 'detected'
      };
    }

    // Try SSH config
    const sshHost = await this.getSSHHost(reference);
    if (sshHost) {
      return {
        id: reference,
        type: 'ssh',
        name: reference,
        config: this.applyDefaults(sshHost),
        source: 'detected'
      };
    }

    // Default to SSH if it looks like a hostname
    if (reference.includes('.') || reference.includes('@')) {
      let host = reference;
      let user: string | undefined;

      if (reference.includes('@')) {
        const parts = reference.split('@', 2);
        user = parts[0];
        host = parts[1] || host;
      }

      return {
        id: reference,
        type: 'ssh',
        name: reference,
        config: this.applyDefaults({
          type: 'ssh',
          host,
          user
        }),
        source: 'detected'
      };
    }

    return undefined;
  }

  private async isDockerContainer(name: string): Promise<boolean> {
    try {
      const result = await $`docker ps --format "{{.Names}}"`.nothrow();
      if (!result.ok) {
        return false;
      }
      const containers = result.stdout.trim().split('\n').filter(line => line);
      return containers.includes(name);
    } catch {
      return false;
    }
  }

  private async isKubernetesPod(name: string): Promise<boolean> {
    try {
      const namespace = this.config.targets?.kubernetes?.$namespace || 'default';
      const context = this.config.targets?.kubernetes?.$context;

      const args = ['get', 'pod', name, '-n', namespace];
      if (context) {
        args.push('--context', context);
      }

      const result = await $`kubectl ${args.join(' ')}`.quiet().nothrow();

      return result.ok;
    } catch {
      return false;
    }
  }

  private async getSSHHost(name: string): Promise<HostConfig | undefined> {
    try {
      // Parse SSH config
      const sshConfigPath = path.join(homedir(), '.ssh', 'config');
      const configContent = await fs.readFile(sshConfigPath, 'utf-8');

      // Simple SSH config parser (basic implementation)
      const lines = configContent.split('\n');
      let currentHost: string | undefined;
      const hosts: Record<string, any> = {};

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.startsWith('Host ')) {
          currentHost = trimmed.substring(5).trim();
          hosts[currentHost] = {};
        } else if (currentHost && trimmed.includes(' ')) {
          const [key, ...valueParts] = trimmed.split(/\s+/);
          const value = valueParts.join(' ');

          const keyMap: Record<string, string> = {
            'HostName': 'host',
            'User': 'user',
            'Port': 'port',
            'IdentityFile': 'privateKey'
          };

          if (key) {
            const mappedKey = keyMap[key];
            if (mappedKey && currentHost) {
              hosts[currentHost][mappedKey] = value;
            }
          }
        }
      }

      if (hosts[name]) {
        return {
          type: 'ssh',
          host: hosts[name].host || name,
          ...hosts[name]
        };
      }
    } catch {
      // SSH config not found or not readable
    }

    return undefined;
  }

  private async findComposeServices(pattern: string): Promise<ResolvedTarget[]> {
    const targets: ResolvedTarget[] = [];
    const compose = this.config.targets?.$compose;

    if (!compose) {
      return targets;
    }

    try {
      const args = ['compose'];
      if (compose.file) {
        args.push('-f', compose.file);
      }
      if (compose.project) {
        args.push('-p', compose.project);
      }
      args.push('ps', '--format', 'json');

      const result = await $.shell(false)`docker ${args}`.nothrow();
      if (!result.ok) {
        return targets;
      }
      const lines = result.stdout.trim().split('\n').filter(line => line);

      for (const line of lines) {
        const service = JSON.parse(line);
        if (matchPattern(pattern, service.Service)) {
          targets.push({
            id: `containers.${service.Service}`,
            type: 'docker',
            name: service.Service,
            config: this.applyDefaults({
              type: 'docker',
              container: service.Name
            }),
            source: 'detected'
          });
        }
      }
    } catch {
      // Docker Compose not available or failed
    }

    return targets;
  }

  private generateTargetId(config: TargetConfig): string {
    switch (config.type) {
      case 'ssh':
        return `dynamic-ssh-${(config as HostConfig).host}`;
      case 'docker':
        return `dynamic-docker-${(config as ContainerConfig).container || 'ephemeral'}`;
      case 'kubernetes':
        return `dynamic-kubernetes-${(config as PodConfig).pod || 'unknown'}`;
      case 'local':
      default:
        return 'local';
    }
  }

  /**
   * Clear target cache
   */
  clearCache(): void {
    this.targetsCache.clear();
  }

  /**
   * Apply global defaults to target configuration
   */
  private applyDefaults(targetConfig: TargetConfig): TargetConfig {
    const defaults = this.config.targets?.defaults;
    if (!defaults) {
      return targetConfig;
    }

    // Build common defaults
    const commonDefaults: Partial<TargetConfig> = {};
    if (defaults.timeout !== undefined) {
      commonDefaults.timeout = defaults.timeout;
    }
    if (defaults.shell !== undefined) {
      commonDefaults.shell = defaults.shell;
    }
    if (defaults.encoding !== undefined) {
      commonDefaults.encoding = defaults.encoding;
    }
    if (defaults.maxBuffer !== undefined) {
      commonDefaults.maxBuffer = defaults.maxBuffer;
    }
    if (defaults.throwOnNonZeroExit !== undefined) {
      commonDefaults.throwOnNonZeroExit = defaults.throwOnNonZeroExit;
    }
    if (defaults.cwd !== undefined) {
      commonDefaults.cwd = defaults.cwd;
    }
    if (defaults.env) {
      commonDefaults.env = defaults.env;
    }

    // Apply type-specific defaults based on target type
    let typeSpecificDefaults: any = {};

    switch (targetConfig.type) {
      case 'ssh':
        if (defaults.ssh) {
          typeSpecificDefaults = this.applySshDefaults(defaults.ssh, targetConfig as HostConfig);
        }
        break;

      case 'docker':
        if (defaults.docker) {
          typeSpecificDefaults = this.applyDockerDefaults(defaults.docker, targetConfig as ContainerConfig);
        }
        break;

      case 'kubernetes':
        if (defaults.kubernetes) {
          typeSpecificDefaults = this.applyKubernetesDefaults(defaults.kubernetes, targetConfig as PodConfig);
        }
        break;

      case 'local':
        // Local targets only get common defaults
        break;
    }

    // Merge all defaults: defaults first, then type-specific, then target config overrides all
    const withCommonDefaults = deepMerge({}, commonDefaults);
    const withTypeDefaults = deepMerge(withCommonDefaults, typeSpecificDefaults);
    let final = deepMerge(withTypeDefaults, targetConfig);

    // Special handling for arrays that should be concatenated
    if (targetConfig.type === 'kubernetes') {
      const k8sTarget = targetConfig as PodConfig;
      if (defaults.kubernetes?.execFlags && k8sTarget.execFlags) {
        // Concatenate execFlags arrays
        final = {
          ...final,
          execFlags: [...(defaults.kubernetes.execFlags || []), ...(k8sTarget.execFlags || [])]
        };
      }
    }

    return final as TargetConfig;
  }

  /**
   * Apply SSH-specific defaults
   */
  private applySshDefaults(sshDefaults: any, hostConfig: HostConfig): Partial<HostConfig> {
    const defaults: Partial<HostConfig> = {};

    // Apply all SSH-specific defaults
    if (sshDefaults.port !== undefined) {
      defaults.port = sshDefaults.port;
    }
    if (sshDefaults.keepAlive !== undefined) {
      defaults.keepAlive = sshDefaults.keepAlive;
    }
    if (sshDefaults.keepAliveInterval !== undefined) {
      defaults.keepAliveInterval = sshDefaults.keepAliveInterval;
    }
    if (sshDefaults.connectionPool !== undefined) {
      defaults.connectionPool = sshDefaults.connectionPool;
    }
    if (sshDefaults.sudo !== undefined) {
      defaults.sudo = sshDefaults.sudo;
    }
    if (sshDefaults.sftp !== undefined) {
      defaults.sftp = sshDefaults.sftp;
    }

    return defaults;
  }

  /**
   * Apply Docker-specific defaults
   */
  private applyDockerDefaults(dockerDefaults: any, containerConfig: ContainerConfig): Partial<ContainerConfig> {
    const defaults: Partial<ContainerConfig> = {};

    if (dockerDefaults.tty !== undefined) {
      defaults.tty = dockerDefaults.tty;
    }
    if (dockerDefaults.workdir !== undefined) {
      defaults.workdir = dockerDefaults.workdir;
    }
    if (dockerDefaults.autoRemove !== undefined) {
      defaults.autoRemove = dockerDefaults.autoRemove;
    }
    if (dockerDefaults.socketPath !== undefined) {
      defaults.socketPath = dockerDefaults.socketPath;
    }
    if (dockerDefaults.user !== undefined) {
      defaults.user = dockerDefaults.user;
    }
    if (dockerDefaults.runMode !== undefined) {
      defaults.runMode = dockerDefaults.runMode;
    }

    return defaults;
  }

  /**
   * Apply Kubernetes-specific defaults
   */
  private applyKubernetesDefaults(k8sDefaults: any, podConfig: PodConfig): Partial<PodConfig> {
    const defaults: Partial<PodConfig> = {};

    if (k8sDefaults.namespace !== undefined) {
      defaults.namespace = k8sDefaults.namespace;
    }
    if (k8sDefaults.tty !== undefined) {
      defaults.tty = k8sDefaults.tty;
    }
    if (k8sDefaults.stdin !== undefined) {
      defaults.stdin = k8sDefaults.stdin;
    }
    if (k8sDefaults.kubeconfig !== undefined) {
      defaults.kubeconfig = k8sDefaults.kubeconfig;
    }
    if (k8sDefaults.context !== undefined) {
      defaults.context = k8sDefaults.context;
    }
    if (k8sDefaults.execFlags !== undefined) {
      defaults.execFlags = k8sDefaults.execFlags;
    }

    return defaults;
  }
}