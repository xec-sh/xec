// Adapted from ssh2 1.17.0. Copyright Brian White. MIT; see package LICENSE and PROVENANCE.json.

import fs from 'node:fs';
import EventEmitter from 'node:events';

const { constants } = fs;
import { types, inherits } from 'node:util';
import { Readable as ReadableStream, Writable as WritableStream } from 'node:stream';

const { isDate } = types;

const FastBuffer = Buffer[Symbol.species];

import { bufferCopy, bufferSlice, writeUInt32BE, makeBufferParser } from './utils.js';

const ATTR = {
  SIZE: 0x00000001,
  UIDGID: 0x00000002,
  PERMISSIONS: 0x00000004,
  ACMODTIME: 0x00000008,
  EXTENDED: 0x80000000,
};

// Large enough to store all possible attributes
const ATTRS_BUF = Buffer.alloc(28);

const STATUS_CODE = {
  OK: 0,
  EOF: 1,
  NO_SUCH_FILE: 2,
  PERMISSION_DENIED: 3,
  FAILURE: 4,
  BAD_MESSAGE: 5,
  NO_CONNECTION: 6,
  CONNECTION_LOST: 7,
  OP_UNSUPPORTED: 8,
};

const VALID_STATUS_CODES = new Map(Object.values(STATUS_CODE).map((n) => [n, 1]));

const STATUS_CODE_STR = {
  [STATUS_CODE.OK]: 'No error',
  [STATUS_CODE.EOF]: 'End of file',
  [STATUS_CODE.NO_SUCH_FILE]: 'No such file or directory',
  [STATUS_CODE.PERMISSION_DENIED]: 'Permission denied',
  [STATUS_CODE.FAILURE]: 'Failure',
  [STATUS_CODE.BAD_MESSAGE]: 'Bad message',
  [STATUS_CODE.NO_CONNECTION]: 'No connection',
  [STATUS_CODE.CONNECTION_LOST]: 'Connection lost',
  [STATUS_CODE.OP_UNSUPPORTED]: 'Operation unsupported',
};

const REQUEST = {
  INIT: 1,
  OPEN: 3,
  CLOSE: 4,
  READ: 5,
  WRITE: 6,
  LSTAT: 7,
  FSTAT: 8,
  SETSTAT: 9,
  FSETSTAT: 10,
  OPENDIR: 11,
  READDIR: 12,
  REMOVE: 13,
  MKDIR: 14,
  RMDIR: 15,
  REALPATH: 16,
  STAT: 17,
  RENAME: 18,
  READLINK: 19,
  SYMLINK: 20,
  EXTENDED: 200,
};

const RESPONSE = {
  VERSION: 2,
  STATUS: 101,
  HANDLE: 102,
  DATA: 103,
  NAME: 104,
  ATTRS: 105,
  EXTENDED: 201,
};

const OPEN_MODE = {
  READ: 0x00000001,
  WRITE: 0x00000002,
  APPEND: 0x00000004,
  CREAT: 0x00000008,
  TRUNC: 0x00000010,
  EXCL: 0x00000020,
};

const PKT_RW_OVERHEAD = 2 * 1024;
const MAX_REQID = 2 ** 32 - 1;
const CLIENT_VERSION_BUFFER = Buffer.from([0, 0, 0, 5 /* length */, REQUEST.INIT, 0, 0, 0, 3 /* version */]);
const SERVER_VERSION_BUFFER = Buffer.from([0, 0, 0, 5 /* length */, RESPONSE.VERSION, 0, 0, 0, 3 /* version */]);

const RE_OPENSSH = /^SSH-2.0-(?:OpenSSH|dropbear)/;
const OPENSSH_MAX_PKT_LEN = 256 * 1024;

const bufferParser = makeBufferParser();

const fakeStderr = {
  readable: false,
  writable: false,
  push: (data) => {},
  once: () => {},
  on: () => {},
  emit: () => {},
  end: () => {},
};

function noop() {}

// Emulates enough of `Channel` to be able to be used as a drop-in replacement
// in order to process incoming data with as little overhead as possible
class SFTP extends EventEmitter {
  constructor(client, chanInfo, cfg) {
    super();

    if (typeof cfg !== 'object' || !cfg) cfg = {};

    const remoteIdentRaw = client._protocol._remoteIdentRaw;

    this.server = !!cfg.server;
    this._debug = typeof cfg.debug === 'function' ? cfg.debug : undefined;
    this._isOpenSSH = remoteIdentRaw && RE_OPENSSH.test(remoteIdentRaw);

    this._version = -1;
    this._extensions = {};
    this._pktLenBytes = 0;
    this._pktLen = 0;
    this._pktPos = 0;
    this._pktType = 0;
    this._pktData = undefined;
    this._writeReqid = -1;
    this._requests = {};
    this._maxInPktLen = OPENSSH_MAX_PKT_LEN;
    this._maxOutPktLen = 34000;
    this._maxReadLen = (this._isOpenSSH ? OPENSSH_MAX_PKT_LEN : 34000) - PKT_RW_OVERHEAD;
    this._maxWriteLen = (this._isOpenSSH ? OPENSSH_MAX_PKT_LEN : 34000) - PKT_RW_OVERHEAD;

    this.maxOpenHandles = undefined;

    // Channel compatibility
    this._client = client;
    this._protocol = client._protocol;
    this._callbacks = [];
    this._hasX11 = false;
    this._exit = {
      code: undefined,
      signal: undefined,
      dump: undefined,
      desc: undefined,
    };
    this._waitWindow = false; // SSH-level backpressure
    this._chunkcb = undefined;
    this._buffer = [];
    this.type = chanInfo.type;
    this.subtype = undefined;
    this.incoming = chanInfo.incoming;
    this.outgoing = chanInfo.outgoing;
    this.stderr = fakeStderr;
    this.readable = true;
  }

  // This handles incoming data to parse
  push(data) {
    if (data === null) {
      cleanupRequests(this);
      if (!this.readable) return undefined;
      // No more incoming data from the remote side
      this.readable = false;
      this.emit('end');
      return undefined;
    }
    /*
        uint32             length
        byte               type
        byte[length - 1]   data payload
    */
    let p = 0;

    while (p < data.length) {
      if (this._pktLenBytes < 4) {
        let nb = Math.min(4 - this._pktLenBytes, data.length - p);
        this._pktLenBytes += nb;

        while (nb--) this._pktLen = (this._pktLen << 8) + data[p++];

        if (this._pktLenBytes < 4) return undefined;
        if (this._pktLen === 0) return doFatalSFTPError(this, 'Invalid packet length');
        if (this._pktLen > this._maxInPktLen) {
          const max = this._maxInPktLen;
          return doFatalSFTPError(this, `Packet length ${this._pktLen} exceeds max length of ${max}`);
        }
        if (p >= data.length) return undefined;
      }
      if (this._pktPos < this._pktLen) {
        const nb = Math.min(this._pktLen - this._pktPos, data.length - p);
        if (p !== 0 || nb !== data.length) {
          if (nb === this._pktLen) {
            this._pkt = new FastBuffer(data.buffer, data.byteOffset + p, nb);
          } else {
            if (!this._pkt) this._pkt = Buffer.allocUnsafe(this._pktLen);
            this._pkt.set(new Uint8Array(data.buffer, data.byteOffset + p, nb), this._pktPos);
          }
        } else if (nb === this._pktLen) {
          this._pkt = data;
        } else {
          if (!this._pkt) this._pkt = Buffer.allocUnsafe(this._pktLen);
          this._pkt.set(data, this._pktPos);
        }
        p += nb;
        this._pktPos += nb;
        if (this._pktPos < this._pktLen) return undefined;
      }

      const type = this._pkt[0];
      const payload = this._pkt;

      // Prepare for next packet
      this._pktLen = 0;
      this._pktLenBytes = 0;
      this._pkt = undefined;
      this._pktPos = 0;

      const handler = this.server ? SERVER_HANDLERS[type] : CLIENT_HANDLERS[type];
      if (!handler) return doFatalSFTPError(this, `Unknown packet type ${type}`);

      if (this._version === -1) {
        if (this.server) {
          if (type !== REQUEST.INIT) return doFatalSFTPError(this, `Expected INIT packet, got ${type}`);
        } else if (type !== RESPONSE.VERSION) {
          return doFatalSFTPError(this, `Expected VERSION packet, got ${type}`);
        }
      }

      if (handler(this, payload) === false) return undefined;
    }

    return undefined;
  }

  end() {
    this.destroy();
  }
  destroy() {
    if (this._protocol._closed) {
      this.outgoing.state = 'closed';
      return;
    }
    if (this.outgoing.state === 'open' || this.outgoing.state === 'eof') {
      this.outgoing.state = 'closing';
      this._protocol.channelClose(this.outgoing.id);
    }
  }
  _init() {
    this._init = noop;
    if (!this.server) sendOrBuffer(this, CLIENT_VERSION_BUFFER);
  }

