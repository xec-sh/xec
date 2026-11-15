import bcrypt from 'bcrypt-pbkdf';
// OpenSSH container decoding is adapted from ssh2 (MIT, Brian White).
// All asymmetric cryptography and PEM/DER handling use the runtime KeyObject API.
import {
  sign,
  verify,
  createECDH,
  createPublicKey,
  timingSafeEqual,
  createDecipheriv,
  createPrivateKey,
} from 'node:crypto';

import { KEY_CIPHER_INFO } from './crypto.js';

export const KEY_LIMITS = Object.freeze({
  bytes: 1024 * 1024,
  passphraseBytes: 1024,
  bcryptRounds: 64,
  saltBytes: 64,
  rsaBits: 8192,
});
const curves = Object.freeze({
  nistp256: { jwk: 'P-256', native: 'prime256v1', bytes: 32, hash: 'sha256' },
  nistp384: { jwk: 'P-384', native: 'secp384r1', bytes: 48, hash: 'sha384' },
  nistp521: { jwk: 'P-521', native: 'secp521r1', bytes: 66, hash: 'sha512' },
});
const parsed = new WeakSet();
const proof = Buffer.from('Xec SSH private key consistency');

function fail(message) {
  throw new Error(message);
}
function equal(a, b) {
  return a.length === b.length && timingSafeEqual(a, b);
}
function unsigned(value) {
  if (!value.length || value[0] & 0x80) fail('Invalid SSH positive integer');
  if (value.length > 1 && value[0] === 0) {
    if (!(value[1] & 0x80)) fail('Non-canonical SSH positive integer');
    return value.subarray(1);
  }
  return value;
}
function mpint(value) {
  if (!value.length) fail('Empty key integer');
  return value[0] & 0x80 ? Buffer.concat([Buffer.from([0]), value]) : value;
}
function field(value) {
  const data = typeof value === 'string' ? Buffer.from(value) : value;
  const result = Buffer.allocUnsafe(data.length + 4);
  result.writeUInt32BE(data.length, 0);
  data.copy(result, 4);
  return result;
}
function publicBlob(type, ...values) {
  return Buffer.concat([field(type), ...values.map(field)]);
}
function base64url(value) {
  return value.toString('base64url');
}
function jwkBuffer(value) {
  return Buffer.from(value, 'base64url');
}
function decodeBase64(value) {
  const text = value.replace(/\s/g, '');
  if (!text.length || !/^[A-Za-z0-9+/]+={0,2}$/.test(text)) fail('Invalid SSH base64 data');
  const bytes = Buffer.from(text, 'base64');
  if (bytes.toString('base64').replace(/=+$/, '') !== text.replace(/=+$/, '')) fail('Non-canonical SSH base64 data');
  return bytes;
}

class Reader {
  constructor(buffer) {
    this.buffer = buffer;
    this.offset = 0;
  }
  uint32() {
    if (this.offset + 4 > this.buffer.length) fail('Truncated SSH key');
    const value = this.buffer.readUInt32BE(this.offset);
    this.offset += 4;
    return value;
  }
  string(limit = KEY_LIMITS.bytes) {
    const length = this.uint32();
    if (length > limit || length > this.buffer.length - this.offset) fail('Invalid SSH key field length');
    const value = this.buffer.subarray(this.offset, this.offset + length);
    this.offset += length;
    return value;
  }
  text(limit = 128) {
    return this.string(limit).toString('utf8');
  }
  integer(limit = KEY_LIMITS.rsaBits / 8 + 1) {
    return unsigned(this.string(limit));
  }
  end() {
    if (this.offset !== this.buffer.length) fail('Unexpected trailing SSH key data');
  }
}

