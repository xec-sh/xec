// Copied into the installed consumer by the canonical SSH acceptance command.
// Only public package exports are imported. The peer is an independently
// released, development-only implementation; no production host is contacted.
import test from 'node:test';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
// Imports resolve only after this fixture enters the installed archive consumer.
// eslint-disable-next-line import-x/no-unresolved
import { $, dispose } from '@xec-sh/core';
import { createRequire } from 'node:module';
// eslint-disable-next-line import-x/no-unresolved
import { SSHClient, sshHostFingerprint } from '@xec-sh/ssh';

const peerPackage = process.env.XEC_SSH_TEST_PEER_PACKAGE;
assert(peerPackage, 'The independent SSH peer package must be explicit');
const peerRequire = createRequire(peerPackage);
const { Server, utils } = peerRequire('ssh2');
const key = readFileSync(peerRequire.resolve('ssh2/test/fixtures/ssh_host_ecdsa_key'));
const expectedHostFingerprint = sshHostFingerprint(utils.parseKey(key).getPublicSSH());

async function peer(t, session, { configure, onAuthentication } = {}) {
  const peers = new Set(),
    clients = new Set();
  const server = new Server({ hostKeys: [key], algorithms: { cipher: ['aes256-gcm@openssh.com'] } }, (connection) => {
    peers.add(connection);
    connection.on('error', () => {});
    connection.once('close', () => peers.delete(connection));
    configure?.(connection);
    connection.on('authentication', (authentication) => {
      onAuthentication?.();
      authentication.accept();
    });
    connection.on('ready', () => connection.on('session', (accept) => session(accept(), connection)));
  });
  t.after(async () => {
    for (const client of clients) client.dispose(true);
    for (const connection of peers) connection._sock.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const config = {
    host: '127.0.0.1',
    port: server.address().port,
    username: 'isolated-fixture',
    password: 'synthetic-only',
    expectedHostFingerprint,
    readyTimeout: 2500,
    algorithms: { cipher: ['aes256-gcm@openssh.com'] },
  };
  return {
    config,
    async connect(overrides = {}) {
      const client = new SSHClient();
      clients.add(client);
      return client.connect({ ...config, ...overrides });
    },
  };
}

test('the packed public Core adapter and SSH client use one owned transport', { timeout: 8000 }, async (t) => {
  const fixture = await peer(t, (session) =>
    session.on('exec', (accept, _reject, info) => {
      const channel = accept();
      channel.resume();
      channel.exit(0);
      channel.end(info.command);
    })
  );
  const ssh = await fixture.connect();
  const replies = await Promise.all(Array.from({ length: 8 }, (_, n) => ssh.exec(`fixture-${n}`)));
  assert.deepEqual(
    replies.map((reply) => [reply.code, reply.stdout]),
    Array.from({ length: 8 }, (_, n) => [0, `fixture-${n}`])
  );
  try {
    const result = await $.ssh(fixture.config)`printf fixture`;
    assert.equal(result.exitCode, 0);
    assert.match(result.stdout, /printf fixture/);
  } finally {
    await dispose();
  }
});

test('a wrong host pin fails before any credential is offered', { timeout: 6000 }, async (t) => {
  let authentications = 0;
  const fixture = await peer(t, () => {}, {
    onAuthentication() {
      authentications++;
    },
  });
  await assert.rejects(
    fixture.connect({ expectedHostFingerprint: 'SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' }),
    /host key|fingerprint/i
  );
  assert.equal(authentications, 0);
});

test('a zero maximum channel packet is rejected by the installed public API', { timeout: 6000 }, async (t) => {
  const fixture = await peer(t, (session) => session.on('shell', (accept) => accept()), {
    configure(connection) {
      const confirm = connection._protocol.channelOpenConfirm.bind(connection._protocol);
      connection._protocol.channelOpenConfirm = (remote, local, window) => confirm(remote, local, window, 0);
    },
  });
  const ssh = await fixture.connect();
  await assert.rejects(ssh.requestShell(false, { timeoutMs: 2000 }), /CHANNEL_OPEN_CONFIRMATION|packet|closed/i);
});

test('closing a channel settles an accepted buffered write exactly once', { timeout: 6000 }, async (t) => {
  const fixture = await peer(
    t,
    (session) =>
      session.on('shell', (accept) => {
        const channel = accept();
        channel.once('data', () => channel.close());
      }),
    {
      configure(connection) {
        const confirm = connection._protocol.channelOpenConfirm.bind(connection._protocol);
        connection._protocol.channelOpenConfirm = (remote, local, _window, packet) => confirm(remote, local, 1, packet);
      },
    }
  );
  const ssh = await fixture.connect(),
    channel = await ssh.requestShell(false, { timeoutMs: 2000 });
  channel.on('error', () => {});
  channel.resume();
  channel.stderr.resume();
  const closed = new Promise((resolve) => channel.once('close', resolve));
  let callbacks = 0;
  const failure = await new Promise((resolve) =>
    channel.write(Buffer.alloc(65536), (error) => {
      callbacks++;
      resolve(error);
    })
  );
  await closed;
  assert(failure instanceof Error);
  assert.equal(callbacks, 1);
  assert.equal(channel.writableLength, 0);
});

test('server-initiated SFTP closure releases channels while keeping SSH usable', { timeout: 8000 }, async (t) => {
  let subsystem;
  const fixture = await peer(t, (session) => {
    session.on('sftp', (accept) => {
      subsystem = accept();
      subsystem.on('error', () => {});
    });
    session.on('exec', (accept) => {
      const channel = accept();
      channel.exit(0);
      channel.end('still-connected');
    });
  });
  const ssh = await fixture.connect();
  for (let index = 0; index < 25; index++) {
    const sftp = await ssh.requestSFTP({ operationTimeoutMs: 2000 });
    sftp.on('error', () => {});
    const closed = new Promise((resolve) => sftp.once('close', resolve));
    subsystem.destroy();
    await closed;
  }
  assert.equal((await ssh.exec('fixture')).stdout, 'still-connected');
});

test('lost SFTP read/write acknowledgements settle once and preserve unknown effects', { timeout: 6000 }, async (t) => {
  let subsystem;
  const fixture = await peer(
    t,
    (session) => {
      session.on('sftp', (accept) => {
        subsystem = accept();
        subsystem.on('error', () => {});
      });
      session.on('exec', (accept) => {
        const channel = accept();
        channel.exit(0);
        channel.end('still-connected');
      });
    },
    {
      configure(connection) {
        const confirm = connection._protocol.channelOpenConfirm.bind(connection._protocol);
        connection._protocol.channelOpenConfirm = (remote, local, _window, packet) =>
          confirm(remote, local, 128, packet);
      },
    }
  );
  const ssh = await fixture.connect(),
    sftp = await ssh.requestSFTP({ operationTimeoutMs: 2000 });
  sftp.on('error', () => {});
  const failures = [];
  const stat = new Promise((resolve) =>
    sftp.stat('/' + 'x'.repeat(4096), (error) => {
      failures.push(error);
      resolve(error);
    })
  );
  const bytes = Buffer.alloc(8192);
  const write = new Promise((resolve) =>
    sftp.write(Buffer.from('fixture'), bytes, 0, bytes.length, 0, (error) => {
      failures.push(error);
      resolve(error);
    })
  );
  const closed = new Promise((resolve) => sftp.once('close', resolve));
  subsystem.destroy();
  const [readError, writeError] = await Promise.all([stat, write]);
  await closed;
  assert(readError instanceof Error);
  assert(writeError instanceof Error);
  assert.equal(writeError.code, 'SSH_OUTCOME_UNKNOWN');
  assert.equal(writeError.outcome, 'unknown');
  assert(writeError.cause instanceof Error);
  assert.equal((await ssh.exec('fixture')).stdout, 'still-connected');
  assert.equal(failures.length, 2);
});

test('a high-level SFTP read settles when its handle-close response is impossible', { timeout: 6000 }, async (t) => {
  const fixture = await peer(t, (session, connection) =>
    session.on('sftp', (accept) => {
      const subsystem = accept();
      subsystem.on('error', () => {});
      subsystem.on('OPENDIR', (id) => subsystem.handle(id, Buffer.from('fixture')));
      subsystem.on('READDIR', () => connection._sock.destroy());
    })
  );
  const ssh = await fixture.connect(),
    sftp = await ssh.requestSFTP({ operationTimeoutMs: 2000 });
  sftp.on('error', () => {});
  const closed = new Promise((resolve) => ssh.connection.once('close', resolve));
  let callbacks = 0;
  const failure = await new Promise((resolve) =>
    sftp.readdir('/', (error) => {
      callbacks++;
      resolve(error);
    })
  );
  await closed;
  assert(failure instanceof Error);
  assert.equal(callbacks, 1);
  assert.equal(ssh.isConnected(), false);
});