  // ===========================================================================
  // Client-specific ===========================================================
  // ===========================================================================
  createReadStream(path, options) {
    if (this.server) throw new Error('Client-only method called in server mode');

    return new ReadStream(this, path, options);
  }
  createWriteStream(path, options) {
    if (this.server) throw new Error('Client-only method called in server mode');

    return new WriteStream(this, path, options);
  }
  open(path, flags_, attrs, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (typeof attrs === 'function') {
      cb = attrs;
      attrs = undefined;
    }

    const flags = typeof flags_ === 'number' ? flags_ : stringToFlags(flags_);
    if (flags === null) throw new Error(`Unknown flags string: ${flags_}`);

    let attrsFlags = 0;
    let attrsLen = 0;
    if (typeof attrs === 'string' || typeof attrs === 'number') attrs = { mode: attrs };
    if (typeof attrs === 'object' && attrs !== null) {
      attrs = attrsToBytes(attrs);
      attrsFlags = attrs.flags;
      attrsLen = attrs.nb;
    }

    /*
      uint32        id
      string        filename
      uint32        pflags
      ATTRS         attrs
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen + 4 + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.OPEN;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, (p += 4), pathLen);
    writeUInt32BE(buf, flags, (p += pathLen));
    writeUInt32BE(buf, attrsFlags, (p += 4));
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }
    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} OPEN`);
    }
  }
  close(handle, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    /*
      uint32     id
      string     handle
    */
    const handleLen = handle.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.CLOSE;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, handleLen, p);
    buf.set(handle, p + 4);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} CLOSE`);
    }
  }
  read(handle, buf, off, len, position, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');
    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');
    if (!Buffer.isBuffer(buf)) throw new Error('buffer is not a Buffer');
    checkBufferRange(buf, off, len, position);
    if (!len) {
      process.nextTick(cb, undefined, 0, buf, position);
      return;
    }

    read_(this, handle, buf, off, len, position, cb);
  }
  write(handle, buf, off, len, position, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');
    if (!Buffer.isBuffer(buf)) throw new Error('buffer is not a Buffer');
    checkBufferRange(buf, off, len, position);

    if (!len) {
      if (cb) {
        process.nextTick(cb, undefined, 0);
      }
      return;
    }

    const maxDataLen = this._maxWriteLen;
    const overflow = Math.max(len - maxDataLen, 0);
    const origPosition = position;
    const originalLength = len;

    if (overflow) len = maxDataLen;

    /*
      uint32     id
      string     handle
      uint64     offset
      string     data
    */
    const handleLen = handle.length;
    let p = 9;
    const out = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen + 8 + 4 + len);

    writeUInt32BE(out, out.length - 4, 0);
    out[4] = REQUEST.WRITE;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(out, reqid, 5);

    writeUInt32BE(out, handleLen, p);
    out.set(handle, (p += 4));
    p += handleLen;
    for (let i = 7; i >= 0; --i) {
      out[p + i] = position & 0xff;
      position /= 256;
    }
    writeUInt32BE(out, len, (p += 8));
    bufferCopy(buf, out, off, off + len, p + 4);

    this._requests[reqid] = {
      cb: (err) => {
        if (err) {
          if (typeof cb === 'function') cb(err);
        } else if (overflow) {
          this.write(handle, buf, off + len, overflow, origPosition + len, (failure) => {
            if (typeof cb === 'function') cb(failure, failure ? undefined : originalLength);
          });
        } else if (typeof cb === 'function') {
          cb(undefined, originalLength);
        }
      },
    };

    const isSent = sendOrBuffer(this, out);
    if (this._debug) {
      const how = isSent ? 'Sent' : 'Buffered';
      this._debug(`SFTP: Outbound: ${how} WRITE (id:${reqid})`);
    }
  }
  fastGet(remotePath, localPath, opts, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    fastXfer(this, fs, remotePath, localPath, opts, cb);
  }
  fastPut(localPath, remotePath, opts, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    fastXfer(fs, this, localPath, remotePath, opts, cb);
  }
  readFile(path, options, callback) {
    if (this.server) throw new Error('Client-only method called in server mode');
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'string') options = { encoding: options };
    else if (options === undefined || options === null) options = {};
    if (typeof callback !== 'function' || typeof options !== 'object')
      throw new TypeError('Invalid readFile arguments');
    const { encoding, flag = 'r', maxBytes = 64 * 1024 * 1024 } = options;
    if (encoding && !Buffer.isEncoding(encoding)) throw new TypeError('Invalid readFile encoding');
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > 1024 * 1024 * 1024)
      throw new RangeError('readFile maxBytes must be an integer from 0 to 1 GiB');

    // Read in bounded chunks rather than trusting a peer-provided ATTRS size.
    // The shared stream owner waits for CLOSE acknowledgement before completion.
    const stream = this.createReadStream(path, { flags: flag, autoClose: true });
    const chunks = [];
    let length = 0,
      failure;
    stream.on('data', (chunk) => {
      if (failure) return;
      if (chunk.length > maxBytes - length) {
        failure = new Error(`SFTP readFile exceeds its ${maxBytes} byte limit`);
        failure.code = 'EFBIG';
        stream.destroy(failure);
        return;
      }
      length += chunk.length;
      chunks.push(chunk);
    });
    stream.once('error', (error) => {
      failure = error;
    });
    stream.once('close', () => {
      if (failure) {
        callback(failure);
        return;
      }
      const data = Buffer.concat(chunks, length);
      callback(undefined, encoding ? data.toString(encoding) : data);
    });
  }
  writeFile(path, data, options, callback) {
    if (this.server) throw new Error('Client-only method called in server mode');
    if (typeof options === 'function') {
      callback = options;
      options = {};
    } else if (typeof options === 'string') options = { encoding: options };
    else if (options === undefined || options === null) options = {};
    if (typeof callback !== 'function' || typeof options !== 'object')
      throw new TypeError('Invalid writeFile arguments');
    const { encoding = 'utf8', flag = 'w', mode = 0o666 } = options;
    if (!Buffer.isEncoding(encoding)) throw new TypeError('Invalid writeFile encoding');
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data, encoding);
    const stream = this.createWriteStream(path, { flags: flag, mode, autoClose: true });
    let failure;
    stream.once('error', (error) => {
      failure = error;
    });
    stream.once('close', () => callback(failure));
    stream.end(buffer);
  }
  appendFile(path, data, options, callback_) {
    if (this.server) throw new Error('Client-only method called in server mode');

    let callback;
    if (typeof callback_ === 'function') {
      callback = callback_;
    } else if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }

    if (typeof options === 'string') options = { encoding: options, mode: 0o666, flag: 'a' };
    else if (!options) options = { encoding: 'utf8', mode: 0o666, flag: 'a' };
    else if (typeof options !== 'object') throw new TypeError('Bad arguments');

    if (!options.flag) options = Object.assign({ flag: 'a' }, options);
    this.writeFile(path, data, options, callback);
  }
  exists(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    this.stat(path, (err) => {
      if (cb) {
        cb(err ? false : true);
      }
    });
  }
  unlink(filename, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     filename
    */
    const fnameLen = Buffer.byteLength(filename);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + fnameLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.REMOVE;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, fnameLen, p);
    buf.utf8Write(filename, p + 4, fnameLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} REMOVE`);
    }
  }
  rename(oldPath, newPath, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     oldpath
      string     newpath
    */
    const oldLen = Buffer.byteLength(oldPath);
    const newLen = Buffer.byteLength(newPath);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + oldLen + 4 + newLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.RENAME;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, oldLen, p);
    buf.utf8Write(oldPath, (p += 4), oldLen);
    writeUInt32BE(buf, newLen, (p += oldLen));
    buf.utf8Write(newPath, p + 4, newLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} RENAME`);
    }
  }
  mkdir(path, attrs, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    let flags = 0;
    let attrsLen = 0;

    if (typeof attrs === 'function') {
      cb = attrs;
      attrs = undefined;
    }
    if (typeof attrs === 'object' && attrs !== null) {
      attrs = attrsToBytes(attrs);
      flags = attrs.flags;
      attrsLen = attrs.nb;
    }

    /*
      uint32     id
      string     path
      ATTRS      attrs
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.MKDIR;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, (p += 4), pathLen);
    writeUInt32BE(buf, flags, (p += pathLen));
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} MKDIR`);
    }
  }
  rmdir(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.RMDIR;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} RMDIR`);
    }
  }
  readdir(where, opts, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (typeof opts === 'function') {
      cb = opts;
      opts = {};
    }
    if (typeof opts !== 'object' || opts === null) opts = {};

    const doFilter = opts && opts.full ? false : true;

    if (!Buffer.isBuffer(where) && typeof where !== 'string') throw new Error('missing directory handle or path');

    if (typeof where === 'string') {
      const entries = [];
      let e = 0;

      const reread = (err, handle) => {
        if (err) return cb(err);

        this.readdir(handle, opts, (readError, list) => {
          const eof = readError && readError.code === STATUS_CODE.EOF;

          if (readError && !eof) return this.close(handle, () => cb(readError));

          if (eof) {
            return this.close(handle, (closeError) => {
              if (closeError) return cb(closeError);
              cb(undefined, entries);

              return undefined;
            });
          }

          for (let i = 0; i < list.length; ++i, ++e) entries[e] = list[i];

          reread(undefined, handle);

          return undefined;
        });

        return undefined;
      };
      return this.opendir(where, reread);
    }

    /*
      uint32     id
      string     handle
    */
    const handleLen = where.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.READDIR;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, handleLen, p);
    buf.set(where, p + 4);

    this._requests[reqid] = {
      cb: doFilter
        ? (err, list) => {
            if (typeof cb !== 'function') return undefined;
            if (err) return cb(err);

            for (let i = list.length - 1; i >= 0; --i) {
              if (list[i].filename === '.' || list[i].filename === '..') list.splice(i, 1);
            }

            cb(undefined, list);

            return undefined;
          }
        : cb,
    };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} READDIR`);
    }

    return undefined;
  }
  fstat(handle, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    /*
      uint32     id
      string     handle
    */
    const handleLen = handle.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.FSTAT;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, handleLen, p);
    buf.set(handle, p + 4);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} FSTAT`);
    }
  }
  stat(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.STAT;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} STAT`);
    }
  }
  lstat(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.LSTAT;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} LSTAT`);
    }
  }
  opendir(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.OPENDIR;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} OPENDIR`);
    }
  }
  setstat(path, attrs, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    let flags = 0;
    let attrsLen = 0;

    if (typeof attrs === 'object' && attrs !== null) {
      attrs = attrsToBytes(attrs);
      flags = attrs.flags;
      attrsLen = attrs.nb;
    } else if (typeof attrs === 'function') {
      cb = attrs;
    }

    /*
      uint32     id
      string     path
      ATTRS      attrs
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.SETSTAT;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, (p += 4), pathLen);
    writeUInt32BE(buf, flags, (p += pathLen));
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} SETSTAT`);
    }
  }
  fsetstat(handle, attrs, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    let flags = 0;
    let attrsLen = 0;

    if (typeof attrs === 'object' && attrs !== null) {
      attrs = attrsToBytes(attrs);
      flags = attrs.flags;
      attrsLen = attrs.nb;
    } else if (typeof attrs === 'function') {
      cb = attrs;
    }

    /*
      uint32     id
      string     handle
      ATTRS      attrs
    */
    const handleLen = handle.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.FSETSTAT;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, handleLen, p);
    buf.set(handle, (p += 4));
    writeUInt32BE(buf, flags, (p += handleLen));
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} FSETSTAT`);
    }
  }
  futimes(handle, atime, mtime, cb) {
    return this.fsetstat(
      handle,
      {
        atime: toUnixTimestamp(atime),
        mtime: toUnixTimestamp(mtime),
      },
      cb
    );
  }
  utimes(path, atime, mtime, cb) {
    return this.setstat(
      path,
      {
        atime: toUnixTimestamp(atime),
        mtime: toUnixTimestamp(mtime),
      },
      cb
    );
  }
  fchown(handle, uid, gid, cb) {
    return this.fsetstat(
      handle,
      {
        uid,
        gid,
      },
      cb
    );
  }
  chown(path, uid, gid, cb) {
    return this.setstat(
      path,
      {
        uid,
        gid,
      },
      cb
    );
  }
  fchmod(handle, mode, cb) {
    return this.fsetstat(
      handle,
      {
        mode,
      },
      cb
    );
  }
  chmod(path, mode, cb) {
    return this.setstat(
      path,
      {
        mode,
      },
      cb
    );
  }
  readlink(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.READLINK;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = {
      cb: (err, names) => {
        if (typeof cb !== 'function') return undefined;
        if (err) return cb(err);
        if (!names || !names.length) return cb(new Error('Response missing link info'));
        cb(undefined, names[0].filename);

        return undefined;
      },
    };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} READLINK`);
    }
  }
  symlink(targetPath, linkPath, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     linkpath
      string     targetpath
    */
    const linkLen = Buffer.byteLength(linkPath);
    const targetLen = Buffer.byteLength(targetPath);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + linkLen + 4 + targetLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.SYMLINK;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    if (this._isOpenSSH) {
      // OpenSSH has linkpath and targetpath positions switched
      writeUInt32BE(buf, targetLen, p);
      buf.utf8Write(targetPath, (p += 4), targetLen);
      writeUInt32BE(buf, linkLen, (p += targetLen));
      buf.utf8Write(linkPath, p + 4, linkLen);
    } else {
      writeUInt32BE(buf, linkLen, p);
      buf.utf8Write(linkPath, (p += 4), linkLen);
      writeUInt32BE(buf, targetLen, (p += linkLen));
      buf.utf8Write(targetPath, p + 4, targetLen);
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} SYMLINK`);
    }
  }
  realpath(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    /*
      uint32     id
      string     path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.REALPATH;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, pathLen, p);
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = {
      cb: (err, names) => {
        if (typeof cb !== 'function') return undefined;
        if (err) return cb(err);
        if (!names || !names.length) return cb(new Error('Response missing path info'));
        cb(undefined, names[0].filename);

        return undefined;
      },
    };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} REALPATH`);
    }
  }
  // extended requests
  ext_openssh_rename(oldPath, newPath, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['posix-rename@openssh.com'];
    if (!ext || ext !== '1') throw new Error('Server does not support this extended request');

    /*
      uint32    id
      string    "posix-rename@openssh.com"
      string    oldpath
      string    newpath
    */
    const oldLen = Buffer.byteLength(oldPath);
    const newLen = Buffer.byteLength(newPath);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 24 + 4 + oldLen + 4 + newLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 24, p);
    buf.utf8Write('posix-rename@openssh.com', (p += 4), 24);
    writeUInt32BE(buf, oldLen, (p += 24));
    buf.utf8Write(oldPath, (p += 4), oldLen);
    writeUInt32BE(buf, newLen, (p += oldLen));
    buf.utf8Write(newPath, p + 4, newLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const which = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${which} posix-rename@openssh.com`);
    }
  }
  ext_openssh_statvfs(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['statvfs@openssh.com'];
    if (!ext || ext !== '2') throw new Error('Server does not support this extended request');

    /*
      uint32    id
      string    "statvfs@openssh.com"
      string    path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 19 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 19, p);
    buf.utf8Write('statvfs@openssh.com', (p += 4), 19);
    writeUInt32BE(buf, pathLen, (p += 19));
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = { extended: 'statvfs@openssh.com', cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const which = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${which} statvfs@openssh.com`);
    }
  }
  ext_openssh_fstatvfs(handle, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['fstatvfs@openssh.com'];
    if (!ext || ext !== '2') throw new Error('Server does not support this extended request');
    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    /*
      uint32    id
      string    "fstatvfs@openssh.com"
      string    handle
    */
    const handleLen = handle.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 20 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 20, p);
    buf.utf8Write('fstatvfs@openssh.com', (p += 4), 20);
    writeUInt32BE(buf, handleLen, (p += 20));
    buf.set(handle, p + 4);

    this._requests[reqid] = { extended: 'fstatvfs@openssh.com', cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const which = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${which} fstatvfs@openssh.com`);
    }
  }
  ext_openssh_hardlink(oldPath, newPath, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['hardlink@openssh.com'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    /*
      uint32    id
      string    "hardlink@openssh.com"
      string    oldpath
      string    newpath
    */
    const oldLen = Buffer.byteLength(oldPath);
    const newLen = Buffer.byteLength(newPath);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 20 + 4 + oldLen + 4 + newLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 20, p);
    buf.utf8Write('hardlink@openssh.com', (p += 4), 20);
    writeUInt32BE(buf, oldLen, (p += 20));
    buf.utf8Write(oldPath, (p += 4), oldLen);
    writeUInt32BE(buf, newLen, (p += oldLen));
    buf.utf8Write(newPath, p + 4, newLen);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const which = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${which} hardlink@openssh.com`);
    }
  }
  ext_openssh_fsync(handle, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['fsync@openssh.com'];
    if (ext !== '1') throw new Error('Server does not support this extended request');
    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    /*
      uint32    id
      string    "fsync@openssh.com"
      string    handle
    */
    const handleLen = handle.length;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 17 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 17, p);
    buf.utf8Write('fsync@openssh.com', (p += 4), 17);
    writeUInt32BE(buf, handleLen, (p += 17));
    buf.set(handle, p + 4);

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} fsync@openssh.com`);
    }
  }
  ext_openssh_lsetstat(path, attrs, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['lsetstat@openssh.com'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    let flags = 0;
    let attrsLen = 0;

    if (typeof attrs === 'object' && attrs !== null) {
      attrs = attrsToBytes(attrs);
      flags = attrs.flags;
      attrsLen = attrs.nb;
    } else if (typeof attrs === 'function') {
      cb = attrs;
    }

    /*
      uint32    id
      string    "lsetstat@openssh.com"
      string    path
      ATTRS     attrs
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 20 + 4 + pathLen + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 20, p);
    buf.utf8Write('lsetstat@openssh.com', (p += 4), 20);

    writeUInt32BE(buf, pathLen, (p += 20));
    buf.utf8Write(path, (p += 4), pathLen);

    writeUInt32BE(buf, flags, (p += pathLen));
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const status = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${status} lsetstat@openssh.com`);
    }
  }
  ext_openssh_expandPath(path, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['expand-path@openssh.com'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    /*
      uint32    id
      string    "expand-path@openssh.com"
      string    path
    */
    const pathLen = Buffer.byteLength(path);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 23 + 4 + pathLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = REQUEST.EXTENDED;
    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, 23, p);
    buf.utf8Write('expand-path@openssh.com', (p += 4), 23);

    writeUInt32BE(buf, pathLen, (p += 20));
    buf.utf8Write(path, p + 4, pathLen);

    this._requests[reqid] = {
      cb: (err, names) => {
        if (typeof cb !== 'function') return undefined;
        if (err) return cb(err);
        if (!names || !names.length) return cb(new Error('Response missing expanded path'));
        cb(undefined, names[0].filename);

        return undefined;
      },
    };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const status = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${status} expand-path@openssh.com`);
    }
  }
  ext_copy_data(srcHandle, srcOffset, len, dstHandle, dstOffset, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['copy-data'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    if (!Buffer.isBuffer(srcHandle)) throw new Error('Source handle is not a Buffer');

    if (!Buffer.isBuffer(dstHandle)) throw new Error('Destination handle is not a Buffer');

    /*
      uint32    id
      string    "copy-data"
      string    read-from-handle
      uint64    read-from-offset
      uint64    read-data-length
      string    write-to-handle
      uint64    write-to-offset
    */
    let p = 0;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 9 + 4 + srcHandle.length + 8 + 8 + 4 + dstHandle.length + 8);

    writeUInt32BE(buf, buf.length - 4, p);
    p += 4;

    buf[p] = REQUEST.EXTENDED;
    ++p;

    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, p);
    p += 4;

    writeUInt32BE(buf, 9, p);
    p += 4;
    buf.utf8Write('copy-data', p, 9);
    p += 9;

    writeUInt32BE(buf, srcHandle.length, p);
    p += 4;
    buf.set(srcHandle, p);
    p += srcHandle.length;

    for (let i = 7; i >= 0; --i) {
      buf[p + i] = srcOffset & 0xff;
      srcOffset /= 256;
    }
    p += 8;

    for (let i = 7; i >= 0; --i) {
      buf[p + i] = len & 0xff;
      len /= 256;
    }
    p += 8;

    writeUInt32BE(buf, dstHandle.length, p);
    p += 4;
    buf.set(dstHandle, p);
    p += dstHandle.length;

    for (let i = 7; i >= 0; --i) {
      buf[p + i] = dstOffset & 0xff;
      dstOffset /= 256;
    }

    this._requests[reqid] = { cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const status = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${status} copy-data`);
    }
  }
  ext_home_dir(username, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['home-directory'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    if (typeof username !== 'string') throw new TypeError('username is not a string');

    /*
      uint32    id
      string    "home-directory"
      string    username
    */
    let p = 0;
    const usernameLen = Buffer.byteLength(username);
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 14 + 4 + usernameLen);

    writeUInt32BE(buf, buf.length - 4, p);
    p += 4;

    buf[p] = REQUEST.EXTENDED;
    ++p;

    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, p);
    p += 4;

    writeUInt32BE(buf, 14, p);
    p += 4;
    buf.utf8Write('home-directory', p, 14);
    p += 14;

    writeUInt32BE(buf, usernameLen, p);
    p += 4;
    buf.utf8Write(username, p, usernameLen);

    this._requests[reqid] = {
      cb: (err, names) => {
        if (typeof cb !== 'function') return undefined;
        if (err) return cb(err);
        if (!names || !names.length) return cb(new Error('Response missing home directory'));
        cb(undefined, names[0].filename);

        return undefined;
      },
    };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const status = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${status} home-directory`);
    }
  }
  ext_users_groups(uids, gids, cb) {
    if (this.server) throw new Error('Client-only method called in server mode');

    const ext = this._extensions['users-groups-by-id@openssh.com'];
    if (ext !== '1') throw new Error('Server does not support this extended request');

    if (!Array.isArray(uids)) throw new TypeError('uids is not an array');
    for (const val of uids) {
      if (!Number.isInteger(val) || val < 0 || val > 2 ** 32 - 1)
        throw new Error('uid values must all be 32-bit unsigned integers');
    }
    if (!Array.isArray(gids)) throw new TypeError('gids is not an array');
    for (const val of gids) {
      if (!Number.isInteger(val) || val < 0 || val > 2 ** 32 - 1)
        throw new Error('gid values must all be 32-bit unsigned integers');
    }

    /*
      uint32    id
      string    "users-groups-by-id@openssh.com"
      string    uids
        uint32    uid1
        ...
      string    gids
        uint32    gid1
        ...
    */
    let p = 0;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 30 + 4 + 4 * uids.length + 4 + 4 * gids.length);

    writeUInt32BE(buf, buf.length - 4, p);
    p += 4;

    buf[p] = REQUEST.EXTENDED;
    ++p;

    const reqid = (this._writeReqid = (this._writeReqid + 1) & MAX_REQID);
    writeUInt32BE(buf, reqid, p);
    p += 4;

    writeUInt32BE(buf, 30, p);
    p += 4;
    buf.utf8Write('users-groups-by-id@openssh.com', p, 30);
    p += 30;

    writeUInt32BE(buf, 4 * uids.length, p);
    p += 4;
    for (const val of uids) {
      writeUInt32BE(buf, val, p);
      p += 4;
    }

    writeUInt32BE(buf, 4 * gids.length, p);
    p += 4;
    for (const val of gids) {
      writeUInt32BE(buf, val, p);
      p += 4;
    }

    this._requests[reqid] = { extended: 'users-groups-by-id@openssh.com', cb };

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      const status = isBuffered ? 'Buffered' : 'Sending';
      this._debug(`SFTP: Outbound: ${status} users-groups-by-id@openssh.com`);
    }
  }
  // ===========================================================================
  // Server-specific ===========================================================
  // ===========================================================================
  handle(reqid, handle) {
    if (!this.server) throw new Error('Server-only method called in client mode');

    if (!Buffer.isBuffer(handle)) throw new Error('handle is not a Buffer');

    const handleLen = handle.length;

    if (handleLen > 256) throw new Error('handle too large (> 256 bytes)');

    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = RESPONSE.HANDLE;
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, handleLen, p);
    if (handleLen) buf.set(handle, p + 4);

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} HANDLE`);
    }
  }
  status(reqid, code, message) {
    if (!this.server) throw new Error('Server-only method called in client mode');

    if (!VALID_STATUS_CODES.has(code)) throw new Error(`Bad status code: ${code}`);

    if (!message) {
      message = '';
    }

    const msgLen = Buffer.byteLength(message);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 4 + msgLen + 4);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = RESPONSE.STATUS;
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, code, p);

    writeUInt32BE(buf, msgLen, (p += 4));
    p += 4;
    if (msgLen) {
      buf.utf8Write(message, p, msgLen);
      p += msgLen;
    }

    writeUInt32BE(buf, 0, p); // Empty language tag

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} STATUS`);
    }
  }
  data(reqid, data, encoding) {
    if (!this.server) throw new Error('Server-only method called in client mode');

    const isBuffer = Buffer.isBuffer(data);

    if (!isBuffer && typeof data !== 'string') throw new Error('data is not a Buffer or string');

    let isUTF8;
    if (!isBuffer && !encoding) {
      encoding = undefined;
      isUTF8 = true;
    }

    const dataLen = isBuffer ? data.length : Buffer.byteLength(data, encoding);
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + dataLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = RESPONSE.DATA;
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, dataLen, p);
    if (dataLen) {
      if (isBuffer) buf.set(data, p + 4);
      else if (isUTF8) buf.utf8Write(data, p + 4, dataLen);
      else buf.write(data, p + 4, dataLen, encoding);
    }

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} DATA`);
    }
  }
  name(reqid, names) {
    if (!this.server) throw new Error('Server-only method called in client mode');

    if (!Array.isArray(names)) {
      if (typeof names !== 'object' || names === null) throw new Error('names is not an object or array');
      names = [names];
    }

    const count = names.length;
    let namesLen = 0;
    let nameAttrs;
    const attrs = [];

    for (let i = 0; i < count; ++i) {
      const name = names[i];
      const filename = !name || !name.filename || typeof name.filename !== 'string' ? '' : name.filename;
      namesLen += 4 + Buffer.byteLength(filename);
      const longname = !name || !name.longname || typeof name.longname !== 'string' ? '' : name.longname;
      namesLen += 4 + Buffer.byteLength(longname);

      if (typeof name.attrs === 'object' && name.attrs !== null) {
        nameAttrs = attrsToBytes(name.attrs);
        namesLen += 4 + nameAttrs.nb;

        if (nameAttrs.nb) {
          let bytes;

          if (nameAttrs.nb === ATTRS_BUF.length) {
            bytes = new Uint8Array(ATTRS_BUF);
          } else {
            bytes = new Uint8Array(nameAttrs.nb);
            bufferCopy(ATTRS_BUF, bytes, 0, nameAttrs.nb, 0);
          }

          nameAttrs.bytes = bytes;
        }

        attrs.push(nameAttrs);
      } else {
        namesLen += 4;
        attrs.push(null);
      }
    }

    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + namesLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = RESPONSE.NAME;
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, count, p);

    p += 4;

    for (let i = 0; i < count; ++i) {
      const name = names[i];

      {
        const filename = !name || !name.filename || typeof name.filename !== 'string' ? '' : name.filename;
        const len = Buffer.byteLength(filename);
        writeUInt32BE(buf, len, p);
        p += 4;
        if (len) {
          buf.utf8Write(filename, p, len);
          p += len;
        }
      }

      {
        const longname = !name || !name.longname || typeof name.longname !== 'string' ? '' : name.longname;
        const len = Buffer.byteLength(longname);
        writeUInt32BE(buf, len, p);
        p += 4;
        if (len) {
          buf.utf8Write(longname, p, len);
          p += len;
        }
      }

      const attr = attrs[i];
      if (attr) {
        writeUInt32BE(buf, attr.flags, p);
        p += 4;
        if (attr.flags && attr.bytes) {
          buf.set(attr.bytes, p);
          p += attr.nb;
        }
      } else {
        writeUInt32BE(buf, 0, p);
        p += 4;
      }
    }

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} NAME`);
    }
  }
  attrs(reqid, attrs) {
    if (!this.server) throw new Error('Server-only method called in client mode');

    if (typeof attrs !== 'object' || attrs === null) throw new Error('attrs is not an object');

    attrs = attrsToBytes(attrs);
    const flags = attrs.flags;
    const attrsLen = attrs.nb;
    let p = 9;
    const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + attrsLen);

    writeUInt32BE(buf, buf.length - 4, 0);
    buf[4] = RESPONSE.ATTRS;
    writeUInt32BE(buf, reqid, 5);

    writeUInt32BE(buf, flags, p);
    if (attrsLen) {
      p += 4;

      if (attrsLen === ATTRS_BUF.length) buf.set(ATTRS_BUF, p);
      else bufferCopy(ATTRS_BUF, buf, 0, attrsLen, p);
    }

    const isBuffered = sendOrBuffer(this, buf);
    if (this._debug) {
      this._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} ATTRS`);
    }
  }
}

