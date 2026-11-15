// Adapted from ssh2 1.17.0. Copyright Brian White. MIT; see package LICENSE and PROVENANCE.json.

import { DISCONNECT_REASON } from './constants.js';

const FastBuffer = Buffer[Symbol.species];
const TypedArrayFill = Object.getPrototypeOf(Uint8Array.prototype).fill;

function readUInt32BE(buf, offset) {
  return buf[offset++] * 16777216 + buf[offset++] * 65536 + buf[offset++] * 256 + buf[offset];
}

function bufferCopy(src, dest, srcStart, srcEnd, destStart) {
  if (!destStart) destStart = 0;
  if (srcEnd > src.length) srcEnd = src.length;
  let nb = srcEnd - srcStart;
  const destLeft = dest.length - destStart;
  if (nb > destLeft) nb = destLeft;
  dest.set(new Uint8Array(src.buffer, src.byteOffset + srcStart, nb), destStart);
  return nb;
}

function bufferSlice(buf, start, end) {
  if (end === undefined) end = buf.length;
  return new FastBuffer(buf.buffer, buf.byteOffset + start, end - start);
}

function makeBufferParser() {
  let pos = 0;
  let buffer;

  const self = {
    init: (buf, start) => {
      buffer = buf;
      pos = typeof start === 'number' ? start : 0;
    },
    pos: () => pos,
    length: () => (buffer ? buffer.length : 0),
    avail: () => (buffer && pos < buffer.length ? buffer.length - pos : 0),
    clear: () => {
      buffer = undefined;
    },
    readUInt32BE: () => {
      if (!buffer || pos + 3 >= buffer.length) return undefined;
      return buffer[pos++] * 16777216 + buffer[pos++] * 65536 + buffer[pos++] * 256 + buffer[pos++];
    },
    readUInt64BE: () => {
      if (!buffer || pos + 7 >= buffer.length) return undefined;
      const value = buffer.readBigUInt64BE(pos);
      pos += 8;
      // The public SFTP contract uses exact numbers. Reject the entire packet
      // instead of rounding a server-controlled size, offset or filesystem ID.
      if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
        buffer = undefined;
        return undefined;
      }
      return Number(value);
    },
    skip: (n) => {
      if (buffer && n > 0) pos += n;
    },
    skipString: () => {
      const len = self.readUInt32BE();
      if (len === undefined) return undefined;
      pos += len;
      return pos <= buffer.length ? len : undefined;
    },
    readByte: () => {
      if (buffer && pos < buffer.length) return buffer[pos++];

      return undefined;
    },
    readBool: () => {
      if (buffer && pos < buffer.length) return !!buffer[pos++];

      return undefined;
    },
    readList: () => {
      const list = self.readString(true);
      if (list === undefined) return undefined;
      return list ? list.split(',') : [];
    },
    readString: (dest, maxLen) => {
      if (typeof dest === 'number') {
        maxLen = dest;
        dest = undefined;
      }

      const len = self.readUInt32BE();
      if (len === undefined) return undefined;

      if (buffer.length - pos < len || (typeof maxLen === 'number' && len > maxLen)) {
        return undefined;
      }

      if (dest) {
        if (Buffer.isBuffer(dest)) return bufferCopy(buffer, dest, pos, (pos += len));
        return buffer.utf8Slice(pos, (pos += len));
      }
      return bufferSlice(buffer, pos, (pos += len));
    },
    readRaw: (len) => {
      if (!buffer) return undefined;
      if (typeof len !== 'number') return bufferSlice(buffer, pos, (pos += buffer.length - pos));
      if (buffer.length - pos >= len) return bufferSlice(buffer, pos, (pos += len));

      return undefined;
    },
  };

  return self;
}

function makeError(msg, level, fatal) {
  const err = new Error(msg);
  if (typeof level === 'boolean') {
    fatal = level;
    err.level = 'protocol';
  } else {
    err.level = level || 'protocol';
  }
  err.fatal = !!fatal;
  return err;
}

function writeUInt32BE(buf, value, offset) {
  buf[offset++] = value >>> 24;
  buf[offset++] = value >>> 16;
  buf[offset++] = value >>> 8;
  buf[offset++] = value;
  return offset;
}

