/**
 * Encryption module for Xec Core
 * Provides secure encryption/decryption for sensitive data
 */

import * as crypto from 'crypto';

import { SecurityError } from '../core/errors.js';

export interface EncryptionOptions {
  algorithm?: string;
  keyLength?: number;
  saltLength?: number;
  iterations?: number;
  ivLength?: number;
}

export interface EncryptedData {
  data: string;
  salt: string;
  iv: string;
  authTag: string;
  algorithm: string;
  version: string;
}

export class EncryptionService {
  private readonly algorithm: string;
  private readonly keyLength: number;
  private readonly saltLength: number;
  private readonly iterations: number;
  private readonly ivLength: number;
  private readonly version = '1.0';

  constructor(options: EncryptionOptions = {}) {
    this.algorithm = options.algorithm || 'aes-256-gcm';
    this.keyLength = options.keyLength || 32;
    this.saltLength = options.saltLength || 32;
    this.iterations = options.iterations || 100000;
    this.ivLength = options.ivLength || 16;
  }

  /**
   * Derive encryption key from password and salt
   */
  private async deriveKey(password: string, salt: Buffer): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      crypto.pbkdf2(password, salt, this.iterations, this.keyLength, 'sha256', (err, key) => {
        if (err) reject(err);
        else resolve(key);
      });
    });
  }

  /**
   * Encrypt data with password
   */
  async encrypt(data: string, password: string): Promise<EncryptedData> {
    try {
      // Generate random salt and IV
      const salt = crypto.randomBytes(this.saltLength);
      const iv = crypto.randomBytes(this.ivLength);

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Create cipher
      const cipher = crypto.createCipheriv(this.algorithm, key, iv);

      // Encrypt data
      const encrypted = Buffer.concat([
        cipher.update(data, 'utf8'),
        cipher.final()
      ]);

      // Get auth tag for GCM mode
      const authTag = (cipher as any).getAuthTag();

      return {
        data: encrypted.toString('base64'),
        salt: salt.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        algorithm: this.algorithm,
        version: this.version
      };
    } catch (error: any) {
      throw new SecurityError(`Encryption failed: ${error.message}`);
    }
  }

  /**
   * Decrypt data with password
   */
  async decrypt(encryptedData: EncryptedData, password: string): Promise<string> {
    try {
      // Validate version
      if (encryptedData.version !== this.version) {
        throw new Error(`Unsupported encryption version: ${encryptedData.version}`);
      }

      // Decode from base64
      const salt = Buffer.from(encryptedData.salt, 'base64');
      const iv = Buffer.from(encryptedData.iv, 'base64');
      const authTag = Buffer.from(encryptedData.authTag, 'base64');
      const encrypted = Buffer.from(encryptedData.data, 'base64');

      // Derive key from password
      const key = await this.deriveKey(password, salt);

      // Create decipher
      const decipher = crypto.createDecipheriv(encryptedData.algorithm, key, iv);
      (decipher as any).setAuthTag(authTag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final()
      ]);

      return decrypted.toString('utf8');
    } catch (error: any) {
      throw new SecurityError(`Decryption failed: ${error.message}`);
    }
  }

  /**
   * Generate secure random password
   */
  generatePassword(length: number = 32): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?';
    const bytes = crypto.randomBytes(length);
    let password = '';

    for (let i = 0; i < length; i++) {
      password += charset[bytes[i] % charset.length];
    }

    return password;
  }

  /**
   * Hash data using SHA256
   */
  hash(data: string, encoding: crypto.BinaryToTextEncoding = 'hex'): string {
    return crypto.createHash('sha256').update(data).digest(encoding);
  }

  /**
   * Compare hash with data
   */
  verifyHash(data: string, hashValue: string, encoding: crypto.BinaryToTextEncoding = 'hex'): boolean {
    const dataHash = this.hash(data, encoding);
    return crypto.timingSafeEqual(Buffer.from(dataHash), Buffer.from(hashValue));
  }

  /**
   * Generate secure random token
   */
  generateToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }
}

// Default encryption service instance
export const encryption = new EncryptionService();

/**
 * Encrypt sensitive value
 */
export async function encrypt(value: string, password: string): Promise<string> {
  const encrypted = await encryption.encrypt(value, password);
  return JSON.stringify(encrypted);
}

/**
 * Decrypt sensitive value
 */
export async function decrypt(encryptedValue: string, password: string): Promise<string> {
  const encrypted = JSON.parse(encryptedValue) as EncryptedData;
  return encryption.decrypt(encrypted, password);
}

/**
 * Hash value
 */
export function hash(value: string): string {
  return encryption.hash(value);
}

/**
 * Generate secure token
 */
export function generateToken(length?: number): string {
  return encryption.generateToken(length);
}