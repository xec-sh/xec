/**
 * Adapter to use the core's unified configuration in the CLI
 * This provides backwards compatibility while migrating to the unified config
 */

import * as os from 'os';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs-extra';
import * as yaml from 'js-yaml';
import { unifiedConfig, type UnifiedConfig } from '@xec-sh/core';

// Re-export types from core
export type { PodConfig, HostConfig, UnifiedConfig, ContainerConfig } from '@xec-sh/core';

/**
 * ConfigManager wrapper around the core's unified config
 * Provides backwards compatibility with the existing CLI config API
 */
export class ConfigManager {
  private additionalPaths: string[] = [];

  constructor() {
    // Add CLI-specific config paths if needed
    this.additionalPaths = [];
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<UnifiedConfig> {
    return unifiedConfig.load(this.additionalPaths);
  }

  /**
   * Save configuration
   */
  async save(config?: UnifiedConfig): Promise<void> {
    const configToSave = config || unifiedConfig.get();
    await unifiedConfig.save(configToSave);
  }

  /**
   * Get current configuration
   */
  get(): UnifiedConfig {
    return unifiedConfig.get();
  }

  /**
   * Get specific configuration value
   */
  getValue(path: string): any {
    return unifiedConfig.getValue(path);
  }

  /**
   * Set configuration value
   */
  setValue(path: string, value: any): void {
    unifiedConfig.setValue(path, value);
  }

  /**
   * Apply a profile
   */
  applyProfile(profileName: string): void {
    unifiedConfig.applyProfile(profileName);
  }

  /**
   * Get active profile name
   */
  getActiveProfile(): string | undefined {
    return unifiedConfig.getActiveProfile();
  }

  /**
   * List available profiles
   */
  listProfiles(): string[] {
    return unifiedConfig.listProfiles();
  }

  /**
   * Get SSH host configuration
   * Provides backwards compatibility with old config structure
   */
  getSSHHost(hostname: string): any {
    const host = unifiedConfig.getHost(hostname);
    if (host) {
      return host;
    }

    // Backwards compatibility: check old config structure
    const oldConfig = this.getValue('adapters.ssh.hosts');
    return oldConfig?.[hostname];
  }

  /**
   * Get adapter defaults
   * Maps old config structure to new unified config
   */
  getAdapterDefaults(adapter: string): any {
    const defaults = unifiedConfig.get().defaults || {};

    // Map old adapter-specific defaults
    switch (adapter) {
      case 'ssh':
        {
          const sshDefaults = this.getValue('adapters.ssh.defaults') || {};
          return { ...defaults, ...sshDefaults };
        }
      case 'docker':
        {
          const dockerDefaults = this.getValue('adapters.docker.defaults') || {};
          return { ...defaults, ...dockerDefaults };
        }
      case 'kubernetes':
        {
          const k8sDefaults = this.getValue('adapters.kubernetes.defaults') || {};
          return { ...defaults, ...k8sDefaults };
        }
      default:
        return defaults;
    }
  }

  /**
   * Resolve command alias
   */
  resolveAlias(command: string): string | undefined {
    return unifiedConfig.resolveAlias(command);
  }

  /**
   * Get configuration for specific environment
   * This is a CLI-specific feature not in the core config
   */
  getEnvironment(name: string): any {
    return this.getValue(`environments.${name}`);
  }

  /**
   * Check if configuration exists
   */
  async exists(): Promise<boolean> {
    return unifiedConfig.exists();
  }

  /**
   * Get configuration file paths
   */
  getConfigPaths(): string[] {
    return unifiedConfig.getLoadedPaths();
  }

  /**
   * Add custom configuration path
   */
  addConfigPath(path: string): void {
    this.additionalPaths.push(path);
  }

  /**
   * Get all hosts
   */
  getHosts(): Record<string, any> {
    const config = unifiedConfig.get();
    return config.hosts || {};
  }

  /**
   * Get all containers
   */
  getContainers(): Record<string, any> {
    const config = unifiedConfig.get();
    return config.containers || {};
  }

  /**
   * Get all pods
   */
  getPods(): Record<string, any> {
    const config = unifiedConfig.get();
    return config.pods || {};
  }
}

/**
 * Migration tool to convert old CLI configs to unified format
 */
export class ConfigMigrator {
  /**
   * Check if migration is needed
   */
  static async needsMigration(): Promise<boolean> {
    // Check for old config format
    const oldPaths = [
      path.join(os.homedir(), '.xec', 'config.json'),
      path.join(process.cwd(), '.xec', 'config.json')
    ];

    for (const oldPath of oldPaths) {
      if (await fs.pathExists(oldPath)) {
        return true;
      }
    }

    // Check if current YAML has old structure
    const yamlPaths = [
      path.join(os.homedir(), '.xec', 'config.yaml'),
      path.join(process.cwd(), '.xec', 'config.yaml')
    ];

    for (const yamlPath of yamlPaths) {
      if (await fs.pathExists(yamlPath)) {
        try {
          const content = await fs.readFile(yamlPath, 'utf-8');
          const config = yaml.load(content) as any;

          // Check for old structure (adapters.ssh.hosts instead of hosts)
          if (config.adapters?.ssh?.hosts) {
            return true;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }

    return false;
  }

  /**
   * Migrate old configuration to new format
   */
  static async migrate(dryRun = false): Promise<UnifiedConfig | null> {
    console.log(chalk.blue('🔄 Checking for configuration migration...'));

    if (!await this.needsMigration()) {
      console.log(chalk.green('✅ Configuration is already up to date'));
      return null;
    }

    console.log(chalk.yellow('📦 Found old configuration format, migrating...'));

    const migratedConfig: UnifiedConfig = {
      name: 'Migrated Configuration',
      description: 'Automatically migrated from old format'
    };

    // Load and merge all old configs
    const oldConfigs = await this.loadOldConfigs();

    for (const oldConfig of oldConfigs) {
      // Migrate defaults
      if (oldConfig.defaults) {
        migratedConfig.defaults = {
          ...migratedConfig.defaults,
          ...oldConfig.defaults
        };
      }

      // Migrate SSH hosts from adapters.ssh.hosts to hosts
      if (oldConfig.adapters?.ssh?.hosts) {
        migratedConfig.hosts = {
          ...migratedConfig.hosts,
          ...oldConfig.adapters.ssh.hosts
        };
      }

      // Migrate Docker containers
      if (oldConfig.adapters?.docker?.hosts) {
        migratedConfig.containers = {
          ...migratedConfig.containers,
          ...oldConfig.adapters.docker.hosts
        };
      }

      // Migrate Kubernetes pods
      if (oldConfig.adapters?.kubernetes?.hosts) {
        migratedConfig.pods = {
          ...migratedConfig.pods,
          ...oldConfig.adapters.kubernetes.hosts
        };
      }

      // Migrate profiles
      if (oldConfig.profiles) {
        migratedConfig.profiles = {
          ...migratedConfig.profiles,
          ...oldConfig.profiles
        };
      }

      // Migrate aliases
      if (oldConfig.aliases) {
        migratedConfig.aliases = {
          ...migratedConfig.aliases,
          ...oldConfig.aliases
        };
      }

      // Migrate environments (CLI-specific, store as profiles)
      if (oldConfig.environments) {
        migratedConfig.profiles = migratedConfig.profiles || {};

        for (const [envName, envConfig] of Object.entries(oldConfig.environments as any)) {
          const env = envConfig as any;
          migratedConfig.profiles[`env-${envName}`] = {
            defaults: env.defaults,
            hosts: env.hosts
          };
        }
      }
    }

    if (dryRun) {
      console.log(chalk.blue('\n📋 Migration preview:'));
      console.log(yaml.dump(migratedConfig, { indent: 2 }));
      return migratedConfig;
    }

    // Save migrated config
    const targetPath = path.join(os.homedir(), '.xec', 'config.yaml');
    await fs.ensureDir(path.dirname(targetPath));

    // Backup old config if it exists
    if (await fs.pathExists(targetPath)) {
      const backupPath = `${targetPath}.backup.${Date.now()}`;
      await fs.copy(targetPath, backupPath);
      console.log(chalk.gray(`📄 Backed up old config to: ${backupPath}`));
    }

    // Save new config
    await fs.writeFile(
      targetPath,
      yaml.dump(migratedConfig, {
        indent: 2,
        sortKeys: false,
        noRefs: true
      })
    );

    console.log(chalk.green(`✅ Configuration migrated to: ${targetPath}`));

    // Remove old JSON configs
    await this.cleanupOldConfigs();

    return migratedConfig;
  }

  /**
   * Load all old configuration files
   */
  private static async loadOldConfigs(): Promise<any[]> {
    const configs: any[] = [];

    // Check JSON configs
    const jsonPaths = [
      path.join(os.homedir(), '.xec', 'config.json'),
      path.join(process.cwd(), '.xec', 'config.json')
    ];

    for (const jsonPath of jsonPaths) {
      if (await fs.pathExists(jsonPath)) {
        try {
          const content = await fs.readFile(jsonPath, 'utf-8');
          configs.push(JSON.parse(content));
        } catch (err) {
          console.warn(chalk.yellow(`⚠️  Failed to parse ${jsonPath}: ${err}`));
        }
      }
    }

    // Check YAML configs with old structure
    const yamlPaths = [
      path.join(os.homedir(), '.xec', 'config.yaml'),
      path.join(process.cwd(), '.xec', 'config.yaml')
    ];

    for (const yamlPath of yamlPaths) {
      if (await fs.pathExists(yamlPath)) {
        try {
          const content = await fs.readFile(yamlPath, 'utf-8');
          const config = yaml.load(content) as any;

          // Only include if it has old structure
          if (config.adapters?.ssh?.hosts) {
            configs.push(config);
          }
        } catch (err) {
          console.warn(chalk.yellow(`⚠️  Failed to parse ${yamlPath}: ${err}`));
        }
      }
    }

    return configs;
  }

  /**
   * Clean up old configuration files after migration
   */
  private static async cleanupOldConfigs(): Promise<void> {
    const oldPaths = [
      path.join(os.homedir(), '.xec', 'config.json'),
      path.join(process.cwd(), '.xec', 'config.json')
    ];

    for (const oldPath of oldPaths) {
      if (await fs.pathExists(oldPath)) {
        const backupPath = `${oldPath}.migrated.${Date.now()}`;
        await fs.move(oldPath, backupPath);
        console.log(chalk.gray(`📦 Archived old config: ${backupPath}`));
      }
    }
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
export async function loadConfig(): Promise<UnifiedConfig> {
  // Check if migration is needed
  if (await ConfigMigrator.needsMigration()) {
    await ConfigMigrator.migrate();
  }

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