export { bufferCopy };
export { bufferSlice };
export { FastBuffer };
export const bufferFill = (buf, value, start, end) => TypedArrayFill.call(buf, value, start, end);
export { makeError };
export const doFatalError = (protocol, msg, level, reason) => {
  let err;
  if (msg instanceof Error) {
    // doFatalError(protocol, err[, reason])
    err = msg;
    if (typeof level !== 'number') reason = DISCONNECT_REASON.PROTOCOL_ERROR;
    else reason = level;
  } else {
    // doFatalError(protocol, msg[, level[, reason]])
    err = makeError(msg, level, true);
  }
  if (typeof reason !== 'number') reason = DISCONNECT_REASON.PROTOCOL_ERROR;
  protocol.disconnect(reason);
  protocol._destruct();
  protocol._onError(err);
  return Infinity;
};
export { readUInt32BE };
export { writeUInt32BE };
export const writeUInt32LE = (buf, value, offset) => {
  buf[offset++] = value;
  buf[offset++] = value >>> 8;
  buf[offset++] = value >>> 16;
  buf[offset++] = value >>> 24;
  return offset;
};
export { makeBufferParser };
export const bufferParser = makeBufferParser();
export const readString = (buffer, start, dest, maxLen) => {
  if (typeof dest === 'number') {
    maxLen = dest;
    dest = undefined;
  }

  if (start === undefined) start = 0;

  const left = buffer.length - start;
  if (start < 0 || start >= buffer.length || left < 4) return undefined;

  const len = readUInt32BE(buffer, start);
  if (left < 4 + len || (typeof maxLen === 'number' && len > maxLen)) return undefined;

  start += 4;
  const end = start + len;
  buffer._pos = end;

  if (dest) {
    if (Buffer.isBuffer(dest)) return bufferCopy(buffer, dest, start, end);
    return buffer.utf8Slice(start, end);
  }
  return bufferSlice(buffer, start, end);
};
const EC_SIGNATURE_BYTES = Object.freeze({
  'ecdsa-sha2-nistp256': 32,
  'ecdsa-sha2-nistp384': 48,
  'ecdsa-sha2-nistp521': 66,
});
function rawSignature(signature, type) {
  if (!Buffer.isBuffer(signature)) return undefined;
  if (type === 'ssh-ed25519') return signature.length === 64 ? signature : undefined;
  if (type === 'ssh-rsa' || type === 'rsa-sha2-256' || type === 'rsa-sha2-512')
    return signature.length > 0 && signature.length <= 1024 ? signature : undefined;
  return undefined;
}
/**
 * Convert the exact SSH signature payload to native fixed-width r||s.
 * @param {Buffer} signature
 * @param {string} type
 * @returns {Buffer | undefined}
 */
export const signatureToNative = (signature, type) => {
  const width = EC_SIGNATURE_BYTES[type];
  if (typeof width !== 'number') return rawSignature(signature, type);
  if (!Buffer.isBuffer(signature) || signature.length > 8 + 2 * (width + 1)) return undefined;
  const native = Buffer.alloc(2 * width);
  let offset = 0;
  for (let part = 0; part < 2; part++) {
    if (offset + 4 > signature.length) return undefined;
    const length = signature.readUInt32BE(offset);
    offset += 4;
    if (!length || length > width + 1 || length > signature.length - offset) return undefined;
    let value = signature.subarray(offset, offset + length);
    offset += length;
    // RFC 4251 positive mpints: no negative values or redundant sign bytes.
    if (value[0] & 0x80) return undefined;
    if (value[0] === 0) {
      if (value.length === 1 || !(value[1] & 0x80)) return undefined;
      value = value.subarray(1);
    }
    if (value.length > width || (width === 66 && value.length === width && value[0] > 1)) return undefined;
    value.copy(native, part * width + width - value.length);
  }
  return offset === signature.length ? native : undefined;
};
/**
 * Convert an explicitly native signature to SSH wire format.
 * @param {Buffer} signature
 * @param {string} type
 * @returns {Buffer | undefined}
 */
export const signatureToSSH = (signature, type) => {
  const width = EC_SIGNATURE_BYTES[type];
  if (typeof width !== 'number') return rawSignature(signature, type);
  if (!Buffer.isBuffer(signature) || signature.length !== 2 * width) return undefined;
  const parts = [];
  for (let part = 0; part < 2; part++) {
    let value = signature.subarray(part * width, (part + 1) * width);
    if (width === 66 && value[0] > 1) return undefined;
    let start = 0;
    while (start < value.length && value[start] === 0) start++;
    if (start === value.length) return undefined;
    value = value.subarray(start);
    const signByte = value[0] & 0x80 ? 1 : 0;
    const field = Buffer.alloc(4 + signByte + value.length);
    field.writeUInt32BE(signByte + value.length);
    value.copy(field, 4 + signByte);
    parts.push(field);
  }
  return Buffer.concat(parts);
};
export const sendPacket = (proto, packet, bypass) => {
  if (!bypass && proto._kexinit !== undefined) {
    // We're currently in the middle of a handshake

    if (proto._queue === undefined) proto._queue = [];
    const nextBytes = (proto._queueBytes ?? 0) + packet.length;
    if (proto._queue.length >= 256 || nextBytes > 8 * 1024 * 1024) {
      const error = new Error('SSH key exchange queue limit exceeded');
      error.code = 'ERR_SSH_QUEUE_LIMIT';
      error.level = 'protocol';
      error.fatal = true;
      return doFatalError(proto, error);
    }
    proto._queueBytes = nextBytes;
    proto._queue.push(packet);
    if (proto._debug) {
      proto._debug('Outbound: ... packet queued');
    }
    return false;
  }
  proto._cipher.encrypt(packet);
  return true;
};
