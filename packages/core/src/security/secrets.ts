/**
 * Secrets management for Xec Core
 * Provides secure storage and retrieval of sensitive data
 */

import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

import { SecurityError } from '../core/errors.js';
import { EncryptedData, EncryptionService } from './encryption.js';

export interface Secret {
  name: string;
  value: string;
  encrypted?: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SecretStoreOptions {
  storePath?: string;
  encryptionKey?: string;
  autoEncrypt?: boolean;
}

export class SecretManager {
  private encryption: EncryptionService;
  private storePath: string;
  private masterKey: string;
  private autoEncrypt: boolean;
  private cache: Map<string, Secret> = new Map();
  private initialized = false;

  constructor(options: SecretStoreOptions = {}) {
    this.encryption = new EncryptionService();
    this.storePath = options.storePath || path.join(os.homedir(), '.xec', 'secrets');
    this.masterKey = options.encryptionKey || this.getMasterKey();
    this.autoEncrypt = options.autoEncrypt !== false;
  }

  /**
   * Get or create master encryption key
   */
  private getMasterKey(): string {
    // In production, this should come from:
    // 1. Environment variable (XEC_MASTER_KEY)
    // 2. Key management service (AWS KMS, HashiCorp Vault, etc.)
    // 3. Hardware security module (HSM)

    const envKey = process.env.XEC_MASTER_KEY;
    if (envKey) {
      return envKey;
    }

    // For development, generate a key based on machine ID
    // WARNING: This is not secure for production use!
    const machineId = os.hostname() + os.platform() + os.arch();
    return this.encryption.hash(machineId);
  }

