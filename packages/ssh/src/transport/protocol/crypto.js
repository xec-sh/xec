import * as crypto from 'node:crypto';

// SSH packet framing is owned here; all cryptographic primitives belong to the
// runtime. No native addon, generated WebAssembly or JavaScript cipher fallback.
const MAX_PACKET_SIZE = 35000;
const MAX_KEY_PACKETS = 2 ** 31;
const MAX_KEY_BYTES = 1024 * 1024 * 1024;
const UINT32_MAX = 0xffffffff;
const AES_GCM = Object.freeze({ blockLen: 16, ivLen: 12, authLen: 16, discardLen: 0, stream: true });
const advertised = crypto.getCiphers();
const cipherInfo = {};
for (const bits of [128, 256]) {
  const sslName = `aes-${bits}-gcm`;
  if (!advertised.includes(sslName)) continue;
  try {
    const key = Buffer.alloc(bits / 8),
      iv = Buffer.alloc(12),
      data = Buffer.from([1]);
    const cipher = crypto.createCipheriv(sslName, key, iv, { authTagLength: 16 });
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
    const decipher = crypto.createDecipheriv(sslName, key, iv, { authTagLength: 16 });
    decipher.setAuthTag(cipher.getAuthTag());
    if (Buffer.concat([decipher.update(ciphertext), decipher.final()]).equals(data))
      cipherInfo[`aes${bits}-gcm@openssh.com`] = Object.freeze({ ...AES_GCM, sslName, keyLen: bits / 8 });
  } catch {
    /* Restricted runtimes must not advertise disabled primitives. */
  }
}

// OpenSSH ChaCha uses two independent 256-bit keys, an encrypted packet length
// and a standalone Poly1305 tag. The IETF ChaCha20-Poly1305 AEAD is not equivalent.
function hasOpenSSHChaCha() {
  if (!advertised.includes('chacha20') || typeof crypto.createMac !== 'function') return false;
  try {
    crypto.createCipheriv('chacha20', Buffer.alloc(32), Buffer.alloc(16)).update(Buffer.alloc(1));
    const key = Buffer.from('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b', 'hex');
    const tag = crypto.createMac('Poly1305', key).update('Cryptographic Forum Research Group').final('hex');
    return tag === 'a8061dc1305136c6c22b8baf0c0127a9';
  } catch {
    return false;
  }
}
if (hasOpenSSHChaCha())
  cipherInfo['chacha20-poly1305@openssh.com'] = Object.freeze({
    sslName: 'chacha20',
    blockLen: 8,
    keyLen: 64,
    ivLen: 0,
    authLen: 16,
    discardLen: 0,
    stream: true,
  });
export const CIPHER_INFO = Object.freeze(cipherInfo);
// Private-key containers use a separate algorithm domain from SSH negotiation.
export const KEY_CIPHER_INFO = Object.freeze({
  ...Object.fromEntries(Object.entries(cipherInfo).filter(([, info]) => info.sslName.endsWith('-gcm'))),
  ...Object.fromEntries(
    [128, 192, 256]
      .filter((bits) => advertised.includes(`aes-${bits}-ctr`))
      .map((bits) => [
        `aes${bits}-ctr`,
        Object.freeze({
          sslName: `aes-${bits}-ctr`,
          blockLen: 16,
          keyLen: bits / 8,
          ivLen: 16,
          authLen: 0,
          stream: true,
        }),
      ])
  ),
});
export const MAC_INFO = Object.freeze({
  'hmac-sha2-256-etm@openssh.com': Object.freeze({ sslName: 'sha256', len: 32, actualLen: 32, isETM: true }),
  'hmac-sha2-512-etm@openssh.com': Object.freeze({ sslName: 'sha512', len: 64, actualLen: 64, isETM: true }),
});

function sequence(value) {
  if (!Number.isInteger(value) || value < 0 || value > UINT32_MAX) throw new TypeError('Invalid SSH packet sequence');
  return value;
}
function packet(payloadLength, blockLength, clearLength) {
  if (!Number.isInteger(payloadLength) || payloadLength < 1 || payloadLength > MAX_PACKET_SIZE - 64)
    throw new RangeError('SSH payload exceeds the packet limit');
  let padding = blockLength - ((1 + payloadLength + (clearLength ? 0 : 4)) % blockLength);
  if (padding < 4) padding += blockLength;
  const out = Buffer.allocUnsafe(5 + payloadLength + padding);
  out.writeUInt32BE(out.length - 4, 0);
  out[4] = padding;
  crypto.randomFillSync(out, 5 + payloadLength, padding);
  return out;
}
function advanceIV(iv) {
  // RFC 5647: the invocation counter is the final eight bytes, never the fixed prefix.
  for (let index = 11; index >= 4; --index) {
    if (iv[index] !== 255) {
      iv[index]++;
      return true;
    }
    iv[index] = 0;
  }
  return false;
}
function nonce(seqno, counter = 0) {
  const iv = Buffer.alloc(16);
  iv[0] = counter;
  iv.writeUInt32BE(seqno, 12);
  return iv;
}

