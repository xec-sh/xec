import test from 'node:test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { randomUUID, generateKeyPairSync } from 'node:crypto';

import { createAgent } from '../../src/transport/agent.js';
import { parseKey } from '../../src/transport/protocol/keyParser.js';

function uint32(number) {
  const data = Buffer.alloc(4);
  data.writeUInt32BE(number);
  return data;
}
function field(data) {
  data = typeof data === 'string' ? Buffer.from(data) : data;
  return Buffer.concat([uint32(data.length), data]);
}
function identities(agent) {
  return new Promise((resolve, reject) =>
    agent.getIdentities((error, keys) => (error ? reject(error) : resolve(keys)))
  );
}
function signed(agent, key, message) {
  return new Promise((resolve, reject) =>
    agent.sign(key, message, { hash: 'sha512' }, (error, signature) => (error ? reject(error) : resolve(signature)))
  );
}
async function agentFixture(t, respond) {
  const path =
    process.platform === 'win32'
      ? `\\\\.\\pipe\\xec-agent-${randomUUID()}`
      : join(tmpdir(), `xec-agent-${randomUUID()}.sock`);
  const sockets = new Set();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    const chunks = [];
    let count = 0;
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      count += chunk.length;
      if (count < 4) return;
      const data = Buffer.concat(chunks);
      if (count < data.readUInt32BE(0) + 4) return;
      respond(socket, data.subarray(4));
    });
  });
  server.listen(path);
  await once(server, 'listening');
  t.after(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise((resolve) => server.close(resolve));
  });
  return createAgent(path);
}

test(
  'agent identity response preserves exact key with fragmented framing and closes its socket',
  { timeout: 3000 },
  async (t) => {
    const pair = generateKeyPairSync('ed25519'),
      key = parseKey(pair.publicKey.export({ type: 'spki', format: 'pem' }));
    let closed;
    const agent = await agentFixture(t, (socket, request) => {
      assert.equal(request[0], 11);
      closed = once(socket, 'close');
      const response = field(
        Buffer.concat([Buffer.from([12]), uint32(1), field(key.getPublicSSH()), field('synthetic')])
      );
      socket.write(response.subarray(0, 2));
      setImmediate(() => socket.write(response.subarray(2)));
    });
    const keys = await identities(agent);
    assert.equal(keys.length, 1);
    assert(keys[0].equals(key));
    assert.equal(keys[0].comment, 'synthetic');
    await closed;
  }
);

test('agent frames and key counts are bounded before accepting identities', { timeout: 3000 }, async (t) => {
  for (const response of [
    uint32(0xffffffff),
    field(Buffer.concat([Buffer.from([12]), uint32(0xffffffff)])),
    field(Buffer.concat([Buffer.from([12]), uint32(0), Buffer.from([0])])),
  ]) {
    const agent = await agentFixture(t, (socket) => socket.write(response));
    await assert.rejects(identities(agent), /length|count|trailing/);
  }
});

test('agent cannot change the requested signature algorithm or append unparsed bytes', { timeout: 3000 }, async (t) => {
  const pair = generateKeyPairSync('ed25519'),
    key = parseKey(pair.privateKey.export({ type: 'pkcs8', format: 'pem' })),
    message = Buffer.from('proof');
  for (const response of [
    field(Buffer.concat([Buffer.from([14]), field(Buffer.concat([field('ssh-rsa'), field(Buffer.alloc(64))]))])),
    field(
      Buffer.concat([
        Buffer.from([14]),
        field(Buffer.concat([field('ssh-ed25519'), field(Buffer.alloc(64)), Buffer.from([0])])),
      ])
    ),
  ]) {
    const agent = await agentFixture(t, (socket) => socket.write(response));
    await assert.rejects(signed(agent, key, message), /algorithm|trailing/);
  }
  const agent = await agentFixture(t, (socket) =>
    socket.write(
      field(Buffer.concat([Buffer.from([14]), field(Buffer.concat([field('ssh-ed25519'), field(key.sign(message))]))]))
    )
  );
  assert.equal(key.verify(message, await signed(agent, key, message)), true);
});

test('peer closure before a response rejects once and releases the owned connection', { timeout: 3000 }, async (t) => {
  const agent = await agentFixture(t, (socket) => socket.end());
  await assert.rejects(identities(agent), /closed/);
});
