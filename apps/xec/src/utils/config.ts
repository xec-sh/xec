/**
 * Configuration management for the CLI
 * This now delegates to the core's unified configuration system
 * 
 * @deprecated Most of this module is deprecated in favor of unified-config-adapter
 * Kept for backwards compatibility during migration
 */

import { 
  ConfigMigrator,
  getConfig as getUnifiedConfig,
  loadConfig as loadUnifiedConfig,
  getConfigValue as getUnifiedConfigValue,
  setConfigValue as setUnifiedConfigValue,
  type ConfigManager as UnifiedConfigManager
} from './unified-config-adapter.js';

// Re-export types from unified config
export type { UnifiedConfig as Config } from '@xec-sh/core';

/**
 * @deprecated Use unified config directly
 */
export class ConfigManager {
  private unifiedConfig: UnifiedConfigManager;

  constructor() {
    this.unifiedConfig = getUnifiedConfig();
  }

  async load() {
    return this.unifiedConfig.load();
  }

  async save(config?: any) {
    return this.unifiedConfig.save(config);
  }

  get() {
    return this.unifiedConfig.get();
  }

  getValue(path: string) {
    return this.unifiedConfig.getValue(path);
  }

  setValue(path: string, value: any) {
    this.unifiedConfig.setValue(path, value);
  }

  applyProfile(profileName: string) {
    this.unifiedConfig.applyProfile(profileName);
  }

  getActiveProfile() {
    return this.unifiedConfig.getActiveProfile();
  }

  listProfiles() {
    return this.unifiedConfig.listProfiles();
  }

  getSSHHost(hostname: string) {
    return this.unifiedConfig.getSSHHost(hostname);
  }

  getAdapterDefaults(adapter: string) {
    return this.unifiedConfig.getAdapterDefaults(adapter);
  }

  resolveAlias(command: string) {
    return this.unifiedConfig.resolveAlias(command);
  }

  getEnvironment(name: string) {
    return this.unifiedConfig.getEnvironment(name);
  }

  async exists() {
    return this.unifiedConfig.exists();
  }

  getConfigPaths() {
    return this.unifiedConfig.getConfigPaths();
  }

  addConfigPath(path: string) {
    this.unifiedConfig.addConfigPath(path);
  }
}

// Export functions that delegate to unified config
export const getConfig = getUnifiedConfig;
export const loadConfig = loadUnifiedConfig;
export const getConfigValue = getUnifiedConfigValue;
export const setConfigValue = setUnifiedConfigValue;

// Export migration tool for use in commands
export { ConfigMigrator };