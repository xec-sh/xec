import { join } from 'node:path';
import { Duplex } from 'node:stream';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

/** Exercise the installed receive callbacks directly at their decoded-data boundary. */
export function checkReceiveWindow(transport) {
  const require = createRequire(join(transport, 'package.json'));
  const { Client } = require('./lib/index.js');
  const { DISCONNECT_REASON, CHANNEL_EXTENDED_DATATYPE } = require('./lib/protocol/constants.js');
  const client = new Client();
  // An unconnected, memory-only stream registers the real handlers; no peer or
  // operating-system buffer participates in this accounting contract.
  const stream = new Duplex({ read() {}, write(_chunk, _encoding, done) { done(); } });
  stream.connecting = true;
  client.connect({ sock: stream, username: 'fixture', readyTimeout: 0 });
  try {
    const handlers = client._protocol._handlers;
    for (const [handler, extended] of [[handlers.CHANNEL_DATA, false], [handlers.CHANNEL_EXTENDED_DATA, true]]) {
      for (const budget of [2, 3]) {
        const delivered = [];
        const events = [];
        const protocol = {
          disconnect(reason) { events.push(reason); },
          _destruct() { events.push('closed'); },
          _onError(error) { assert.equal(error.level, 'protocol'); assert.equal(error.fatal, true); events.push('error'); },
        };
        const receive = data => { delivered.push(data.length); return false; };
        const unexpected = () => assert.fail('data delivered to the wrong channel stream');
        const incoming = { window: budget };
        const id = client._chanMgr.add({ incoming, push: extended ? unexpected : receive, stderr: { push: extended ? receive : unexpected } });
        const deliver = bytes => handler(protocol, id, Buffer.alloc(bytes), CHANNEL_EXTENDED_DATATYPE.STDERR);

        deliver(2);
        assert.equal(incoming.window, budget - 2);
        assert.deepEqual(delivered, [2]);
        assert.deepEqual(events, []);

        // A budget refusal must leave both accounting and delivery untouched.
        deliver(2);
        assert.equal(incoming.window, budget - 2);
        assert.deepEqual(delivered, [2]);
        assert.deepEqual(events, [DISCONNECT_REASON.PROTOCOL_ERROR, 'closed', 'error']);
        client._chanMgr.remove(id);
      }
    }
    return { mode: 'receive-window', observation: 'installed-receive-handlers', streams: 2, passed: true };
  } finally {
    // The stream was never connected. Keep test teardown separate from the
    // disconnect and error observed above.
    stream.destroy();
  }
}
