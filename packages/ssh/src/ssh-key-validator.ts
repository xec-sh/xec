import type { SSHConnectionConfig } from './contracts.js';

import { stat } from 'node:fs/promises';

import { readRegularFile } from './files.js';

export interface SSHKeyValidation {
  isValid: boolean;
  keyType?: string;
  issues: string[];
}

/** Validation uses the same actual key decoder as authentication, never PEM-shaped regex acceptance. */
export class SSHKeyValidator {
  private static async validate(key: string | Buffer, privateKey: boolean, passphrase?: string | Buffer): Promise<SSHKeyValidation> {
    try {
      const { parseKey } = await import('./transport/protocol/keyParser.js');
      const parsed = parseKey(key, passphrase);
      if (parsed instanceof Error) throw parsed;
      if (!parsed || parsed.isPrivateKey() !== privateKey) {
        throw new Error(privateKey ? 'Expected one SSH private key' : 'Expected one SSH public key');
      }
      const keyType = parsed.type === 'ssh-rsa' ? 'RSA'
        : parsed.type === 'ssh-ed25519' ? 'ED25519' : 'EC';
      return { isValid: true, keyType, issues: [] };
    } catch (error) {
      return { isValid: false, issues: [error instanceof Error ? error.message : 'SSH key could not be decoded'] };
    }
  }

  static validatePrivateKey(key: string | Buffer, passphrase?: string | Buffer): Promise<SSHKeyValidation> {
    return this.validate(key, true, passphrase);
  }

  static validatePublicKey(key: string | Buffer): Promise<SSHKeyValidation> {
    return this.validate(key, false);
  }

  static async validateKeyFile(keyPath: string, passphrase?: string): Promise<SSHKeyValidation> {
    try {
      return await this.validatePrivateKey(await readRegularFile(keyPath, 1024 * 1024), passphrase);
    } catch (error) {
      return { isValid: false, issues: [error instanceof Error ? error.message : 'SSH key file could not be read'] };
    }
  }

  static async checkKeyFilePermissions(keyPath: string): Promise<{ isSecure: boolean; issues: string[] }> {
    if (process.platform === 'win32') return { isSecure: false, issues: ['Windows key access requires an ACL check; POSIX mode bits do not establish it'] };
    try {
      const information = await stat(keyPath);
      const mode = information.mode & 0o777;
      const issues = !information.isFile() ? ['SSH key is not a regular file']
        : (mode & 0o077) !== 0 || (mode & 0o400) === 0 ? ['SSH private key must be owner-readable without group or other access'] : [];
      return { isSecure: issues.length === 0, issues };
    } catch (error) {
      return { isSecure: false, issues: [error instanceof Error ? error.message : 'Key access could not be checked'] };
    }
  }

  static validateSSHOptions(options: SSHConnectionConfig): { isValid: boolean; issues: string[] } {
    if (!options || typeof options !== 'object') return { isValid: false, issues: ['SSH options must be an object'] };
    const issues: string[] = [];
    if ((!options.host || typeof options.host !== 'string') && !options.sock) issues.push('An SSH host or socket is required');
    if (!options.username || typeof options.username !== 'string') issues.push('SSH username is required');
    if (options.port !== undefined && (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535)) issues.push('SSH port must be between 1 and 65535');
    if (options.privateKey && options.privateKeyPath) issues.push('Specify privateKey or privateKeyPath, not both');
    const custom = typeof options.authHandler === 'function' || (Array.isArray(options.authHandler) && options.authHandler.length > 0);
    if (!options.privateKey && !options.privateKeyPath && options.password === undefined && !options.agent && !custom && !(options.tryKeyboard && options.onKeyboardInteractive)) {
      issues.push('An explicit SSH authentication method is required');
    }
    return { isValid: issues.length === 0, issues };
  }
}
