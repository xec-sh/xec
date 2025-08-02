import { it, expect, describe } from '@jest/globals';

import {
  encode,
  decode,
  encrypt,
  decrypt,
  hashKey,
  deriveKey,
  secureCompare,
  generateSecret,
  createFingerprint
} from '../../src/secrets/crypto.js';

describe('Crypto Module', () => {
  const testMachineId = 'test-machine-id-12345';
  const testPassphrase = 'test-passphrase';
  const testValue = 'my-secret-value';
  
  // Helper to test real file encryption/decryption
  const testRealFileEncryption = async (filePath: string, content: string) => {
    const fs = await import('fs/promises');
    const path = await import('path');
    const os = await import('os');
    
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-crypto-test-'));
    const testFile = path.join(tempDir, 'test.enc');
    
    try {
      // Encrypt and write to file
      const { encrypted, salt, iv, authTag } = await encrypt(content, testMachineId);
      const fileData = Buffer.concat([salt, iv, authTag, encrypted]);
      await fs.writeFile(testFile, fileData);
      
      // Read and decrypt from file
      const readData = await fs.readFile(testFile);
      const readSalt = readData.subarray(0, 32);
      const readIv = readData.subarray(32, 48);
      const readAuthTag = readData.subarray(48, 64);
      const readEncrypted = readData.subarray(64);
      
      const decrypted = await decrypt(readEncrypted, readSalt, readIv, readAuthTag, testMachineId);
      return { decrypted, fileSize: readData.length };
    } finally {
      await fs.rm(tempDir, { recursive: true });
    }
  };

  describe('deriveKey', () => {
    it('should derive a consistent key for the same inputs', async () => {
      const salt = Buffer.from('test-salt');
      const key1 = await deriveKey(testMachineId, salt);
      const key2 = await deriveKey(testMachineId, salt);
      
      expect(key1).toBeInstanceOf(Buffer);
      expect(key1.length).toBe(32); // 256 bits
      expect(key1.equals(key2)).toBe(true);
    });

    it('should derive different keys for different salts', async () => {
      const salt1 = Buffer.from('salt1');
      const salt2 = Buffer.from('salt2');
      
      const key1 = await deriveKey(testMachineId, salt1);
      const key2 = await deriveKey(testMachineId, salt2);
      
      expect(key1.equals(key2)).toBe(false);
    });

    it('should derive different keys with passphrase', async () => {
      const salt = Buffer.from('test-salt');
      
      const keyWithoutPassphrase = await deriveKey(testMachineId, salt);
      const keyWithPassphrase = await deriveKey(testMachineId, salt, testPassphrase);
      
      expect(keyWithoutPassphrase.equals(keyWithPassphrase)).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt a value successfully', async () => {
      const { encrypted, salt, iv, authTag } = await encrypt(testValue, testMachineId);
      
      expect(encrypted).toBeInstanceOf(Buffer);
      expect(salt).toBeInstanceOf(Buffer);
      expect(iv).toBeInstanceOf(Buffer);
      expect(authTag).toBeInstanceOf(Buffer);
      
      const decrypted = await decrypt(encrypted, salt, iv, authTag, testMachineId);
      expect(decrypted).toBe(testValue);
    });

    it('should encrypt and decrypt with passphrase', async () => {
      const { encrypted, salt, iv, authTag } = await encrypt(
        testValue,
        testMachineId,
        testPassphrase
      );
      
      const decrypted = await decrypt(
        encrypted,
        salt,
        iv,
        authTag,
        testMachineId,
        testPassphrase
      );
      
      expect(decrypted).toBe(testValue);
    });

    it('should fail to decrypt with wrong passphrase', async () => {
      const { encrypted, salt, iv, authTag } = await encrypt(
        testValue,
        testMachineId,
        testPassphrase
      );
      
      await expect(
        decrypt(encrypted, salt, iv, authTag, testMachineId, 'wrong-passphrase')
      ).rejects.toThrow();
    });

    it('should fail to decrypt with wrong machine ID', async () => {
      const { encrypted, salt, iv, authTag } = await encrypt(testValue, testMachineId);
      
      await expect(
        decrypt(encrypted, salt, iv, authTag, 'wrong-machine-id')
      ).rejects.toThrow();
    });

    it('should fail to decrypt with tampered data', async () => {
      const { encrypted, salt, iv, authTag } = await encrypt(testValue, testMachineId);
      
      // Tamper with encrypted data
      encrypted[0] = encrypted[0] ^ 0xFF;
      
      await expect(
        decrypt(encrypted, salt, iv, authTag, testMachineId)
      ).rejects.toThrow();
    });

    it('should produce different ciphertexts for same plaintext', async () => {
      const result1 = await encrypt(testValue, testMachineId);
      const result2 = await encrypt(testValue, testMachineId);
      
      // Should have different IVs and salts
      expect(result1.iv.equals(result2.iv)).toBe(false);
      expect(result1.salt.equals(result2.salt)).toBe(false);
      expect(result1.encrypted.equals(result2.encrypted)).toBe(false);
    });
  });

  describe('encode/decode', () => {
    it('should encode and decode buffers', () => {
      const buffer = Buffer.from('test data');
      const encoded = encode(buffer);
      const decoded = decode(encoded);
      
      expect(encoded).toMatch(/^[A-Za-z0-9+/]+=*$/);
      expect(decoded).toBeInstanceOf(Buffer);
      expect(decoded.equals(buffer)).toBe(true);
    });

    it('should handle empty buffers', () => {
      const buffer = Buffer.alloc(0);
      const encoded = encode(buffer);
      const decoded = decode(encoded);
      
      expect(encoded).toBe('');
      expect(decoded.length).toBe(0);
    });
  });

  describe('hashKey', () => {
    it('should produce consistent hashes', () => {
      const key = 'test-key';
      const hash1 = hashKey(key);
      const hash2 = hashKey(key);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different keys', () => {
      const hash1 = hashKey('key1');
      const hash2 = hashKey('key2');
      
      expect(hash1).not.toBe(hash2);
    });

    it('should handle unicode keys', () => {
      const key = '测试密钥🔑';
      const hash = hashKey(key);
      
      expect(hash).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('createFingerprint', () => {
    it('should create consistent fingerprints', () => {
      const data = Buffer.from('test data');
      const fp1 = createFingerprint(data);
      const fp2 = createFingerprint(data);
      
      expect(fp1).toBe(fp2);
      expect(fp1).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should create different fingerprints for different data', () => {
      const fp1 = createFingerprint(Buffer.from('data1'));
      const fp2 = createFingerprint(Buffer.from('data2'));
      
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('generateSecret', () => {
    it('should generate secrets of specified length', () => {
      const lengths = [16, 32, 64, 128];
      
      for (const length of lengths) {
        const secret = generateSecret(length);
        expect(secret).toHaveLength(length);
        expect(secret).toMatch(/^[A-Za-z0-9+/=]+$/);
      }
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();
      
      for (let i = 0; i < 100; i++) {
        secrets.add(generateSecret(32));
      }
      
      expect(secrets.size).toBe(100);
    });

    it('should handle edge cases', () => {
      expect(() => generateSecret(0)).toThrow();
      expect(() => generateSecret(-1)).toThrow();
      expect(() => generateSecret(1025)).toThrow(); // Too large
    });
  });

  describe('secureCompare', () => {
    it('should correctly compare equal strings', () => {
      expect(secureCompare('test', 'test')).toBe(true);
      expect(secureCompare('', '')).toBe(true);
      expect(secureCompare('long string with spaces', 'long string with spaces')).toBe(true);
    });

    it('should correctly identify different strings', () => {
      expect(secureCompare('test', 'Test')).toBe(false);
      expect(secureCompare('abc', 'abd')).toBe(false);
      expect(secureCompare('short', 'longer')).toBe(false);
    });

    it('should handle different length strings', () => {
      expect(secureCompare('test', 'testing')).toBe(false);
      expect(secureCompare('a', 'ab')).toBe(false);
      expect(secureCompare('longer string', 'short')).toBe(false);
    });

    it('should compare in constant time', () => {
      const string1 = 'a'.repeat(1000);
      const string2 = 'a'.repeat(999) + 'b';
      const string3 = 'b' + 'a'.repeat(999);
      
      // Time multiple comparisons
      const iterations = 10000; // More iterations for better timing accuracy
      
      // Compare strings that differ at the end
      const start1 = performance.now();
      for (let i = 0; i < iterations; i++) {
        secureCompare(string1, string2);
      }
      const time1 = performance.now() - start1;
      
      // Compare strings that differ at the beginning
      const start2 = performance.now();
      for (let i = 0; i < iterations; i++) {
        secureCompare(string1, string3);
      }
      const time2 = performance.now() - start2;
      
      // Times should be similar (within 100% variance to avoid flaky tests)
      const ratio = Math.max(time1, time2) / Math.min(time1, time2);
      expect(ratio).toBeLessThan(2.0);
      
      // At least verify the function works correctly
      expect(secureCompare(string1, string1)).toBe(true);
      expect(secureCompare(string1, string2)).toBe(false);
      expect(secureCompare(string1, string3)).toBe(false);
    });
  });

  describe('real file encryption', () => {
    it('should encrypt and decrypt files correctly', async () => {
      const content = 'This is sensitive data that needs encryption';
      const { decrypted, fileSize } = await testRealFileEncryption('test.txt', content);
      
      expect(decrypted).toBe(content);
      expect(fileSize).toBeGreaterThan(content.length); // Should include salt, iv, tag
    });

    it('should handle large files', async () => {
      const largeContent = 'x'.repeat(10000); // 10KB of data
      const { decrypted } = await testRealFileEncryption('large.txt', largeContent);
      
      expect(decrypted).toBe(largeContent);
    });

    it('should handle unicode content', async () => {
      const unicodeContent = '这是中文内容 🔐 مع محتوى عربي';
      const { decrypted } = await testRealFileEncryption('unicode.txt', unicodeContent);
      
      expect(decrypted).toBe(unicodeContent);
    });
  });
});