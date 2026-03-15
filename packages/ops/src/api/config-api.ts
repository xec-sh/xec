/**
 * Configuration API
 * 
 * Provides programmatic access to xec configuration management.
 * Supports loading, querying, modifying, and saving configurations.
 */

import { ConfigurationManager } from '../config/configuration-manager.js';
import { VariableInterpolator } from '../config/variable-interpolator.js';

import type { ConfigValue, ConfigurationOptions, InterpolationContext } from './types.js';

export class ConfigAPI {
  private manager: ConfigurationManager;
  private interpolator: VariableInterpolator;
  private loaded = false;

  constructor(private options: ConfigurationOptions = {}) {
    this.manager = new ConfigurationManager();
    this.interpolator = new VariableInterpolator();
  }

  /**
   * Load configuration from all sources
   */
  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    await this.manager.load();
    
    // Mark as loaded before applying overrides to avoid circular dependency
    this.loaded = true;

    // Apply any overrides
    if (this.options.overrides) {
      for (const [path, value] of Object.entries(this.options.overrides)) {
        this.set(path, value);
      }
    }
  }

  /**
   * Get a configuration value by path
   * @param path - Dot-separated path (e.g., 'vars.app_name')
   * @returns The value at the path, or undefined if not found
   */
  get<T = ConfigValue>(path: string): T | undefined {
    this.ensureLoaded();
    const parts = path.split('.');
    let current: any = this.manager.getConfig();
    
    for (const part of parts) {
      if (current && typeof current === 'object' && part in current) {
        current = current[part];
      } else {
        return undefined;
      }
    }
    
    return current as T;
  }

  /**
   * Set a configuration value
   * @param path - Dot-separated path
   * @param value - Value to set
   */
  set(path: string, value: ConfigValue): void {
    this.ensureLoaded();
    const parts = path.split('.');
    const config = this.manager.getConfig();
    let current: any = config;
    
    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part) continue;
      if (!current[part] || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }
    
    // Set the value
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      current[lastPart] = value;
    }
  }

  /**
   * Remove a configuration value
   * @param path - Dot-separated path
   */
  unset(path: string): void {
    this.ensureLoaded();
    const parts = path.split('.');
    const config = this.manager.getConfig();
    let current: any = config;
    
    // Navigate to parent
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!part || !current[part]) {
        return; // Path doesn't exist
      }
      current = current[part];
    }
    
    // Delete the value
    const lastPart = parts[parts.length - 1];
    if (lastPart) {
      delete current[lastPart];
    }
  }

  /**
   * Save configuration to file
   * @param path - Optional path to save to (defaults to project config)
   */
  async save(path?: string): Promise<void> {
    this.ensureLoaded();
    await this.manager.save(path);
  }

  /**
   * Apply a profile
   * @param name - Profile name
   */
  async useProfile(name: string): Promise<void> {
    await this.manager.useProfile(name);
    this.interpolator = new VariableInterpolator();
  }

  /**
   * Get current profile name
   */
  getProfile(): string | undefined {
    return this.manager.getCurrentProfile();
  }

  /**
   * List available profiles
   */
  listProfiles(): string[] {
    this.ensureLoaded();
    const profiles = this.get<Record<string, any>>('profiles');
    return profiles ? Object.keys(profiles) : [];
  }

  /**
   * Resolve a target reference
   * @param ref - Target reference (e.g., 'hosts.web-1')
   */
  async resolveTarget(ref: string): Promise<any> {
    this.ensureLoaded();
    const resolver = this.manager.getTargetResolver();
    return resolver.resolve(ref);
  }

  /**
   * Interpolate variables in a string
   * @param template - String with variable references
   * @param context - Additional context for interpolation
   */
  interpolate(template: string, context: InterpolationContext = {}): string {
    this.ensureLoaded();
    const config = this.manager.getConfig();
    
    // Convert process.env to Record<string, string>
    const env: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        env[key] = value;
      }
    }
    
    const fullContext = {
      vars: config.vars || {},
      env,
      ...context
    };
    return this.interpolator.interpolate(template, fullContext);
  }

  /**
   * Get all configuration as plain object
   */
  getAll(): Record<string, any> {
    this.ensureLoaded();
    return this.manager.getConfig();
  }

  /**
   * Check if configuration has a feature
   * @param feature - Feature name to check
   */
  hasFeature(feature: string): boolean {
    const features = this.get<string[]>('features') || [];
    return features.includes(feature);
  }

  /**
   * Get configuration version
   */
  getVersion(): string {
    return this.get<string>('version') || '1.0';
  }

  /**
   * Validate configuration
   * @returns Array of validation errors, empty if valid
   */
  async validate(): Promise<string[]> {
    this.ensureLoaded();
    const errors = await this.manager.validate();
    return errors.map(err => `${err.path}: ${err.message}`);
  }

  /**
   * Reload configuration from disk
   */
  async reload(): Promise<void> {
    this.loaded = false;
    // Create new manager to pick up current working directory
    this.manager = new ConfigurationManager({
      ...this.options,
      projectRoot: process.cwd()
    });
    await this.load();
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      throw new Error('Configuration not loaded. Call config.load() first.');
    }
  }
}

// Export singleton instance for convenience
export const config = new ConfigAPI();