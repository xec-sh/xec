/**
 * Configuration Manager - handles loading, merging, and managing configurations
 */

import * as path from 'path';
import jsYaml from 'js-yaml';
import * as fs from 'fs/promises';

import { SecretManager } from '../secrets/index.js';
import { TargetResolver } from './target-resolver.js';
import { ConfigValidator } from './config-validator.js';
import { deepMerge, getGlobalConfigDir } from './utils.js';
import { VariableInterpolator } from './variable-interpolator.js';

import type {
  ConfigSource,
  Configuration,
  ProfileConfig,
  TargetsConfig,
  ValidationError,
  VariableContext,
  ConfigManagerOptions
} from './types.js';

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: Partial<Configuration> = {
  version: '1.0',
  targets: {
    local: {
      type: 'local'
    }
  },
  commands: {
    in: {
      defaultTimeout: '30s'
    },
    on: {
      parallel: false
    },
    copy: {
      compress: true,
      progress: true
    },
    forward: {
      dynamic: true
    },
    watch: {
      interval: 2,
      clear: true
    }
  }
};

/**
 * Configuration manager implementation
 */
export class ConfigurationManager {
  private sources: ConfigSource[] = [];
  private merged?: Configuration;
  private interpolator: VariableInterpolator;
  private validator: ConfigValidator;
  private secretManager: SecretManager;

  constructor(private options: ConfigManagerOptions = {}) {
    this.options.projectRoot = this.options.projectRoot || process.cwd();
    this.options.globalConfigDir = this.options.globalConfigDir || getGlobalConfigDir();
    this.options.envPrefix = this.options.envPrefix || 'XEC_';

    // Initialize secret manager based on configuration
    this.secretManager = new SecretManager(this.options.secretProvider);
    this.interpolator = new VariableInterpolator(this.secretManager);
    this.validator = new ConfigValidator();
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<Configuration> {
    // Clear previous state
    this.sources = [];
    this.merged = undefined;

    // Initialize secret manager
    await this.secretManager.initialize();

    // 1. Load from multiple sources in priority order
    await this.loadBuiltinDefaults();
    await this.loadGlobalConfig();
    await this.loadProjectConfig();
    await this.loadEnvironmentConfig();
    await this.loadProfileConfig();

    // 2. Merge configurations
    this.merged = this.mergeConfigurations();

    // 3. Update secret provider from configuration if specified
    if (this.merged.secrets) {
      await this.updateSecretProvider({
        type: this.merged.secrets.provider,
        config: this.merged.secrets.config
      });
    }

    // 4. Resolve variables
    try {
      this.merged = await this.resolveVariables(this.merged);
    } catch (error: any) {
      // Handle circular references and other interpolation errors
      if (error.message.includes('Circular variable reference detected')) {
        if (this.options.strict) {
          throw error;
        } else {
          console.warn(`Config warning: ${error.message}`);
          // Continue with unresolved variables for validation
        }
      } else {
        throw error;
      }
    }

    // 4. Validate
    const errors = await this.validator.validate(this.merged);
    if (errors.length > 0) {
      if (this.options.strict) {
        throw new ConfigValidationError('Configuration validation failed', errors);
      } else {
        // Log warnings in non-strict mode
        for (const error of errors) {
          console.warn(`Config warning: ${error.path} - ${error.message}`);
        }
      }
    }

    return this.merged;
  }

  /**
   * Get a configuration value by path
   */
  get<T = any>(path: string): T | undefined {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }

    return this.getByPath(this.merged, path) as T;
  }

  /**
   * Set a configuration value by path
   */
  set(path: string, value: any): void {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }

