import * as path from 'path';
import { existsSync } from 'fs';
import * as fs from 'fs/promises';

import { getCachedMachineId } from '../machine-id.js';
import { getSecretsDir } from '../../config/utils.js';
import {
  encode,
  decode,
  encrypt,
  decrypt,
  hashKey,
  createFingerprint
} from '../crypto.js';
import {
  SecretError,
  SecretProvider,
  EncryptedSecret,
  SecretProviderConfig
} from '../types.js';

/**
 * Local secret provider that stores encrypted secrets on disk
 * Uses machine UUID for encryption
 */
export class LocalSecretProvider implements SecretProvider {
  private storageDir: string;
  private initialized = false;
  private passphrase?: string;

  constructor(config?: SecretProviderConfig['config']) {
    // Default storage location
    const baseDir = config?.['storageDir'] || getSecretsDir();
    this.storageDir = path.resolve(baseDir);
    this.passphrase = config?.['passphrase'];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Create storage directory if it doesn't exist
    await fs.mkdir(this.storageDir, { recursive: true, mode: 0o700 });

    // Create index file if it doesn't exist
    const indexPath = this.getIndexPath();
    if (!existsSync(indexPath)) {
      await this.writeIndex({});
    }

    // Verify we can read/write
    try {
      await fs.access(this.storageDir, fs.constants.R_OK | fs.constants.W_OK);
    } catch (error) {
      throw new SecretError(
        `Cannot access secret storage directory: ${this.storageDir}`,
        'STORAGE_ACCESS_ERROR'
      );
    }

    this.initialized = true;
  }

  async get(key: string): Promise<string | null> {
    await this.ensureInitialized();

    try {
      // Read the encrypted secret
      const secretPath = this.getSecretPath(key);

      if (!existsSync(secretPath)) {
        return null;
      }

      const data = await fs.readFile(secretPath, 'utf8');
      const encryptedSecret: EncryptedSecret = JSON.parse(data);

      // Get machine ID
      const machineId = await getCachedMachineId();

      // Get salt from stored data
      const dataWithSalt = JSON.parse(data) as any;

      // Decrypt the secret
      const decrypted = await decrypt(
        decode(encryptedSecret.encrypted),
        decode(dataWithSalt.salt),
        decode(encryptedSecret.iv),
        decode(encryptedSecret.authTag),
        machineId,
        this.passphrase
      );

      return decrypted;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }

      throw new SecretError(
        `Failed to get secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'GET_ERROR',
        key
      );
    }
  }

  async set(key: string, value: string): Promise<void> {
    await this.ensureInitialized();

    try {
      // Get machine ID
      const machineId = await getCachedMachineId();

      // Encrypt the secret
      const { encrypted, salt, iv, authTag } = await encrypt(
        value,
        machineId,
        this.passphrase
      );

      // Create encrypted secret object
      const encryptedSecret: EncryptedSecret = {
        version: 1,
        encrypted: encode(encrypted),
        iv: encode(iv),
        authTag: encode(authTag),
        algorithm: 'aes-256-gcm',
        metadata: {
          key,
          createdAt: new Date(),
          updatedAt: new Date()
        }
      };

      // Store salt separately in the encrypted data
      const dataWithSalt = {
        ...encryptedSecret,
        salt: encode(salt)
      };

      // Write to disk
      const secretPath = this.getSecretPath(key);
      await fs.writeFile(
        secretPath,
        JSON.stringify(dataWithSalt, null, 2),
        { mode: 0o600 }
      );

      // Update index
      await this.updateIndex(key, {
        hashedKey: hashKey(key),
        createdAt: encryptedSecret.metadata.createdAt,
        updatedAt: encryptedSecret.metadata.updatedAt,
        fingerprint: createFingerprint(encrypted)
      });
    } catch (error) {
      throw new SecretError(
        `Failed to set secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'SET_ERROR',
        key
      );
    }
  }

  async delete(key: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const secretPath = this.getSecretPath(key);

      // Delete the secret file
      await fs.unlink(secretPath);

      // Remove from index
      await this.removeFromIndex(key);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        // Secret doesn't exist, not an error
        return;
      }

      throw new SecretError(
        `Failed to delete secret: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'DELETE_ERROR',
        key
      );
    }
  }

  async list(): Promise<string[]> {
    await this.ensureInitialized();

    try {
      const index = await this.readIndex();
      return Object.keys(index);
    } catch (error) {
      throw new SecretError(
        `Failed to list secrets: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LIST_ERROR'
      );
    }
  }

  async has(key: string): Promise<boolean> {
    await this.ensureInitialized();

    const secretPath = this.getSecretPath(key);
    return existsSync(secretPath);
  }

  /**
   * Change the passphrase for all secrets
   */
  async changePassphrase(oldPassphrase?: string, newPassphrase?: string): Promise<void> {
    await this.ensureInitialized();

    const keys = await this.list();
    const tempProvider = new LocalSecretProvider({
      storageDir: this.storageDir,
      passphrase: oldPassphrase
    });

    // Re-encrypt all secrets with new passphrase
    for (const key of keys) {
      const value = await tempProvider.get(key);
      if (value !== null) {
        this.passphrase = newPassphrase;
        await this.set(key, value);
      }
    }
  }

  /**
   * Export all secrets (decrypted) - use with caution
   */
  async export(): Promise<Record<string, string>> {
    await this.ensureInitialized();

    const keys = await this.list();
    const secrets: Record<string, string> = {};

    for (const key of keys) {
      const value = await this.get(key);
      if (value !== null) {
        secrets[key] = value;
      }
    }

    return secrets;
  }

  /**
   * Import secrets from a plain object
   */
  async import(secrets: Record<string, string>): Promise<void> {
    await this.ensureInitialized();

    for (const [key, value] of Object.entries(secrets)) {
      await this.set(key, value);
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }
  }

  private getSecretPath(key: string): string {
    // Use hashed key for filename to avoid filesystem issues
    const hashedKey = hashKey(key);
    return path.join(this.storageDir, `${hashedKey}.secret`);
  }

  private getIndexPath(): string {
    return path.join(this.storageDir, '.index.json');
  }

  private async readIndex(): Promise<Record<string, any>> {
    try {
      const data = await fs.readFile(this.getIndexPath(), 'utf8');
      return JSON.parse(data);
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async writeIndex(index: Record<string, any>): Promise<void> {
    await fs.writeFile(
      this.getIndexPath(),
      JSON.stringify(index, null, 2),
      { mode: 0o600 }
    );
  }

  private async updateIndex(key: string, metadata: any): Promise<void> {
    const index = await this.readIndex();
    index[key] = metadata;
    await this.writeIndex(index);
  }

  private async removeFromIndex(key: string): Promise<void> {
    const index = await this.readIndex();
    delete index[key];
    await this.writeIndex(index);
  }
}