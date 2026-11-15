import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect, describe } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises';

import { SSHKeyValidator } from '../src/ssh-key-validator.js';

const ed25519 = generateKeyPairSync('ed25519');
const privatePEM = ed25519.privateKey.export({ format: 'pem', type: 'pkcs8' });
const publicPEM = ed25519.publicKey.export({ format: 'pem', type: 'spki' });

describe('actual SSH key validation', () => {
  it('decodes private and public keys and rejects swapping their roles', async () => {
    await expect(SSHKeyValidator.validatePrivateKey(privatePEM)).resolves.toEqual({ isValid: true, keyType: 'ED25519', issues: [] });
    await expect(SSHKeyValidator.validatePublicKey(publicPEM)).resolves.toEqual({ isValid: true, keyType: 'ED25519', issues: [] });
    expect((await SSHKeyValidator.validatePrivateKey(publicPEM)).isValid).toBe(false);
    expect((await SSHKeyValidator.validatePublicKey(privatePEM)).isValid).toBe(false);
  });
  it('does not treat a PEM header or base64-looking text as a valid key', async () => {
    for (const value of ['', '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----', privatePEM.toString().slice(0, 100)]) {
      const result = await SSHKeyValidator.validatePrivateKey(value);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
  it('uses the authentication decoder and its encryption policy', async () => {
    const encrypted = ed25519.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase: 'synthetic-only' });
    expect((await SSHKeyValidator.validatePrivateKey(encrypted, 'synthetic-only')).isValid).toBe(true);
    expect((await SSHKeyValidator.validatePrivateKey(encrypted, 'wrong')).isValid).toBe(false);
    expect((await SSHKeyValidator.validatePrivateKey(privatePEM, 'x'.repeat(1025))).isValid).toBe(false);
  });
  it('rejects weak RSA and unsupported EC keys', async () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({ format: 'pem', type: 'pkcs8' });
    const curve = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey.export({ format: 'pem', type: 'pkcs8' });
    expect((await SSHKeyValidator.validatePrivateKey(weak)).isValid).toBe(false);
    expect((await SSHKeyValidator.validatePrivateKey(curve)).isValid).toBe(false);
  });
  it('rejects oversized input before decoding', async () => {
    const result = await SSHKeyValidator.validatePrivateKey(Buffer.alloc(1024 * 1024 + 1));
    expect(result.isValid).toBe(false);
    expect(result.issues.join(' ')).toMatch(/1 MiB/);
  });
  it('reads bounded regular files and reports permissions independently of key validity', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'xec-key-validation-'));
    try {
      const file = join(directory, 'identity');
      await writeFile(file, privatePEM, { mode: 0o600 });
      expect((await SSHKeyValidator.validateKeyFile(file)).isValid).toBe(true);
      const access = await SSHKeyValidator.checkKeyFilePermissions(file);
      expect(access.isSecure).toBe(process.platform !== 'win32');
      if (process.platform !== 'win32') {
        await chmod(file, 0o644);
        expect((await SSHKeyValidator.checkKeyFilePermissions(file)).isSecure).toBe(false);
      }
      expect((await SSHKeyValidator.validateKeyFile(directory)).isValid).toBe(false);
      expect((await SSHKeyValidator.validateKeyFile(join(directory, 'missing'))).isValid).toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('accepts an explicit agent policy without demanding a password', () => {
    expect(SSHKeyValidator.validateSSHOptions({ host: 'fixture.invalid', username: 'operator', agent: '/synthetic/socket' }).isValid).toBe(true);
    expect(SSHKeyValidator.validateSSHOptions({ host: 'fixture.invalid', username: 'operator' }).isValid).toBe(false);
    expect(SSHKeyValidator.validateSSHOptions(null as never).isValid).toBe(false);
  });
});
