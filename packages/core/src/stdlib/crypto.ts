import type { CallableExecutionEngine } from '@xec-js/ush';

import { v4 as uuidv4 } from 'uuid';
import { createHash, randomBytes as nodeRandomBytes } from 'crypto';

import type { Logger } from '../utils/logger.js';
import type {
  Crypto,
  HashAlgorithm,
  EnvironmentInfo,
} from '../types/environment-types.js';

export async function createCrypto(
  $: CallableExecutionEngine,
  env: EnvironmentInfo,
  log?: Logger
): Promise<Crypto> {

  const crypto: Crypto = {
    async hash(algorithm: HashAlgorithm, data: string | Buffer): Promise<string> {
      const dataStr = typeof data === 'string' ? data : data.toString();

      // Use Node.js crypto if available
      try {
        const hash = createHash(algorithm);
        hash.update(data);
        return hash.digest('hex');
      } catch {
        // Fallback to shell commands
        const cmd = algorithm === 'md5' && env.platform.os === 'darwin'
          ? 'md5'
          : `${algorithm}sum`;

        const result = await $`echo -n "${dataStr}" | ${cmd} | awk '{print $1}'`;
        return result.stdout.trim();
      }
    },

    async md5(data: string | Buffer): Promise<string> {
      return this.hash('md5', data);
    },

    async sha256(data: string | Buffer): Promise<string> {
      return this.hash('sha256', data);
    },

    async sha512(data: string | Buffer): Promise<string> {
      return this.hash('sha512', data);
    },

    async randomBytes(size: number): Promise<Buffer> {
      // Use Node.js crypto if available
      try {
        return nodeRandomBytes(size);
      } catch {
        // Fallback to shell command
        const result = await $`dd if=/dev/urandom bs=1 count=${size} 2>/dev/null | base64`;
        return Buffer.from(result.stdout.trim(), 'base64').slice(0, size);
      }
    },

    uuid(): string {
      try {
        return uuidv4();
      } catch {
        // Simple UUID v4 implementation
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
    },

    base64Encode(data: string | Buffer): string {
      const buffer = typeof data === 'string' ? Buffer.from(data) : data;
      return buffer.toString('base64');
    },

    base64Decode(encoded: string): Buffer {
      return Buffer.from(encoded, 'base64');
    },
  };

  return crypto;
}