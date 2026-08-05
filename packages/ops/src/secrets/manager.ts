import { EnvSecretProvider } from './providers/env.js';
import { GitSecretProvider } from './providers/git.js';
import { LocalSecretProvider } from './providers/local.js';
import { SecretError, SecretProvider, SecretProviderConfig } from './types.js';

/**
 * Secret provider types that are actually implemented.
 * The configuration validator uses this list, so validation and runtime
 * support cannot drift apart.
 */
export const SUPPORTED_SECRET_PROVIDERS = ['local', 'env', 'git'] as const;

export type SupportedSecretProvider = (typeof SUPPORTED_SECRET_PROVIDERS)[number];

/**
 * Provider types that are declared in the configuration schema but not yet implemented.
 */
export const UNIMPLEMENTED_SECRET_PROVIDERS = ['vault', '1password', 'aws-secrets', 'dotenv'] as const;

/**
 * Secret manager that handles multiple secret providers
 */
export class SecretManager {
  private provider?: SecretProvider;
  private config: SecretProviderConfig;
  private initialized = false;
  private initializing: Promise<void> | null = null;

  constructor(config?: SecretProviderConfig) {
    // Provider creation is deferred to initialize() so that constructing a
    // manager with an unsupported provider type does not throw before
    // configuration validation had a chance to report it properly.
    this.config = config || { type: 'local' };
  }

  /**
   * Check whether a provider type is implemented
   */
  static isSupported(type: string): type is SupportedSecretProvider {
    return (SUPPORTED_SECRET_PROVIDERS as readonly string[]).includes(type);
  }

  /**
   * Initialize the secret manager and provider
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Batch operations (getMany, setMany) fan out with Promise.all, so the
    // first awaits land here concurrently; without memoization each of them
    // ran provider.initialize() again.
    this.initializing ??= (async () => {
      if (!this.provider) {
        this.provider = this.createProvider();
      }
      await this.provider.initialize();
      this.initialized = true;
    })();

    try {
      await this.initializing;
    } finally {
      if (!this.initialized) {
        // Initialization failed; let the next call retry instead of
        // replaying the same rejection forever.
        this.initializing = null;
      }
    }
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
   * Return the initialized provider; initialize() must have run first
   */
  private requireProvider(): SecretProvider {
    if (!this.provider) {
      throw new SecretError(
        'Secret provider is not initialized',
        'PROVIDER_NOT_INITIALIZED'
      );
    }
    return this.provider;
  }

  /**
   * Get a secret value
   */
  async get(key: string): Promise<string | null> {
    await this.ensureInitialized();
    this.validateKey(key);
    try {
      return await this.requireProvider().get(key);
    } catch (error) {
      // Providers already raise SecretError with the failing key and a
      // specific code; re-wrapping stacked "Failed to get secret:" prefixes
      // and replaced the code with the generic one.
      if (error instanceof SecretError) {
        throw error;
      }
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
      return await this.requireProvider().set(key, value);
    } catch (error) {
      if (error instanceof SecretError) {
        throw error;
      }
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
    return this.requireProvider().delete(key);
  }

  /**
   * List all secret keys
   */
  async list(): Promise<string[]> {
    await this.ensureInitialized();
    return this.requireProvider().list();
  }

  /**
   * Check if a secret exists
   */
  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();
    this.validateKey(key);
    return this.requireProvider().has(key);
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
    this.provider = undefined;
    this.initialized = false;
    this.initializing = null;
    await this.initialize();
  }

  /**
   * Create a provider instance based on configuration
   */
  private createProvider(): SecretProvider {
    const supported = SUPPORTED_SECRET_PROVIDERS.join(', ');

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
      case 'dotenv':
        throw new SecretError(
          `Secret provider '${this.config.type}' is not yet implemented. Supported providers: ${supported}`,
          'PROVIDER_NOT_IMPLEMENTED'
        );

      default:
        throw new SecretError(
          `Unknown secret provider type: '${this.config.type}'. Supported providers: ${supported}`,
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