    this.setByPath(this.merged, path, value);
  }

  /**
   * Get the current profile name
   */
  getCurrentProfile(): string | undefined {
    return this.options.profile || process.env[`${this.options.envPrefix}PROFILE`];
  }

  /**
   * Switch to a different profile
   */
  async useProfile(profileName: string): Promise<void> {
    this.options.profile = profileName;
    await this.load();
  }

  /**
   * Get all available profiles
   */
  getProfiles(): string[] {
    return Object.keys(this.merged?.profiles || {});
  }

  /**
   * Interpolate variables in a string
   */
  interpolate(value: string, context?: Partial<VariableContext>): string {
    // Convert process.env to Record<string, string>
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const fullContext: VariableContext = {
      vars: this.merged?.vars || {},
      env,
      profile: this.getCurrentProfile(),
      ...context
    };

    return this.interpolator.interpolate(value, fullContext);
  }

  /**
   * Get the full configuration object
   */
  getConfig(): Configuration {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }
    return this.merged;
  }

  /**
   * Get the target resolver
   */
  getTargetResolver(): TargetResolver {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }
    return new TargetResolver(this.merged);
  }

  /**
   * Validate the current configuration
   */
  async validate(): Promise<ValidationError[]> {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }
    return this.validator.validate(this.merged);
  }

  /**
   * Save configuration to file
   */
  async save(filePath?: string): Promise<void> {
    if (!this.merged) {
      throw new Error('No configuration to save');
    }

    const targetPath = filePath || path.join(this.options.projectRoot!, '.xec', 'config.yaml');
    const dir = path.dirname(targetPath);

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Convert to YAML
    const yamlContent = jsYaml.dump(this.merged, {
      indent: 2,
      lineWidth: 120,
      sortKeys: false
    });

    // Write file
    await fs.writeFile(targetPath, yamlContent, 'utf-8');
  }

  /**
   * Validate configuration without loading
   */
  async validateFile(filePath: string): Promise<ValidationError[]> {
    const content = await fs.readFile(filePath, 'utf-8');
    const config = jsYaml.load(content) as Configuration;
    return this.validator.validate(config);
  }

  // Private methods

  private async loadBuiltinDefaults(): Promise<void> {
    this.sources.push({
      type: 'builtin',
      name: 'defaults',
      priority: 0,
      config: DEFAULT_CONFIG
    });
  }

  private async loadGlobalConfig(): Promise<void> {
    const globalPath = path.join(this.options.globalConfigDir!, 'config.yaml');

    try {
      const content = await fs.readFile(globalPath, 'utf-8');
      const config = jsYaml.load(content) as Configuration;

      this.sources.push({
        type: 'global',
        path: globalPath,
        priority: 10,
        config
      });
    } catch (error: any) {
      // Global config is optional
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to load global config: ${error.message}`);
      }
    }
  }

  private async loadProjectConfig(): Promise<void> {
    // Try multiple locations
    const locations = [
      path.join(this.options.projectRoot!, '.xec', 'config.yaml'),
      path.join(this.options.projectRoot!, '.xec', 'config.yml'),
      path.join(this.options.projectRoot!, 'xec.yaml'),
      path.join(this.options.projectRoot!, 'xec.yml')
    ];

    for (const location of locations) {
      try {
        const content = await fs.readFile(location, 'utf-8');
        const config = jsYaml.load(content) as Configuration;

        this.sources.push({
          type: 'project',
          path: location,
          priority: 20,
          config
        });

        // Use first found
        break;
      } catch (error: any) {
        // Continue to next location
        if (error.code !== 'ENOENT') {
          if (this.options.strict && error.name === 'YAMLException') {
            throw error;
          }
          console.warn(`Failed to load project config from ${location}: ${error.message}`);
        }
      }
    }
  }

  private async loadEnvironmentConfig(): Promise<void> {
    const envConfig: Partial<Configuration> = {};
    const prefix = this.options.envPrefix!;

    // Look for environment variables with prefix
    for (const [key, value] of Object.entries(process.env)) {
      if (key.startsWith(prefix) && key !== `${prefix}PROFILE`) {
        // Convert XEC_VARS_APP_NAME to vars.app_name
        const path = key
          .substring(prefix.length)
          .toLowerCase()
          .replace(/_/g, '.');

        this.setByPath(envConfig, path, value);
      }
    }

    // Also check for XEC_CONFIG pointing to a file
    const configPath = process.env[`${prefix}CONFIG`];
    if (configPath) {
      try {
        const content = await fs.readFile(configPath, 'utf-8');
        const config = jsYaml.load(content) as Configuration;

        this.sources.push({
          type: 'env',
          path: configPath,
          priority: 30,
          config
        });
      } catch (error: any) {
        console.warn(`Failed to load config from ${prefix}CONFIG: ${error.message}`);
      }
    }

    if (Object.keys(envConfig).length > 0) {
      this.sources.push({
        type: 'env',
        name: 'environment',
        priority: 35,
        config: envConfig
      });
    }
  }

  private async loadProfileConfig(): Promise<void> {
    const profileName = this.getCurrentProfile();
    if (!profileName) {
      return;
    }

    // Resolve the full profile with inheritance
    const resolvedProfile = await this.resolveProfileWithInheritance(profileName);

    if (resolvedProfile) {
      // Convert profile config to full config structure
      const config: Partial<Configuration> = {
        vars: resolvedProfile.vars,
        targets: resolvedProfile.targets
      };

      if (resolvedProfile.env) {
        config.scripts = { env: resolvedProfile.env };
      }

      this.sources.push({
        type: 'profile',
        name: profileName,
        priority: 40,
        config
      });
    }
  }

  private async resolveProfileWithInheritance(profileName: string): Promise<ProfileConfig | undefined> {
    const seen = new Set<string>();
    const profiles: ProfileConfig[] = [];

    let currentName: string | undefined = profileName;

    while (currentName) {
      // Prevent circular inheritance
      if (seen.has(currentName)) {
        console.warn(`Circular profile inheritance detected: ${currentName}`);
        break;
      }
      seen.add(currentName);

      // Find the profile
      let profileConfig: ProfileConfig | undefined;

      // First check in already loaded configs
      for (const source of this.sources) {
        if (source.config.profiles?.[currentName]) {
          profileConfig = source.config.profiles[currentName];
          break;
        }
      }

      if (!profileConfig) {
        // Try loading from separate file
        const profilePath = path.join(
          this.options.projectRoot!,
          '.xec',
          'profiles',
          `${currentName}.yaml`
        );

        try {
          const content = await fs.readFile(profilePath, 'utf-8');
          profileConfig = jsYaml.load(content) as ProfileConfig;
        } catch (error: any) {
          if (error.code !== 'ENOENT') {
            console.warn(`Failed to load profile ${currentName}: ${error.message}`);
          }
        }
      }

      if (profileConfig) {
        profiles.unshift(profileConfig); // Add to beginning for proper merge order
        currentName = profileConfig.extends;
      } else {
        break;
      }
    }

    // Merge profiles from base to most specific
    if (profiles.length === 0) {
      return undefined;
    }

    // For single profile without inheritance, return as-is to preserve $unset
    if (profiles.length === 1) {
      return profiles[0];
    }

    // For multiple profiles (inheritance), merge them
    const result: ProfileConfig = {};
    for (const profile of profiles) {
      // Deep merge vars
      if (profile.vars) {
        result.vars = deepMerge(result.vars || {}, profile.vars);
      }

      // Deep merge targets
      if (profile.targets) {
        result.targets = deepMerge(result.targets || {}, profile.targets) as Partial<TargetsConfig>;
      }

      // Merge env (simple merge, later values override)
      if (profile.env) {
        result.env = { ...result.env, ...profile.env };
      }
    }

    return result;
  }

  private mergeConfigurations(): Configuration {
    // Sort sources by priority
    const sorted = [...this.sources].sort((a, b) => a.priority - b.priority);

    // Start with empty config
    let merged: Configuration = { version: '1.0' };

    // Merge each source
    for (const source of sorted) {
      merged = deepMerge(merged, source.config) as Configuration;
    }

    return merged;
  }

  private async resolveVariables(config: Configuration): Promise<Configuration> {
    // Convert process.env to Record<string, string>
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }

    const context: VariableContext = {
      vars: config.vars || {},
      env,
      profile: this.getCurrentProfile()
    };

    // Don't resolve task commands - they may contain params that are only available at runtime
    const configCopy = JSON.parse(JSON.stringify(config));
    const tasks = configCopy.tasks;
    delete configCopy.tasks;

    // Resolve variables in the config except tasks
    const resolved = await this.interpolator.resolveConfig(configCopy, context);

    // Add tasks back without resolution
    if (tasks) {
      resolved.tasks = tasks;
    }

    return resolved;
  }

  private getByPath(obj: any, path: string): any {
    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private setByPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    const lastPart = parts.pop()!;
    let current = obj;

    for (const part of parts) {
      if (!(part in current) || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[lastPart] = value;
  }

  /**
   * Get the secret manager instance
   */
  getSecretManager(): SecretManager {
    return this.secretManager;
  }

  /**
   * Update secret provider configuration
   */
  async updateSecretProvider(config: ConfigManagerOptions['secretProvider']): Promise<void> {
    this.secretManager = new SecretManager(config);
    await this.secretManager.initialize();
    this.interpolator = new VariableInterpolator(this.secretManager);
  }
}

/**
 * Configuration validation error
 */
export class ConfigValidationError extends Error {
  constructor(message: string, public errors: ValidationError[]) {
    super(message);
    this.name = 'ConfigValidationError';
  }
}