function read_(self, handle, buf, off, len, position, cb, req_) {
  const maxDataLen = self._maxReadLen;
  const overflow = Math.max(len - maxDataLen, 0);

  if (overflow) len = maxDataLen;

  /*
    uint32     id
    string     handle
    uint64     offset
    uint32     len
  */
  const handleLen = handle.length;
  let p = 9;
  let pos = position;
  const out = Buffer.allocUnsafe(4 + 1 + 4 + 4 + handleLen + 8 + 4);

  writeUInt32BE(out, out.length - 4, 0);
  out[4] = REQUEST.READ;
  const reqid = (self._writeReqid = (self._writeReqid + 1) & MAX_REQID);
  writeUInt32BE(out, reqid, 5);

  writeUInt32BE(out, handleLen, p);
  out.set(handle, (p += 4));
  p += handleLen;
  for (let i = 7; i >= 0; --i) {
    out[p + i] = pos & 0xff;
    pos /= 256;
  }
  writeUInt32BE(out, len, p + 8);

  if (typeof cb !== 'function') cb = noop;

  const req = req_ || {
    nb: 0,
    position,
    off,
    origOff: off,
    len: undefined,
    overflow: undefined,
    cb: (err, data, nb) => {
      const requestLength = req.len;
      const requestOverflow = req.overflow;

      if (err) {
        if (cb._wantEOFError || err.code !== STATUS_CODE.EOF) return cb(err);
      } else if (nb > requestLength) {
        return cb(new Error('Received more data than requested'));
      } else if (nb === requestLength && requestOverflow) {
        req.nb += nb;
        req.position += nb;
        req.off += nb;
        read_(self, handle, buf, req.off, requestOverflow, req.position, cb, req);
        return undefined;
      }

      nb = nb || 0;
      if (req.origOff === 0 && buf.length === req.nb) data = buf;
      else data = bufferSlice(buf, req.origOff, req.origOff + req.nb + nb);
      cb(undefined, req.nb + nb, data, req.position);

      return undefined;
    },
    buffer: undefined,
  };

  req.len = len;
  req.overflow = overflow;

  // TODO: avoid creating multiple buffer slices when we need to re-call read_()
  // because of overflow
  req.buffer = bufferSlice(buf, off, off + len);

  self._requests[reqid] = req;

  const isBuffered = sendOrBuffer(self, out);
  if (self._debug) {
    self._debug(`SFTP: Outbound: ${isBuffered ? 'Buffered' : 'Sending'} READ`);
  }
}

