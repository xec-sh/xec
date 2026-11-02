// Verify channel ownership through a loopback peer and the installed package.
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname, resolve as resolvePath } from 'node:path';

const root = resolvePath(dirname(fileURLToPath(import.meta.url)), '../..');
const packageDirectory = resolvePath(process.argv[2]);
const packaged = createRequire(join(packageDirectory, 'package.json'));
const { Server, Client } = packaged('ssh2'); // Exercise the installed transport on both sides.
const { NodeSSH } = await import(pathToFileURL(join(packageDirectory, 'dist/adapters/ssh/ssh.js')).href);
const waitFor = async predicate => {
  const deadline = Date.now() + 1000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error('SFTP fixture did not release its resources');
    await new Promise(resolve => setTimeout(resolve, 5));
  }
};

async function withPeer(window, action) {
  let peer, subsystem;
  const server = new Server({ hostKeys: [readFileSync(join(root, 'packages/core/test/unit/ssh/fixtures/id_rsa'))] }, connection => {
    peer = connection; connection.on('error', () => {});
    const confirm = connection._protocol.channelOpenConfirm.bind(connection._protocol);
    connection._protocol.channelOpenConfirm = (remote, local, _window, packet) => confirm(remote, local, window, packet);
    connection.on('authentication', auth => auth.accept());
    connection.on('ready', () => connection.on('session', accept => {
      const session = accept();
      session.on('sftp', acceptSftp => { subsystem = acceptSftp(); subsystem.on('error', () => {}); });
      session.on('exec', acceptExec => { const stream = acceptExec(); stream.exit(0); stream.end('still-connected'); });
    }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const config = { host: '127.0.0.1', port: server.address().port, username: 'fixture', password: 'fixture' };
    await action(config, () => peer, () => subsystem);
  } finally { peer?.end(); await new Promise(resolve => server.close(resolve)); }
}

// The protocol must return CLOSE for each server-initiated SFTP close, without
// disconnecting a shared connection or consuming its channel allocation budget.
await withPeer(32768, async (config, peer, subsystem) => {
  const client = new Client();
  await new Promise((resolve, reject) => client.once('ready', resolve).once('error', reject).connect(config));
  try {
    for (let i = 0; i < 25; i++) {
      const sftp = await new Promise((resolve, reject) => client.sftp((error, channel) => error ? reject(error) : resolve(channel)));
      sftp.on('error', () => {});
      const close = new Promise(resolve => sftp.once('close', resolve));
      subsystem().destroy(); await close;
      await waitFor(() => peer()._chanMgr._count === 0);
    }
  } finally { client.destroy(); }
});

// SFTP's buffered drain method is not a stream write callback. Closing it must
// settle public read/write callbacks once, free the channel and keep SSH usable.
await withPeer(128, async (config, peer, subsystem) => {
  const ssh = await new NodeSSH().connect({ ...config, hostKeyChecking: 'off' });
  try {
    const sftp = await ssh.requestSFTP({ operationTimeoutMs: 500 });
    const failures = [];
    sftp.stat('/' + 'x'.repeat(4096), error => failures.push({ operation: 'stat', error }));
    const bytes = Buffer.alloc(8192);
    sftp.write(Buffer.from('fixture'), bytes, 0, bytes.length, 0, error => failures.push({ operation: 'write', error }));
    subsystem().destroy();
    await waitFor(() => failures.length === 2 && peer()._chanMgr._count === 0);
    assert.ok(failures.every(result => result.error instanceof Error));
    assert.equal(failures.find(result => result.operation === 'write').error.kind, 'outcome-unknown');
    assert.equal(sftp._buffer.length, 0);
    const command = await ssh.execCommand('fixture');
    assert.equal(command.stdout, 'still-connected');
    await waitFor(() => peer()._chanMgr._count === 0);
    assert.equal(failures.length, 2);
  } finally { ssh.dispose(true); }
});

// A high-level read can attempt a final handle-close after the transport dies.
// The Xec lifecycle boundary must settle its callback instead of waiting forever.
await withPeer(32768, async (config, peer, subsystem) => {
  const ssh = await new NodeSSH().connect({ ...config, hostKeyChecking: 'off' });
  try {
    const sftp = await ssh.requestSFTP({ operationTimeoutMs: 500 });
    subsystem().on('OPENDIR', id => subsystem().handle(id, Buffer.from('fixture')));
    subsystem().on('READDIR', () => peer()._sock.destroy());
    const failures = [];
    sftp.readdir('/', error => failures.push(error));
    await waitFor(() => failures.length === 1 && !ssh.isConnected());
    assert.ok(failures[0] instanceof Error);
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.equal(failures.length, 1);
  } finally { ssh.dispose(true); }
});
console.log(JSON.stringify({ cases: 3, peerCloseCycles: 25, passed: true }));
