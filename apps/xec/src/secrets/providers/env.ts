import { SecretProvider, SecretProviderConfig } from '../types.js';

/**
 * Environment variable secret provider
 * Stores secrets in process.env with SECRET_ prefix
 */
export class EnvSecretProvider implements SecretProvider {
  private prefix = 'SECRET_';
  
  constructor(config?: SecretProviderConfig['config']) {
    if (config?.['prefix']) {
      this.prefix = config['prefix'] as string;
    }
  }
  
  async initialize(): Promise<void> {
    // No initialization needed for env provider
  }
  
  async get(key: string): Promise<string | null> {
    const envKey = this.getEnvKey(key);
    return process.env[envKey] || null;
  }
  
  async set(key: string, value: string): Promise<void> {
    const envKey = this.getEnvKey(key);
    process.env[envKey] = value;
  }
  
  async delete(key: string): Promise<void> {
    const envKey = this.getEnvKey(key);
    delete process.env[envKey];
  }
  
  async list(): Promise<string[]> {
    const keys: string[] = [];
    const prefix = this.prefix;
    
    for (const envKey of Object.keys(process.env)) {
      if (envKey.startsWith(prefix)) {
        const key = this.getKeyFromEnv(envKey);
        if (key) {
          keys.push(key);
        }
      }
    }
    
    return keys;
  }
  
  async has(key: string): Promise<boolean> {
    const envKey = this.getEnvKey(key);
    return envKey in process.env;
  }
  
  /**
   * Convert secret key to environment variable name
   */
  private getEnvKey(key: string): string {
    // Convert to uppercase and replace special chars with underscore
    return this.prefix + key.toUpperCase().replace(/[.-]/g, '_');
  }
  
  /**
   * Convert environment variable name back to secret key
   */
  private getKeyFromEnv(envKey: string): string | null {
    if (!envKey.startsWith(this.prefix)) {
      return null;
    }
    
    // Remove prefix and convert to lowercase
    return envKey
      .substring(this.prefix.length)
      .toLowerCase()
      .replace(/_/g, '-');
  }
}