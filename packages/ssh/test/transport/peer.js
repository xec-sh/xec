import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

import Client from '../../src/transport/client.js';

const require = createRequire(import.meta.url);
// An independently released implementation is a development-only wire oracle.
const { Server, utils } = require('ssh2');

const key = readFileSync(require.resolve('ssh2/test/fixtures/ssh_host_ecdsa_key'));
const pinned = utils.parseKey(key).getPublicSSH();

export async function connection(t, session, options = {}) {
  const cipher = options.cipher ?? 'aes256-gcm@openssh.com';
  const peers = new Set();
  const server = new Server({ hostKeys: [key], algorithms: { cipher: [cipher] } }, (peer) => {
    peers.add(peer);
    peer.on('close', () => peers.delete(peer));
    peer.on('error', () => {});
    options.configurePeer?.(peer);
    peer.on('authentication', (context) => {
      options.onAuthentication?.();
      context.accept();
    });
    peer.on('ready', () => peer.on('session', (accept) => session(accept(), peer)));
  });
  options.mutateServer?.(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const client = new Client();
  const errors = [];
  client.on('error', (error) => errors.push(error));
  t.after(async () => {
    client.destroy();
    for (const peer of peers) peer._sock.destroy();
    await new Promise((resolve) => server.close(resolve));
    if (!options.expectedFailure) assert.deepEqual(errors, []);
  });
  const ready = once(client, 'ready');
  client.connect({
    host: '127.0.0.1',
    port: server.address().port,
    username: 'isolated-fixture',
    readyTimeout: 2500,
    hostVerifier: (blob) => blob.equals(pinned),
    algorithms: { cipher: [cipher] },
  });
  await ready;
  return client;
}
