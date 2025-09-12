import { EnvSecretProvider } from './providers/env.js';
import { GitSecretProvider } from './providers/git.js';
import { LocalSecretProvider } from './providers/local.js';
import { SecretError, SecretProvider, SecretProviderConfig } from './types.js';

/**
 * Secret manager that handles multiple secret providers
 */
export class SecretManager {
  private provider: SecretProvider;
  private config: SecretProviderConfig;
  private initialized = false;

  constructor(config?: SecretProviderConfig) {
    this.config = config || { type: 'local' };
    this.provider = this.createProvider();
  }

  /**
   * Initialize the secret manager and provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.provider.initialize();
    this.initialized = true;
  }

  /**
   * Ensure the provider is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  /**
   * Get a secret value
   */
  async get(key: string): Promise<string | null> {
    await this.ensureInitialized();
    this.validateKey(key);
    try {
      return await this.provider.get(key);
    } catch (error) {
      throw new SecretError(
        `Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ERROR',
        key
      );
    }
  }

  /**
   * Get a secret value or throw if not found
   */
  async getRequired(key: string): Promise<string> {
    const value = await this.get(key);
    if (value === null) {
      throw new SecretError(
        `Required secret '${key}' not found`,
        'SECRET_NOT_FOUND',
        key
      );
    }
    return value;
  }

  /**
   * Set a secret value
   */
  async set(key: string, value: string): Promise<void> {
    await this.ensureInitialized();
    this.validateKey(key);
    this.validateValue(value);
    try {
      return await this.provider.set(key, value);
    } catch (error) {
      throw new SecretError(
        `Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SET_ERROR',
        key
      );
    }
  }

  /**
   * Delete a secret
   */
  async delete(key: string): Promise<void> {
    await this.ensureInitialized();
    this.validateKey(key);
    return this.provider.delete(key);
  }

  /**
   * List all secret keys
   */
  async list(): Promise<string[]> {
    await this.ensureInitialized();
    return this.provider.list();
  }

  /**
   * Check if a secret exists
   */
  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();
    this.validateKey(key);
    return this.provider.has(key);
  }

  /**
   * Batch get multiple secrets
   */
  async getMany(keys: string[]): Promise<Record<string, string | null>> {
    const results: Record<string, string | null> = {};

    await Promise.all(
      keys.map(async (key) => {
        results[key] = await this.get(key);
      })
    );

    return results;
  }

  /**
   * Batch set multiple secrets
   */
  async setMany(secrets: Record<string, string>): Promise<void> {
    await Promise.all(
      Object.entries(secrets).map(([key, value]) =>
        this.set(key, value)
      )
    );
  }

  /**
   * Batch delete multiple secrets
   */
  async deleteMany(keys: string[]): Promise<void> {
    await Promise.all(keys.map(key => this.delete(key)));
  }

  /**
   * Clear all secrets (use with caution!)
   */
  async clear(): Promise<void> {
    const keys = await this.list();
    await this.deleteMany(keys);
  }

  /**
   * Get provider type
   */
  getProviderType(): string {
    return this.config.type;
  }

  /**
   * Update the secret provider
   */
  async updateProvider(config: SecretProviderConfig): Promise<void> {
    this.config = config;
    this.provider = this.createProvider();
    this.initialized = false;
    await this.initialize();
  }

  /**
   * Create a provider instance based on configuration
   */
  private createProvider(): SecretProvider {
    switch (this.config.type) {
      case 'local':
        return new LocalSecretProvider(this.config.config);

      case 'env':
        return new EnvSecretProvider(this.config.config);

      case 'git':
        return new GitSecretProvider(this.config.config);

      case 'vault':
      case 'aws-secrets':
      case '1password':
        throw new SecretError(
          `Provider '${this.config.type}' not yet implemented`,
          'PROVIDER_NOT_IMPLEMENTED'
        );

      default:
        throw new SecretError(
          `Unknown secret provider type: ${this.config.type}`,
          'INVALID_PROVIDER_TYPE'
        );
    }
  }

  /**
   * Validate secret key format
   */
  private validateKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new SecretError(
        'Secret key must be a non-empty string',
        'INVALID_KEY'
      );
    }

    // Key should be alphanumeric with underscores, dashes, and dots
    if (!/^[a-zA-Z0-9_\-.]+$/.test(key)) {
      throw new SecretError(
        'Secret key must contain only alphanumeric characters, underscores, dashes, and dots',
        'INVALID_KEY_FORMAT',
        key
      );
    }

    // Key length limits
    if (key.length > 256) {
      throw new SecretError(
        'Secret key must be 256 characters or less',
        'KEY_TOO_LONG',
        key
      );
    }
  }

  /**
   * Validate secret value
   */
  private validateValue(value: string): void {
    if (typeof value !== 'string') {
      throw new SecretError(
        'Secret value must be a string',
        'INVALID_VALUE'
      );
    }

    if (value.length === 0) {
      throw new SecretError(
        'Secret value cannot be empty',
        'EMPTY_VALUE'
      );
    }

    // Value size limit (64KB for testing)
    if (value.length > 64 * 1024) {
      throw new SecretError(
        'Secret value must be 64KB or less',
        'VALUE_TOO_LARGE'
      );
    }
  }
}

/**
 * Default secret manager instance
 */
let defaultManager: SecretManager | null = null;

/**
 * Get the default secret manager instance
 */
export function getDefaultSecretManager(config?: SecretProviderConfig): SecretManager {
  if (!defaultManager) {
    defaultManager = new SecretManager(config);
  }
  return defaultManager;
}