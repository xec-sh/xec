import { it, expect, describe, beforeEach } from 'vitest';

import { EncryptionService } from '../../../src/security/encryption.js';

describe('security/encryption', () => {
  let encryption: EncryptionService;

  beforeEach(() => {
    encryption = new EncryptionService();
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', async () => {
      const data = 'Hello, World!';
      const password = 'secret-password';

      const encrypted = await encryption.encrypt(data, password);
      expect(encrypted).toBeDefined();
      expect(encrypted.data).toBeDefined();
      expect(encrypted.salt).toBeDefined();
      expect(encrypted.iv).toBeDefined();
      expect(encrypted.authTag).toBeDefined();

      const decrypted = await encryption.decrypt(encrypted, password);
      expect(decrypted).toBe(data);
    });

    it('should fail to decrypt with wrong password', async () => {
      const data = 'Hello, World!';
      const password = 'secret-password';
      const wrongPassword = 'wrong-password';

      const encrypted = await encryption.encrypt(data, password);

      await expect(encryption.decrypt(encrypted, wrongPassword))
        .rejects.toThrow();
    });

    it('should handle empty strings', async () => {
      const data = '';
      const password = 'secret-password';

      const encrypted = await encryption.encrypt(data, password);
      const decrypted = await encryption.decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });

    it('should handle unicode data', async () => {
      const data = '你好世界! 🌍 emoji test';
      const password = 'secret-password';

      const encrypted = await encryption.encrypt(data, password);
      const decrypted = await encryption.decrypt(encrypted, password);
      
      expect(decrypted).toBe(data);
    });

    it('should generate different encrypted data for same input', async () => {
      const data = 'Hello, World!';
      const password = 'secret-password';

      const encrypted1 = await encryption.encrypt(data, password);
      const encrypted2 = await encryption.encrypt(data, password);

      // Different salts and IVs should produce different encrypted data
      expect(encrypted1.salt).not.toBe(encrypted2.salt);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
      expect(encrypted1.data).not.toBe(encrypted2.data);

      // But both should decrypt to the same value
      const decrypted1 = await encryption.decrypt(encrypted1, password);
      const decrypted2 = await encryption.decrypt(encrypted2, password);
      
      expect(decrypted1).toBe(data);
      expect(decrypted2).toBe(data);
    });
  });

  describe('hash', () => {
    it('should hash data correctly', () => {
      const data = 'Hello, World!';
      const hashed = encryption.hash(data);

      expect(hashed).toBeDefined();
      expect(hashed).toHaveLength(64); // SHA256 produces 64 hex characters
    });

    it('should produce same hash for same input', () => {
      const data = 'Hello, World!';
      const hash1 = encryption.hash(data);
      const hash2 = encryption.hash(data);

      expect(hash1).toBe(hash2);
    });

    it('should produce different hash for different input', () => {
      const data1 = 'Hello, World!';
      const data2 = 'Hello, World!!';
      
      const hash1 = encryption.hash(data1);
      const hash2 = encryption.hash(data2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('verifyHash', () => {
    it('should verify hash correctly', () => {
      const data = 'Hello, World!';
      const hashed = encryption.hash(data);

      expect(encryption.verifyHash(data, hashed)).toBe(true);
    });

    it('should fail verification with wrong data', () => {
      const data = 'Hello, World!';
      const wrongData = 'Hello, World!!';
      const hashed = encryption.hash(data);

      expect(encryption.verifyHash(wrongData, hashed)).toBe(false);
    });
  });

  describe('generatePassword', () => {
    it('should generate password of correct length', () => {
      const password = encryption.generatePassword(16);
      expect(password).toHaveLength(16);
    });

    it('should generate different passwords', () => {
      const password1 = encryption.generatePassword(16);
      const password2 = encryption.generatePassword(16);
      
      expect(password1).not.toBe(password2);
    });

    it('should generate password with various characters', () => {
      const password = encryption.generatePassword(100);
      
      // Should contain lowercase, uppercase, numbers, and special chars
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[!@#$%^&*()_+\-=\[\]{}|;:,.<>?]/);
    });
  });

  describe('generateToken', () => {
    it('should generate token of correct length', () => {
      const token = encryption.generateToken(32);
      expect(token).toHaveLength(64); // 32 bytes = 64 hex characters
    });

    it('should generate different tokens', () => {
      const token1 = encryption.generateToken(32);
      const token2 = encryption.generateToken(32);
      
      expect(token1).not.toBe(token2);
    });

    it('should generate hex token', () => {
      const token = encryption.generateToken(32);
      expect(token).toMatch(/^[0-9a-f]+$/);
    });
  });
});