function fastXfer(src, dst, srcPath, dstPath, options, callback) {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }
  options ??= {};
  if (typeof callback !== 'function' || typeof options !== 'object') throw new TypeError('Invalid transfer arguments');
  const { concurrency = 64, chunkSize = 32768, step, fileSize } = options;
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 256)
    throw new RangeError('Transfer concurrency must be an integer from 1 to 256');
  if (
    !Number.isInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > 1024 * 1024 ||
    chunkSize * concurrency > 64 * 1024 * 1024
  )
    throw new RangeError('Transfer chunkSize must be 1..1 MiB and total buffering must not exceed 64 MiB');
  if (fileSize !== undefined && (!Number.isSafeInteger(fileSize) || fileSize < 0))
    throw new RangeError('Invalid transfer fileSize');
  if (step !== undefined && typeof step !== 'function') throw new TypeError('Invalid transfer progress callback');
  const mode = options.mode === undefined ? undefined : modeNum(options.mode);
  let localIO = Promise.resolve();
  const call = (target, method, args) => {
    const invoke = () =>
      new Promise((resolve, reject) => {
        target[method](...args, (error, ...values) => (error ? reject(error) : resolve(values)));
      });
    if (target !== fs || (method !== 'read' && method !== 'write')) return invoke();
    // Some supported runtimes implement positioned I/O through a shared seek.
    // Own the local handle's cursor while independent SSH requests stay concurrent.
    const operation = localIO.then(invoke);
    localIO = operation.then(
      () => {},
      () => {}
    );
    return operation;
  };
  async function transfer() {
    let sourceHandle, destinationHandle, failure;
    const errors = [];
    try {
      [sourceHandle] = await call(src, 'open', [srcPath, 'r']);
      const size = fileSize ?? (await call(src, 'fstat', [sourceHandle]))[0].size;
      if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('Invalid transfer source size');
      [destinationHandle] = await call(dst, 'open', [dstPath, 'w']);
      // The opened handle is authoritative. A path fallback can address a
      // different file and cannot substitute for a refused handle operation.
      if (mode !== undefined) await call(dst, 'fchmod', [destinationHandle, mode]);
      let next = 0,
        total = 0;
      const workers = Math.min(concurrency, Math.ceil(size / chunkSize));
      await Promise.all(
        Array.from({ length: workers }, async () => {
          try {
            const buffer = Buffer.allocUnsafe(Math.min(chunkSize, size));
            while (!failure && next < size) {
              const position = next,
                length = Math.min(chunkSize, size - position);
              next += length;
              let received = 0;
              while (received < length) {
                const [count] = await call(src, 'read', [
                  sourceHandle,
                  buffer,
                  received,
                  length - received,
                  position + received,
                ]);
                if (!Number.isInteger(count) || count < 1 || count > length - received)
                  throw new Error('Transfer source returned an invalid or premature EOF');
                received += count;
              }
              let written = 0;
              while (written < received) {
                const [count] = await call(dst, 'write', [
                  destinationHandle,
                  buffer,
                  written,
                  received - written,
                  position + written,
                ]);
                if (!Number.isInteger(count) || count < 1 || count > received - written)
                  throw new Error('Transfer destination reported invalid progress');
                written += count;
              }
              total += written;
              step?.(total, written, size);
            }
          } catch (error) {
            failure ??= error;
            errors.push(error);
          }
        })
      );
    } catch (error) {
      errors.push(error);
    }

    // Drain every already submitted worker before closing each owned handle.
    // A missing close acknowledgement remains a failure, including empty files.
    await Promise.all(
      [
        [dst, destinationHandle],
        [src, sourceHandle],
      ].map(async ([target, handle]) => {
        if (handle === undefined) return;
        try {
          if (target !== fs && target.outgoing.state !== 'open') {
            const error = new Error('SFTP transport closed before handle cleanup could be acknowledged');
            error.code = 'ERR_STREAM_PREMATURE_CLOSE';
            throw error;
          }
          await call(target, 'close', [handle]);
        } catch (error) {
          errors.push(error);
        }
      })
    );
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, 'SFTP transfer and handle cleanup failed');
  }
  void transfer().then(
    () => callback(),
    (error) => callback(error)
  );
}

