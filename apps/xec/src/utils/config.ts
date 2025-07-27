import os from 'os';
import path from 'path';
import { z } from 'zod';
import fs from 'fs-extra';
import yaml from 'js-yaml';
import { merge } from 'es-toolkit';

// Configuration schema
const AdapterConfigSchema = z.object({
  defaults: z.record(z.any()).optional(),
  hosts: z.record(z.any()).optional()
});

const ProfileSchema = z.object({
  adapter: z.string().optional(),
  defaultHost: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().optional(),
  shell: z.string().optional()
});

const ConfigSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional(),
  defaults: z.object({
    adapter: z.enum(['local', 'ssh', 'docker', 'kubernetes', 'remote-docker']).optional(),
    timeout: z.number().optional(),
    retry: z.number().optional(),
    shell: z.string().optional(),
    env: z.record(z.string()).optional()
  }).optional(),
  adapters: z.object({
    ssh: AdapterConfigSchema.optional(),
    docker: AdapterConfigSchema.optional(),
    kubernetes: AdapterConfigSchema.optional()
  }).optional(),
  profiles: z.record(ProfileSchema).optional(),
  aliases: z.record(z.string()).optional(),
  plugins: z.array(z.string()).optional(),
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).optional(),
    file: z.string().optional(),
    maxSize: z.string().optional(),
    maxFiles: z.number().optional()
  }).optional(),
  environments: z.record(z.any()).optional()
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigManager {
  private config: Config = {};
  private configPaths: string[] = [];
  private activeProfile?: string;

  constructor() {
    this.configPaths = [
      path.join(os.homedir(), '.xec', 'config.yaml'),
      path.join(process.cwd(), '.xec', 'config.yaml')
    ];
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<Config> {
    // Start with empty config
    this.config = {};

    // Load from each path and merge
    for (const configPath of this.configPaths) {
      if (await fs.pathExists(configPath)) {
        try {
          const content = await fs.readFile(configPath, 'utf-8');
          const parsed = yaml.load(content) as any;
          
          // Validate the configuration
          const validated = ConfigSchema.parse(parsed);
          
          // Merge with existing config (later configs override earlier ones)
          this.config = merge(this.config, validated);
        } catch (error) {
          console.warn(`Failed to load config from ${configPath}:`, error);
        }
      }
    }

    // Apply environment variables
    this.applyEnvironmentVariables();

    // Apply active profile if set
    if (this.activeProfile && this.config.profiles?.[this.activeProfile]) {
      this.applyProfile(this.activeProfile);
    }

    return this.config;
  }

  /**
   * Save configuration to local project
   */
  async save(config?: Config): Promise<void> {
    const configToSave = config || this.config;
    const localConfigPath = path.join(process.cwd(), '.xec', 'config.yaml');
    
    await fs.ensureDir(path.dirname(localConfigPath));
    await fs.writeFile(
      localConfigPath,
      yaml.dump(configToSave, { indent: 2 })
    );
  }

  /**
   * Get current configuration
   */
  get(): Config {
    return this.config;
  }

  /**
   * Get specific configuration value
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
   * Set configuration value
   */
  setValue(path: string, value: any): void {
    const parts = path.split('.');
    let current: any = this.config;
    
    if (parts.length === 0) return;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * Apply a profile
   */
  applyProfile(profileName: string): void {
    const profile = this.config.profiles?.[profileName];
    if (!profile) {
      throw new Error(`Profile '${profileName}' not found`);
    }

    // Merge profile settings into defaults
    if (profile.adapter) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.adapter = profile.adapter as any;
    }

    if (profile.env) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.env = {
        ...this.config.defaults.env,
        ...profile.env
      };
    }

    if (profile.timeout) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.timeout = profile.timeout;
    }

    if (profile.shell) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.shell = profile.shell;
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
   * List available profiles
   */
  listProfiles(): string[] {
    return Object.keys(this.config.profiles || {});
  }

  /**
   * Get SSH host configuration
   */
  getSSHHost(hostname: string): any {
    return this.config.adapters?.ssh?.hosts?.[hostname];
  }

  /**
   * Get adapter defaults
   */
  getAdapterDefaults(adapter: string): any {
    switch (adapter) {
      case 'ssh':
        return this.config.adapters?.ssh?.defaults || {};
      case 'docker':
        return this.config.adapters?.docker?.defaults || {};
      case 'kubernetes':
        return this.config.adapters?.kubernetes?.defaults || {};
      default:
        return {};
    }
  }

  /**
   * Resolve command alias
   */
  resolveAlias(command: string): string | undefined {
    return this.config.aliases?.[command];
  }

  /**
   * Apply environment variables to configuration
   */
  private applyEnvironmentVariables(): void {
    // XEC_PROFILE
    if (process.env['XEC_PROFILE']) {
      this.activeProfile = process.env['XEC_PROFILE'];
    }

    // XEC_LOG_LEVEL
    if (process.env['XEC_LOG_LEVEL']) {
      this.config.logging = this.config.logging || {};
      this.config.logging.level = process.env['XEC_LOG_LEVEL'] as any;
    }

    // XEC_ADAPTER
    if (process.env['XEC_ADAPTER']) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.adapter = process.env['XEC_ADAPTER'] as any;
    }

    // XEC_TIMEOUT
    if (process.env['XEC_TIMEOUT']) {
      this.config.defaults = this.config.defaults || {};
      this.config.defaults.timeout = parseInt(process.env['XEC_TIMEOUT'], 10);
    }
  }

  /**
   * Get configuration for specific environment
   */
  getEnvironment(name: string): any {
    return this.config.environments?.[name];
  }

  /**
   * Check if configuration exists
   */
  async exists(): Promise<boolean> {
    for (const configPath of this.configPaths) {
      if (await fs.pathExists(configPath)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths(): string[] {
    return this.configPaths;
  }

  /**
   * Add custom configuration path
   */
  addConfigPath(path: string): void {
    this.configPaths.push(path);
  }
}

// Singleton instance
let configManager: ConfigManager;

/**
 * Get config manager instance
 */
export function getConfig(): ConfigManager {
  if (!configManager) {
    configManager = new ConfigManager();
  }
  return configManager;
}

/**
 * Load configuration
 */
export async function loadConfig(): Promise<Config> {
  return getConfig().load();
}

/**
 * Get configuration value
 */
export function getConfigValue(path: string): any {
  return getConfig().getValue(path);
}

/**
 * Set configuration value
 */
export function setConfigValue(path: string, value: any): void {
  getConfig().setValue(path, value);
}