/**
 * Secret provider interface
 */
export interface SecretProvider {
  /**
   * Get a secret value by key
   */
  get(key: string): Promise<string | null>;

  /**
   * Set a secret value
   */
  set(key: string, value: string): Promise<void>;

  /**
   * Delete a secret
   */
  delete(key: string): Promise<void>;

  /**
   * List all secret keys
   */
  list(): Promise<string[]>;

  /**
   * Check if a secret exists
   */
  has(key: string): Promise<boolean>;

  /**
   * Initialize the provider (e.g., create storage, verify access)
   */
  initialize(): Promise<void>;
}

/**
 * Secret metadata
 */
export interface SecretMetadata {
  key: string;
  createdAt: Date;
  updatedAt: Date;
  description?: string;
}

/**
 * Encrypted secret storage format
 */
export interface EncryptedSecret {
  version: number;
  encrypted: string;
  iv: string;
  authTag: string;
  algorithm: string;
  metadata: SecretMetadata;
}

/**
 * Secret provider configuration
 */
export interface SecretProviderConfig {
  type: 'local' | 'vault' | 'aws-secrets' | '1password' | 'env' | 'git' | 'dotenv';
  config?: Record<string, any>;
}

/**
 * Error thrown when a secret operation fails
 */
export class SecretError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly key?: string
  ) {
    super(message);
    this.name = 'SecretError';
  }
}