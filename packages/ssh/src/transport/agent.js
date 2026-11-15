// OpenSSH agent framing adapted from ssh2 (MIT, Brian White); see LICENSE.
import { Socket } from 'node:net';

import { parseKey, isSupportedKeyType } from './protocol/keyParser.js';

const MAX_AGENT_MESSAGE = 1024 * 1024;
const MAX_AGENT_KEYS = 256;
const AGENT_TIMEOUT_MS = 10_000;
function once(callback) {
  let called = false;
  return (...args) => {
    if (!called) {
      called = true;
      callback(...args);
    }
  };
}
function noop() {}
function field(value) {
  const out = Buffer.allocUnsafe(value.length + 4);
  out.writeUInt32BE(value.length);
  value.copy(out, 4);
  return out;
}
function uint32(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}
function reader(buffer) {
  let offset = 0;
  return {
    uint32() {
      if (offset + 4 > buffer.length) throw new Error('Truncated SSH agent response');
      const value = buffer.readUInt32BE(offset);
      offset += 4;
      return value;
    },
    string() {
      const length = this.uint32();
      if (length > buffer.length - offset) throw new Error('Truncated SSH agent field');
      const value = buffer.subarray(offset, offset + length);
      offset += length;
      return value;
    },
    end() {
      if (offset !== buffer.length) throw new Error('Unexpected trailing SSH agent data');
    },
  };
}

export class BaseAgent {
  getIdentities(callback) {
    callback(new Error('Missing getIdentities() implementation'));
  }
  sign(_publicKey, _data, options, callback) {
    if (typeof options === 'function') callback = options;
    callback(new Error('Missing sign() implementation'));
  }
}

class OpenSSHAgent extends BaseAgent {
  constructor(socketPath) {
    super();
    this.socketPath = socketPath;
  }
  getStream(callback) {
    callback = once(callback);
    const socket = new Socket();
    const failure = (error) => {
      socket.destroy();
      callback(error instanceof Error ? error : new Error('SSH agent closed before connection'));
    };
    socket.once('error', failure).once('close', failure);
    socket.setTimeout(AGENT_TIMEOUT_MS, () => failure(new Error('SSH agent connection timed out')));
    socket.once('connect', () => {
      socket.setTimeout(0);
      socket.removeListener('error', failure);
      socket.removeListener('close', failure);
      callback(null, socket);
    });
    socket.connect(this.socketPath);
  }
  request(payload, decode, callback) {
    callback = once(callback);
    if (payload.length > MAX_AGENT_MESSAGE) {
      callback(new Error('SSH agent request exceeds the byte limit'));
      return;
    }
    this.getStream((error, socket) => {
      if (error) {
        callback(error);
        return;
      }
      const chunks = [];
      let size = 0,
        expected,
        terminal = false;
      const finish = (responseError, result) => {
        if (terminal) return;
        terminal = true;
        socket.once('close', () => callback(responseError, result));
        socket.destroy();
      };
      socket.once('error', (socketError) => finish(socketError));
      socket.once('end', () => finish(new Error('SSH agent closed before a complete response')));
      socket.once('close', () => {
        if (!terminal) {
          terminal = true;
          callback(new Error('SSH agent closed before a complete response'));
        }
      });
      socket.setTimeout(AGENT_TIMEOUT_MS, () => finish(new Error('SSH agent response timed out')));
      socket.on('data', (chunk) => {
        if (terminal) return;
        size += chunk.length;
        if (size > MAX_AGENT_MESSAGE + 4) {
          finish(new Error('SSH agent response exceeds the byte limit'));
          return;
        }
        chunks.push(chunk);
        if (expected === undefined && size >= 4) {
          expected = Buffer.concat(chunks, size).readUInt32BE(0);
          if (expected < 1 || expected > MAX_AGENT_MESSAGE) {
            finish(new Error('Invalid SSH agent response length'));
            return;
          }
        }
        if (expected === undefined || size < expected + 4) return;
        if (size !== expected + 4) {
          finish(new Error('Unexpected trailing SSH agent response'));
          return;
        }
        try {
          const message = Buffer.concat(chunks, size).subarray(4);
          if (message[0] === 5) throw new Error('SSH agent refused the request');
          finish(null, decode(message));
        } catch (decodeError) {
          finish(decodeError);
        }
      });
      socket.write(field(payload), (writeError) => {
        if (writeError) finish(writeError);
      });
    });
  }
  getIdentities(callback) {
    this.request(
      Buffer.from([11]),
      (message) => {
        if (message[0] !== 12) throw new Error('Unexpected SSH agent identities response');
        const input = reader(message.subarray(1)),
          count = input.uint32(),
          keys = [];
        if (count > MAX_AGENT_KEYS) throw new Error('SSH agent identity count exceeds the limit');
        for (let index = 0; index < count; index++) {
          const blob = input.string(),
            comment = input.string().toString('utf8');
          const type = reader(blob).string().toString('utf8');
          // An agent may contain keys outside the explicitly supported algorithms.
          if (!isSupportedKeyType(type)) continue;
          const key = parseKey(blob);
          if (key instanceof Error) throw key;
          key.comment = comment;
          keys.push(key);
        }
        input.end();
        return keys;
      },
      callback
    );
  }
  sign(publicKey, data, options, callback) {
    if (typeof options === 'function') {
      callback = options;
      options = undefined;
    }
    try {
      const key = parseKey(publicKey);
      if (key instanceof Error) throw key;
      let flags = 0,
        algorithm = key.type;
      if (key.type === 'ssh-rsa') {
        const hash = options?.hash ?? 'sha512';
        if (hash === 'sha256') {
          flags = 2;
          algorithm = 'rsa-sha2-256';
        } else if (hash === 'sha512') {
          flags = 4;
          algorithm = 'rsa-sha2-512';
        } else throw new Error('SSH RSA agent signatures require SHA-256 or SHA-512');
      }
      if (!Buffer.isBuffer(data) || data.length > MAX_AGENT_MESSAGE)
        throw new Error('Invalid SSH agent signing payload');
      const payload = Buffer.concat([Buffer.from([13]), field(key.getPublicSSH()), field(data), uint32(flags)]);
      this.request(
        payload,
        (message) => {
          if (message[0] !== 14) throw new Error('Unexpected SSH agent signing response');
          const input = reader(message.subarray(1)),
            signed = reader(input.string());
          input.end();
          const actual = signed.string().toString('utf8'),
            signature = signed.string();
          signed.end();
          if (actual !== algorithm || !signature.length)
            throw new Error('SSH agent returned an unexpected signature algorithm or encoding');
          return signature;
        },
        callback
      );
    } catch (error) {
      callback(error);
    }
  }
}

