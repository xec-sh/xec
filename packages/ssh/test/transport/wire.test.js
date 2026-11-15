import test from 'node:test';
import { once } from 'node:events';
import { Duplex } from 'node:stream';
import assert from 'node:assert/strict';
import { finished } from 'node:stream/promises';

import { connection } from './peer.js';
import Client from '../../src/transport/client.js';
import { sendPacket } from '../../src/transport/protocol/utils.js';
import { NullCipher, CIPHER_INFO } from '../../src/transport/protocol/crypto.js';
import {
  DEFAULT_CIPHER,
  DEFAULT_COMPRESSION,
  DEFAULT_SERVER_HOST_KEY,
} from '../../src/transport/protocol/constants.js';

function exec(client, command) {
  return new Promise((resolve, reject) =>
    client.exec(command, (error, channel) => {
      if (error) return reject(error);
      const chunks = [];
      let status;
      channel.on('data', (data) => chunks.push(Buffer.from(data)));
      channel.stderr.resume();
      channel.once('error', reject);
      channel.once('exit', (code) => {
        status = code;
      });
      channel.once('close', () => resolve({ status, data: Buffer.concat(chunks) }));
      channel.end();

      return undefined;
    })
  );
}

test(
  'native AES-GCM interoperates with an independent server over concurrent channels',
  { timeout: 6000 },
  async (t) => {
    const expected = Buffer.alloc(256 * 1024, 0xa5);
    const client = await connection(t, (session) =>
      session.on('exec', (accept) => {
        const channel = accept();
        channel.resume();
        channel.exit(0);
        channel.end(expected);
      })
    );
    const responses = await Promise.all(Array.from({ length: 8 }, (_, n) => exec(client, `synthetic-${n}`)));
    for (const response of responses) {
      assert.equal(response.status, 0);
      assert.deepEqual(response.data, expected);
    }
  }
);

test('rekey preserves queued commands and still validates host identity', { timeout: 6000 }, async (t) => {
  const client = await connection(t, (session) =>
    session.on('exec', (accept, reject, info) => {
      const channel = accept();
      channel.resume();
      channel.exit(0);
      channel.end(info.command);
    })
  );
  const handshake = once(client, 'handshake');
  client._protocol.rekey();
  const responses = await Promise.all([
    exec(client, 'first'),
    exec(client, 'second'),
    handshake.then(() => exec(client, 'third')),
  ]);
  assert.deepEqual(
    responses.map((value) => value.data.toString()),
    ['first', 'second', 'third']
  );
  assert.equal(client._protocol._queue, undefined);
  assert.equal(client._protocol._queueBytes, 0);
});

test('SFTP requests complete on the same modern transport', { timeout: 6000 }, async (t) => {
  const client = await connection(t, (session) =>
    session.on('sftp', (accept) => {
      const sftp = accept();
      sftp.on('REALPATH', (id, path) =>
        sftp.name(id, [
          { filename: path, longname: path, attrs: { mode: 0o40755, uid: 1, gid: 1, size: 0, atime: 0, mtime: 0 } },
        ])
      );
    })
  );
  const sftp = await new Promise((resolve, reject) =>
    client.sftp((error, stream) => (error ? reject(error) : resolve(stream)))
  );
  assert.equal(
    await new Promise((resolve, reject) =>
      sftp.realpath('/synthetic', (error, path) => (error ? reject(error) : resolve(path)))
    ),
    '/synthetic'
  );
  sftp.end();
});

test('receive and send window violations fail before data delivery', () => {
  const client = new Client();
  client.on('error', () => {});
  const stream = new Duplex({
    read() {},
    write(_chunk, _encoding, callback) {
      callback();
    },
  });
  stream.connecting = true;
  client.connect({ sock: stream, username: 'memory-only-fixture', readyTimeout: 0 });
  try {
    const errors = [],
      delivered = [];
    const protocol = {
      disconnect() {},
      _destruct() {},
      _onError(error) {
        errors.push(error);
      },
    };
    const channel = {
      incoming: { window: 10, packetSize: 4 },
      outgoing: { window: 0xffffffff },
      push(data) {
        delivered.push(data);
        return false;
      },
      stderr: {
        push(data) {
          delivered.push(data);
          return false;
        },
      },
    };
    const id = client._chanMgr.add(channel);
    client._protocol._handlers.CHANNEL_DATA(protocol, id, Buffer.alloc(5));
    client._protocol._handlers.CHANNEL_EXTENDED_DATA(protocol, id, Buffer.alloc(11), 1);
    client._protocol._handlers.CHANNEL_WINDOW_ADJUST(protocol, id, 1);
    assert.equal(errors.length, 3);
    assert.deepEqual(delivered, []);
    assert.equal(channel.outgoing.window, 0xffffffff);
    assert.equal(channel.incoming.window, 10);
    client._chanMgr.remove(id);
  } finally {
    stream.destroy();
    client.destroy();
  }
});

