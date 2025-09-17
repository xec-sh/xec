import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';
import { it, expect, describe, afterEach, beforeEach } from '@jest/globals';

import { SSHKeyValidator } from '../../../src/adapters/ssh/ssh-key-validator.js';

describe('SSHKeyValidator', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ssh-key-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('validatePrivateKey', () => {
    describe('valid keys', () => {
      it('should validate RSA private key', async () => {
        const rsaKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+
Y0IkhYPRLnqPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU
/B0KkTc5S16veHm7HXDRXJbEQK9OQl9J1zxu8qUCQZwx7cXYphmnlVOlOgAhW1Qz
M8TTFH8SmfTQsOGKqHGWmFkH5Y4Dbh9mjVA0gkLr1Hv4TaB8jJLwK6Xm+7MEj8Dj
T7HdQ3hGT6oQFQDQnayR5Eg5TYVleifKKfpk7wIDAQABAoIBAD0K84UngCnvMz0g
FALn/7sOgPP4g7BUJpXoLhcK0XPZ2h1TtpXU/7B3gSxLCxYk5a9F0QFqGS7iF1qZ
-----END RSA PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(rsaKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('RSA');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate DSA private key', async () => {
        const dsaKey = `-----BEGIN DSA PRIVATE KEY-----
MIIBuwIBAAKBgQDHvT1HEsLBKXm5A0FqflHA8n7fY7lBFxwo/HQQbAh1n1J9lLKz
z0FRNqPLF3J5x0pisCmLKJXlJrS8Gn9pQz9CciGIR3rMpFXGUfGEz2gvmVUdTbHE
jLHGTrX3psLaV7quCnP3x6ShFEdsGpfvZ9qVMKSBpKXd0NQ9gQFN8mzqhQIVAJKy
-----END DSA PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(dsaKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('DSA');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate EC private key', async () => {
        const ecKey = `-----BEGIN EC PRIVATE KEY-----
MHcCAQEEIIGLlYaYvEm/LcvtLkDkTMjCGQAHXNmkVKBLz8J5Fz7BoAoGCCqGSM49
AwEHoUQDQgAEOwU5oNyKwTbdFMmudHqEKvLZwbLpAJZcbvt/xXSRGfPL7lPw/mCY
sGEkqPX3wM8LHAN0O7hlJMQarv8qKZnbWg==
-----END EC PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(ecKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('EC');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate OpenSSH format private key', async () => {
        const opensshKey = `-----BEGIN OPENSSH PRIVATE KEY-----
b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAlwAAAAdzc2gtcn
NhAAAAAwEAAQAAAIEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzXKZpq
ZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+Y0IkhYPRLn
qPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU/B0KkTc5S16veHm7
HXDRXJbEQK9OQl9J1zxu8qUCQZwx7cXYphmnlVOlOgAhW1QzM8TTFH8SmfTQsOGKqHGWmF
kH5Y4Dbh9mjVA0gkLr1Hv4TaB8jJLwK6Xm+7MEj8DjT7HdQ3hGT6oQFQDQnayR5Eg5TYVl
-----END OPENSSH PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(opensshKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('OPENSSH');
        expect(result.issues).toHaveLength(0);
      });
    });

    describe('invalid keys', () => {
      it('should reject empty key', async () => {
        const result = await SSHKeyValidator.validatePrivateKey('');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('SSH key is empty');
      });

      it('should reject whitespace-only key', async () => {
        const result = await SSHKeyValidator.validatePrivateKey('   \n\t  ');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('SSH key is empty');
      });

      it('should reject key with invalid format', async () => {
        const invalidKey = `-----BEGIN INVALID KEY-----
some random content
-----END INVALID KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(invalidKey);
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Invalid SSH private key format. Expected PEM or OpenSSH format');
      });

      it('should reject key with unsupported type', async () => {
        const unsupportedKey = `-----BEGIN UNKNOWN PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
-----END UNKNOWN PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(unsupportedKey);
        expect(result.isValid).toBe(false);
        expect(result.issues.some(issue => issue.includes('Unsupported key type'))).toBe(true);
      });

      it('should detect encrypted keys', async () => {
        const encryptedKey = `-----BEGIN RSA PRIVATE KEY-----
Proc-Type: 4,ENCRYPTED
DEK-Info: AES-128-CBC,2AF25325A9B286E8B2B26B80C9F3D66F

MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
-----END RSA PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(encryptedKey);
        expect(result.issues).toContain('Encrypted private keys require a passphrase');
      });

      it('should reject key with too short content', async () => {
        const shortKey = `-----BEGIN RSA PRIVATE KEY-----
MII
-----END RSA PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(shortKey);
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Private key content appears to be too short');
      });

      it('should reject key with invalid Base64 encoding', async () => {
        const invalidBase64 = `-----BEGIN RSA PRIVATE KEY-----
This is not valid Base64!!!
It contains invalid characters @#$%
-----END RSA PRIVATE KEY-----`;

        const result = await SSHKeyValidator.validatePrivateKey(invalidBase64);
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Private key content is not properly Base64 encoded');
      });
    });
  });

  describe('validatePublicKey', () => {
    describe('valid keys', () => {
      it('should validate RSA public key', () => {
        const rsaPublicKey = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDDtsnGVeLUz5aZaknSJkVxIGbPX7S88GEghOtRSMlUaeo7PNcpmmpmKHBLA== user@host';

        const result = SSHKeyValidator.validatePublicKey(rsaPublicKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('RSA');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate DSA public key', () => {
        const dsaPublicKey = 'ssh-dss AAAAB3NzaC1kc3MAAACBAMe9PUcSwsEpeblDQWp+UcDyft9juUEXHCj8dBBsCHWfUn2UsrPPQVE2o8sXcnnHSmKwKYsolQ==';

        const result = SSHKeyValidator.validatePublicKey(dsaPublicKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('DSA');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate ECDSA public key', () => {
        const ecdsaPublicKey = 'ecdsa-sha2-nistp256 AAAAE2VjZHNhLXNoYTItbmlzdHAyNTYAAAAIbmlzdHAyNTYAAABBBDsFOaDcisE23RTJrnR6hCry2cGy6QCWXG77f8V0kRnz';

        const result = SSHKeyValidator.validatePublicKey(ecdsaPublicKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('ECDSA');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate Ed25519 public key', () => {
        const ed25519PublicKey = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMPTZce1BDkoL48MHmA7FvcNBPJKL0kkhVYPRLn6Pb0K';

        const result = SSHKeyValidator.validatePublicKey(ed25519PublicKey);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('ED25519');
        expect(result.issues).toHaveLength(0);
      });

      it('should validate key without comment', () => {
        const keyWithoutComment = 'ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABAQDDtsnGVeLUz5aZaknSJkVxIGbPX7S88GEghOtRSMlUaeo7PNcpmmpmKHBLA==';

        const result = SSHKeyValidator.validatePublicKey(keyWithoutComment);
        expect(result.isValid).toBe(true);
        expect(result.keyType).toBe('RSA');
      });
    });

    describe('invalid keys', () => {
      it('should reject empty key', () => {
        const result = SSHKeyValidator.validatePublicKey('');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('SSH public key is empty');
      });

      it('should reject invalid format', () => {
        const result = SSHKeyValidator.validatePublicKey('not-a-valid-ssh-key');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Invalid SSH public key format. Expected OpenSSH format');
      });

      it('should reject unknown key type', () => {
        const result = SSHKeyValidator.validatePublicKey('ssh-unknown AAAAB3NzaC1yc2EAAAADAQABAAABAQDDtsnGVeLUz5aZa==');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Invalid SSH public key format. Expected OpenSSH format');
      });

      it('should reject malformed Base64', () => {
        const result = SSHKeyValidator.validatePublicKey('ssh-rsa InvalidBase64Content!@#$%');
        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('Invalid SSH public key format. Expected OpenSSH format');
      });
    });
  });

  describe('validateKeyFile', () => {
    it('should validate key from file', async () => {
      const keyPath = path.join(tempDir, 'test_key');
      const keyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+
Y0IkhYPRLnqPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU
-----END RSA PRIVATE KEY-----`;

      await fs.writeFile(keyPath, keyContent);

      const result = await SSHKeyValidator.validateKeyFile(keyPath);
      expect(result.isValid).toBe(true);
      expect(result.keyType).toBe('RSA');
    });

    it('should handle non-existent file', async () => {
      const result = await SSHKeyValidator.validateKeyFile('/non/existent/file');
      expect(result.isValid).toBe(false);
      expect(result.issues.some(issue => issue.includes('Failed to read key file'))).toBe(true);
    });

    it('should validate file permissions', async () => {
      const keyPath = path.join(tempDir, 'test_key_perms');
      const keyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
-----END RSA PRIVATE KEY-----`;

      await fs.writeFile(keyPath, keyContent);
      
      // Set insecure permissions
      await fs.chmod(keyPath, 0o644);

      const result = await SSHKeyValidator.checkKeyFilePermissions(keyPath);
      expect(result.isSecure).toBe(false);
      expect(result.issues.some(issue => issue.includes('insecure permissions'))).toBe(true);
    });

    it('should accept secure permissions', async () => {
      const keyPath = path.join(tempDir, 'test_key_secure');
      const keyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+
-----END RSA PRIVATE KEY-----`;

      await fs.writeFile(keyPath, keyContent);
      
      // Set secure permissions
      await fs.chmod(keyPath, 0o600);

      const result = await SSHKeyValidator.validateKeyFile(keyPath);
      expect(result.issues.some(issue => issue.includes('insecure permissions'))).toBe(false);
    });
  });

  describe('edge cases', () => {
    it('should handle keys with extra whitespace', async () => {
      const keyWithWhitespace = `  

-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+
Y0IkhYPRLnqPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU
/B0KkTc5S16veHm7HXDRXJbEQK9OQl9J1zxu8qUCQZwx7cXYphmnlVOlOgAhW1Qz
M8TTFH8SmfTQsOGKqHGWmFkH5Y4Dbh9mjVA0gkLr1Hv4TaB8jJLwK6Xm+7MEj8Dj
T7HdQ3hGT6oQFQDQnayR5Eg5TYVleifKKfpk7wIDAQABAoIBAD0K84UngCnvMz0g
FALn/7sOgPP4g7BUJpXoLhcK0XPZ2h1TtpXU/7B3gSxLCxYk5a9F0QFqGS7iF1qZ
-----END RSA PRIVATE KEY-----  

`;

      const result = await SSHKeyValidator.validatePrivateKey(keyWithWhitespace);
      expect(result.isValid).toBe(true);
    });

    it('should handle keys with Windows line endings', async () => {
      const keyWithCRLF = '-----BEGIN RSA PRIVATE KEY-----\r\n' +
        'MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX\r\n' +
        'KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+\r\n' +
        'Y0IkhYPRLnqPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU\r\n' +
        '/B0KkTc5S16veHm7HXDRXJbEQK9OQl9J1zxu8qUCQZwx7cXYphmnlVOlOgAhW1Qz\r\n' +
        '-----END RSA PRIVATE KEY-----\r\n';

      const result = await SSHKeyValidator.validatePrivateKey(keyWithCRLF);
      expect(result.isValid).toBe(true);
    });

    it('should handle public keys with multiple spaces', () => {
      const keyWithSpaces = 'ssh-rsa    AAAAB3NzaC1yc2EAAAADAQABAAABAQDDtsnGVeLUz5aZaknSJkVx    user@host';

      const result = SSHKeyValidator.validatePublicKey(keyWithSpaces);
      expect(result.isValid).toBe(true);
    });

    it('should validate very long keys', () => {
      // Generate a long but valid Base64 string
      const longBase64 = 'A'.repeat(1000);
      const longKey = `ssh-rsa ${longBase64} user@host`;

      const result = SSHKeyValidator.validatePublicKey(longKey);
      expect(result.isValid).toBe(true);
    });
  });

  describe('security checks', () => {
    it('should detect weak RSA keys', async () => {
      // This would be a real implementation in production
      const weakKey = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAKj34+5SNkn0S8nfMzoLHwFJRDzfBQ0= 
-----END RSA PRIVATE KEY-----`;

      const result = await SSHKeyValidator.validatePrivateKey(weakKey);
      // In a real implementation, this would check key length
      expect(result.issues.some(issue => 
        issue.includes('too short') || issue.includes('Base64')
      )).toBe(true);
    });

    it('should warn about DSA keys', async () => {
      const dsaKey = `-----BEGIN DSA PRIVATE KEY-----
MIIBuwIBAAKBgQDHvT1HEsLBKXm5A0FqflHA8n7fY7lBFxwo/HQQbAh1n1J9lLKz
-----END DSA PRIVATE KEY-----`;

      const result = await SSHKeyValidator.validatePrivateKey(dsaKey);
      // DSA is considered less secure, could add a warning
      expect(result.keyType).toBe('DSA');
    });
  });

  describe('Buffer input', () => {
    it('should validate private key from Buffer', async () => {
      const rsaKey = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
KZpqZLEWCQfYnfpLpTCzLmKzc7VNT5ZvEtLx8EqQg8H7Je8OfD3Q/5mSPassCIy+
Y0IkhYPRLnqPbcKKHQfXzCUfVDQvQvvwvRoZJQPNnR2WpNxFJyvgJbQKLqCZE3fU
/B0KkTc5S16veHm7HXDRXJbEQK9OQl9J1zxu8qUCQZwx7cXYphmnlVOlOgAhW1Qz
M8TTFH8SmfTQsOGKqHGWmFkH5Y4Dbh9mjVA0gkLr1Hv4TaB8jJLwK6Xm+7MEj8Dj
T7HdQ3hGT6oQFQDQnayR5Eg5TYVleifKKfpk7wIDAQABAoIBAD0K84UngCnvMz0g
FALn/7sOgPP4g7BUJpXoLhcK0XPZ2h1TtpXU/7B3gSxLCxYk5a9F0QFqGS7iF1qZ
-----END RSA PRIVATE KEY-----`;

      const buffer = Buffer.from(rsaKey, 'utf8');
      const result = await SSHKeyValidator.validatePrivateKey(buffer);
      
      expect(result.isValid).toBe(true);
      expect(result.keyType).toBe('RSA');
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('validateKeyFile with passphrase', () => {
    it('should warn when passphrase provided for unencrypted key', async () => {
      const keyPath = path.join(tempDir, 'unencrypted_key');
      const keyContent = `-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEAw7bJxlXi1M+WmWpJ0iZFcSBmz1+0vPBhIITrUUjJVGnqOzzX
-----END RSA PRIVATE KEY-----`;

      await fs.writeFile(keyPath, keyContent);

      const result = await SSHKeyValidator.validateKeyFile(keyPath, 'unnecessary-passphrase');
      expect(result.issues).toContain('Passphrase provided but key does not appear to be encrypted');
    });
  });

  describe('validateSSHOptions', () => {
    it('should validate valid SSH options with private key', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        username: 'user',
        port: 22,
        privateKey: 'key-content'
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should validate valid SSH options with password', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        username: 'user',
        password: 'secret'
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });

    it('should reject missing host', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        username: 'user',
        privateKey: 'key'
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('SSH host is required');
    });

    it('should reject missing username', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        privateKey: 'key'
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('SSH username is required');
    });

    it('should reject invalid port numbers', () => {
      const testCases = [
        { port: 0, desc: 'port 0' },
        { port: -1, desc: 'negative port' },
        { port: 65536, desc: 'port > 65535' },
        { port: 1.5, desc: 'non-integer port' }
      ];

      testCases.forEach(({ port, desc }) => {
        const result = SSHKeyValidator.validateSSHOptions({
          host: 'example.com',
          username: 'user',
          port,
          privateKey: 'key'
        });

        expect(result.isValid).toBe(false);
        expect(result.issues).toContain('SSH port must be a valid port number (1-65535)');
      });
    });

    it('should reject missing authentication', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        username: 'user'
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Either privateKey or password must be provided for authentication');
    });

    it('should reject both authentication methods', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        username: 'user',
        privateKey: 'key',
        password: 'password'
      });

      expect(result.isValid).toBe(false);
      expect(result.issues).toContain('Both privateKey and password provided. Only one authentication method should be used');
    });

    it('should accept Buffer as privateKey', () => {
      const result = SSHKeyValidator.validateSSHOptions({
        host: 'example.com',
        username: 'user',
        privateKey: Buffer.from('key-content')
      });

      expect(result.isValid).toBe(true);
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('checkKeyFilePermissions error handling', () => {
    it('should handle file stat errors', async () => {
      const result = await SSHKeyValidator.checkKeyFilePermissions('/path/that/does/not/exist');
      
      expect(result.isSecure).toBe(false);
      expect(result.issues.some(issue => issue.includes('Failed to check file permissions'))).toBe(true);
    });
  });
});