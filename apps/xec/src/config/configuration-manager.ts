/**
 * Configuration Manager - handles loading, merging, and managing configurations
 */

import * as path from 'path';
import jsYaml from 'js-yaml';
import { existsSync } from 'fs';
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
    this.options.globalHomeDir = this.options.globalHomeDir || getGlobalConfigDir();
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
  get<T = any>(p: string): T | undefined {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }

    return this.getByPath(this.merged, p) as T;
  }

  /**
   * Set a configuration value by path
   */
  set(p: string, value: any): void {
    if (!this.merged) {
      throw new Error('Configuration not loaded. Call jsYaml.load() first.');
    }

    this.setByPath(this.merged, p, value);
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
    const fullContext: VariableContext = {
      vars: this.merged?.vars || {},
      env: this.getEnvironmentVariables(),
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
   * Get the discovered project root path
   * Useful for debugging and understanding where configuration is loaded from
   */
  async getProjectRoot(): Promise<string> {
    const projectRoot = await this.findProjectRoot(this.options.projectRoot!);
    return projectRoot || this.options.projectRoot!;
  }

  /**
   * Get the path where configuration will be saved
   * @returns The full path to the configuration file
   */
  async getConfigPath(): Promise<string> {
    const saveRoot = await this.findProjectRoot(this.options.projectRoot!);
    return path.join(saveRoot || this.options.projectRoot!, '.xec', 'config.yaml');
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

    // If no path specified, save to project root .xec directory
    let targetPath = filePath;
    if (!targetPath) {
      const saveRoot = await this.findProjectRoot(this.options.projectRoot!);
      targetPath = path.join(saveRoot || this.options.projectRoot!, '.xec', 'config.yaml');
    }

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
    
    // Log where config was saved for debugging
    if (process.env['XEC_DEBUG']) {
      console.log(`[ConfigManager] Configuration saved to: ${targetPath}`);
    }
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


  /**
   * Find the monorepo or project root by looking for common root indicators
   * Priority:
   * 1. Directory with existing .xec/config.yaml
   * 2. Monorepo root (package.json with workspaces)
   * 3. Git repository root
   * 4. null if nothing found
   * @param startDir - Directory to start searching from
   * @returns The root directory path or null if not found
   */
  private async findProjectRoot(startDir: string): Promise<string | null> {
    let currentDir = path.resolve(startDir);
    let monorepoRoot: string | null = null;
    let gitRoot: string | null = null;
    let firstConfigDir: string | null = null;
    
    // Traverse up to find all relevant roots
    while (currentDir !== path.dirname(currentDir)) {
      // Check for .xec directory with actual config file
      if (!firstConfigDir && this.hasXecConfig(currentDir)) {
        firstConfigDir = currentDir;
      }

      // Check for monorepo indicators (package.json with workspaces)
      if (!monorepoRoot) {
        const packageJsonPath = path.join(currentDir, 'package.json');
        if (existsSync(packageJsonPath)) {
          try {
            const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));
            if (packageJson.workspaces) {
              monorepoRoot = currentDir;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      // Check for .git directory (repository root)
      if (!gitRoot && existsSync(path.join(currentDir, '.git'))) {
        gitRoot = currentDir;
      }

      currentDir = path.dirname(currentDir);
    }

    // Return in priority order
    if (firstConfigDir) {
      return firstConfigDir;
    }
    if (monorepoRoot) {
      return monorepoRoot;
    }
    if (gitRoot) {
      return gitRoot;
    }
    
    return null;
  }

  /**
   * Check if a directory has an xec configuration file
   */
  private hasXecConfig(dir: string): boolean {
    return existsSync(path.join(dir, '.xec', 'config.yaml')) ||
           existsSync(path.join(dir, '.xec', 'config.yml'));
  }

  /**
   * Build configuration search paths in priority order
   */
  private buildConfigSearchPaths(searchRoot: string): string[] {
    const locations = [
      // Prioritize .xec directory in project/monorepo root
      path.join(searchRoot, '.xec', 'config.yaml'),
      path.join(searchRoot, '.xec', 'config.yml'),
      // Also check current directory if different from searchRoot
      ...(searchRoot !== this.options.projectRoot ? [
        path.join(this.options.projectRoot!, '.xec', 'config.yaml'),
        path.join(this.options.projectRoot!, '.xec', 'config.yml'),
      ] : []),
      // Legacy locations
      path.join(searchRoot, 'xec.yaml'),
      path.join(searchRoot, 'xec.yml'),
      path.join(this.options.projectRoot!, 'xec.yaml'),
      path.join(this.options.projectRoot!, 'xec.yml')
    ];

    // Remove duplicates while preserving order
    return [...new Set(locations)];
  }

  /**
   * Build profile search paths
   */
  private buildProfileSearchPaths(searchRoot: string, profileName: string): string[] {
    const paths = [
      path.join(searchRoot, '.xec', 'profiles', `${profileName}.yaml`),
    ];
    
    // Also check current directory if different from searchRoot
    if (searchRoot !== this.options.projectRoot) {
      paths.push(path.join(this.options.projectRoot!, '.xec', 'profiles', `${profileName}.yaml`));
    }
    
    return paths;
  }

  /**
   * Try to load a configuration file
   * @returns The configuration or undefined if not found/invalid
   */
  private async tryLoadConfigFile(filePath: string): Promise<Configuration | undefined> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      return jsYaml.load(content) as Configuration;
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        if (this.options.strict && error.name === 'YAMLException') {
          throw error;
        }
        console.warn(`Failed to load config from ${filePath}: ${error.message}`);
      } else if (process.env['XEC_DEBUG']) {
        console.log(`[ConfigManager] File not found: ${filePath}`);
      }
      return undefined;
    }
  }

  private async loadBuiltinDefaults(): Promise<void> {
    this.sources.push({
      type: 'builtin',
      name: 'defaults',
      priority: 0,
      config: DEFAULT_CONFIG
    });
  }

  private async loadGlobalConfig(): Promise<void> {
    const globalPath = path.join(this.options.globalHomeDir!, 'config.yaml');
    const config = await this.tryLoadConfigFile(globalPath);
    
    if (config) {
      this.sources.push({
        type: 'global',
        path: globalPath,
        priority: 10,
        config
      });
    }
  }

  private async loadProjectConfig(): Promise<void> {
    // First, try to find the project root (monorepo or regular project)
    const projectRoot = await this.findProjectRoot(this.options.projectRoot!);

    // If no project root found, fall back to current directory
    const searchRoot = projectRoot || this.options.projectRoot!;

    // Debug logging
    if (process.env['XEC_DEBUG']) {
      console.log(`[ConfigManager] Current directory: ${this.options.projectRoot}`);
      console.log(`[ConfigManager] Found project root: ${projectRoot || 'not found'}`);
      console.log(`[ConfigManager] Search root: ${searchRoot}`);
    }

    // Build configuration search paths
    const uniqueLocations = this.buildConfigSearchPaths(searchRoot);

    if (process.env['XEC_DEBUG']) {
      console.log(`[ConfigManager] Will check these locations for config:`);
      uniqueLocations.forEach((loc, i) => {
        console.log(`  ${i + 1}. ${loc} (exists: ${existsSync(loc)})`);
      });
    }

    for (const location of uniqueLocations) {
      const config = await this.tryLoadConfigFile(location);
      if (config) {
        this.sources.push({
          type: 'project',
          path: location,
          priority: 20,
          config
        });

        // Log where config was found (useful for debugging in monorepos)
        if (process.env['XEC_DEBUG']) {
          console.log(`[ConfigManager] Successfully loaded project config from: ${location}`);
        }

        // Use first found
        break;
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
        const p = key
          .substring(prefix.length)
          .toLowerCase()
          .replace(/_/g, '.');

        this.setByPath(envConfig, p, value);
      }
    }

    // Also check for XEC_CONFIG pointing to a file
    const configPath = process.env[`${prefix}CONFIG`];
    if (configPath) {
      const config = await this.tryLoadConfigFile(configPath);
      if (config) {
        this.sources.push({
          type: 'env',
          path: configPath,
          priority: 30,
          config
        });
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
        // Try loading from separate file, checking project root first
        const projectRoot = await this.findProjectRoot(this.options.projectRoot!);
        const searchRoot = projectRoot || this.options.projectRoot!;

        // Build profile search paths
        const profilePaths = this.buildProfileSearchPaths(searchRoot, currentName);

        for (const profilePath of profilePaths) {
          try {
            const content = await fs.readFile(profilePath, 'utf-8');
            profileConfig = jsYaml.load(content) as ProfileConfig;
            break;  // Use first found
          } catch (error: any) {
            if (error.code !== 'ENOENT') {
              console.warn(`Failed to load profile ${currentName} from ${profilePath}: ${error.message}`);
            }
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
    const context: VariableContext = {
      vars: config.vars || {},
      env: this.getEnvironmentVariables(),
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

  private getByPath(obj: any, p: string): any {
    const parts = p.split('.');
    let current = obj;

    for (const part of parts) {
      if (current == null || typeof current !== 'object') {
        return undefined;
      }
      current = current[part];
    }

    return current;
  }

  private setByPath(obj: any, p: string, value: any): void {
    const parts = p.split('.');
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

  /**
   * Convert process.env to Record<string, string>
   */
  private getEnvironmentVariables(): Record<string, string> {
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    return env;
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