test('a stalled key exchange cannot retain an unbounded command queue', () => {
  const errors = [];
  const proto = {
    _kexinit: Buffer.alloc(1),
    _queue: [],
    _queueBytes: 0,
    disconnect() {},
    _destruct() {},
    _onError(error) {
      errors.push(error);
    },
  };
  for (let index = 0; index < 256; index++) assert.equal(sendPacket(proto, Buffer.alloc(1)), false);
  sendPacket(proto, Buffer.alloc(1));
  assert.equal(errors[0].code, 'ERR_SSH_QUEUE_LIMIT');
  assert.equal(proto._queue.length, 256);
});

test('unsupported compression and legacy cryptography are not negotiated', () => {
  assert.deepEqual(DEFAULT_COMPRESSION, ['none']);
  assert.equal(DEFAULT_SERVER_HOST_KEY.includes('ssh-rsa'), false);
  assert.equal(DEFAULT_SERVER_HOST_KEY.includes('ssh-dss'), false);
  assert(DEFAULT_CIPHER.every((name) => /gcm@openssh.com|chacha20-poly1305@openssh.com/.test(name)));
});

test('the byte budget rekeys the live connection before subsequent commands', { timeout: 6000 }, async (t) => {
  const client = await connection(t, (session) =>
    session.on('exec', (accept, reject, info) => {
      const channel = accept();
      channel.resume();
      channel.exit(0);
      channel.end(info.command);
    })
  );
  const previous = client._protocol._cipher;
  previous.lifetime.bytes = 1024 * 1024 * 1024 - 1;
  const handshake = once(client, 'handshake');
  const result = await exec(client, 'budget-trigger');
  await handshake;
  assert.equal(result.data.toString(), 'budget-trigger');
  assert.notEqual(client._protocol._cipher, previous);
  assert.equal((await exec(client, 'after-rekey')).data.toString(), 'after-rekey');
});

test('strict KEX rejects injected pre-exchange packets before authentication', { timeout: 6000 }, async (t) => {
  let authenticated = false;
  await assert.rejects(
    connection(
      t,
      () => {
        authenticated = true;
      },
      {
        expectedFailure: true,
        onAuthentication() {
          authenticated = true;
        },
        mutateServer(server) {
          // Explicit hostile peer: inject an otherwise well-formed IGNORE before
          // the independent implementation's first KEXINIT without advancing its
          // sequence. A strict peer must reject this prefix manipulation.
          server._srv.prependListener('connection', (socket) => {
            const write = socket.write.bind(socket);
            let injected = false;
            socket.write = (data, ...args) => {
              if (!injected && Buffer.isBuffer(data) && data[0] !== 83) {
                injected = true;
                const cipher = new NullCipher(0, (packet) => write(packet));
                const packet = cipher.allocPacket(5);
                packet.set([2, 0, 0, 0, 0], 5);
                cipher.encrypt(packet);
              }
              return write(data, ...args);
            };
          });
        },
      }
    ),
    /strict|KEXINIT|sequence/i
  );
  assert.equal(authenticated, false);
});

if (Object.hasOwn(CIPHER_INFO, 'chacha20-poly1305@openssh.com')) {
  test('native OpenSSH ChaCha interoperates with the independent peer', { timeout: 6000 }, async (t) => {
    const client = await connection(
      t,
      (session) =>
        session.on('exec', (accept) => {
          const channel = accept();
          channel.resume();
          channel.exit(0);
          channel.end('native-chacha');
        }),
      { cipher: 'chacha20-poly1305@openssh.com' }
    );
    assert.equal((await exec(client, 'synthetic')).data.toString(), 'native-chacha');
  });
}

test('SFTP write finish waits for one successful remote CLOSE acknowledgement', { timeout: 6000 }, async (t) => {
  let closeRequest, receiveClose;
  const closeSeen = new Promise((resolve) => {
    receiveClose = resolve;
  });
  let closes = 0,
    writes = 0;
  const client = await connection(t, (session) =>
    session.on('sftp', (accept) => {
      const peer = accept();
      peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
      peer.on('WRITE', (id, _handle, _offset, bytes) => {
        writes += bytes.length;
        peer.status(id, 0);
      });
      peer.on('CLOSE', (id) => {
        closes++;
        closeRequest = () => peer.status(id, 0);
        receiveClose();
      });
    })
  );
  const sftp = await new Promise((resolve, reject) =>
    client.sftp((error, value) => (error ? reject(error) : resolve(value)))
  );
  const stream = sftp.createWriteStream('/synthetic');
  let completed = false;
  const done = finished(stream).then(() => {
    completed = true;
  });
  stream.end(Buffer.alloc(64 * 1024, 7));
  await closeSeen;
  assert.equal(completed, false);
  assert.equal(closes, 1);
  assert.equal(writes, 64 * 1024);
  closeRequest();
  await done;
  stream.destroy();
  assert.equal(closes, 1);
  sftp.end();
});