class Stats {
  constructor(initial) {
    this.mode = initial && initial.mode;
    this.uid = initial && initial.uid;
    this.gid = initial && initial.gid;
    this.size = initial && initial.size;
    this.atime = initial && initial.atime;
    this.mtime = initial && initial.mtime;
    this.extended = initial && initial.extended;
  }
  isDirectory() {
    return (this.mode & constants.S_IFMT) === constants.S_IFDIR;
  }
  isFile() {
    return (this.mode & constants.S_IFMT) === constants.S_IFREG;
  }
  isBlockDevice() {
    return (this.mode & constants.S_IFMT) === constants.S_IFBLK;
  }
  isCharacterDevice() {
    return (this.mode & constants.S_IFMT) === constants.S_IFCHR;
  }
  isSymbolicLink() {
    return (this.mode & constants.S_IFMT) === constants.S_IFLNK;
  }
  isFIFO() {
    return (this.mode & constants.S_IFMT) === constants.S_IFIFO;
  }
  isSocket() {
    return (this.mode & constants.S_IFMT) === constants.S_IFSOCK;
  }
}

function attrsToBytes(attrs) {
  let flags = 0;
  let nb = 0;

  if (typeof attrs === 'object' && attrs !== null) {
    if (typeof attrs.size === 'number') {
      flags |= ATTR.SIZE;
      const val = attrs.size;
      // Big Endian
      ATTRS_BUF[nb++] = val / 72057594037927940; // 2**56
      ATTRS_BUF[nb++] = val / 281474976710656; // 2**48
      ATTRS_BUF[nb++] = val / 1099511627776; // 2**40
      ATTRS_BUF[nb++] = val / 4294967296; // 2**32
      ATTRS_BUF[nb++] = val / 16777216; // 2**24
      ATTRS_BUF[nb++] = val / 65536; // 2**16
      ATTRS_BUF[nb++] = val / 256; // 2**8
      ATTRS_BUF[nb++] = val;
    }
    if (typeof attrs.uid === 'number' && typeof attrs.gid === 'number') {
      flags |= ATTR.UIDGID;
      const uid = attrs.uid;
      const gid = attrs.gid;
      // Big Endian
      ATTRS_BUF[nb++] = uid >>> 24;
      ATTRS_BUF[nb++] = uid >>> 16;
      ATTRS_BUF[nb++] = uid >>> 8;
      ATTRS_BUF[nb++] = uid;
      ATTRS_BUF[nb++] = gid >>> 24;
      ATTRS_BUF[nb++] = gid >>> 16;
      ATTRS_BUF[nb++] = gid >>> 8;
      ATTRS_BUF[nb++] = gid;
    }
    if (typeof attrs.mode === 'number' || typeof attrs.mode === 'string') {
      const mode = modeNum(attrs.mode);
      flags |= ATTR.PERMISSIONS;
      // Big Endian
      ATTRS_BUF[nb++] = mode >>> 24;
      ATTRS_BUF[nb++] = mode >>> 16;
      ATTRS_BUF[nb++] = mode >>> 8;
      ATTRS_BUF[nb++] = mode;
    }
    if (
      (typeof attrs.atime === 'number' || isDate(attrs.atime)) &&
      (typeof attrs.mtime === 'number' || isDate(attrs.mtime))
    ) {
      const atime = toUnixTimestamp(attrs.atime);
      const mtime = toUnixTimestamp(attrs.mtime);

      flags |= ATTR.ACMODTIME;
      // Big Endian
      ATTRS_BUF[nb++] = atime >>> 24;
      ATTRS_BUF[nb++] = atime >>> 16;
      ATTRS_BUF[nb++] = atime >>> 8;
      ATTRS_BUF[nb++] = atime;
      ATTRS_BUF[nb++] = mtime >>> 24;
      ATTRS_BUF[nb++] = mtime >>> 16;
      ATTRS_BUF[nb++] = mtime >>> 8;
      ATTRS_BUF[nb++] = mtime;
    }
    // TODO: extended attributes
  }

  return { flags, nb };
}

function toUnixTimestamp(time) {
  if (typeof time === 'number' && time === time)
    // Valid, non-NaN number
    return time;
  if (isDate(time)) return parseInt(time.getTime() / 1000, 10);
  throw new Error(`Cannot parse time: ${time}`);
}

function modeNum(mode) {
  if (typeof mode === 'string' && /^[0-7]{1,6}$/.test(mode)) mode = Number.parseInt(mode, 8);
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o177777) throw new RangeError('Invalid POSIX file mode');
  return mode;
}

const stringFlagMap = {
  r: OPEN_MODE.READ,
  'r+': OPEN_MODE.READ | OPEN_MODE.WRITE,
  w: OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.WRITE,
  wx: OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  xw: OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  'w+': OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE,
  'wx+': OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  'xw+': OPEN_MODE.TRUNC | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  a: OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.WRITE,
  ax: OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  xa: OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  'a+': OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE,
  'ax+': OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
  'xa+': OPEN_MODE.APPEND | OPEN_MODE.CREAT | OPEN_MODE.READ | OPEN_MODE.WRITE | OPEN_MODE.EXCL,
};

function stringToFlags(str) {
  const flags = stringFlagMap[str];
  return flags !== undefined ? flags : null;
}

const flagsToString = (() => {
  const stringFlagMapKeys = Object.keys(stringFlagMap);
  return (flags) => {
    for (let i = 0; i < stringFlagMapKeys.length; ++i) {
      const key = stringFlagMapKeys[i];
      if (stringFlagMap[key] === flags) return key;
    }
    return null;
  };
})();

function readAttrs() {
  /*
    uint32   flags
    uint64   size           present only if flag SSH_FILEXFER_ATTR_SIZE
    uint32   uid            present only if flag SSH_FILEXFER_ATTR_UIDGID
    uint32   gid            present only if flag SSH_FILEXFER_ATTR_UIDGID
    uint32   permissions    present only if flag SSH_FILEXFER_ATTR_PERMISSIONS
    uint32   atime          present only if flag SSH_FILEXFER_ACMODTIME
    uint32   mtime          present only if flag SSH_FILEXFER_ACMODTIME
    uint32   extended_count present only if flag SSH_FILEXFER_ATTR_EXTENDED
    string   extended_type
    string   extended_data
    ...      more extended data (extended_type - extended_data pairs),
               so that number of pairs equals extended_count
  */
  const flags = bufferParser.readUInt32BE();
  if (flags === undefined) return undefined;

  const attrs = new Stats();
  if (flags & ATTR.SIZE) {
    const size = bufferParser.readUInt64BE();
    if (size === undefined) return undefined;
    attrs.size = size;
  }

  if (flags & ATTR.UIDGID) {
    const uid = bufferParser.readUInt32BE();
    const gid = bufferParser.readUInt32BE();
    if (gid === undefined) return undefined;
    attrs.uid = uid;
    attrs.gid = gid;
  }

  if (flags & ATTR.PERMISSIONS) {
    const mode = bufferParser.readUInt32BE();
    if (mode === undefined) return undefined;
    attrs.mode = mode;
  }

  if (flags & ATTR.ACMODTIME) {
    const atime = bufferParser.readUInt32BE();
    const mtime = bufferParser.readUInt32BE();
    if (mtime === undefined) return undefined;
    attrs.atime = atime;
    attrs.mtime = mtime;
  }

  if (flags & ATTR.EXTENDED) {
    const count = bufferParser.readUInt32BE();
    if (count === undefined) return undefined;
    const extended = {};
    for (let i = 0; i < count; ++i) {
      const type = bufferParser.readString(true);
      const data = bufferParser.readString();
      if (data === undefined) return undefined;
      extended[type] = data;
    }
    attrs.extended = extended;
  }

  return attrs;
}

function sendOrBuffer(sftp, payload) {
  const ret = tryWritePayload(sftp, payload);
  if (ret !== undefined) {
    sftp._buffer.push(ret);
    return false;
  }
  return true;
}

function tryWritePayload(sftp, payload) {
  const outgoing = sftp.outgoing;
  if (outgoing.state !== 'open') return undefined;

  if (outgoing.window === 0) {
    sftp._waitWindow = true;
    sftp._chunkcb = drainBuffer;
    return payload;
  }

  let ret;
  const len = payload.length;
  let p = 0;

  while (len - p > 0 && outgoing.window > 0) {
    const actualLen = Math.min(len - p, outgoing.window, outgoing.packetSize);
    outgoing.window -= actualLen;
    if (outgoing.window === 0) {
      sftp._waitWindow = true;
      sftp._chunkcb = drainBuffer;
    }

    if (p === 0 && actualLen === len) {
      sftp._protocol.channelData(sftp.outgoing.id, payload);
    } else {
      sftp._protocol.channelData(sftp.outgoing.id, bufferSlice(payload, p, p + actualLen));
    }

    p += actualLen;
  }

  if (len - p > 0) {
    if (p > 0) ret = bufferSlice(payload, p, len);
    else ret = payload; // XXX: should never get here?
  }

  return ret;
}

function drainBuffer() {
  this._chunkcb = undefined;
  const buffer = this._buffer;
  let i = 0;
  while (i < buffer.length) {
    const payload = buffer[i];
    const ret = tryWritePayload(this, payload);
    if (ret !== undefined) {
      if (ret !== payload) buffer[i] = ret;
      if (i > 0) this._buffer = buffer.slice(i);
      return;
    }
    ++i;
  }
  if (i > 0) this._buffer = [];
}

function doFatalSFTPError(sftp, msg, noDebug) {
  const err = new Error(msg);
  err.level = 'sftp-protocol';
  if (!noDebug && sftp._debug) sftp._debug(`SFTP: Inbound: ${msg}`);
  sftp.emit('error', err);
  sftp.destroy();
  cleanupRequests(sftp);
  return false;
}

