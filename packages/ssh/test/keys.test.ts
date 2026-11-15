import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Socket } from 'node:net';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { it, vi, expect, describe } from 'vitest';
import { rm, chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { createPublicKey, createPrivateKey, generateKeyPairSync } from 'node:crypto';

import { SSHClient } from '../src/client.js';
import TransportClient from '../src/transport/client.js';
import { SSHKeyValidator } from '../src/ssh-key-validator.js';
import { parseKey } from '../src/transport/protocol/keyParser.js';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    createMac: actual.createMac,
    createPrivateKey: vi.fn(actual.createPrivateKey),
    createPublicKey: vi.fn(actual.createPublicKey),
  };
});

const ed25519 = generateKeyPairSync('ed25519');
const privatePEM = ed25519.privateKey.export({ format: 'pem', type: 'pkcs8' });
const publicPEM = ed25519.publicKey.export({ format: 'pem', type: 'spki' });

describe('actual SSH key validation', () => {
  it('decodes private and public keys and rejects swapping their roles', async () => {
    await expect(SSHKeyValidator.validatePrivateKey(privatePEM)).resolves.toEqual({
      isValid: true,
      keyType: 'ED25519',
      issues: [],
    });
    await expect(SSHKeyValidator.validatePublicKey(publicPEM)).resolves.toEqual({
      isValid: true,
      keyType: 'ED25519',
      issues: [],
    });
    expect((await SSHKeyValidator.validatePrivateKey(publicPEM)).isValid).toBe(false);
    expect((await SSHKeyValidator.validatePublicKey(privatePEM)).isValid).toBe(false);
  });
  it('does not treat a PEM header or base64-looking text as a valid key', async () => {
    for (const value of [
      '',
      '-----BEGIN PRIVATE KEY-----\nZmFrZQ==\n-----END PRIVATE KEY-----',
      privatePEM.toString().slice(0, 100),
    ]) {
      const result = await SSHKeyValidator.validatePrivateKey(value);
      expect(result.isValid).toBe(false);
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
  it('rejects encrypted PEM/PKCS8 through validation and authentication before native key parsing or sockets', async () => {
    const passphrase = 'synthetic-only';
    const pkcs8 = ed25519.privateKey.export({ format: 'pem', type: 'pkcs8', cipher: 'aes-256-cbc', passphrase });
    const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({
      format: 'pem',
      type: 'pkcs1',
      cipher: 'aes-256-cbc',
      passphrase,
    });
    const ec = generateKeyPairSync('ec', { namedCurve: 'prime256v1' }).privateKey.export({
      format: 'pem',
      type: 'sec1',
      cipher: 'aes-256-cbc',
      passphrase,
    });
    const cases = [
      pkcs8,
      rsa,
      ec,
      pkcs8.toString().replaceAll('\n', '\r\n'),
      publicPEM.toString() + pkcs8,
      rsa.toString().replace('Proc-Type:', 'pRoC-TyPe :'),
    ];
    const directory = await mkdtemp(join(tmpdir(), 'xec-key-policy-'));
    const connect = vi.spyOn(Socket.prototype, 'connect').mockImplementation(() => {
      throw new Error('Key rejection must precede opening a socket');
    });
    const config = { host: '127.0.0.1', port: 9, username: 'fixture', passphrase, hostVerifier: () => true };
    vi.mocked(createPrivateKey).mockClear();
    vi.mocked(createPublicKey).mockClear();
    try {
      for (const encrypted of cases) {
        const decoded = parseKey(encrypted, passphrase);
        expect(decoded).toBeInstanceOf(Error);
        expect((decoded as Error).message).toMatch(/Encrypted PEM\/PKCS8.*OpenSSH.*agent/);
        expect((await SSHKeyValidator.validatePrivateKey(encrypted, passphrase)).issues.join(' ')).toMatch(
          /Encrypted PEM\/PKCS8/
        );
        expect((await SSHKeyValidator.validatePublicKey(encrypted)).isValid).toBe(false);
        const transport = new TransportClient();
        expect(() => transport.connect({ ...config, privateKey: encrypted })).toThrow(/Encrypted PEM\/PKCS8/);
        transport.destroy();
        const file = join(directory, 'identity');
        await writeFile(file, encrypted, { mode: 0o600 });
        expect((await SSHKeyValidator.validateKeyFile(file, passphrase)).isValid).toBe(false);
        for (const key of [{ privateKey: encrypted }, { privateKeyPath: file }]) {
          const client = new SSHClient();
          try {
            await expect(client.connect({ ...config, ...key })).rejects.toThrow(/Encrypted PEM\/PKCS8/);
          } finally {
            client.dispose();
          }
        }
      }
      expect(createPrivateKey).not.toHaveBeenCalled();
      expect(createPublicKey).not.toHaveBeenCalled();
      expect(connect).not.toHaveBeenCalled();
    } finally {
      connect.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  });
  it('custom publickey and hostbased authentication use the same rejection before native parsing', async () => {
    const require = createRequire(import.meta.url);
    const { Server } = require('ssh2') as typeof import('ssh2');
    const hostKey = readFileSync(require.resolve('ssh2/test/fixtures/ssh_host_ecdsa_key'));
    const peers = new Set<import('ssh2').Connection>();
    let authenticationRequests = 0;
    const server = new Server({ hostKeys: [hostKey] }, (peer) => {
      peers.add(peer);
      peer.on('error', () => {});
      peer.on('close', () => peers.delete(peer));
      peer.on('authentication', (context) => {
        authenticationRequests++;
        context.reject();
      });
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (typeof address !== 'object' || address === null) throw new Error('Missing local fixture address');
    const encrypted = ed25519.privateKey.export({
      format: 'pem',
      type: 'pkcs8',
      cipher: 'aes-256-cbc',
      passphrase: 'synthetic-only',
    });
    let trustedHosts = 0;
    try {
      for (const type of ['publickey', 'hostbased'] as const) {
        vi.mocked(createPrivateKey).mockClear();
        const client = new SSHClient();
        try {
          await expect(
            client.connect({
              host: '127.0.0.1',
              port: address.port,
              username: 'fixture',
              readyTimeout: 2500,
              hostVerifier: () => {
                trustedHosts++;
                return true;
              },
              authHandler: [
                {
                  type,
                  username: 'fixture',
                  key: encrypted,
                  passphrase: 'synthetic-only',
                  localHostname: 'fixture.invalid',
                  localUsername: 'fixture',
                },
              ],
            })
          ).rejects.toThrow(/All configured authentication methods failed/);
          expect(createPrivateKey).not.toHaveBeenCalled();
        } finally {
          client.dispose();
        }
      }
      expect(trustedHosts).toBe(2);
      expect(authenticationRequests).toBe(0);
    } finally {
      for (const peer of peers) peer.end();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
  it('never forwards a passphrase to native parsing, including a relabelled encrypted body', async () => {
    const encrypted = ed25519.privateKey.export({
      format: 'pem',
      type: 'pkcs8',
      cipher: 'aes-256-cbc',
      passphrase: 'synthetic-only',
    });
    vi.mocked(createPrivateKey).mockClear();
    expect(
      parseKey(encrypted.toString().replaceAll('ENCRYPTED PRIVATE KEY', 'PRIVATE KEY'), 'synthetic-only')
    ).toBeInstanceOf(Error);
    expect((await SSHKeyValidator.validatePrivateKey(privatePEM, 'unused')).isValid).toBe(true);
    for (const [input] of vi.mocked(createPrivateKey).mock.calls) expect(input).not.toHaveProperty('passphrase');
    expect((await SSHKeyValidator.validatePrivateKey(privatePEM, 'x'.repeat(1025))).isValid).toBe(false);
  });
  it('continues to decode bounded encrypted OpenSSH through the asynchronous validator', async () => {
    const require = createRequire(import.meta.url);
    const encrypted = readFileSync(require.resolve('ssh2/test/fixtures/keyParser/openssh_new_ecdsa_enc'));
    expect((await SSHKeyValidator.validatePrivateKey(encrypted, 'password')).isValid).toBe(true);
    expect((await SSHKeyValidator.validatePrivateKey(encrypted, 'wrong')).isValid).toBe(false);
  });
  it('requires one matching PEM envelope before native parsing', () => {
    vi.mocked(createPrivateKey).mockClear();
    vi.mocked(createPublicKey).mockClear();
    for (const input of [
      privatePEM.toString() + publicPEM,
      privatePEM.toString().replace('END PRIVATE KEY', 'END PUBLIC KEY'),
      '-----BEGIN CERTIFICATE-----\nAAAA\n-----END CERTIFICATE-----',
    ])
      expect(parseKey(input)).toBeInstanceOf(Error);
    expect(createPrivateKey).not.toHaveBeenCalled();
    expect(createPublicKey).not.toHaveBeenCalled();
  });
  it('rejects weak RSA and unsupported EC keys', async () => {
    const weak = generateKeyPairSync('rsa', { modulusLength: 1024 }).privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    });
    const curve = generateKeyPairSync('ec', { namedCurve: 'secp256k1' }).privateKey.export({
      format: 'pem',
      type: 'pkcs8',
    });
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
    expect(
      SSHKeyValidator.validateSSHOptions({ host: 'fixture.invalid', username: 'operator', agent: '/synthetic/socket' })
        .isValid
    ).toBe(true);
    expect(SSHKeyValidator.validateSSHOptions({ host: 'fixture.invalid', username: 'operator' }).isValid).toBe(false);
    expect(SSHKeyValidator.validateSSHOptions(null as never).isValid).toBe(false);
  });
});
