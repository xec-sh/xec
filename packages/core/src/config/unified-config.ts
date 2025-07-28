import { z } from 'zod';
import * as os from 'os';
import * as path from 'path';
import * as yaml from 'js-yaml';
import * as fs from 'fs/promises';

import { ExecutionEngineConfig } from '../core/execution-engine.js';

import type { SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions } from '../core/command.js';

// Host configuration schema
const HostConfigSchema = z.object({
  host: z.string(),
  username: z.string().optional(),
  password: z.string().optional(),
  privateKey: z.string().optional(),
  privateKeyPath: z.string().optional(),
  port: z.number().optional(),
  readyTimeout: z.number().optional(),
  keepaliveInterval: z.number().optional(),
  env: z.record(z.string(), z.string()).optional()
});

// Container configuration schema
const ContainerConfigSchema = z.object({
  name: z.string().optional(),
  image: z.string().optional(),
  container: z.string().optional(),
  env: z.record(z.string(), z.string()).optional()
});

// Pod configuration schema
const PodConfigSchema = z.object({
  name: z.string(),
  namespace: z.string().optional(),
  container: z.string().optional(),
  context: z.string().optional(),
  kubeconfig: z.string().optional()
});

// Defaults configuration schema
const DefaultsSchema = z.object({
  timeout: z.union([z.number(), z.string()]).optional(),
  shell: z.union([z.string(), z.boolean()]).optional(),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  encoding: z.string().optional(),
  throwOnNonZeroExit: z.boolean().optional()
});

// Profile schema
const ProfileSchema = z.object({
  extends: z.string().optional(),
  defaults: DefaultsSchema.optional(),
  hosts: z.record(z.string(), HostConfigSchema).optional(),
  containers: z.record(z.string(), ContainerConfigSchema).optional(),
  pods: z.record(z.string(), PodConfigSchema).optional()
});

// Main configuration schema
const UnifiedConfigSchema = z.object({
  // Meta information
  name: z.string().optional(),
  description: z.string().optional(),
  version: z.string().optional(),
  
  // Global defaults
  defaults: DefaultsSchema.optional(),
  
  // Resource definitions
  hosts: z.record(z.string(), HostConfigSchema).optional(),
  containers: z.record(z.string(), ContainerConfigSchema).optional(),
  pods: z.record(z.string(), PodConfigSchema).optional(),
  
  // Aliases for commands
  aliases: z.record(z.string(), z.string()).optional(),
  
  // Profiles for different environments
  profiles: z.record(z.string(), ProfileSchema).optional(),
  
  // Plugin system (future)
  plugins: z.array(z.string()).optional()
});

export type UnifiedConfig = z.infer<typeof UnifiedConfigSchema>;
export type HostConfig = z.infer<typeof HostConfigSchema>;
export type ContainerConfig = z.infer<typeof ContainerConfigSchema>;
export type PodConfig = z.infer<typeof PodConfigSchema>;
export type ProfileConfig = z.infer<typeof ProfileSchema>;

/**
 * Configuration loader that works for both core and CLI
 */
export class UnifiedConfigLoader {
  private static instance: UnifiedConfigLoader;
  private config: UnifiedConfig = {};
  private loadedPaths: string[] = [];
  private activeProfile?: string;
  
  /**
   * Configuration search paths in order of precedence
   */
  private readonly searchPaths = [
    // Environment variable
    () => process.env['XEC_CONFIG'],
    // Current directory
    () => path.join(process.cwd(), '.xec', 'config.yaml'),
    () => path.join(process.cwd(), '.xec.yaml'),
    () => path.join(process.cwd(), 'xec.yaml'),
    // User home directory
    () => path.join(os.homedir(), '.xec', 'config.yaml'),
    () => path.join(os.homedir(), '.xec.yaml')
  ];
  
  private constructor() {}
  
  /**
   * Get singleton instance
   */
  static getInstance(): UnifiedConfigLoader {
    if (!UnifiedConfigLoader.instance) {
      UnifiedConfigLoader.instance = new UnifiedConfigLoader();
    }
    return UnifiedConfigLoader.instance;
  }
  
  /**
   * Load configuration from all available sources
   */
  async load(additionalPaths?: string[]): Promise<UnifiedConfig> {
    this.config = {};
    this.loadedPaths = [];
    
    // Collect all paths to check
    const pathsToCheck: string[] = [];
    
    // Add search paths
    for (const pathFn of this.searchPaths) {
      const path = pathFn();
      if (path) pathsToCheck.push(path);
    }
    
    // Add any additional paths
    if (additionalPaths) {
      pathsToCheck.push(...additionalPaths);
    }
    
    // Load and merge configurations
    for (const configPath of pathsToCheck) {
      try {
        const stats = await fs.stat(configPath);
        if (stats.isFile()) {
          const content = await fs.readFile(configPath, 'utf-8');
          const parsed = yaml.load(content) as any;
          const validated = UnifiedConfigSchema.parse(parsed);
          
          // Merge configuration
          this.config = this.mergeConfigs(this.config, validated);
          this.loadedPaths.push(configPath);
        }
      } catch (error: any) {
        // Ignore missing files, but log parse errors
        if (error?.code === 'ENOENT') {
          continue;
        }
        console.warn(`Failed to load config from ${configPath}:`, error);
      }
    }
    
    // Apply environment variables
    this.applyEnvironmentOverrides();
    
    // Apply active profile if set
    const profileName = process.env['XEC_PROFILE'] || this.activeProfile;
    if (profileName) {
      this.applyProfile(profileName);
    }
    
    return this.config;
  }
  
