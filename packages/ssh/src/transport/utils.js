// Adapted from ssh2 1.17.0. Copyright Brian White. MIT; see package LICENSE and PROVENANCE.json.

import { SFTP } from './protocol/SFTP.js';

const MAX_CHANNEL = 2 ** 32 - 1;

function onChannelOpenFailure(self, recipient, info, cb) {
  self._chanMgr.remove(recipient);
  if (typeof cb !== 'function') return;

  let err;
  if (info instanceof Error) {
    err = info;
  } else if (typeof info === 'object' && info !== null) {
    err = new Error(`(SSH) Channel open failure: ${info.description}`);
    err.reason = info.reason;
  } else {
    err = new Error('(SSH) Channel open failure: server closed channel unexpectedly');
    err.reason = '';
  }

  cb(err);
}

function onCHANNEL_CLOSE(self, recipient, channel, err, dead) {
  if (typeof channel === 'function') {
    // We got CHANNEL_CLOSE instead of CHANNEL_OPEN_FAILURE when
    // requesting to open a channel
    onChannelOpenFailure(self, recipient, err, channel);
    return;
  }

  if (typeof channel !== 'object' || channel === null) return;

  if (channel.incoming && channel.incoming.state === 'closed') return;

  self._chanMgr.remove(recipient);

  if (channel.server && channel.constructor.name === 'Session') return;

  channel.incoming.state = 'closed';
  if (dead) channel.outgoing.state = 'closed';

  const interruptedWrite = channel.constructor !== SFTP && !!(channel._chunkcb || channel._chunkcbErr);

  // A peer may close while a write is waiting for window credit. Release the
  // retained buffers and settle each pending callback exactly once. Defer the
  // callbacks so application code cannot interrupt cleanup of other channels.
  if (channel.constructor === SFTP) {
    // SFTP's _chunkcb is an internal drain method, not a user write callback.
    // Its request callbacks are settled by push(null) below.
    channel._buffer = [];
    channel._chunkcb = undefined;
    channel._waitWindow = false;
  } else if (channel._chunkcb || channel._chunkcbErr) {
    const writeError = err || new Error('SSH channel closed before buffered write completed');
    if (!writeError.code) writeError.code = 'ERR_STREAM_PREMATURE_CLOSE';
    const pending = [channel._chunkcb, channel._chunkcbErr];
    channel._chunkcb = channel._chunkcbErr = null;
    channel._chunk = channel._chunkErr = null;
    channel._waitWindow = false;
    for (const callback of pending) {
      if (typeof callback === 'function') process.nextTick(callback, writeError);
    }
  }

  if (channel.readable) channel.push(null);
  if (channel.server) {
    if (channel.stderr.writable) channel.stderr.end();
  } else if (channel.stderr.readable) {
    channel.stderr.push(null);
  }

  if ((channel.outgoing.state === 'open' || channel.outgoing.state === 'eof') && !dead) {
    // SFTP.close() closes a file handle; destroy() acknowledges CHANNEL_CLOSE.
    if (channel.constructor === SFTP) channel.destroy();
    else channel.close();
  }
  if (channel.outgoing.state === 'closing') channel.outgoing.state = 'closed';

  const readState = channel._readableState;
  const writeState = channel._writableState;
  if (writeState && !writeState.ending && !writeState.finished && !dead) channel.end();

  // Take care of any outstanding channel requests
  const chanCallbacks = channel._callbacks;
  channel._callbacks = [];
  for (let i = 0; i < chanCallbacks.length; ++i) chanCallbacks[i](true);

  if (channel.server) {
    if (dead || interruptedWrite) {
      process.nextTick(() => channel.emit('close'));
    } else if (!channel.readable || channel.destroyed || (readState && readState.endEmitted)) {
      channel.emit('close');
    } else {
      channel.once('end', () => channel.emit('close'));
    }
  } else {
    let doClose;
    switch (channel.type) {
      case 'direct-streamlocal@openssh.com':
      case 'direct-tcpip':
        doClose = () => channel.emit('close');
        break;
      default: {
        // Align more with node child processes, where the close event gets
        // the same arguments as the exit event
        const exit = channel._exit;
        doClose = () => {
          if (exit.code === null) channel.emit('close', exit.code, exit.signal, exit.dump, exit.desc);
          else channel.emit('close', exit.code);
        };
      }
    }
    // A failed buffered write destroys Node's readable side before its end
    // event. The remote CLOSE still owns a terminal notification.
    if (dead || interruptedWrite) {
      process.nextTick(doClose);
    } else if (!channel.readable || channel.destroyed || (readState && readState.endEmitted)) {
      doClose();
    } else {
      channel.once('end', doClose);
    }

    const errReadState = channel.stderr._readableState;
    if (!channel.stderr.readable || channel.stderr.destroyed || (errReadState && errReadState.endEmitted)) {
      channel.stderr.emit('close');
    } else {
      channel.stderr.once('end', () => channel.stderr.emit('close'));
    }
  }
}

