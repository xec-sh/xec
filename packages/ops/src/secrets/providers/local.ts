import * as path from 'node:path';
import { existsSync } from 'node:fs';
import * as fs from 'node:fs/promises';

import { getCachedMachineId } from '../machine-id.js';
import { atomicWriteFile } from '../atomic-write.js';
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

  // Index updates are read-modify-write cycles on one file. Without this
  // serialization, parallel set/delete calls (SecretManager.setMany fans
  // out with Promise.all) read the same snapshot and each write drops the
  // others' entries.
  private indexLock: Promise<unknown> = Promise.resolve();
  private initializing: Promise<void> | null = null;

  constructor(config?: SecretProviderConfig['config']) {
    // Default storage location
    const baseDir = config?.['storageDir'] || getSecretsDir();
    this.storageDir = path.resolve(baseDir);
    this.passphrase = config?.['passphrase'];
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    // Concurrent first calls (Promise.all over set/get) must share one
    // initialization: a second run could re-create the empty index after
    // the first writer already added entries to it.
    this.initializing ??= this.initializeInternal();
    try {
      await this.initializing;
    } finally {
      if (!this.initialized) {
        this.initializing = null;
      }
    }
  }

  private async initializeInternal(): Promise<void> {
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
    } catch {
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
      const record = JSON.parse(data) as EncryptedSecret & { salt: string };

      // A record written by a newer format would decrypt into garbage or
      // fail with an unrelated authentication error; refuse it by name
      // before touching the ciphertext.
      if (record.version !== 1) {
        throw new SecretError(
          `Secret '${key}' uses storage format version ${record.version}; this build reads version 1`,
          'UNSUPPORTED_VERSION',
          key
        );
      }
      if (record.algorithm !== 'aes-256-gcm') {
        throw new SecretError(
          `Secret '${key}' is encrypted with '${record.algorithm}'; this build supports aes-256-gcm`,
          'UNSUPPORTED_ALGORITHM',
          key
        );
      }

      // Get machine ID
      const machineId = await getCachedMachineId();

      // Decrypt the secret
      const decrypted = await decrypt(
        decode(record.encrypted),
        decode(record.salt),
        decode(record.iv),
        decode(record.authTag),
        machineId,
        this.passphrase
      );

      return decrypted;
    } catch (error) {
      if ((error as any).code === 'ENOENT') {
        return null;
      }
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
      await atomicWriteFile(secretPath, JSON.stringify(dataWithSalt, null, 2));

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

    // Decrypt everything before writing anything. Re-encrypting as we read
    // meant a failure on secret N (wrong passphrase, one corrupt file) left
    // secrets 1..N-1 under the new passphrase and the rest under the old,
    // with nothing recording which was which.
    const plaintexts = new Map<string, string>();
    for (const key of keys) {
      const value = await tempProvider.get(key);
      if (value !== null) {
        plaintexts.set(key, value);
      }
    }

    const previous = this.passphrase;
    this.passphrase = newPassphrase;
    try {
      for (const [key, value] of plaintexts) {
        await this.set(key, value);
      }
    } catch (error) {
      this.passphrase = previous;
      throw error;
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
    await atomicWriteFile(this.getIndexPath(), JSON.stringify(index, null, 2));
  }

  private withIndexLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.indexLock.then(fn, fn);
    this.indexLock = run.catch(() => undefined);
    return run;
  }

  private async updateIndex(key: string, metadata: any): Promise<void> {
    await this.withIndexLock(async () => {
      const index = await this.readIndex();
      index[key] = metadata;
      await this.writeIndex(index);
    });
  }

  private async removeFromIndex(key: string): Promise<void> {
    await this.withIndexLock(async () => {
      const index = await this.readIndex();
      delete index[key];
      await this.writeIndex(index);
    });
  }
}