class KeyLifetime {
  constructor(onRekey) {
    this.packets = 0;
    this.bytes = 0;
    this.onRekey = onRekey;
    this.rekeyRequested = false;
  }
  account(bytes) {
    this.packets++;
    this.bytes += bytes;
    if (this.packets >= MAX_KEY_PACKETS) throw new Error('SSH key packet limit exhausted');
    if (!this.rekeyRequested && (this.packets >= 1024 * 1024 || this.bytes >= MAX_KEY_BYTES)) {
      this.rekeyRequested = true;
      this.onRekey?.();
    }
  }
}

export class NullCipher {
  constructor(seqno, onWrite) {
    this.outSeqno = sequence(seqno);
    this._onWrite = onWrite;
    this._dead = false;
  }
  allocPacket(length) {
    return packet(length, 8, false);
  }
  encrypt(data) {
    if (this._dead) throw new Error('SSH cipher is disposed');
    this.outSeqno = (this.outSeqno + 1) >>> 0;
    this._onWrite(data);
  }
  free() {
    this._dead = true;
  }
}

class Cipher {
  constructor(cipherOptions) {
    this.info = cipherOptions.cipherInfo;
    this.key = Buffer.from(cipherOptions.cipherKey);
    this.iv = cipherOptions.cipherIV ? Buffer.from(cipherOptions.cipherIV) : undefined;
    this.outSeqno = sequence(cipherOptions.seqno);
    this._onWrite = cipherOptions.onWrite;
    this._dead = false;
    this.exhausted = false;
    this.lifetime = new KeyLifetime(cipherOptions.onRekey);
  }
  allocPacket(length) {
    return packet(length, this.info.blockLen, true);
  }
  encrypt(data) {
    if (this._dead || this.exhausted) throw new Error('SSH cipher key is exhausted or disposed');
    const seqno = this.outSeqno;
    let wire;
    if (this.info.sslName === 'chacha20') {
      const main = this.key.subarray(0, 32),
        lengthKey = this.key.subarray(32);
      const polyKey = crypto.createCipheriv('chacha20', main, nonce(seqno)).update(Buffer.alloc(32));
      const header = crypto.createCipheriv('chacha20', lengthKey, nonce(seqno)).update(data.subarray(0, 4));
      const ciphertext = crypto.createCipheriv('chacha20', main, nonce(seqno, 1)).update(data.subarray(4));
      const tag = crypto.createMac('Poly1305', polyKey).update(header).update(ciphertext).final();
      polyKey.fill(0);
      wire = Buffer.concat([header, ciphertext, tag]);
    } else {
      const iv = Buffer.from(this.iv);
      this.exhausted = !advanceIV(this.iv);
      const cipher = crypto.createCipheriv(this.info.sslName, this.key, iv, { authTagLength: 16 });
      cipher.setAAD(data.subarray(0, 4));
      const ciphertext = Buffer.concat([cipher.update(data.subarray(4)), cipher.final()]);
      wire = Buffer.concat([data.subarray(0, 4), ciphertext, cipher.getAuthTag()]);
    }
    // Commit per-packet state before a transport callback can re-enter this cipher.
    this.outSeqno = (seqno + 1) >>> 0;
    this.lifetime.account(wire.length);
    this._onWrite(wire);
  }
  free() {
    this._dead = true;
    this.key.fill(0);
    this.iv?.fill(0);
  }
}