test('SFTP close failure is a failed write completion, never a successful finish', { timeout: 6000 }, async (t) => {
  let closes = 0;
  const client = await connection(t, (session) =>
    session.on('sftp', (accept) => {
      const peer = accept();
      peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
      peer.on('WRITE', (id) => peer.status(id, 0));
      peer.on('CLOSE', (id) => {
        closes++;
        peer.status(id, 3, 'synthetic CLOSE refusal');
      });
    })
  );
  const sftp = await new Promise((resolve, reject) =>
    client.sftp((error, value) => (error ? reject(error) : resolve(value)))
  );
  const stream = sftp.createWriteStream('/synthetic');
  let finishedEvent = false;
  stream.on('finish', () => {
    finishedEvent = true;
  });
  const done = finished(stream);
  stream.end('test');
  await assert.rejects(done, /CLOSE refusal/);
  assert.equal(finishedEvent, false);
  assert.equal(closes, 1);
  sftp.end();
});

for (const accepted of [false, true]) {
  test(
    `SFTP cancellation during pending OPEN settles after ${accepted ? 'handle release' : 'OPEN rejection'}`,
    { timeout: 6000 },
    async (t) => {
      let respond, opened;
      const openSeen = new Promise((resolve) => {
        opened = resolve;
      });
      let closes = 0;
      const client = await connection(t, (session) =>
        session.on('sftp', (accept) => {
          const peer = accept();
          peer.on('OPEN', (id) => {
            respond = () =>
              accepted ? peer.handle(id, Buffer.from([1])) : peer.status(id, 3, 'synthetic OPEN refusal');
            opened();
          });
          peer.on('CLOSE', (id) => {
            closes++;
            peer.status(id, 0);
          });
        })
      );
      const sftp = await new Promise((resolve, reject) =>
        client.sftp((error, value) => (error ? reject(error) : resolve(value)))
      );
      const stream = sftp.createWriteStream('/synthetic');
      const done = finished(stream).then(
        () => null,
        (error) => error
      );
      await openSeen;
      stream.destroy(new Error('synthetic cancellation'));
      respond();
      const error = await done;
      assert(error instanceof Error);
      assert.match(error.message, /cancellation|operation and handle close failed/);
      assert.equal(closes, accepted ? 1 : 0);
      sftp.end();
    }
  );
}

test(
  'SFTP cancellation drains already submitted WRITE outcomes before closing the handle',
  { timeout: 6000 },
  async (t) => {
    const acknowledgements = [];
    let writesReceived,
      closes = 0;
    const writesSeen = new Promise((resolve) => {
      writesReceived = resolve;
    });
    const client = await connection(t, (session) =>
      session.on('sftp', (accept) => {
        const peer = accept();
        peer.on('OPEN', (id) => peer.handle(id, Buffer.from([1])));
        peer.on('WRITE', (id) => {
          acknowledgements.push(() => peer.status(id, 0));
          if (acknowledgements.length === 2) writesReceived();
        });
        peer.on('REALPATH', (id, path) => peer.name(id, [{ filename: path, longname: path, attrs: {} }]));
        peer.on('CLOSE', (id) => {
          closes++;
          peer.status(id, 0);
        });
      })
    );
    const sftp = await new Promise((resolve, reject) =>
      client.sftp((error, value) => (error ? reject(error) : resolve(value)))
    );
    const stream = sftp.createWriteStream('/synthetic');
    const done = finished(stream).then(
      () => null,
      (error) => error
    );
    stream.cork();
    stream.write('first');
    stream.write('second');
    stream.uncork();
    await writesSeen;
    stream.destroy(new Error('synthetic cancellation'));
    // A response on the same ordered SFTP channel is a causal barrier: a CLOSE
    // sent prematurely would have reached the peer before this REALPATH.
    await new Promise((resolve, reject) => sftp.realpath('/barrier', (error) => (error ? reject(error) : resolve())));
    assert.equal(closes, 0);
    for (const acknowledge of acknowledgements) acknowledge();
    assert.match((await done).message, /synthetic cancellation/);
    assert.equal(closes, 1);
    sftp.end();
  }
);