function details(key) {
  const jwk = key.export({ format: 'jwk' });
  if (jwk.kty === 'RSA') {
    const bits = key.asymmetricKeyDetails?.modulusLength;
    if (!bits || bits < 2048 || bits > KEY_LIMITS.rsaBits) fail('SSH RSA keys require 2048–8192 bits');
    return {
      type: 'ssh-rsa',
      hash: 'sha512',
      blob: publicBlob('ssh-rsa', mpint(jwkBuffer(jwk.e)), mpint(jwkBuffer(jwk.n))),
    };
  }
  if (jwk.kty === 'OKP' && jwk.crv === 'Ed25519')
    return { type: 'ssh-ed25519', hash: null, blob: publicBlob('ssh-ed25519', jwkBuffer(jwk.x)) };
  if (jwk.kty === 'EC') {
    const entry = Object.entries(curves).find(([, curve]) => curve.jwk === jwk.crv);
    if (entry) {
      const [name, curve] = entry,
        type = `ecdsa-sha2-${name}`;
      return {
        type,
        hash: curve.hash,
        blob: publicBlob(type, name, Buffer.concat([Buffer.from([4]), jwkBuffer(jwk.x), jwkBuffer(jwk.y)])),
      };
    }
  }
  fail('Unsupported SSH key algorithm');

  return undefined;
}