  /**
   * Initialize secret store
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Create store directory if it doesn't exist
      await fs.mkdir(this.storePath, { recursive: true, mode: 0o700 });

      // Load existing secrets
      await this.loadSecrets();

      this.initialized = true;
    } catch (error: any) {
      throw new SecurityError(`Failed to initialize secret store: ${error.message}`);
    }
  }

  /**
   * Set a secret
   */
  async set(name: string, value: string, metadata?: Record<string, any>): Promise<void> {
    await this.initialize();

    // Validate secret name
    if (!name || typeof name !== 'string') {
      throw new SecurityError('Secret name must be a non-empty string');
    }

    // Encrypt value if auto-encrypt is enabled
    let secretValue = value;
    let encrypted = false;

    if (this.autoEncrypt) {
      const encryptedData = await this.encryption.encrypt(value, this.masterKey);
      secretValue = JSON.stringify(encryptedData);
      encrypted = true;
    }

    const secret: Secret = {
      name,
      value: secretValue,
      encrypted,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Update cache
    this.cache.set(name, secret);

    // Persist to disk
    await this.saveSecrets();
  }

  /**
   * Get a secret
   */
  async get(name: string): Promise<string | undefined> {
    await this.initialize();

    const secret = this.cache.get(name);
    if (!secret) {
      return undefined;
    }

    // Decrypt if encrypted
    if (secret.encrypted) {
      try {
        const encryptedData = JSON.parse(secret.value) as EncryptedData;
        return await this.encryption.decrypt(encryptedData, this.masterKey);
      } catch (error: any) {
        throw new SecurityError(`Failed to decrypt secret '${name}': ${error.message}`);
      }
    }

    return secret.value;
  }

  /**
   * Check if secret exists
   */
  async has(name: string): Promise<boolean> {
    await this.initialize();
    return this.cache.has(name);
  }

  /**
   * Delete a secret
   */
  async delete(name: string): Promise<boolean> {
    await this.initialize();

    const deleted = this.cache.delete(name);
    if (deleted) {
      await this.saveSecrets();
    }

    return deleted;
  }

  /**
   * List all secret names
   */
  async list(): Promise<string[]> {
    await this.initialize();
    return Array.from(this.cache.keys());
  }

  /**
   * Get secret metadata
   */
  async getMetadata(name: string): Promise<Record<string, any> | undefined> {
    await this.initialize();

    const secret = this.cache.get(name);
    return secret?.metadata;
  }

  /**
   * Update secret metadata
   */
  async updateMetadata(name: string, metadata: Record<string, any>): Promise<void> {
    await this.initialize();

    const secret = this.cache.get(name);
    if (!secret) {
      throw new SecurityError(`Secret '${name}' not found`);
    }

    secret.metadata = { ...secret.metadata, ...metadata };
    secret.updatedAt = new Date();

    await this.saveSecrets();
  }

  /**
   * Export secrets (encrypted)
   */
  async export(password: string): Promise<string> {
    await this.initialize();

    const secrets: Record<string, Secret> = {};
    for (const [name, secret] of this.cache) {
      secrets[name] = { ...secret };
    }

    const data = JSON.stringify(secrets);
    const encrypted = await this.encryption.encrypt(data, password);

    return JSON.stringify(encrypted);
  }

  /**
   * Import secrets
   */
  async import(encryptedData: string, password: string): Promise<number> {
    await this.initialize();

    try {
      const encrypted = JSON.parse(encryptedData) as EncryptedData;
      const decrypted = await this.encryption.decrypt(encrypted, password);
      const secrets = JSON.parse(decrypted) as Record<string, Secret>;

      let count = 0;
      for (const [name, secret] of Object.entries(secrets)) {
        // Re-encrypt with current master key if needed
        if (secret.encrypted) {
          // The secret value was encrypted with the original master key, not the export password
          const value = await this.encryption.decrypt(
            JSON.parse(secret.value) as EncryptedData,
            this.masterKey
          );
          await this.set(name, value, secret.metadata);
        } else {
          this.cache.set(name, {
            ...secret,
            createdAt: new Date(secret.createdAt),
            updatedAt: new Date(secret.updatedAt)
          });
        }
        count++;
      }

      await this.saveSecrets();
      return count;
    } catch (error: any) {
      throw new SecurityError(`Failed to import secrets: ${error.message}`);
    }
  }

  /**
   * Clear all secrets
   */
  async clear(): Promise<void> {
    await this.initialize();
    this.cache.clear();
    await this.saveSecrets();
  }

  /**
   * Load secrets from disk
   */
  private async loadSecrets(): Promise<void> {
    const secretsFile = path.join(this.storePath, 'secrets.json');

    try {
      const data = await fs.readFile(secretsFile, 'utf8');
      const secrets = JSON.parse(data) as Record<string, Secret>;

      for (const [name, secret] of Object.entries(secrets)) {
        this.cache.set(name, {
          ...secret,
          createdAt: new Date(secret.createdAt),
          updatedAt: new Date(secret.updatedAt)
        });
      }
    } catch (error: any) {
      // File doesn't exist or is corrupted - start fresh
      if (error.code !== 'ENOENT') {
        console.warn(`Failed to load secrets: ${error.message}`);
      }
    }
  }

  /**
   * Save secrets to disk
   */
  private async saveSecrets(): Promise<void> {
    const secretsFile = path.join(this.storePath, 'secrets.json');
    const tempFile = `${secretsFile}.tmp`;

    const secrets: Record<string, Secret> = {};
    for (const [name, secret] of this.cache) {
      secrets[name] = secret;
    }

    // Write to temp file first
    await fs.writeFile(tempFile, JSON.stringify(secrets, null, 2), {
      mode: 0o600 // Read/write for owner only
    });

    // Atomic rename
    await fs.rename(tempFile, secretsFile);
  }
}

// Global secret manager instance
let globalSecretManager: SecretManager | null = null;

/**
 * Get global secret manager instance
 */
export function getSecretManager(options?: SecretStoreOptions): SecretManager {
  if (!globalSecretManager) {
    globalSecretManager = new SecretManager(options);
  }
  return globalSecretManager;
}

/**
 * Helper functions for easy access
 */
export async function setSecret(name: string, value: string, metadata?: Record<string, any>): Promise<void> {
  const manager = getSecretManager();
  await manager.set(name, value, metadata);
}

export async function getSecret(name: string): Promise<string | undefined> {
  const manager = getSecretManager();
  return manager.get(name);
}

export async function hasSecret(name: string): Promise<boolean> {
  const manager = getSecretManager();
  return manager.has(name);
}

export async function deleteSecret(name: string): Promise<boolean> {
  const manager = getSecretManager();
  return manager.delete(name);
}

export async function listSecrets(): Promise<string[]> {
  const manager = getSecretManager();
  return manager.list();
}