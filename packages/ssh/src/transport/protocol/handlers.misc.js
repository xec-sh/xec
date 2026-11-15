// Adapted from ssh2 1.17.0. Copyright Brian White. MIT; see package LICENSE and PROVENANCE.json.

import { parseKey } from './keyParser.js';
import { MESSAGE, TERMINAL_MODE, CHANNEL_OPEN_FAILURE } from './constants.js';
import { bufferSlice, bufferParser, doFatalError, writeUInt32BE, signatureToNative } from './utils.js';

const TERMINAL_MODE_BY_VALUE = Array.from(Object.entries(TERMINAL_MODE)).reduce(
  (obj, [key, value]) => ({ ...obj, [key]: value }),
  {}
);

export default {
  // Transport layer protocol ==================================================
  [MESSAGE.DISCONNECT]: (self, payload) => {
    /*
      byte      SSH_MSG_DISCONNECT
      uint32    reason code
      string    description in ISO-10646 UTF-8 encoding
      string    language tag
    */
    bufferParser.init(payload, 1);
    const reason = bufferParser.readUInt32BE();
    const desc = bufferParser.readString(true);
    const lang = bufferParser.readString();
    bufferParser.clear();

    if (lang === undefined) {
      return doFatalError(self, 'Inbound: Malformed DISCONNECT packet');
    }

    if (self._debug) {
      self._debug(`Inbound: Received DISCONNECT (${reason}, "${desc}")`);
    }

    const handler = self._handlers.DISCONNECT;
    if (handler) {
      handler(self, reason, desc);
    }

    return undefined;
  },
  [MESSAGE.IGNORE]: (self, payload) => {
    /*
      byte      SSH_MSG_IGNORE
      string    data
    */
    if (self._debug) {
      self._debug('Inbound: Received IGNORE');
    }
  },
  [MESSAGE.UNIMPLEMENTED]: (self, payload) => {
    /*
      byte      SSH_MSG_UNIMPLEMENTED
      uint32    packet sequence number of rejected message
    */
    bufferParser.init(payload, 1);
    const seqno = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (seqno === undefined) {
      return doFatalError(self, 'Inbound: Malformed UNIMPLEMENTED packet');
    }

    if (self._debug) {
      self._debug(`Inbound: Received UNIMPLEMENTED (seqno ${seqno})`);
    }

    return undefined;
  },
  [MESSAGE.DEBUG]: (self, payload) => {
    /*
      byte      SSH_MSG_DEBUG
      boolean   always_display
      string    message in ISO-10646 UTF-8 encoding [RFC3629]
      string    language tag [RFC3066]
    */
    bufferParser.init(payload, 1);
    const display = bufferParser.readBool();
    const msg = bufferParser.readString(true);
    const lang = bufferParser.readString();
    bufferParser.clear();

    if (lang === undefined) {
      return doFatalError(self, 'Inbound: Malformed DEBUG packet');
    }

    if (self._debug) {
      self._debug('Inbound: Received DEBUG');
    }

    const handler = self._handlers.DEBUG;
    if (handler) {
      handler(self, display, msg);
    }

    return undefined;
  },
  [MESSAGE.SERVICE_REQUEST]: (self, payload) => {
    /*
      byte      SSH_MSG_SERVICE_REQUEST
      string    service name
    */
    bufferParser.init(payload, 1);
    const name = bufferParser.readString(true);
    bufferParser.clear();

    if (name === undefined) {
      return doFatalError(self, 'Inbound: Malformed SERVICE_REQUEST packet');
    }

    if (self._debug) {
      self._debug(`Inbound: Received SERVICE_REQUEST (${name})`);
    }

    const handler = self._handlers.SERVICE_REQUEST;
    if (handler) {
      handler(self, name);
    }

    return undefined;
  },
  [MESSAGE.SERVICE_ACCEPT]: (self, payload) => {
    // S->C
    /*
      byte      SSH_MSG_SERVICE_ACCEPT
      string    service name
    */
    bufferParser.init(payload, 1);
    const name = bufferParser.readString(true);
    bufferParser.clear();

    if (name === undefined) {
      return doFatalError(self, 'Inbound: Malformed SERVICE_ACCEPT packet');
    }

    if (self._debug) {
      self._debug(`Inbound: Received SERVICE_ACCEPT (${name})`);
    }

    const handler = self._handlers.SERVICE_ACCEPT;
    if (handler) {
      handler(self, name);
    }

    return undefined;
  },
  [MESSAGE.EXT_INFO]: (self, payload) => {
    /*
      byte       SSH_MSG_EXT_INFO
      uint32     nr-extensions
      repeat the following 2 fields "nr-extensions" times:
        string   extension-name
        string   extension-value (binary)
    */
    bufferParser.init(payload, 1);
    const numExts = bufferParser.readUInt32BE();
    let exts;
    if (numExts !== undefined) {
      exts = [];
      for (let i = 0; i < numExts; ++i) {
        const name = bufferParser.readString(true);
        const data = bufferParser.readString();
        if (data !== undefined) {
          switch (name) {
            case 'server-sig-algs': {
              const algs = data.latin1Slice(0, data.length).split(',');
              exts.push({ name, algs });
              continue;
            }
            default:
              continue;
          }
        }
        // Malformed
        exts = undefined;
        break;
      }
    }
    bufferParser.clear();

    if (exts === undefined) return doFatalError(self, 'Inbound: Malformed EXT_INFO packet');

    if (self._debug) {
      self._debug('Inbound: Received EXT_INFO');
    }

    const handler = self._handlers.EXT_INFO;
    if (handler) {
      handler(self, exts);
    }

    return undefined;
  },

  // User auth protocol -- generic =============================================
  [MESSAGE.USERAUTH_REQUEST]: (self, payload) => {
    /*
      byte      SSH_MSG_USERAUTH_REQUEST
      string    user name in ISO-10646 UTF-8 encoding [RFC3629]
      string    service name in US-ASCII
      string    method name in US-ASCII
      ....      method specific fields
    */
    bufferParser.init(payload, 1);
    const user = bufferParser.readString(true);
    const service = bufferParser.readString(true);
    const method = bufferParser.readString(true);
    let methodData;
    let methodDesc;
    switch (method) {
      case 'none':
        methodData = null;
        break;
      case 'password': {
        /*
          boolean   <new password follows (old) plaintext password?>
          string    plaintext password in ISO-10646 UTF-8 encoding [RFC3629]
         [string    new password]
        */
        const isChange = bufferParser.readBool();
        if (isChange !== undefined) {
          methodData = bufferParser.readString(true);
          if (methodData !== undefined && isChange) {
            const newPassword = bufferParser.readString(true);
            if (newPassword !== undefined) methodData = { oldPassword: methodData, newPassword };
            else methodData = undefined;
          }
        }
        break;
      }
      case 'publickey': {
        /*
          boolean   <signature follows public key blob?>
          string    public key algorithm name
          string    public key blob
         [string    signature]
        */
        const hasSig = bufferParser.readBool();
        if (hasSig !== undefined) {
          const keyAlgo = bufferParser.readString(true);
          let realKeyAlgo = keyAlgo;
          const key = bufferParser.readString();

          let hashAlgo;
          switch (keyAlgo) {
            case 'rsa-sha2-256':
              realKeyAlgo = 'ssh-rsa';
              hashAlgo = 'sha256';
              break;
            case 'rsa-sha2-512':
              realKeyAlgo = 'ssh-rsa';
              hashAlgo = 'sha512';
              break;

            default:
              break;
          }

          if (hasSig) {
            const blobEnd = bufferParser.pos();
            let signature = bufferParser.readString();
            if (signature !== undefined) {
              if (signature.length > 4 + keyAlgo.length + 4 && signature.utf8Slice(4, 4 + keyAlgo.length) === keyAlgo) {
                // Skip algoLen + algo + sigLen
                signature = bufferSlice(signature, 4 + keyAlgo.length + 4);
              }

              signature = signatureToNative(signature, realKeyAlgo);
              if (signature) {
                const sessionID = self._kex.sessionID;
                const blob = Buffer.allocUnsafe(4 + sessionID.length + blobEnd);
                writeUInt32BE(blob, sessionID.length, 0);
                blob.set(sessionID, 4);
                blob.set(new Uint8Array(payload.buffer, payload.byteOffset, blobEnd), 4 + sessionID.length);
                methodData = {
                  keyAlgo: realKeyAlgo,
                  key,
                  signature,
                  blob,
                  hashAlgo,
                };
              }
            }
          } else {
            methodData = { keyAlgo: realKeyAlgo, key, hashAlgo };
            methodDesc = 'publickey -- check';
          }
        }
        break;
      }
      case 'hostbased': {
        /*
          string    public key algorithm for host key
          string    public host key and certificates for client host
          string    client host name expressed as the FQDN in US-ASCII
          string    user name on the client host in ISO-10646 UTF-8 encoding
                     [RFC3629]
          string    signature
        */
        const keyAlgo = bufferParser.readString(true);
        let realKeyAlgo = keyAlgo;
        const key = bufferParser.readString();
        const localHostname = bufferParser.readString(true);
        const localUsername = bufferParser.readString(true);

        let hashAlgo;
        switch (keyAlgo) {
          case 'rsa-sha2-256':
            realKeyAlgo = 'ssh-rsa';
            hashAlgo = 'sha256';
            break;
          case 'rsa-sha2-512':
            realKeyAlgo = 'ssh-rsa';
            hashAlgo = 'sha512';
            break;

          default:
            break;
        }

        const blobEnd = bufferParser.pos();
        let signature = bufferParser.readString();
        if (signature !== undefined) {
          if (signature.length > 4 + keyAlgo.length + 4 && signature.utf8Slice(4, 4 + keyAlgo.length) === keyAlgo) {
            // Skip algoLen + algo + sigLen
            signature = bufferSlice(signature, 4 + keyAlgo.length + 4);
          }

          signature = signatureToNative(signature, realKeyAlgo);
          if (signature !== undefined) {
            const sessionID = self._kex.sessionID;
            const blob = Buffer.allocUnsafe(4 + sessionID.length + blobEnd);
            writeUInt32BE(blob, sessionID.length, 0);
            blob.set(sessionID, 4);
            blob.set(new Uint8Array(payload.buffer, payload.byteOffset, blobEnd), 4 + sessionID.length);
            methodData = {
              keyAlgo: realKeyAlgo,
              key,
              signature,
              blob,
              localHostname,
              localUsername,
              hashAlgo,
            };
          }
        }
        break;
      }
      case 'keyboard-interactive':
        /*
          string    language tag (as defined in [RFC-3066])
          string    submethods (ISO-10646 UTF-8)
        */
        // Skip/ignore language field -- it's deprecated in RFC 4256
        bufferParser.skipString();

        methodData = bufferParser.readList();
        break;
      default:
        if (method !== undefined) methodData = bufferParser.readRaw();
    }
    bufferParser.clear();

    if (methodData === undefined) {
      return doFatalError(self, 'Inbound: Malformed USERAUTH_REQUEST packet');
    }

    if (methodDesc === undefined) methodDesc = method;

    self._authsQueue.push(method);

    if (self._debug) {
      self._debug(`Inbound: Received USERAUTH_REQUEST (${methodDesc})`);
    }

    const handler = self._handlers.USERAUTH_REQUEST;
    if (handler) {
      handler(self, user, service, method, methodData);
    }

    return undefined;
  },
  [MESSAGE.USERAUTH_FAILURE]: (self, payload) => {
    // S->C
    /*
      byte         SSH_MSG_USERAUTH_FAILURE
      name-list    authentications that can continue
      boolean      partial success
    */
    bufferParser.init(payload, 1);
    const authMethods = bufferParser.readList();
    const partialSuccess = bufferParser.readBool();
    bufferParser.clear();

    if (partialSuccess === undefined) {
      return doFatalError(self, 'Inbound: Malformed USERAUTH_FAILURE packet');
    }

    if (self._debug) {
      self._debug(`Inbound: Received USERAUTH_FAILURE (${authMethods})`);
    }

    self._authsQueue.shift();
    const handler = self._handlers.USERAUTH_FAILURE;
    if (handler) {
      handler(self, authMethods, partialSuccess);
    }

    return undefined;
  },
  [MESSAGE.USERAUTH_SUCCESS]: (self, payload) => {
    // S->C
    /*
      byte      SSH_MSG_USERAUTH_SUCCESS
    */
    if (self._debug) {
      self._debug('Inbound: Received USERAUTH_SUCCESS');
    }

    self._authsQueue.shift();
    const handler = self._handlers.USERAUTH_SUCCESS;
    if (handler) {
      handler(self);
    }
  },
  [MESSAGE.USERAUTH_BANNER]: (self, payload) => {
    // S->C
    /*
      byte      SSH_MSG_USERAUTH_BANNER
      string    message in ISO-10646 UTF-8 encoding [RFC3629]
      string    language tag [RFC3066]
    */
    bufferParser.init(payload, 1);
    const msg = bufferParser.readString(true);
    const lang = bufferParser.readString();
    bufferParser.clear();

    if (lang === undefined) {
      return doFatalError(self, 'Inbound: Malformed USERAUTH_BANNER packet');
    }

    if (self._debug) {
      self._debug('Inbound: Received USERAUTH_BANNER');
    }

    const handler = self._handlers.USERAUTH_BANNER;
    if (handler) {
      handler(self, msg);
    }

    return undefined;
  },

  // User auth protocol -- method-specific =====================================
  60: (self, payload) => {
    if (!self._authsQueue.length) {
      if (self._debug) {
        self._debug('Inbound: Received payload type 60 without auth');
      }
      return undefined;
    }

    switch (self._authsQueue[0]) {
      case 'password': {
        // S->C
        /*
          byte      SSH_MSG_USERAUTH_PASSWD_CHANGEREQ
          string    prompt in ISO-10646 UTF-8 encoding [RFC3629]
          string    language tag [RFC3066]
        */
        bufferParser.init(payload, 1);
        const prompt = bufferParser.readString(true);
        const lang = bufferParser.readString();
        bufferParser.clear();

        if (lang === undefined) {
          return doFatalError(self, 'Inbound: Malformed USERAUTH_PASSWD_CHANGEREQ packet');
        }

        if (self._debug) {
          self._debug('Inbound: Received USERAUTH_PASSWD_CHANGEREQ');
        }

        const handler = self._handlers.USERAUTH_PASSWD_CHANGEREQ;
        if (handler) {
          handler(self, prompt);
        }
        break;
      }
      case 'publickey': {
        // S->C
        /*
          byte      SSH_MSG_USERAUTH_PK_OK
          string    public key algorithm name from the request
          string    public key blob from the request
        */
        bufferParser.init(payload, 1);
        const keyAlgo = bufferParser.readString(true);
        const key = bufferParser.readString();
        bufferParser.clear();

        if (key === undefined) {
          return doFatalError(self, 'Inbound: Malformed USERAUTH_PK_OK packet');
        }

        if (self._debug) {
          self._debug('Inbound: Received USERAUTH_PK_OK');
        }

        self._authsQueue.shift();
        const handler = self._handlers.USERAUTH_PK_OK;
        if (handler) {
          handler(self, keyAlgo, key);
        }
        break;
      }
      case 'keyboard-interactive': {
        // S->C
        /*
          byte      SSH_MSG_USERAUTH_INFO_REQUEST
          string    name (ISO-10646 UTF-8)
          string    instruction (ISO-10646 UTF-8)
          string    language tag (as defined in [RFC-3066])
          int       num-prompts
          string    prompt[1] (ISO-10646 UTF-8)
          boolean   echo[1]
          ...
          string    prompt[num-prompts] (ISO-10646 UTF-8)
          boolean   echo[num-prompts]
        */
        bufferParser.init(payload, 1);
        const name = bufferParser.readString(true);
        const instructions = bufferParser.readString(true);
        bufferParser.readString(); // skip lang
        const numPrompts = bufferParser.readUInt32BE();
        let prompts;
        if (numPrompts !== undefined) {
          prompts = new Array(numPrompts);
          let i;
          for (i = 0; i < numPrompts; ++i) {
            const prompt = bufferParser.readString(true);
            const echo = bufferParser.readBool();
            if (echo === undefined) break;
            prompts[i] = { prompt, echo };
          }
          if (i !== numPrompts) prompts = undefined;
        }
        bufferParser.clear();

        if (prompts === undefined) {
          return doFatalError(self, 'Inbound: Malformed USERAUTH_INFO_REQUEST packet');
        }

        if (self._debug) {
          self._debug('Inbound: Received USERAUTH_INFO_REQUEST');
        }

        const handler = self._handlers.USERAUTH_INFO_REQUEST;
        if (handler) {
          handler(self, name, instructions, prompts);
        }
        break;
      }
      default:
        if (self._debug) {
          self._debug('Inbound: Received unexpected payload type 60');
        }
    }

    return undefined;
  },
  61: (self, payload) => {
    if (!self._authsQueue.length) {
      if (self._debug) {
        self._debug('Inbound: Received payload type 61 without auth');
      }
      return undefined;
    }
    /*
      byte      SSH_MSG_USERAUTH_INFO_RESPONSE
      int       num-responses
      string    response[1] (ISO-10646 UTF-8)
      ...
      string    response[num-responses] (ISO-10646 UTF-8)
    */
    if (self._authsQueue[0] !== 'keyboard-interactive') {
      return doFatalError(self, 'Inbound: Received unexpected payload type 61');
    }
    bufferParser.init(payload, 1);
    const numResponses = bufferParser.readUInt32BE();
    let responses;
    if (numResponses !== undefined) {
      responses = new Array(numResponses);
      let i;
      for (i = 0; i < numResponses; ++i) {
        const response = bufferParser.readString(true);
        if (response === undefined) break;
        responses[i] = response;
      }
      if (i !== numResponses) responses = undefined;
    }
    bufferParser.clear();

    if (responses === undefined) {
      return doFatalError(self, 'Inbound: Malformed USERAUTH_INFO_RESPONSE packet');
    }

    if (self._debug) {
      self._debug('Inbound: Received USERAUTH_INFO_RESPONSE');
    }

    const handler = self._handlers.USERAUTH_INFO_RESPONSE;
    if (handler) {
      handler(self, responses);
    }

    return undefined;
  },

  // Connection protocol -- generic ============================================
  [MESSAGE.GLOBAL_REQUEST]: (self, payload) => {
    /*
      byte      SSH_MSG_GLOBAL_REQUEST
      string    request name in US-ASCII only
      boolean   want reply
      ....      request-specific data follows
    */
    bufferParser.init(payload, 1);
    const name = bufferParser.readString(true);
    const wantReply = bufferParser.readBool();
    let data;
    if (wantReply !== undefined) {
      switch (name) {
        case 'tcpip-forward':
        case 'cancel-tcpip-forward': {
          /*
            string    address to bind (e.g., "0.0.0.0")
            uint32    port number to bind
          */
          const bindAddr = bufferParser.readString(true);
          const bindPort = bufferParser.readUInt32BE();
          if (bindPort !== undefined) data = { bindAddr, bindPort };
          break;
        }
        case 'streamlocal-forward@openssh.com':
        case 'cancel-streamlocal-forward@openssh.com': {
          /*
            string    socket path
          */
          const socketPath = bufferParser.readString(true);
          if (socketPath !== undefined) data = { socketPath };
          break;
        }
        case 'no-more-sessions@openssh.com':
          data = null;
          break;
        case 'hostkeys-00@openssh.com': {
          data = [];
          while (bufferParser.avail() > 0) {
            const keyRaw = bufferParser.readString();
            if (keyRaw === undefined) {
              data = undefined;
              break;
            }
            const key = parseKey(keyRaw);
            if (!(key instanceof Error)) data.push(key);
          }
          break;
        }
        default:
          data = bufferParser.readRaw();
      }
    }
    bufferParser.clear();

    if (data === undefined) {
      return doFatalError(self, 'Inbound: Malformed GLOBAL_REQUEST packet');
    }

    if (self._debug) {
      self._debug(`Inbound: GLOBAL_REQUEST (${name})`);
    }

    const handler = self._handlers.GLOBAL_REQUEST;
    if (handler) handler(self, name, wantReply, data);
    else self.requestFailure(); // Auto reject

    return undefined;
  },
  [MESSAGE.REQUEST_SUCCESS]: (self, payload) => {
    /*
      byte      SSH_MSG_REQUEST_SUCCESS
      ....     response specific data
    */
    const data = payload.length > 1 ? bufferSlice(payload, 1) : null;

    if (self._debug) {
      self._debug('Inbound: REQUEST_SUCCESS');
    }

    const handler = self._handlers.REQUEST_SUCCESS;
    if (handler) {
      handler(self, data);
    }
  },
  [MESSAGE.REQUEST_FAILURE]: (self, payload) => {
    /*
      byte      SSH_MSG_REQUEST_FAILURE
    */
    if (self._debug) {
      self._debug('Inbound: Received REQUEST_FAILURE');
    }

    const handler = self._handlers.REQUEST_FAILURE;
    if (handler) {
      handler(self);
    }
  },

  // Connection protocol -- channel-related ====================================
  [MESSAGE.CHANNEL_OPEN]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_OPEN
      string    channel type in US-ASCII only
      uint32    sender channel
      uint32    initial window size
      uint32    maximum packet size
      ....      channel type specific data follows
    */
    bufferParser.init(payload, 1);
    const type = bufferParser.readString(true);
    const sender = bufferParser.readUInt32BE();
    const window = bufferParser.readUInt32BE();
    const packetSize = bufferParser.readUInt32BE();
    if (packetSize === 0) {
      bufferParser.clear();
      return doFatalError(self, 'Inbound: Invalid CHANNEL_OPEN packet size');
    }
    let channelInfo;

    switch (type) {
      case 'forwarded-tcpip': // S->C
      case 'direct-tcpip': {
        // C->S
        /*
          string    address that was connected / host to connect
          uint32    port that was connected / port to connect
          string    originator IP address
          uint32    originator port
        */
        const destIP = bufferParser.readString(true);
        const destPort = bufferParser.readUInt32BE();
        const srcIP = bufferParser.readString(true);
        const srcPort = bufferParser.readUInt32BE();
        if (srcPort !== undefined) {
          channelInfo = {
            type,
            sender,
            window,
            packetSize,
            data: { destIP, destPort, srcIP, srcPort },
          };
        }
        break;
      }
      case 'forwarded-streamlocal@openssh.com': // S->C
      case 'direct-streamlocal@openssh.com': {
        // C->S
        /*
          string    socket path
          string    reserved for future use

          (direct-streamlocal@openssh.com additionally has:)
          uint32    reserved
        */
        const socketPath = bufferParser.readString(true);
        if (socketPath !== undefined) {
          channelInfo = {
            type,
            sender,
            window,
            packetSize,
            data: { socketPath },
          };
        }
        break;
      }
      case 'x11': {
        // S->C
        /*
          string    originator address (e.g., "192.168.7.38")
          uint32    originator port
        */
        const srcIP = bufferParser.readString(true);
        const srcPort = bufferParser.readUInt32BE();
        if (srcPort !== undefined) {
          channelInfo = {
            type,
            sender,
            window,
            packetSize,
            data: { srcIP, srcPort },
          };
        }
        break;
      }
      default:
        // Includes:
        //   'session' (C->S)
        //   'auth-agent@openssh.com' (S->C)
        channelInfo = {
          type,
          sender,
          window,
          packetSize,
          data: {},
        };
    }
    bufferParser.clear();

    if (channelInfo === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_OPEN packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_OPEN (s:${sender}, ${type})`);
    }

    const handler = self._handlers.CHANNEL_OPEN;
    if (handler) {
      handler(self, channelInfo);
    } else {
      self.channelOpenFail(channelInfo.sender, CHANNEL_OPEN_FAILURE.ADMINISTRATIVELY_PROHIBITED, '', '');
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_OPEN_CONFIRMATION]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_OPEN_CONFIRMATION
      uint32    recipient channel
      uint32    sender channel
      uint32    initial window size
      uint32    maximum packet size
      ....      channel type specific data follows
    */
    // "The 'recipient channel' is the channel number given in the
    // original open request, and 'sender channel' is the channel number
    // allocated by the other side."
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const sender = bufferParser.readUInt32BE();
    const window = bufferParser.readUInt32BE();
    const packetSize = bufferParser.readUInt32BE();
    const data = bufferParser.avail() ? bufferParser.readRaw() : undefined;
    bufferParser.clear();

    if (packetSize === undefined || packetSize === 0) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_OPEN_CONFIRMATION packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_OPEN_CONFIRMATION (r:${recipient}, s:${sender})`);
    }

    const handler = self._handlers.CHANNEL_OPEN_CONFIRMATION;
    if (handler) handler(self, { recipient, sender, window, packetSize, data });

    return undefined;
  },
  [MESSAGE.CHANNEL_OPEN_FAILURE]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_OPEN_FAILURE
      uint32    recipient channel
      uint32    reason code
      string    description in ISO-10646 UTF-8 encoding [RFC3629]
      string    language tag [RFC3066]
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const reason = bufferParser.readUInt32BE();
    const description = bufferParser.readString(true);
    const lang = bufferParser.readString();
    bufferParser.clear();

    if (lang === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_OPEN_FAILURE packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_OPEN_FAILURE (r:${recipient})`);
    }

    const handler = self._handlers.CHANNEL_OPEN_FAILURE;
    if (handler) {
      handler(self, recipient, reason, description);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_WINDOW_ADJUST]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_WINDOW_ADJUST
      uint32    recipient channel
      uint32    bytes to add
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const bytesToAdd = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (bytesToAdd === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_WINDOW_ADJUST packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_WINDOW_ADJUST (r:${recipient}, ${bytesToAdd})`);
    }

    const handler = self._handlers.CHANNEL_WINDOW_ADJUST;
    if (handler) {
      handler(self, recipient, bytesToAdd);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_DATA]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_DATA
      uint32    recipient channel
      string    data
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const data = bufferParser.readString();
    bufferParser.clear();

    if (data === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_DATA packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_DATA (r:${recipient}, ${data.length})`);
    }

    const handler = self._handlers.CHANNEL_DATA;
    if (handler) {
      handler(self, recipient, data);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_EXTENDED_DATA]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_EXTENDED_DATA
      uint32    recipient channel
      uint32    data_type_code
      string    data
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const type = bufferParser.readUInt32BE();
    const data = bufferParser.readString();
    bufferParser.clear();

    if (data === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_EXTENDED_DATA packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_EXTENDED_DATA (r:${recipient}, ${data.length})`);
    }

    const handler = self._handlers.CHANNEL_EXTENDED_DATA;
    if (handler) {
      handler(self, recipient, data, type);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_EOF]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_EOF
      uint32    recipient channel
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (recipient === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_EOF packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_EOF (r:${recipient})`);
    }

    const handler = self._handlers.CHANNEL_EOF;
    if (handler) {
      handler(self, recipient);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_CLOSE]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_CLOSE
      uint32    recipient channel
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (recipient === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_CLOSE packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_CLOSE (r:${recipient})`);
    }

    const handler = self._handlers.CHANNEL_CLOSE;
    if (handler) {
      handler(self, recipient);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_REQUEST]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_REQUEST
      uint32    recipient channel
      string    request type in US-ASCII characters only
      boolean   want reply
      ....      type-specific data follows
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    const type = bufferParser.readString(true);
    const wantReply = bufferParser.readBool();
    let data;
    if (wantReply !== undefined) {
      switch (type) {
        case 'exit-status': // S->C
          /*
            uint32    exit_status
          */
          data = bufferParser.readUInt32BE();
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${data})`);
          }
          break;
        case 'exit-signal': {
          // S->C
          /*
            string    signal name (without the "SIG" prefix)
            boolean   core dumped
            string    error message in ISO-10646 UTF-8 encoding
            string    language tag
          */
          let signal;
          let coreDumped;
          signal = bufferParser.readString(true);
          coreDumped = bufferParser.readBool();
          if (coreDumped === undefined) signal = undefined;
          const errorMessage = bufferParser.readString(true);
          if (bufferParser.skipString() !== undefined) data = { signal, coreDumped, errorMessage };
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${signal})`);
          }
          break;
        }
        case 'pty-req': {
          // C->S
          /*
            string    TERM environment variable value (e.g., vt100)
            uint32    terminal width, characters (e.g., 80)
            uint32    terminal height, rows (e.g., 24)
            uint32    terminal width, pixels (e.g., 640)
            uint32    terminal height, pixels (e.g., 480)
            string    encoded terminal modes
          */
          const term = bufferParser.readString(true);
          const cols = bufferParser.readUInt32BE();
          const rows = bufferParser.readUInt32BE();
          const width = bufferParser.readUInt32BE();
          const height = bufferParser.readUInt32BE();
          const modesBinary = bufferParser.readString();
          if (modesBinary !== undefined) {
            bufferParser.init(modesBinary, 1);
            let modes = {};
            while (bufferParser.avail()) {
              const opcode = bufferParser.readByte();
              if (opcode === TERMINAL_MODE.TTY_OP_END) break;
              const name = TERMINAL_MODE_BY_VALUE[opcode];
              const value = bufferParser.readUInt32BE();
              if (opcode === undefined || name === undefined || value === undefined) {
                modes = undefined;
                break;
              }
              modes[name] = value;
            }
            if (modes !== undefined) data = { term, cols, rows, width, height, modes };
          }
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
          break;
        }
        case 'window-change': {
          // C->S
          /*
            uint32    terminal width, columns
            uint32    terminal height, rows
            uint32    terminal width, pixels
            uint32    terminal height, pixels
          */
          const cols = bufferParser.readUInt32BE();
          const rows = bufferParser.readUInt32BE();
          const width = bufferParser.readUInt32BE();
          const height = bufferParser.readUInt32BE();
          if (height !== undefined) data = { cols, rows, width, height };
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
          break;
        }
        case 'x11-req': {
          // C->S
          /*
            boolean   single connection
            string    x11 authentication protocol
            string    x11 authentication cookie
            uint32    x11 screen number
          */
          const single = bufferParser.readBool();
          const protocol = bufferParser.readString(true);
          const cookie = bufferParser.readString();
          const screen = bufferParser.readUInt32BE();
          if (screen !== undefined) data = { single, protocol, cookie, screen };
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
          break;
        }
        case 'env': {
          // C->S
          /*
            string    variable name
            string    variable value
          */
          const name = bufferParser.readString(true);
          const value = bufferParser.readString(true);
          if (value !== undefined) data = { name, value };
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ` + `${name}=${value})`);
          }
          break;
        }
        case 'shell': // C->S
          data = null; // No extra data
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
          break;
        case 'exec': // C->S
          /*
            string    command
          */
          data = bufferParser.readString(true);
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${data})`);
          }
          break;
        case 'subsystem': // C->S
          /*
            string    subsystem name
          */
          data = bufferParser.readString(true);
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${data})`);
          }
          break;
        case 'signal': // C->S
          /*
            string    signal name (without the "SIG" prefix)
          */
          data = bufferParser.readString(true);
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${data})`);
          }
          break;
        case 'xon-xoff': // C->S
          /*
            boolean   client can do
          */
          data = bufferParser.readBool();
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type}: ${data})`);
          }
          break;
        case 'auth-agent-req@openssh.com': // C-S
          data = null; // No extra data
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
          break;
        default:
          data = bufferParser.avail() ? bufferParser.readRaw() : null;
          if (self._debug) {
            self._debug(`Inbound: CHANNEL_REQUEST (r:${recipient}, ${type})`);
          }
      }
    }
    bufferParser.clear();

    if (data === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_REQUEST packet');
    }

    const handler = self._handlers.CHANNEL_REQUEST;
    if (handler) {
      handler(self, recipient, type, wantReply, data);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_SUCCESS]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_SUCCESS
      uint32    recipient channel
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (recipient === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_SUCCESS packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_SUCCESS (r:${recipient})`);
    }

    const handler = self._handlers.CHANNEL_SUCCESS;
    if (handler) {
      handler(self, recipient);
    }

    return undefined;
  },
  [MESSAGE.CHANNEL_FAILURE]: (self, payload) => {
    /*
      byte      SSH_MSG_CHANNEL_FAILURE
      uint32    recipient channel
    */
    bufferParser.init(payload, 1);
    const recipient = bufferParser.readUInt32BE();
    bufferParser.clear();

    if (recipient === undefined) {
      return doFatalError(self, 'Inbound: Malformed CHANNEL_FAILURE packet');
    }

    if (self._debug) {
      self._debug(`Inbound: CHANNEL_FAILURE (r:${recipient})`);
    }

    const handler = self._handlers.CHANNEL_FAILURE;
    if (handler) {
      handler(self, recipient);
    }

    return undefined;
  },
};
