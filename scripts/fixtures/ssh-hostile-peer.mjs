// Hostile peers exist only in this loopback test fixture. No real hosts or credentials.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const packageDirectory = resolve(process.argv[3]);
const load = createRequire(join(packageDirectory, 'package.json'));
let phase = 'starting';
void (async () => {
    const mode = process.argv[2];
    if (!['zero-packet', 'buffered-close'].includes(mode)) throw new Error('Unknown SSH fixture');
    const { Server } = load('ssh2');
    const manifest = JSON.parse(readFileSync(join(packageDirectory, 'package.json')));
    const { NodeSSH } = await import(pathToFileURL(join(packageDirectory, manifest.exports['./ssh'].import)).href);
    const peers = [];
    let serverChannel, peer;
    const server = new Server({ hostKeys: [readFileSync(join(root, 'packages/core/test/unit/ssh/fixtures/id_rsa'))] }, connection => {
      peers.push(connection); peer = connection; connection.on('error', () => {});
      // Deliberately malformed peer, private protocol access is confined to this fixture.
      const confirm = connection._protocol.channelOpenConfirm.bind(connection._protocol);
      connection._protocol.channelOpenConfirm = (remote, local, window, packet) =>
        confirm(remote, local, mode === 'buffered-close' ? 1 : window, mode === 'zero-packet' ? 0 : packet);
      connection.on('authentication', auth => auth.accept());
      connection.on('ready', () => connection.on('session', accept => {
        const session = accept();
        session.on('shell', acceptShell => { serverChannel = acceptShell(); serverChannel.on('error', () => {}); });
      }));
    });
    await new Promise(done => server.listen(0, '127.0.0.1', done));
    const ssh = await new NodeSSH().connect({ host: '127.0.0.1', port: server.address().port, username: 'fixture', password: 'fixture', hostKeyChecking: 'off', readyTimeout: 1000 });
    phase = 'authenticated';
    const channel = await ssh.requestShell(false, { timeoutMs: 1000 }); channel.on('error', () => {});
    const finish = result => {
      process.stdout.write(JSON.stringify(result) + '\n');
      ssh.dispose(true); for (const connection of peers) connection.end(); server.close();
      setTimeout(() => process.exit(0), 20);
    };
    if (mode === 'zero-packet') {
      process.stdout.write('authenticated; writing to zero-packet channel\n');
      channel.write(Buffer.from('fixture'));
      finish({ returned: true });
    } else {
      let callbackCalled = false, callbackError, closeReceived = false, connectionClosed = false;
      channel.once('close', () => { closeReceived = true; });
      ssh.connection.once('close', () => { connectionClosed = true; });
      channel.write(Buffer.alloc(65536), error => { callbackCalled = true; callbackError = error?.message; });
      setTimeout(() => serverChannel.close(), 20);
      setTimeout(() => peer.end(), 50);
      setTimeout(() => finish({ callbackCalled, callbackError, closeReceived, connectionClosed, destroyed: channel.destroyed, writePending: channel.writableLength }), 150);
    }
  })().catch(error => { process.stdout.write(JSON.stringify({ phase, error: error.message, level: error.level }) + '\n', () => process.exit(phase === 'authenticated' && error.level === 'protocol' ? 0 : 1)); });
