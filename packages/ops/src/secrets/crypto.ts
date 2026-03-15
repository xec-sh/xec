import { promisify } from 'util';
import {
  scrypt,
  createHash,
  randomBytes,
  createCipheriv,
  createDecipheriv
} from 'crypto';

const scryptAsync = promisify(scrypt);

/**
 * Encryption configuration
 */
const ALGORITHM = 'aes-256-gcm';
const SALT_LENGTH = 32;
const IV_LENGTH = 16;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_OPTIONS = {
  N: 16384, // CPU/memory cost parameter
  r: 8,     // Block size parameter
  p: 1,     // Parallelization parameter
};

/**
 * Derive encryption key from machine ID and optional user passphrase
 */
export async function deriveKey(
  machineId: string,
  salt: Buffer,
  passphrase?: string
): Promise<Buffer> {
  // Combine machine ID with optional passphrase
  const secret = passphrase ? `${machineId}:${passphrase}` : machineId;
  
  // Use scrypt for key derivation (resistant to GPU attacks)
  const key = await scryptAsync(secret, salt, KEY_LENGTH) as Buffer;
  return key;
}

/**
 * Encrypt a string value
 */
export async function encrypt(
  value: string,
  machineId: string,
  passphrase?: string
): Promise<{
  encrypted: Buffer;
  salt: Buffer;
  iv: Buffer;
  authTag: Buffer;
}> {
  // Generate random salt and IV
  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  
  // Derive key
  const key = await deriveKey(machineId, salt, passphrase);
  
  // Create cipher
  const cipher = createCipheriv(ALGORITHM, key, iv);
  
  // Encrypt the value
  const encrypted = Buffer.concat([
    cipher.update(value, 'utf8'),
    cipher.final()
  ]);
  
  // Get the authentication tag
  const authTag = cipher.getAuthTag();
  
  return {
    encrypted,
    salt,
    iv,
    authTag
  };
}

/**
 * Decrypt a value
 */
export async function decrypt(
  encrypted: Buffer,
  salt: Buffer,
  iv: Buffer,
  authTag: Buffer,
  machineId: string,
  passphrase?: string
): Promise<string> {
  // Derive key
  const key = await deriveKey(machineId, salt, passphrase);
  
  // Create decipher
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  // Decrypt the value
  const decrypted = Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]);
  
  return decrypted.toString('utf8');
}

/**
 * Hash a value for indexing (one-way)
 */
export function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/**
 * Create a fingerprint of encrypted data for integrity checking
 */
export function createFingerprint(data: Buffer | string): string {
  const hash = createHash('sha256');
  hash.update(typeof data === 'string' ? Buffer.from(data) : data);
  return hash.digest('hex').substring(0, 16);
}

/**
 * Encode binary data to base64 for storage
 */
export function encode(buffer: Buffer): string {
  return buffer.toString('base64');
}

/**
 * Decode base64 data
 */
export function decode(data: string): Buffer {
  return Buffer.from(data, 'base64');
}

/**
 * Securely compare two strings in constant time
 */
export function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Generate a random secret key
 */
export function generateSecret(length: number = 32): string {
  if (length <= 0) {
    throw new Error('Length must be greater than 0');
  }
  if (length > 1024) {
    throw new Error('Length must be less than or equal to 1024');
  }
  
  // Generate enough random bytes to produce the desired base64 length
  // Base64 encoding produces 4 characters for every 3 bytes
  const bytesNeeded = Math.ceil(length * 3 / 4);
  const randomData = randomBytes(bytesNeeded);
  
  // Convert to base64 and trim to exact length
  return randomData.toString('base64').substring(0, length);
}