/** @returns {BaseAgent} */
export function createAgent(socketPath) {
  if (typeof socketPath !== 'string' || !socketPath || socketPath === 'pageant')
    throw new Error('An OpenSSH agent socket or named pipe is required');
  return new OpenSSHAgent(socketPath);
}
/** @returns {boolean} */
export function isAgent(value) {
  return value instanceof BaseAgent;
}

const SYM_AGENT = Symbol('Agent');
const SYM_AGENT_KEYS = Symbol('Agent Keys');
const SYM_AGENT_KEYS_IDX = Symbol('Agent Keys Index');
const SYM_AGENT_CBS = Symbol('Agent Init Callbacks');
export class AgentContext {
  constructor(agent) {
    if (typeof agent === 'string') agent = createAgent(agent);
    else if (!isAgent(agent)) throw new Error('Invalid agent argument');
    this[SYM_AGENT] = agent;
    this[SYM_AGENT_KEYS] = null;
    this[SYM_AGENT_KEYS_IDX] = -1;
    this[SYM_AGENT_CBS] = null;
  }
  init(cb) {
    if (typeof cb !== 'function') cb = noop;

    if (this[SYM_AGENT_KEYS] === null) {
      if (this[SYM_AGENT_CBS] === null) {
        this[SYM_AGENT_CBS] = [cb];

        const doCbs = (...args) => {
          process.nextTick(() => {
            const cbs = this[SYM_AGENT_CBS];
            this[SYM_AGENT_CBS] = null;
            for (const pendingCallback of cbs) pendingCallback(...args);
          });
        };

        this[SYM_AGENT].getIdentities(
          once((err, keys) => {
            if (err) return doCbs(err);

            if (!Array.isArray(keys) || keys.length > MAX_AGENT_KEYS) {
              return doCbs(new Error('Agent implementation failed to provide keys'));
            }

            const newKeys = [];
            for (let key of keys) {
              key = parseKey(key);
              if (key instanceof Error) {
                continue;
              }
              newKeys.push(key);
            }

            this[SYM_AGENT_KEYS] = newKeys;
            this[SYM_AGENT_KEYS_IDX] = -1;
            doCbs();

            return undefined;
          })
        );
      } else {
        this[SYM_AGENT_CBS].push(cb);
      }
    } else {
      process.nextTick(cb);
    }
  }
  nextKey() {
    if (this[SYM_AGENT_KEYS] === null || ++this[SYM_AGENT_KEYS_IDX] >= this[SYM_AGENT_KEYS].length) {
      return false;
    }

    return this[SYM_AGENT_KEYS][this[SYM_AGENT_KEYS_IDX]];
  }
  currentKey() {
    if (this[SYM_AGENT_KEYS] === null || this[SYM_AGENT_KEYS_IDX] >= this[SYM_AGENT_KEYS].length) {
      return null;
    }

    return this[SYM_AGENT_KEYS][this[SYM_AGENT_KEYS_IDX]];
  }
  pos() {
    if (this[SYM_AGENT_KEYS] === null || this[SYM_AGENT_KEYS_IDX] >= this[SYM_AGENT_KEYS].length) {
      return -1;
    }

    return this[SYM_AGENT_KEYS_IDX];
  }
  reset() {
    this[SYM_AGENT_KEYS_IDX] = -1;
  }

  sign(...args) {
    this[SYM_AGENT].sign(...args);
  }
}

/** @returns {boolean} */