  /**
   * Save configuration to a specific path
   */
  async save(config: UnifiedConfig, filePath?: string): Promise<void> {
    const targetPath = filePath || path.join(process.cwd(), '.xec', 'config.yaml');
    const dir = path.dirname(targetPath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });
    
    // Write configuration
    const content = yaml.dump(config, {
      indent: 2,
      sortKeys: false,
      noRefs: true
    });
    
    await fs.writeFile(targetPath, content, 'utf-8');
  }
  
  /**
   * Get current configuration
   */
  get(): UnifiedConfig {
    return this.config;
  }
  
  /**
   * Get specific value by path (dot notation)
   */
  getValue(path: string): any {
    const parts = path.split('.');
    let current: any = this.config;
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current;
  }
  
  /**
   * Set specific value by path (dot notation)
   */
  setValue(path: string, value: any): void {
    const parts = path.split('.');
    let current: any = this.config;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i]!;
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1]!;
    current[lastPart] = value;
  }
  
  /**
   * Apply a profile to the current configuration
   */
  applyProfile(profileName: string): void {
    const profile = this.config.profiles?.[profileName];
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }
    
    // Handle profile inheritance
    if (profile.extends) {
      this.applyProfile(profile.extends);
    }
    
    // Merge profile settings
    if (profile.defaults) {
      this.config.defaults = this.mergeDefaults(this.config.defaults || {}, profile.defaults);
    }
    
    if (profile.hosts) {
      this.config.hosts = { ...this.config.hosts, ...profile.hosts };
    }
    
    if (profile.containers) {
      this.config.containers = { ...this.config.containers, ...profile.containers };
    }
    
    if (profile.pods) {
      this.config.pods = { ...this.config.pods, ...profile.pods };
    }
    
    this.activeProfile = profileName;
  }
  
  /**
   * Get active profile name
   */
  getActiveProfile(): string | undefined {
    return this.activeProfile;
  }
  
  /**
   * Get SSH host configuration
   */
  getHost(name: string): HostConfig | undefined {
    return this.config.hosts?.[name];
  }
  
  /**
   * Get container configuration
   */
  getContainer(name: string): ContainerConfig | undefined {
    return this.config.containers?.[name];
  }
  
  /**
   * Get pod configuration
   */
  getPod(name: string): PodConfig | undefined {
    return this.config.pods?.[name];
  }
  
  /**
   * Resolve command alias
   */
  resolveAlias(alias: string): string | undefined {
    return this.config.aliases?.[alias];
  }
  
  /**
   * List all defined hosts
   */
  listHosts(): string[] {
    return Object.keys(this.config.hosts || {});
  }
  
  /**
   * List all defined containers
   */
  listContainers(): string[] {
    return Object.keys(this.config.containers || {});
  }
  
  /**
   * List all defined pods
   */
  listPods(): string[] {
    return Object.keys(this.config.pods || {});
  }
  
  /**
   * List all available profiles
   */
  listProfiles(): string[] {
    return Object.keys(this.config.profiles || {});
  }
  
  /**
   * Convert to ExecutionEngineConfig for core compatibility
   */
  toEngineConfig(): ExecutionEngineConfig {
    const config: ExecutionEngineConfig = {};
    
    if (this.config.defaults) {
      if (this.config.defaults.timeout) {
        config.defaultTimeout = this.parseTimeout(this.config.defaults.timeout);
      }
      if (this.config.defaults.cwd) {
        config.defaultCwd = this.config.defaults.cwd;
      }
      if (this.config.defaults.env) {
        config.defaultEnv = this.config.defaults.env;
      }
      if (this.config.defaults.shell !== undefined) {
        config.defaultShell = this.config.defaults.shell;
      }
      if (this.config.defaults.encoding) {
        config.encoding = this.config.defaults.encoding as BufferEncoding;
      }
      if (this.config.defaults.throwOnNonZeroExit !== undefined) {
        config.throwOnNonZeroExit = this.config.defaults.throwOnNonZeroExit;
      }
    }
    
    return config;
  }
  
  /**
   * Convert host config to SSH adapter options
   */
  async hostToSSHOptions(name: string): Promise<Partial<SSHAdapterOptions>> {
    const host = this.getHost(name);
    if (!host) {
      throw new Error(`Host '${name}' not found in configuration`);
    }
    
    return {
      host: host.host,
      username: host.username,
      password: host.password,
      privateKey: host.privateKey || (host.privateKeyPath ? await this.readPrivateKey(host.privateKeyPath) : undefined),
      port: host.port
    };
  }
  
  /**
   * Convert container config to Docker adapter options
   */
  containerToDockerOptions(name: string): Partial<DockerAdapterOptions> {
    const container = this.getContainer(name);
    if (!container) {
      throw new Error(`Container '${name}' not found in configuration`);
    }
    
    return {
      container: container.container || container.name
    };
  }
  
  /**
   * Convert pod config to Kubernetes adapter options
   */
  podToK8sOptions(name: string): Partial<KubernetesAdapterOptions> {
    const pod = this.getPod(name);
    if (!pod) {
      throw new Error(`Pod '${name}' not found in configuration`);
    }
    
    return {
      pod: pod.name,
      namespace: pod.namespace,
      container: pod.container
    };
  }
  
  /**
   * Get loaded configuration file paths
   */
  getLoadedPaths(): string[] {
    return [...this.loadedPaths];
  }
  
  /**
   * Check if configuration exists
   */
  async exists(): Promise<boolean> {
    for (const pathFn of this.searchPaths) {
      const configPath = pathFn();
      if (!configPath) continue;
      
      try {
        const stats = await fs.stat(configPath);
        if (stats.isFile()) return true;
      } catch {
        continue;
      }
    }
    return false;
  }
  
  /**
   * Read private key from file
   */
  private async readPrivateKey(path: string): Promise<string | undefined> {
    try {
      return await fs.readFile(path, 'utf-8');
    } catch {
      return undefined;
    }
  }
  
  /**
   * Apply environment variable overrides
   */
  private applyEnvironmentOverrides(): void {
    // XEC_TIMEOUT
    if (process.env['XEC_TIMEOUT']) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.timeout = process.env['XEC_TIMEOUT'];
    }
    
    // XEC_SHELL
    if (process.env['XEC_SHELL']) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.shell = process.env['XEC_SHELL'];
    }
    
    // XEC_CWD
    if (process.env['XEC_CWD']) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.cwd = process.env['XEC_CWD'];
    }
  }
  
  /**
   * Merge two configurations
   */
  private mergeConfigs(base: UnifiedConfig, override: UnifiedConfig): UnifiedConfig {
    const merged: UnifiedConfig = { ...base };
    
    // Simple properties
    if (override.name) merged.name = override.name;
    if (override.description) merged.description = override.description;
    if (override.version) merged.version = override.version;
    
    // Merge defaults
    if (override.defaults) {
      merged.defaults = this.mergeDefaults(merged.defaults || {}, override.defaults);
    }
    
    // Merge resources (hosts, containers, pods)
    if (override.hosts) {
      merged.hosts = { ...merged.hosts, ...override.hosts };
    }
    
    if (override.containers) {
      merged.containers = { ...merged.containers, ...override.containers };
    }
    
    if (override.pods) {
      merged.pods = { ...merged.pods, ...override.pods };
    }
    
    // Merge aliases
    if (override.aliases) {
      merged.aliases = { ...merged.aliases, ...override.aliases };
    }
    
    // Merge profiles
    if (override.profiles) {
      merged.profiles = { ...merged.profiles, ...override.profiles };
    }
    
    // Merge plugins
    if (override.plugins) {
      const existingPlugins = new Set(merged.plugins || []);
      override.plugins.forEach(p => existingPlugins.add(p));
      merged.plugins = Array.from(existingPlugins);
    }
    
    return merged;
  }
  
  /**
   * Merge defaults objects
   */
  private mergeDefaults(
    base: z.infer<typeof DefaultsSchema>,
    override: z.infer<typeof DefaultsSchema>
  ): z.infer<typeof DefaultsSchema> {
    const merged = { ...base };
    
    if (override.timeout !== undefined) merged.timeout = override.timeout;
    if (override.shell !== undefined) merged.shell = override.shell;
    if (override.cwd !== undefined) merged.cwd = override.cwd;
    if (override.encoding !== undefined) merged.encoding = override.encoding;
    if (override.throwOnNonZeroExit !== undefined) merged.throwOnNonZeroExit = override.throwOnNonZeroExit;
    
    // Merge environment variables
    if (override.env) {
      merged.env = { ...merged.env, ...override.env };
    }
    
    return merged;
  }
  
  /**
   * Parse timeout value from string or number
   */
  private parseTimeout(value: string | number): number {
    if (typeof value === 'number') return value;
    
    const match = value.match(/^(\d+)(ms|s|m|h)?$/);
    if (!match) {
      throw new Error(`Invalid timeout format: ${value}`);
    }
    
    const num = parseInt(match[1]!, 10);
    const unit = match[2] || 'ms';
    
    switch (unit) {
      case 'ms': return num;
      case 's': return num * 1000;
      case 'm': return num * 60 * 1000;
      case 'h': return num * 60 * 60 * 1000;
      default: return num;
    }
  }
}

// Export singleton instance
export const unifiedConfig = UnifiedConfigLoader.getInstance();