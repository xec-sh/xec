import {
  scrypt,
  createHash,
  randomBytes,
  createCipheriv,
  timingSafeEqual,
  createDecipheriv,
  type ScryptOptions
} from 'node:crypto';

/**
 * Promise wrapper for {@link scrypt} that keeps the options argument.
 *
 * `promisify` resolves to the three-argument overload, which is why the cost
 * parameters below could not be passed and were silently left at Node's
 * defaults.
 */
function deriveScrypt(
  secret: string,
  salt: Buffer,
  keyLength: number,
  options: ScryptOptions
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(secret, salt, keyLength, options, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(key);
    });
  });
}

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
  
  // Use scrypt for key derivation (resistant to GPU attacks).
  //
  // The cost parameters are passed explicitly rather than left to Node's
  // defaults. They currently coincide, so stored secrets are unaffected, but
  // a default that shifted under a future runtime would silently change the
  // strength of every key derived here — and, because the derivation is not
  // versioned, would also make existing secrets undecryptable.
  return deriveScrypt(secret, salt, KEY_LENGTH, SCRYPT_OPTIONS);
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
  
  // GCM accepts a truncated authentication tag, and a shorter tag is
  // proportionally easier to forge. Node validates only that the length is one
  // it recognises, so the full length is required here instead.
  if (authTag.length !== TAG_LENGTH) {
    throw new Error(
      `Invalid authentication tag: expected ${TAG_LENGTH} bytes, got ${authTag.length}`
    );
  }

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
 * Compare two secrets without leaking where they differ.
 *
 * Both inputs are hashed before comparison, so the observable time does not
 * depend on the position of the first differing byte — or on whether the
 * lengths match, which a raw length check would reveal. The comparison
 * itself is {@link timingSafeEqual}, the audited constant-time primitive.
 *
 * The previous implementation was a hand-rolled XOR loop. Source-level
 * constant time means nothing after the JIT has had opinions about a hot
 * loop; measured on Node 22 it diverged by up to 4× between early- and
 * late-difference inputs.
 */
export function secureCompare(a: string, b: string): boolean {
  const digestA = createHash('sha256').update(a, 'utf8').digest();
  const digestB = createHash('sha256').update(b, 'utf8').digest();

  return timingSafeEqual(digestA, digestB);
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