class PacketDecipher {
  constructor(seqno, onPayload, info, onRekey) {
    this.inSeqno = sequence(seqno);
    this._onPayload = onPayload;
    this.info = info;
    this.header = Buffer.alloc(4);
    this.headerBytes = 0;
    this.body = undefined;
    this.bodyBytes = 0;
    this._dead = false;
    this.lifetime = new KeyLifetime(onRekey);
  }
  decodeLength(header) {
    return header.readUInt32BE(0);
  }
  authenticate(_header, body) {
    return body;
  }
  decrypt(data, offset, end) {
    if (this._dead) throw new Error('SSH decipher is disposed');
    while (offset < end) {
      if (this.headerBytes < 4) {
        const size = Math.min(4 - this.headerBytes, end - offset);
        data.copy(this.header, this.headerBytes, offset, offset + size);
        offset += size;
        this.headerBytes += size;
        if (this.headerBytes < 4) return undefined;
        const length = this.decodeLength(this.header);
        const { blockLen, authLen, clearLength } = this.info;
        if (
          length < blockLen ||
          length + 4 + authLen > MAX_PACKET_SIZE ||
          (length + (clearLength ? 0 : 4)) % blockLen !== 0
        )
          throw new Error('Invalid SSH packet length');
        this.body = Buffer.allocUnsafe(length + authLen);
      }
      const size = Math.min(this.body.length - this.bodyBytes, end - offset);
      data.copy(this.body, this.bodyBytes, offset, offset + size);
      offset += size;
      this.bodyBytes += size;
      if (this.bodyBytes < this.body.length) return undefined;
      const body = this.authenticate(this.header, this.body);
      const padding = body[0];
      if (padding < 4 || padding >= body.length - 1) throw new Error('Invalid SSH packet padding');
      const payload = body.subarray(1, body.length - padding);
      const bytes = this.body.length + 4;
      this.headerBytes = 0;
      this.bodyBytes = 0;
      this.body = undefined;
      this.inSeqno = (this.inSeqno + 1) >>> 0;
      this.lifetime.account(bytes);
      const result = this._onPayload(payload);
      if (result !== undefined) return result === false ? offset : result;
    }

    return undefined;
  }
  free() {
    this._dead = true;
    this.body?.fill(0);
    this.body = undefined;
  }
}

export class NullDecipher extends PacketDecipher {
  constructor(seqno, onPayload) {
    super(seqno, onPayload, { blockLen: 8, authLen: 0, clearLength: false });
  }
}

class Decipher extends PacketDecipher {
  constructor(decipherOptions) {
    super(
      decipherOptions.seqno,
      decipherOptions.onPayload,
      { ...decipherOptions.decipherInfo, clearLength: true },
      decipherOptions.onRekey
    );
    this.key = Buffer.from(decipherOptions.decipherKey);
    this.iv = decipherOptions.decipherIV ? Buffer.from(decipherOptions.decipherIV) : undefined;
    this.exhausted = false;
  }
  decodeLength(header) {
    if (this.exhausted) throw new Error('SSH decipher key is exhausted');
    if (this.info.sslName === 'chacha20')
      return crypto
        .createDecipheriv('chacha20', this.key.subarray(32), nonce(this.inSeqno))
        .update(header)
        .readUInt32BE(0);
    return super.decodeLength(header);
  }
  authenticate(header, body) {
    const ciphertext = body.subarray(0, -16),
      tag = body.subarray(-16);
    if (this.info.sslName === 'chacha20') {
      const main = this.key.subarray(0, 32),
        seqno = this.inSeqno;
      const polyKey = crypto.createCipheriv('chacha20', main, nonce(seqno)).update(Buffer.alloc(32));
      const expected = crypto.createMac('Poly1305', polyKey).update(header).update(ciphertext).final();
      polyKey.fill(0);
      if (!crypto.timingSafeEqual(tag, expected)) throw new Error('Invalid SSH packet authentication tag');
      return crypto.createDecipheriv('chacha20', main, nonce(seqno, 1)).update(ciphertext);
    }
    const decipher = crypto.createDecipheriv(this.info.sslName, this.key, this.iv, { authTagLength: 16 });
    decipher.setAAD(header);
    decipher.setAuthTag(tag);
    const first = decipher.update(ciphertext);
    try {
      const last = decipher.final();
      this.exhausted = !advanceIV(this.iv);
      return last.length ? Buffer.concat([first, last]) : first;
    } catch (error) {
      first.fill(0);
      throw error;
    }
  }
  free() {
    super.free();
    this.key.fill(0);
    this.iv?.fill(0);
  }
}

function options(config, direction) {
  const value = config?.[direction];
  const outbound = direction === 'outbound';
  const info = value?.[outbound ? 'cipherInfo' : 'decipherInfo'];
  const key = value?.[outbound ? 'cipherKey' : 'decipherKey'];
  const iv = value?.[outbound ? 'cipherIV' : 'decipherIV'];
  const callback = value?.[outbound ? 'onWrite' : 'onPayload'];
  if (!info || !Object.values(CIPHER_INFO).includes(info)) throw new Error('Unsupported SSH cipher');
  if (
    !Buffer.isBuffer(key) ||
    key.length !== info.keyLen ||
    (info.ivLen && (!Buffer.isBuffer(iv) || iv.length !== info.ivLen)) ||
    typeof callback !== 'function'
  )
    throw new TypeError('Invalid SSH cipher configuration');
  sequence(value.seqno);
  return value;
}
export function createCipher(config) {
  return new Cipher(options(config, 'outbound'));
}
export function createDecipher(config) {
  return new Decipher(options(config, 'inbound'));
}