function cleanupRequests(sftp) {
  const keys = Object.keys(sftp._requests);
  if (keys.length === 0) return;

  const reqs = sftp._requests;
  sftp._requests = {};
  const err = new Error('No response from server');
  for (let i = 0; i < keys.length; ++i) {
    const req = reqs[keys[i]];
    if (typeof req.cb === 'function') req.cb(err);
  }
}

function requestLimits(sftp, cb) {
  /*
    uint32    id
    string    "limits@openssh.com"
  */
  let p = 9;
  const buf = Buffer.allocUnsafe(4 + 1 + 4 + 4 + 18);

  writeUInt32BE(buf, buf.length - 4, 0);
  buf[4] = REQUEST.EXTENDED;
  const reqid = (sftp._writeReqid = (sftp._writeReqid + 1) & MAX_REQID);
  writeUInt32BE(buf, reqid, 5);

  writeUInt32BE(buf, 18, p);
  buf.utf8Write('limits@openssh.com', p + 4, 18);

  sftp._requests[reqid] = { extended: 'limits@openssh.com', cb };

  const isBuffered = sendOrBuffer(sftp, buf);
  if (sftp._debug) {
    const which = isBuffered ? 'Buffered' : 'Sending';
    sftp._debug(`SFTP: Outbound: ${which} limits@openssh.com`);
  }
}