for (const variant of ['exact-statvfs', 'unsafe-statvfs', 'unsafe-stat']) {
  test(`SFTP ${variant} preserves exact numeric and callback semantics`, { timeout: 6000 }, async (t) => {
    const value = variant === 'exact-statvfs' ? BigInt(Number.MAX_SAFE_INTEGER) : BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    const string = (text) => {
      const bytes = Buffer.from(text),
        out = Buffer.alloc(4 + bytes.length);
      out.writeUInt32BE(bytes.length);
      bytes.copy(out, 4);
      return out;
    };
    const frame = (type, id, payload) => {
      const data = Buffer.alloc(9 + payload.length);
      data.writeUInt32BE(data.length - 4);
      data[4] = type;
      data.writeUInt32BE(id, 5);
      payload.copy(data, 9);
      return data;
    };
    const client = await connection(t, (session, server) =>
      session.on('sftp', (accept) => {
        const peer = accept();
        const send = server._protocol.channelData.bind(server._protocol);
        server._protocol.channelData = (id, data) => {
          if (id === peer.outgoing.id && data.length === 9 && data[4] === 2) {
            data = frame(2, 3, Buffer.concat([string('statvfs@openssh.com'), string('2')]));
          }
          return send(id, data);
        };
        peer.on('EXTENDED', (id, name) => {
          assert.equal(name, 'statvfs@openssh.com');
          const bytes = Buffer.alloc(88);
          for (let i = 0; i < 11; i++) bytes.writeBigUInt64BE(value, i * 8);
          send(peer.outgoing.id, frame(201, id, bytes));
        });
        peer.on('STAT', (id) => {
          const bytes = Buffer.alloc(12);
          bytes.writeUInt32BE(1);
          bytes.writeBigUInt64BE(value, 4);
          send(peer.outgoing.id, frame(105, id, bytes));
        });
      })
    );
    const sftp = await new Promise((resolve, reject) =>
      client.sftp((error, result) => (error ? reject(error) : resolve(result)))
    );
    const failures = [];
    sftp.on('error', (error) => failures.push(error));
    let callbacks = 0;
    const result = await new Promise((resolve) => {
      const callback = (error, stats) => {
        callbacks++;
        resolve({ error, stats });
      };
      if (variant === 'unsafe-stat') sftp.stat('/synthetic', callback);
      else sftp.ext_openssh_statvfs('/synthetic', callback);
    });
    assert.equal(callbacks, 1);
    if (variant === 'exact-statvfs') {
      assert.ifError(result.error);
      assert.equal(result.stats.f_fsid, Number.MAX_SAFE_INTEGER);
      assert.equal(Object.hasOwn(result.stats, 'f_sid'), false);
      assert.equal(failures.length, 0);
      sftp.end();
    } else {
      assert(result.error instanceof Error);
      assert.equal(result.stats, undefined);
      assert.equal(failures.length, 1);
      assert.equal(failures[0].level, 'sftp-protocol');
      assert.equal(Object.keys(sftp._requests).length, 0);
    }
  });
}

test('peer CHANNEL_CLOSE settles the buffered writer on a shared connection', { timeout: 6000 }, async (t) => {
  const phase = { received: 0, close: 0, callback: 0 };
  let opened;
  t.after(() => {
    assert.equal(phase.callback, 1, JSON.stringify({ ...phase, pending: opened?.writableLength }));
  });
  const client = await connection(
    t,
    (session, peer) => {
      session.on('shell', (accept) => {
        const channel = accept();
        channel.once('data', (bytes) => {
          phase.received += bytes.length;
          channel.close();
        });
      });
    },
    {
      configurePeer(peer) {
        const confirm = peer._protocol.channelOpenConfirm.bind(peer._protocol);
        peer._protocol.channelOpenConfirm = (remote, local, _window, packet) => confirm(remote, local, 1, packet);
      },
    }
  );
  opened = await new Promise((resolve, reject) =>
    client.shell(false, (error, channel) => (error ? reject(error) : resolve(channel)))
  );
  opened.on('error', () => {});
  opened.resume();
  opened.stderr.resume();
  const closed = new Promise((resolve) =>
    opened.once('close', () => {
      phase.close++;
      resolve();
    })
  );
  const error = await new Promise((resolve) =>
    opened.write(Buffer.alloc(65536), (failure) => {
      phase.callback++;
      resolve(failure);
    })
  );
  await closed;
  assert(error instanceof Error);
  assert.equal(phase.received, 1);
  assert.equal(opened.writableLength, 0);
});