class ParsedKey {
  #private;
  #public;
  #blob;
  #hash;
  constructor(publicKey, privateKey, comment = '') {
    const { type, hash, blob } = details(publicKey);
    this.type = type;
    this.comment = comment;
    this.#private = privateKey;
    this.#public = publicKey;
    this.#blob = blob;
    this.#hash = hash;
    if (privateKey && !verify(hash, proof, publicKey, sign(hash, proof, privateKey)))
      fail('SSH private and public key do not match');
    parsed.add(this);
  }
  hash(algorithm) {
    if (algorithm === undefined || algorithm === null) return this.#hash;
    if (this.type === 'ssh-rsa' && (algorithm === 'sha256' || algorithm === 'sha512')) return algorithm;
    if (algorithm === this.#hash) return algorithm;
    fail('Unsupported SSH signature hash');

    return undefined;
  }
  sign(data, algorithm) {
    try {
      if (!this.#private) fail('No private key available');
      return sign(this.hash(algorithm), data, this.#private);
    } catch (error) {
      return error;
    }
  }
  verify(data, signature, algorithm) {
    try {
      return verify(this.hash(algorithm), data, this.#public, signature);
    } catch (error) {
      return error;
    }
  }
  isPrivateKey() {
    return this.#private !== undefined;
  }
  getPrivatePEM() {
    return this.#private?.export({ format: 'pem', type: 'pkcs8' }).toString() ?? null;
  }
  getPublicPEM() {
    return this.#public.export({ format: 'pem', type: 'spki' }).toString();
  }
  getPublicSSH() {
    return Buffer.from(this.#blob);
  }
  equals(other) {
    const key = parseKey(other);
    return !(key instanceof Error) && equal(this.#blob, key.#blob);
  }
}

function parsePublic(reader, type, comment = '') {
  let jwk;
  if (type === 'ssh-rsa') {
    const e = reader.integer(8),
      n = reader.integer();
    jwk = { kty: 'RSA', e: base64url(e), n: base64url(n) };
  } else if (type === 'ssh-ed25519') {
    const x = reader.string(32);
    if (x.length !== 32) fail('Invalid Ed25519 public key');
    jwk = { kty: 'OKP', crv: 'Ed25519', x: base64url(x) };
  } else {
    const name = type.slice('ecdsa-sha2-'.length),
      curve = curves[name];
    if (!type.startsWith('ecdsa-sha2-') || !curve || reader.text() !== name)
      fail('Unsupported or mismatched SSH key curve');
    const point = reader.string(1 + 2 * curve.bytes);
    if (point.length !== 1 + 2 * curve.bytes || point[0] !== 4) fail('Invalid SSH elliptic curve point');
    jwk = {
      kty: 'EC',
      crv: curve.jwk,
      x: base64url(point.subarray(1, 1 + curve.bytes)),
      y: base64url(point.subarray(1 + curve.bytes)),
    };
  }
  reader.end();
  return new ParsedKey(createPublicKey({ key: jwk, format: 'jwk' }), undefined, comment);
}

function bigint(value) {
  return BigInt(`0x${value.toString('hex') || '0'}`);
}
function integerBuffer(value) {
  const hex = value.toString(16);
  return Buffer.from(hex.length % 2 ? `0${hex}` : hex, 'hex');
}
function parsePrivate(reader) {
  const type = reader.text();
  let privateKey;
  if (type === 'ssh-rsa') {
    const n = reader.integer(),
      e = reader.integer(8),
      d = reader.integer(),
      qi = reader.integer(),
      p = reader.integer(),
      q = reader.integer();
    const P = bigint(p),
      Q = bigint(q),
      D = bigint(d);
    if (P < 3n || Q < 3n || P * Q !== bigint(n)) fail('Inconsistent SSH RSA factors');
    // OpenSSH stores p/q/d/iqmp. PKCS/JWK additionally require the two CRT
    // residues; this converts the key container, not the RSA signing primitive.
    privateKey = createPrivateKey({
      format: 'jwk',
      key: {
        kty: 'RSA',
        n: base64url(n),
        e: base64url(e),
        d: base64url(d),
        p: base64url(p),
        q: base64url(q),
        qi: base64url(qi),
        dp: base64url(integerBuffer(D % (P - 1n))),
        dq: base64url(integerBuffer(D % (Q - 1n))),
      },
    });
  } else if (type === 'ssh-ed25519') {
    const pub = reader.string(32),
      secret = reader.string(64);
    if (pub.length !== 32 || secret.length !== 64 || !equal(pub, secret.subarray(32)))
      fail('Inconsistent Ed25519 private key');
    // RFC 8410 PKCS8 prefix for a 32-byte Ed25519 seed. The runtime derives x.
    const der = Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), secret.subarray(0, 32)]);
    try {
      privateKey = createPrivateKey({ key: der, format: 'der', type: 'pkcs8' });
    } finally {
      der.fill(0);
    }
    if (!equal(jwkBuffer(createPublicKey(privateKey).export({ format: 'jwk' }).x), pub))
      fail('Inconsistent Ed25519 public key');
  } else {
    const name = type.slice('ecdsa-sha2-'.length),
      curve = curves[name];
    if (!type.startsWith('ecdsa-sha2-') || !curve || reader.text() !== name)
      fail('Unsupported or mismatched SSH private key curve');
    const pub = reader.string(1 + 2 * curve.bytes),
      d = reader.integer(curve.bytes + 1);
    if (d.length > curve.bytes) fail('Invalid SSH private scalar');
    const ecdh = createECDH(curve.native);
    ecdh.setPrivateKey(d);
    if (!equal(ecdh.getPublicKey(), pub)) fail('SSH private and public key do not match');
    const padded = Buffer.alloc(curve.bytes);
    d.copy(padded, padded.length - d.length);
    try {
      privateKey = createPrivateKey({
        format: 'jwk',
        key: {
          kty: 'EC',
          crv: curve.jwk,
          d: base64url(padded),
          x: base64url(pub.subarray(1, 1 + curve.bytes)),
          y: base64url(pub.subarray(1 + curve.bytes)),
        },
      });
    } finally {
      padded.fill(0);
    }
  }
  const comment = reader.text(64 * 1024);
  return new ParsedKey(createPublicKey(privateKey), privateKey, comment);
}

function parseOpenSSH(text, passphrase) {
  const match = /^-----BEGIN OPENSSH PRIVATE KEY-----\r?\n([\s\S]+)\r?\n-----END OPENSSH PRIVATE KEY-----$/.exec(text);
  if (!match) fail('Malformed OpenSSH private key');
  const container = decodeBase64(match[1]);
  let decrypted, material;
  try {
    if (container.subarray(0, 15).toString() !== 'openssh-key-v1\0') fail('Invalid OpenSSH key magic');
    const reader = new Reader(container.subarray(15));
    const cipher = reader.text(),
      kdf = reader.text(),
      options = reader.string(128);
    if (reader.uint32() !== 1) fail('Exactly one OpenSSH private key is required');
    const expected = reader.string(),
      encrypted = reader.string();
    let blockLength = 8;
    if (cipher === 'none') {
      if (kdf !== 'none' || options.length) fail('Invalid unencrypted OpenSSH key');
      reader.end();
      decrypted = encrypted;
    } else {
      const info = KEY_CIPHER_INFO[cipher];
      if (!info || kdf !== 'bcrypt') fail('Unsupported OpenSSH private key encryption');
      const tag = reader.buffer.subarray(reader.offset);
      if (tag.length !== info.authLen) fail('Invalid OpenSSH key authentication tag length');
      reader.offset += tag.length;
      reader.end();
      const parameters = new Reader(options),
        salt = parameters.string(KEY_LIMITS.saltBytes),
        rounds = parameters.uint32();
      parameters.end();
      if (salt.length < 16 || rounds < 1 || rounds > KEY_LIMITS.bcryptRounds)
        fail(`OpenSSH bcrypt requires 16–64 salt bytes and 1–${KEY_LIMITS.bcryptRounds} rounds`);
      if (!passphrase?.length) fail('Encrypted OpenSSH private key requires a passphrase');
      blockLength = info.blockLen;
      if (!encrypted.length || encrypted.length % blockLength) fail('Invalid encrypted OpenSSH key length');
      material = Buffer.alloc(info.keyLen + info.ivLen);
      if (bcrypt.pbkdf(passphrase, passphrase.length, salt, salt.length, material, material.length, rounds) !== 0)
        fail('OpenSSH key derivation failed');
      const decipher = createDecipheriv(
        info.sslName,
        material.subarray(0, info.keyLen),
        material.subarray(info.keyLen),
        info.authLen ? { authTagLength: info.authLen } : undefined
      );
      if (info.authLen) decipher.setAuthTag(tag);
      decipher.setAutoPadding(false);
      decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    }
    if (!decrypted.length || decrypted.length % blockLength) fail('Invalid OpenSSH key padding length');
    const secret = new Reader(decrypted);
    if (secret.uint32() !== secret.uint32()) fail('OpenSSH private key integrity check failed');
    const result = parsePrivate(secret);
    const padding = decrypted.length - secret.offset;
    if (padding >= blockLength) fail('Invalid OpenSSH key padding');
    for (let index = 1; secret.offset < decrypted.length; index++)
      if (decrypted[secret.offset++] !== index) fail('Invalid OpenSSH key padding');
    if (!equal(expected, result.getPublicSSH())) fail('OpenSSH public and private keys do not match');
    return result;
  } finally {
    material?.fill(0);
    decrypted?.fill(0);
    container.fill(0);
  }
}

export function isParsedKey(value) {
  return value !== null && typeof value === 'object' && parsed.has(value);
}
export function isSupportedKeyType(type) {
  return (
    type === 'ssh-rsa' ||
    type === 'ssh-ed25519' ||
    (type.startsWith('ecdsa-sha2-') && Object.hasOwn(curves, type.slice(11)))
  );
}
export function parseDERKey(data, type) {
  try {
    if (!Buffer.isBuffer(data) || data.length > KEY_LIMITS.bytes || typeof type !== 'string')
      fail('Invalid SSH public key');
    return parsePublic(new Reader(data), type);
  } catch (error) {
    return error;
  }
}
export function parseKey(data, passphrase) {
  if (isParsedKey(data)) return data;
  let password;
  try {
    if (
      (typeof data !== 'string' && !Buffer.isBuffer(data)) ||
      !data.length ||
      Buffer.byteLength(data) > KEY_LIMITS.bytes
    )
      fail('SSH key must contain at most 1 MiB');
    if (passphrase !== undefined) {
      if (
        (typeof passphrase !== 'string' && !Buffer.isBuffer(passphrase)) ||
        Buffer.byteLength(passphrase) > KEY_LIMITS.passphraseBytes
      )
        fail('SSH passphrase must contain at most 1024 bytes');
      password = Buffer.from(passphrase);
    }
    if (Buffer.isBuffer(data) && data[0] === 0) {
      const reader = new Reader(data);
      return parsePublic(reader, reader.text());
    }
    const text = data.toString().trim();
    if (text.startsWith('-----BEGIN OPENSSH PRIVATE KEY-----')) return parseOpenSSH(text, password);
    if (text.startsWith('-----BEGIN ')) {
      if (!/^-----BEGIN (?:RSA |EC |ENCRYPTED )?PRIVATE KEY-----/.test(text))
        return new ParsedKey(createPublicKey(text));
      const key = createPrivateKey({ key: text, format: 'pem', passphrase: password });
      return new ParsedKey(createPublicKey(key), key);
    }
    const match = /^(ssh-rsa|ssh-ed25519|ecdsa-sha2-nistp(?:256|384|521)) ([A-Za-z0-9+/]+={0,2})(?: ([^\r\n]*))?$/.exec(
      text
    );
    if (!match) fail('Unsupported SSH key format');
    const reader = new Reader(decodeBase64(match[2])),
      type = reader.text();
    if (type !== match[1]) fail('SSH public key type does not match its body');
    return parsePublic(reader, type, match[3]);
  } catch (error) {
    return error;
  } finally {
    password?.fill(0);
  }
}