const CLIENT_HANDLERS = {
  [RESPONSE.VERSION]: (sftp, payload) => {
    if (sftp._version !== -1) return doFatalSFTPError(sftp, 'Duplicate VERSION packet');

    const extensions = {};

    /*
      uint32 version
      <extension data>
    */
    bufferParser.init(payload, 1);
    let version = bufferParser.readUInt32BE();
    while (bufferParser.avail()) {
      const extName = bufferParser.readString(true);
      const extData = bufferParser.readString(true);
      if (extData === undefined) {
        version = undefined;
        break;
      }
      extensions[extName] = extData;
    }
    bufferParser.clear();

    if (version === undefined) return doFatalSFTPError(sftp, 'Malformed VERSION packet');

    if (sftp._debug) {
      const names = Object.keys(extensions);
      if (names.length) {
        sftp._debug(`SFTP: Inbound: Received VERSION (v${version}, exts:${names})`);
      } else {
        sftp._debug(`SFTP: Inbound: Received VERSION (v${version})`);
      }
    }

    sftp._version = version;
    sftp._extensions = extensions;

    if (extensions['limits@openssh.com'] === '1') {
      return requestLimits(sftp, (err, limits) => {
        if (!err) {
          if (limits.maxPktLen > 0) sftp._maxOutPktLen = limits.maxPktLen;
          if (limits.maxReadLen > 0) sftp._maxReadLen = limits.maxReadLen;
          if (limits.maxWriteLen > 0) sftp._maxWriteLen = limits.maxWriteLen;
          sftp.maxOpenHandles = limits.maxOpenHandles > 0 ? limits.maxOpenHandles : Infinity;
        }
        sftp.emit('ready');
      });
    }

    sftp.emit('ready');

    return undefined;
  },
  [RESPONSE.STATUS]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      uint32     error/status code
      string     error message (ISO-10646 UTF-8)
      string     language tag
    */
    const errorCode = bufferParser.readUInt32BE();
    const errorMsg = bufferParser.readString(true);
    bufferParser.clear();

    // Note: we avoid checking that the error message and language tag are in
    // the packet because there are some broken implementations that incorrectly
    // omit them. The language tag in general was never really used amongst ssh
    // implementations, so in the case of a missing error message we just
    // default to something sensible.

    if (sftp._debug) {
      const jsonMsg = JSON.stringify(errorMsg);
      sftp._debug(`SFTP: Inbound: Received STATUS (id:${reqID}, ${errorCode}, ${jsonMsg})`);
    }
    const req = sftp._requests[reqID];
    delete sftp._requests[reqID];
    if (req && typeof req.cb === 'function') {
      if (errorCode === STATUS_CODE.OK) {
        req.cb();
        return;
      }
      const err = new Error(errorMsg || STATUS_CODE_STR[errorCode] || 'Unknown status');
      err.code = errorCode;
      req.cb(err);
    }
  },
  [RESPONSE.HANDLE]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     handle
    */
    const handle = bufferParser.readString();
    bufferParser.clear();

    if (handle === undefined) {
      if (reqID !== undefined) delete sftp._requests[reqID];
      return doFatalSFTPError(sftp, 'Malformed HANDLE packet');
    }

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received HANDLE (id:${reqID})`);
    }

    const req = sftp._requests[reqID];
    delete sftp._requests[reqID];
    if (req && typeof req.cb === 'function') req.cb(undefined, handle);

    return undefined;
  },
  [RESPONSE.DATA]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    let req;
    if (reqID !== undefined) {
      req = sftp._requests[reqID];
      delete sftp._requests[reqID];
    }
    /*
      string     data
    */
    if (req && typeof req.cb === 'function') {
      if (req.buffer) {
        // We have already pre-allocated space to store the data

        const nb = bufferParser.readString(req.buffer);
        bufferParser.clear();

        if (nb !== undefined) {
          if (sftp._debug) {
            sftp._debug(`SFTP: Inbound: Received DATA (id:${reqID}, ${nb})`);
          }
          req.cb(undefined, req.buffer, nb);
          return undefined;
        }
      } else {
        const data = bufferParser.readString();
        bufferParser.clear();

        if (data !== undefined) {
          if (sftp._debug) {
            sftp._debug(`SFTP: Inbound: Received DATA (id:${reqID}, ${data.length})`);
          }
          req.cb(undefined, data);
          return undefined;
        }
      }
    } else {
      const nb = bufferParser.skipString();
      bufferParser.clear();
      if (nb !== undefined) {
        if (sftp._debug) {
          sftp._debug(`SFTP: Inbound: Received DATA (id:${reqID}, ${nb})`);
        }
        return undefined;
      }
    }

    return doFatalSFTPError(sftp, 'Malformed DATA packet');
  },
  [RESPONSE.NAME]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    let req;
    if (reqID !== undefined) {
      req = sftp._requests[reqID];
    }
    /*
      uint32     count
      repeats count times:
              string     filename
              string     longname
              ATTRS      attrs
    */
    const count = bufferParser.readUInt32BE();
    if (count !== undefined) {
      let names = [];
      for (let i = 0; i < count; ++i) {
        // We are going to assume UTF-8 for filenames despite the SFTPv3
        // spec not specifying an encoding because the specs for newer
        // versions of the protocol all explicitly specify UTF-8 for
        // filenames
        const filename = bufferParser.readString(true);

        // `longname` only exists in SFTPv3 and since it typically will
        // contain the filename, we assume it is also UTF-8
        const longname = bufferParser.readString(true);

        const attrs = readAttrs();
        if (attrs === undefined) {
          names = undefined;
          break;
        }
        names.push({ filename, longname, attrs });
      }
      if (names !== undefined) {
        if (sftp._debug) {
          sftp._debug(`SFTP: Inbound: Received NAME (id:${reqID}, ${names.length})`);
        }
        bufferParser.clear();
        delete sftp._requests[reqID];
        if (req && typeof req.cb === 'function') req.cb(undefined, names);
        return undefined;
      }
    }

    bufferParser.clear();
    return doFatalSFTPError(sftp, 'Malformed NAME packet');
  },
  [RESPONSE.ATTRS]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    let req;
    if (reqID !== undefined) {
      req = sftp._requests[reqID];
    }
    /*
      ATTRS      attrs
    */
    const attrs = readAttrs();
    bufferParser.clear();
    if (attrs !== undefined) {
      if (sftp._debug) {
        sftp._debug(`SFTP: Inbound: Received ATTRS (id:${reqID})`);
      }
      delete sftp._requests[reqID];
      if (req && typeof req.cb === 'function') req.cb(undefined, attrs);
      return undefined;
    }

    return doFatalSFTPError(sftp, 'Malformed ATTRS packet');
  },
  [RESPONSE.EXTENDED]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    if (reqID !== undefined) {
      const req = sftp._requests[reqID];
      if (req) {
        switch (req.extended) {
          case 'statvfs@openssh.com':
          case 'fstatvfs@openssh.com': {
            /*
              uint64    f_bsize   // file system block size
              uint64    f_frsize  // fundamental fs block size
              uint64    f_blocks  // number of blocks (unit f_frsize)
              uint64    f_bfree   // free blocks in file system
              uint64    f_bavail  // free blocks for non-root
              uint64    f_files   // total file inodes
              uint64    f_ffree   // free file inodes
              uint64    f_favail  // free file inodes for to non-root
              uint64    f_fsid    // file system id
              uint64    f_flag    // bit mask of f_flag values
              uint64    f_namemax // maximum filename length
            */
            const stats = {
              f_bsize: bufferParser.readUInt64BE(),
              f_frsize: bufferParser.readUInt64BE(),
              f_blocks: bufferParser.readUInt64BE(),
              f_bfree: bufferParser.readUInt64BE(),
              f_bavail: bufferParser.readUInt64BE(),
              f_files: bufferParser.readUInt64BE(),
              f_ffree: bufferParser.readUInt64BE(),
              f_favail: bufferParser.readUInt64BE(),
              f_fsid: bufferParser.readUInt64BE(),
              f_flag: bufferParser.readUInt64BE(),
              f_namemax: bufferParser.readUInt64BE(),
            };
            if (stats.f_namemax === undefined || bufferParser.avail()) break;
            if (sftp._debug) {
              sftp._debug('SFTP: Inbound: Received EXTENDED_REPLY ' + `(id:${reqID}, ${req.extended})`);
            }
            bufferParser.clear();
            delete sftp._requests[reqID];
            if (typeof req.cb === 'function') req.cb(undefined, stats);
            return undefined;
          }
          case 'limits@openssh.com': {
            /*
              uint64          max-packet-length
              uint64          max-read-length
              uint64          max-write-length
              uint64          max-open-handles
            */
            const limits = {
              maxPktLen: bufferParser.readUInt64BE(),
              maxReadLen: bufferParser.readUInt64BE(),
              maxWriteLen: bufferParser.readUInt64BE(),
              maxOpenHandles: bufferParser.readUInt64BE(),
            };
            if (limits.maxOpenHandles === undefined || bufferParser.avail()) break;
            if (sftp._debug) {
              sftp._debug('SFTP: Inbound: Received EXTENDED_REPLY ' + `(id:${reqID}, ${req.extended})`);
            }
            bufferParser.clear();
            delete sftp._requests[reqID];
            if (typeof req.cb === 'function') req.cb(undefined, limits);
            return undefined;
          }
          case 'users-groups-by-id@openssh.com': {
            /*
              string    usernames
                string    username1
                ...
              string    groupnames
                string    groupname1
                ...
            */
            const usernameCount = bufferParser.readUInt32BE();
            if (usernameCount === undefined || usernameCount > Math.floor(bufferParser.avail() / 4)) break;
            const usernames = new Array(usernameCount);
            for (let i = 0; i < usernames.length; ++i) usernames[i] = bufferParser.readString(true);

            const groupnameCount = bufferParser.readUInt32BE();
            if (groupnameCount === undefined || groupnameCount > Math.floor(bufferParser.avail() / 4)) break;
            const groupnames = new Array(groupnameCount);
            for (let i = 0; i < groupnames.length; ++i) groupnames[i] = bufferParser.readString(true);
            if (groupnames.length > 0 && groupnames[groupnames.length - 1] === undefined) {
              break;
            }

            if (sftp._debug) {
              sftp._debug('SFTP: Inbound: Received EXTENDED_REPLY ' + `(id:${reqID}, ${req.extended})`);
            }
            bufferParser.clear();
            delete sftp._requests[reqID];
            if (typeof req.cb === 'function') req.cb(undefined, usernames, groupnames);
            return undefined;
          }
          default:
            // Unknown extended request
            if (sftp._debug) {
              sftp._debug(`SFTP: Inbound: Received EXTENDED_REPLY (id:${reqID}, ???)`);
            }
            bufferParser.clear();
            delete sftp._requests[reqID];
            if (typeof req.cb === 'function') req.cb();
            return undefined;
        }
      } else {
        if (sftp._debug) {
          sftp._debug(`SFTP: Inbound: Received EXTENDED_REPLY (id:${reqID}, ???)`);
        }
        bufferParser.clear();
        return undefined;
      }
    }

    bufferParser.clear();
    return doFatalSFTPError(sftp, 'Malformed EXTENDED_REPLY packet');
  },
};
const SERVER_HANDLERS = {
  [REQUEST.INIT]: (sftp, payload) => {
    if (sftp._version !== -1) return doFatalSFTPError(sftp, 'Duplicate INIT packet');

    const extensions = {};

    /*
      uint32 version
      <extension data>
    */
    bufferParser.init(payload, 1);
    let version = bufferParser.readUInt32BE();
    while (bufferParser.avail()) {
      const extName = bufferParser.readString(true);
      const extData = bufferParser.readString(true);
      if (extData === undefined) {
        version = undefined;
        break;
      }
      extensions[extName] = extData;
    }
    bufferParser.clear();

    if (version === undefined) return doFatalSFTPError(sftp, 'Malformed INIT packet');

    if (sftp._debug) {
      const names = Object.keys(extensions);
      if (names.length) {
        sftp._debug(`SFTP: Inbound: Received INIT (v${version}, exts:${names})`);
      } else {
        sftp._debug(`SFTP: Inbound: Received INIT (v${version})`);
      }
    }

    sendOrBuffer(sftp, SERVER_VERSION_BUFFER);

    sftp._version = version;
    sftp._extensions = extensions;
    sftp.emit('ready');

    return undefined;
  },
  [REQUEST.OPEN]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string        filename
      uint32        pflags
      ATTRS         attrs
    */
    const filename = bufferParser.readString(true);
    const pflags = bufferParser.readUInt32BE();
    const attrs = readAttrs();
    bufferParser.clear();

    if (attrs === undefined) return doFatalSFTPError(sftp, 'Malformed OPEN packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received OPEN (id:${reqID})`);
    }

    if (!sftp.emit('OPEN', reqID, filename, pflags, attrs)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.CLOSE]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string        handle
    */
    const handle = bufferParser.readString();
    bufferParser.clear();

    if (handle === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed CLOSE packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received CLOSE (id:${reqID})`);
    }

    if (!sftp.emit('CLOSE', reqID, handle)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.READ]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     handle
      uint64     offset
      uint32     len
    */
    const handle = bufferParser.readString();
    const offset = bufferParser.readUInt64BE();
    const len = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (len === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed READ packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received READ (id:${reqID})`);
    }

    if (!sftp.emit('READ', reqID, handle, offset, len)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.WRITE]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     handle
      uint64     offset
      string     data
    */
    const handle = bufferParser.readString();
    const offset = bufferParser.readUInt64BE();
    const data = bufferParser.readString();
    bufferParser.clear();

    if (data === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed WRITE packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received WRITE (id:${reqID})`);
    }

    if (!sftp.emit('WRITE', reqID, handle, offset, data)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.LSTAT]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed LSTAT packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received LSTAT (id:${reqID})`);
    }

    if (!sftp.emit('LSTAT', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.FSTAT]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string        handle
    */
    const handle = bufferParser.readString();
    bufferParser.clear();

    if (handle === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed FSTAT packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received FSTAT (id:${reqID})`);
    }

    if (!sftp.emit('FSTAT', reqID, handle)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.SETSTAT]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
      ATTRS      attrs
    */
    const path = bufferParser.readString(true);
    const attrs = readAttrs();
    bufferParser.clear();

    if (attrs === undefined) return doFatalSFTPError(sftp, 'Malformed SETSTAT packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received SETSTAT (id:${reqID})`);
    }

    if (!sftp.emit('SETSTAT', reqID, path, attrs)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.FSETSTAT]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     handle
      ATTRS      attrs
    */
    const handle = bufferParser.readString();
    const attrs = readAttrs();
    bufferParser.clear();

    if (attrs === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed FSETSTAT packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received FSETSTAT (id:${reqID})`);
    }

    if (!sftp.emit('FSETSTAT', reqID, handle, attrs)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.OPENDIR]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed OPENDIR packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received OPENDIR (id:${reqID})`);
    }

    if (!sftp.emit('OPENDIR', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.READDIR]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string        handle
    */
    const handle = bufferParser.readString();
    bufferParser.clear();

    if (handle === undefined || handle.length > 256) return doFatalSFTPError(sftp, 'Malformed READDIR packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received READDIR (id:${reqID})`);
    }

    if (!sftp.emit('READDIR', reqID, handle)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.REMOVE]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed REMOVE packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received REMOVE (id:${reqID})`);
    }

    if (!sftp.emit('REMOVE', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.MKDIR]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
      ATTRS      attrs
    */
    const path = bufferParser.readString(true);
    const attrs = readAttrs();
    bufferParser.clear();

    if (attrs === undefined) return doFatalSFTPError(sftp, 'Malformed MKDIR packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received MKDIR (id:${reqID})`);
    }

    if (!sftp.emit('MKDIR', reqID, path, attrs)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.RMDIR]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed RMDIR packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received RMDIR (id:${reqID})`);
    }

    if (!sftp.emit('RMDIR', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.REALPATH]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed REALPATH packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received REALPATH (id:${reqID})`);
    }

    if (!sftp.emit('REALPATH', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.STAT]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed STAT packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received STAT (id:${reqID})`);
    }

    if (!sftp.emit('STAT', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.RENAME]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     oldpath
      string     newpath
    */
    const oldPath = bufferParser.readString(true);
    const newPath = bufferParser.readString(true);
    bufferParser.clear();

    if (newPath === undefined) return doFatalSFTPError(sftp, 'Malformed RENAME packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received RENAME (id:${reqID})`);
    }

    if (!sftp.emit('RENAME', reqID, oldPath, newPath)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.READLINK]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     path
    */
    const path = bufferParser.readString(true);
    bufferParser.clear();

    if (path === undefined) return doFatalSFTPError(sftp, 'Malformed READLINK packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received READLINK (id:${reqID})`);
    }

    if (!sftp.emit('READLINK', reqID, path)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.SYMLINK]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     linkpath
      string     targetpath
    */
    const linkPath = bufferParser.readString(true);
    const targetPath = bufferParser.readString(true);
    bufferParser.clear();

    if (targetPath === undefined) return doFatalSFTPError(sftp, 'Malformed SYMLINK packet');

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received SYMLINK (id:${reqID})`);
    }

    let handled;
    if (sftp._isOpenSSH) {
      // OpenSSH has linkpath and targetpath positions switched
      handled = sftp.emit('SYMLINK', reqID, targetPath, linkPath);
    } else {
      handled = sftp.emit('SYMLINK', reqID, linkPath, targetPath);
    }
    if (!handled) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
  [REQUEST.EXTENDED]: (sftp, payload) => {
    bufferParser.init(payload, 1);
    const reqID = bufferParser.readUInt32BE();
    /*
      string     extended-request
      ... any request-specific data ...
    */
    const extName = bufferParser.readString(true);
    if (extName === undefined) {
      bufferParser.clear();
      return doFatalSFTPError(sftp, 'Malformed EXTENDED packet');
    }

    let extData;
    if (bufferParser.avail()) extData = bufferParser.readRaw();
    bufferParser.clear();

    if (sftp._debug) {
      sftp._debug(`SFTP: Inbound: Received EXTENDED (id:${reqID})`);
    }

    if (!sftp.emit('EXTENDED', reqID, extName, extData)) {
      // Automatically reject request if no handler for request type
      sftp.status(reqID, STATUS_CODE.OP_UNSUPPORTED);
    }

    return undefined;
  },
};

// =============================================================================
// ReadStream/WriteStream-related ==============================================
// =============================================================================
class ERR_INVALID_ARG_TYPE extends TypeError {
  constructor(name, expected) {
    super(`${name} must be ${expected}`);
    this.code = 'ERR_INVALID_ARG_TYPE';
  }
}
class ERR_OUT_OF_RANGE extends RangeError {
  constructor(name, expected) {
    super(`${name} must be ${expected}`);
    this.code = 'ERR_OUT_OF_RANGE';
  }
}
function validateNumber(value, name) {
  if (typeof value !== 'number') throw new ERR_INVALID_ARG_TYPE(name, 'a number');
}

const kMinPoolSpace = 128;

let pool;
// It can happen that we expect to read a large chunk of data, and reserve
// a large chunk of the pool accordingly, but the read() call only filled
// a portion of it. If a concurrently executing read() then uses the same pool,
// the "reserved" portion cannot be used, so we allow it to be re-used as a
// new pool later.
const poolFragments = [];

function allocNewPool(poolSize) {
  if (poolFragments.length > 0) pool = poolFragments.pop();
  else pool = Buffer.allocUnsafe(poolSize);
  pool.used = 0;
}

// Check the `this.start` and `this.end` of stream.
function checkBufferRange(buffer, offset, length, position) {
  checkPosition(offset, 'offset');
  checkPosition(length, 'length');
  checkPosition(position, 'position');
  if (offset > buffer.length || length > buffer.length - offset)
    throw new RangeError('SFTP buffer range exceeds the provided buffer');
  if (!Number.isSafeInteger(position + length))
    throw new RangeError('SFTP position plus length exceeds the safe integer range');
}

function checkPosition(pos, name) {
  if (!Number.isSafeInteger(pos)) {
    validateNumber(pos, name);
    if (!Number.isInteger(pos)) throw new ERR_OUT_OF_RANGE(name, 'an integer', pos);
    throw new ERR_OUT_OF_RANGE(name, '>= 0 and <= 2 ** 53 - 1', pos);
  }
  if (pos < 0) throw new ERR_OUT_OF_RANGE(name, '>= 0 and <= 2 ** 53 - 1', pos);
}

function roundUpToMultipleOf8(n) {
  return (n + 7) & ~7; // Align to 8 byte boundary.
}

function ReadStream(sftp, path, options) {
  if (options === undefined) options = {};
  else if (typeof options === 'string') options = { encoding: options };
  else if (options === null || typeof options !== 'object')
    throw new TypeError('"options" argument must be a string or an object');
  else options = Object.create(options);

  // A little bit bigger buffer and water marks by default
  if (options.highWaterMark === undefined) options.highWaterMark = 64 * 1024;

  // Native stream completion includes the acknowledged remote handle close.
  options.autoDestroy = options.autoClose !== false;

  ReadableStream.call(this, options);

  this.path = path;
  this.flags = options.flags === undefined ? 'r' : options.flags;
  this.mode = options.mode === undefined ? 0o666 : options.mode;

  this.start = options.start;
  this.end = options.end;
  this.autoClose = options.autoClose === undefined ? true : options.autoClose;
  this.pos = 0;
  this.bytesRead = 0;
  this.isClosed = false;

  this.handle = options.handle === undefined ? null : options.handle;
  this.sftp = sftp;
  this._opening = false;

  if (this.start !== undefined) {
    checkPosition(this.start, 'start');

    this.pos = this.start;
  }

  if (this.end === undefined) {
    this.end = Infinity;
  } else if (this.end !== Infinity) {
    checkPosition(this.end, 'end');

    if (this.start !== undefined && this.start > this.end) {
      throw new ERR_OUT_OF_RANGE('start', `<= "end" (here: ${this.end})`, this.start);
    }
  }

  this.on('end', function onReadEnd() {
    if (this.autoClose) this.destroy();
  });

  if (!Buffer.isBuffer(this.handle)) this.open();
}
inherits(ReadStream, ReadableStream);

function openStream(stream, readable) {
  if (stream._opening || stream.destroyed) return;
  stream._opening = true;
  stream.sftp.open(stream.path, stream.flags, stream.mode, (error, handle) => {
    if (error) return complete(error);
    stream.handle = handle;
    if (!readable && stream.flags[0] === 'a') {
      // Bind append positioning to the opened handle, never a later pathname.
      stream.sftp.fstat(handle, (statError, stats) => {
        if (statError) return complete(statError);
        stream.pos = stats.size;
        complete();

        return undefined;
      });
    } else complete();

    return undefined;
  });
  function complete(error) {
    stream._opening = false;
    stream._openError = error;
    stream.emit('_open-complete');
    if (error) {
      if (!stream.destroyed) stream.destroy(error);
      return;
    }
    if (stream.destroyed || stream._handleClosed) return;
    stream.emit('open', stream.handle);
    stream.emit('ready');
    if (readable) stream.read();
  }
}

ReadStream.prototype.open = function open() {
  openStream(this, true);
};

ReadStream.prototype._read = function _read(n) {
  if (!Buffer.isBuffer(this.handle)) return this.once('open', () => this._read(n));

  // XXX: safe to remove this?
  if (this.destroyed) return undefined;

  if (!pool || pool.length - pool.used < kMinPoolSpace) {
    // Discard the old pool.
    allocNewPool(this.readableHighWaterMark || this._readableState.highWaterMark);
  }

  // Grab another reference to the pool in the case that while we're
  // in the thread pool another read() finishes up the pool, and
  // allocates a new one.
  const thisPool = pool;
  let toRead = Math.min(pool.length - pool.used, n);
  const start = pool.used;

  if (this.end !== undefined) toRead = Math.min(this.end - this.pos + 1, toRead);

  // Already read everything we were supposed to read!
  // treat as EOF.
  if (toRead <= 0) return this.push(null);

  // the actual read.
  this.sftp.read(this.handle, pool, pool.used, toRead, this.pos, (er, bytesRead) => {
    if (er) {
      this.emit('error', er);
      if (this.autoClose) this.destroy();
      return;
    }
    let b = null;

    // Now that we know how much data we have actually read, re-wind the
    // 'used' field if we can, and otherwise allow the remainder of our
    // reservation to be used as a new pool later.
    if (start + toRead === thisPool.used && thisPool === pool) {
      thisPool.used = roundUpToMultipleOf8(thisPool.used + bytesRead - toRead);
    } else {
      // Round down to the next lowest multiple of 8 to ensure the new pool
      // fragment start and end positions are aligned to an 8 byte boundary.
      const alignedEnd = (start + toRead) & ~7;
      const alignedStart = roundUpToMultipleOf8(start + bytesRead);
      if (alignedEnd - alignedStart >= kMinPoolSpace) poolFragments.push(thisPool.slice(alignedStart, alignedEnd));
    }

    if (bytesRead > 0) {
      this.bytesRead += bytesRead;
      b = thisPool.slice(start, start + bytesRead);
    }

    // Move the pool positions, and internal position for reading.
    this.pos += bytesRead;

    this.push(b);
  });

  pool.used = roundUpToMultipleOf8(pool.used + toRead);

  return undefined;
};

ReadStream.prototype._destroy = function _destroy(error, callback) {
  closeStream(this, callback, error);
};

function combineCloseError(first, second) {
  return first && second && first !== second
    ? new AggregateError([first, second], 'SFTP operation and handle close failed')
    : first || second;
}

function closeStream(stream, callback, error) {
  if (stream._opening) {
    stream.once('_open-complete', () => closeStream(stream, callback, error));
    return;
  }
  if (stream._writesInFlight > 0) {
    stream.once('_writes-complete', () => closeStream(stream, callback, error));
    return;
  }
  const complete = (failure) => callback(combineCloseError(error || stream._openError, failure));
  if (stream._closeCallbacks) {
    stream._closeCallbacks.push(complete);
    return;
  }
  if (stream._handleClosed) {
    complete(stream._closeError);
    return;
  }
  stream._handleClosed = true;
  const handle = stream.handle;
  stream.handle = null;
  if (!handle) {
    stream.isClosed = true;
    complete();
    return;
  }
  stream._closeCallbacks = [complete];
  // Preserve one CLOSE request and its exact result, including an unknown
  // outcome after transport loss. A second destroy must never repeat it.
  stream.sftp.close(handle, (failure) => {
    stream._closeError = failure;
    stream.isClosed = !failure;
    const callbacks = stream._closeCallbacks;
    stream._closeCallbacks = undefined;
    for (const pendingCallback of callbacks) pendingCallback(failure);
  });
}

ReadStream.prototype.close = function close(cb) {
  this.destroy(null, cb);
};

Object.defineProperty(ReadStream.prototype, 'pending', {
  get() {
    return this.handle === null;
  },
  configurable: true,
});

// TODO: add `concurrency` setting to allow more than one in-flight WRITE
// request to server to improve throughput
function WriteStream(sftp, path, options) {
  if (options === undefined) options = {};
  else if (typeof options === 'string') options = { encoding: options };
  else if (options === null || typeof options !== 'object')
    throw new TypeError('"options" argument must be a string or an object');
  else options = Object.create(options);

  // Native stream completion includes the acknowledged remote handle close.
  options.autoDestroy = options.autoClose !== false;

  WritableStream.call(this, options);

  this.path = path;
  this.flags = options.flags === undefined ? 'w' : options.flags;
  this.mode = options.mode === undefined ? 0o666 : options.mode;

  this.start = options.start;
  this.autoClose = options.autoClose === undefined ? true : options.autoClose;
  this.pos = 0;
  this.bytesWritten = 0;
  this.isClosed = false;

  this.handle = options.handle === undefined ? null : options.handle;
  this.sftp = sftp;
  this._opening = false;

  if (this.start !== undefined) {
    checkPosition(this.start, 'start');

    this.pos = this.start;
  }

  if (options.encoding) this.setDefaultEncoding(options.encoding);

  if (!Buffer.isBuffer(this.handle)) this.open();
}
inherits(WriteStream, WritableStream);

WriteStream.prototype._final = function _final(callback) {
  if (this.autoClose) closeStream(this, callback);
  else callback();
};

WriteStream.prototype.open = function open() {
  openStream(this, false);
};

WriteStream.prototype._write = function _write(data, encoding, cb) {
  if (!Buffer.isBuffer(data)) {
    const err = new ERR_INVALID_ARG_TYPE('data', 'Buffer', data);
    return cb(err);
  }

  if (!Buffer.isBuffer(this.handle)) {
    return this.once('_open-complete', () => {
      if (this._openError || this.destroyed)
        cb(this._openError || new Error('SFTP stream was destroyed while opening'));
      else this._write(data, encoding, cb);
    });
  }

  this._writesInFlight = (this._writesInFlight || 0) + 1;
  this.sftp.write(this.handle, data, 0, data.length, this.pos, (er, bytes) => {
    this._writesInFlight--;
    if (!er) this.bytesWritten += bytes;
    cb(er);
    if (this._writesInFlight === 0) this.emit('_writes-complete');
  });

  this.pos += data.length;

  return undefined;
};

WriteStream.prototype._writev = function _writev(data, cb) {
  if (!Buffer.isBuffer(this.handle)) {
    return this.once('_open-complete', () => {
      if (this._openError || this.destroyed)
        cb(this._openError || new Error('SFTP stream was destroyed while opening'));
      else this._writev(data, cb);
    });
  }

  const sftp = this.sftp;
  const handle = this.handle;
  let writesLeft = data.length;
  const failures = [];
  this._writesInFlight = (this._writesInFlight || 0) + data.length;
  const onwrite = (error, bytes) => {
    this._writesInFlight--;
    if (error) failures.push(error);
    else this.bytesWritten += bytes;
    if (--writesLeft === 0) {
      cb(failures.length > 1 ? new AggregateError(failures, 'SFTP writes failed') : failures[0]);
      if (this._writesInFlight === 0) this.emit('_writes-complete');
    }
  };

  // TODO: try to combine chunks to reduce number of requests to the server?
  for (let i = 0; i < data.length; ++i) {
    const chunk = data[i].chunk;

    sftp.write(handle, chunk, 0, chunk.length, this.pos, onwrite);
    this.pos += chunk.length;
  }

  return undefined;
};

WriteStream.prototype._destroy = ReadStream.prototype._destroy;
WriteStream.prototype.close = function close(cb) {
  if (cb) {
    if (this.isClosed) {
      process.nextTick(cb);
      return;
    }
    this.on('close', cb);
  }

  // If we are not autoClosing, we should call
  // destroy on 'finish'.
  if (!this.autoClose) this.on('finish', this.destroy.bind(this));

  this.end();
};

// There is no shutdown() for files.
WriteStream.prototype.destroySoon = WriteStream.prototype.end;

Object.defineProperty(WriteStream.prototype, 'pending', {
  get() {
    return this.handle === null;
  },
  configurable: true,
});
// =============================================================================

export { flagsToString };
export { OPEN_MODE };
export { SFTP };
export { Stats };
export { STATUS_CODE };
export { stringToFlags };