class ChannelManager {
  constructor(client) {
    this._client = client;
    this._channels = {};
    this._cur = -1;
    this._count = 0;
  }
  add(val) {
    // Attempt to reserve an id

    let id;
    // Optimized paths
    if (this._cur < MAX_CHANNEL) {
      id = ++this._cur;
    } else if (this._count === 0) {
      // Revert and reset back to fast path once we no longer have any channels
      // open
      this._cur = 0;
      id = 0;
    } else {
      // Slower lookup path

      // This path is triggered we have opened at least MAX_CHANNEL channels
      // while having at least one channel open at any given time, so we have
      // to search for a free id.
      const channels = this._channels;
      for (let i = 0; i < MAX_CHANNEL; ++i) {
        if (channels[i] === undefined) {
          id = i;
          break;
        }
      }
    }

    if (id === undefined) return -1;

    this._channels[id] = val || true;
    ++this._count;

    return id;
  }
  update(id, val) {
    if (typeof id !== 'number' || id < 0 || id >= MAX_CHANNEL || !isFinite(id))
      throw new Error(`Invalid channel id: ${id}`);

    if (val && this._channels[id]) this._channels[id] = val;
  }
  get(id) {
    if (typeof id !== 'number' || id < 0 || id >= MAX_CHANNEL || !isFinite(id))
      throw new Error(`Invalid channel id: ${id}`);

    return this._channels[id];
  }
  remove(id) {
    if (typeof id !== 'number' || id < 0 || id >= MAX_CHANNEL || !isFinite(id))
      throw new Error(`Invalid channel id: ${id}`);

    if (this._channels[id]) {
      delete this._channels[id];
      if (this._count) --this._count;
    }
  }
  cleanup(err) {
    const channels = this._channels;
    this._channels = {};
    this._cur = -1;
    this._count = 0;

    const chanIDs = Object.keys(channels);
    const client = this._client;
    for (let i = 0; i < chanIDs.length; ++i) {
      const id = +chanIDs[i];
      const channel = channels[id];
      onCHANNEL_CLOSE(client, id, channel._channel || channel, err, true);
    }
  }
}

const isRegExp = (() => {
  const toString = Object.prototype.toString;
  return (val) => toString.call(val) === '[object RegExp]';
})();

function generateAlgorithmList(algoList, defaultList, supportedList) {
  if (Array.isArray(algoList) && algoList.length > 0) {
    // Exact list
    for (let i = 0; i < algoList.length; ++i) {
      if (supportedList.indexOf(algoList[i]) === -1) throw new Error(`Unsupported algorithm: ${algoList[i]}`);
    }
    return algoList;
  }

  if (typeof algoList === 'object' && algoList !== null) {
    // Operations based on the default list
    const keys = Object.keys(algoList);
    let list = defaultList;
    for (let i = 0; i < keys.length; ++i) {
      const key = keys[i];
      let val = algoList[key];
      switch (key) {
        case 'append':
          if (!Array.isArray(val)) val = [val];
          if (Array.isArray(val)) {
            for (let j = 0; j < val.length; ++j) {
              const append = val[j];
              if (typeof append === 'string') {
                if (!append || list.indexOf(append) !== -1) continue;
                if (supportedList.indexOf(append) === -1) throw new Error(`Unsupported algorithm: ${append}`);
                if (list === defaultList) list = list.slice();
                list.push(append);
              } else if (isRegExp(append)) {
                for (let k = 0; k < supportedList.length; ++k) {
                  const algo = supportedList[k];
                  if (append.test(algo)) {
                    if (list.indexOf(algo) !== -1) continue;
                    if (list === defaultList) list = list.slice();
                    list.push(algo);
                  }
                }
              }
            }
          }
          break;
        case 'prepend':
          if (!Array.isArray(val)) val = [val];
          if (Array.isArray(val)) {
            for (let j = val.length; j >= 0; --j) {
              const prepend = val[j];
              if (typeof prepend === 'string') {
                if (!prepend || list.indexOf(prepend) !== -1) continue;
                if (supportedList.indexOf(prepend) === -1) throw new Error(`Unsupported algorithm: ${prepend}`);
                if (list === defaultList) list = list.slice();
                list.unshift(prepend);
              } else if (isRegExp(prepend)) {
                for (let k = supportedList.length; k >= 0; --k) {
                  const algo = supportedList[k];
                  if (prepend.test(algo)) {
                    if (list.indexOf(algo) !== -1) continue;
                    if (list === defaultList) list = list.slice();
                    list.unshift(algo);
                  }
                }
              }
            }
          }
          break;
        case 'remove':
          if (!Array.isArray(val)) val = [val];
          if (Array.isArray(val)) {
            for (let j = 0; j < val.length; ++j) {
              const search = val[j];
              if (typeof search === 'string') {
                if (!search) continue;
                const idx = list.indexOf(search);
                if (idx === -1) continue;
                if (list === defaultList) list = list.slice();
                list.splice(idx, 1);
              } else if (isRegExp(search)) {
                for (let k = 0; k < list.length; ++k) {
                  if (search.test(list[k])) {
                    if (list === defaultList) list = list.slice();
                    list.splice(k, 1);
                    --k;
                  }
                }
              }
            }
          }
          break;

        default:
          break;
      }
    }

    return list;
  }

  return defaultList;
}

export { ChannelManager };
export { generateAlgorithmList };
export { onChannelOpenFailure };
export { onCHANNEL_CLOSE };
export const isWritable = (stream) =>
  // XXX: hack to workaround regression in node
  // See: https://github.com/nodejs/node/issues/36029
  stream && stream.writable && stream._readableState && stream._readableState.ended === false;
