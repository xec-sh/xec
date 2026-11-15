import test from 'node:test';
import * as native from 'node:crypto';
import assert from 'node:assert/strict';

import {
  NullCipher,
  CIPHER_INFO,
  createCipher,
  NullDecipher,
  createDecipher,
} from '../../src/transport/protocol/crypto.js';

function pair(name, receive = () => {}) {
  const info = CIPHER_INFO[name];
  const key = Buffer.alloc(info.keyLen, 3),
    iv = Buffer.alloc(info.ivLen, 9),
    wire = [];
  const cipher = createCipher({
    outbound: {
      cipherInfo: info,
      cipherKey: key,
      cipherIV: iv,
      seqno: 0,
      onWrite: (data) => wire.push(Buffer.from(data)),
    },
  });
  const decipher = createDecipher({
    inbound: { decipherInfo: info, decipherKey: key, decipherIV: iv, seqno: 0, onPayload: receive },
  });
  return { cipher, decipher, key, iv, wire };
}
function encrypt(cipher, payload) {
  const packet = cipher.allocPacket(payload.length);
  packet.set(payload, 5);
  cipher.encrypt(packet);
}

test('advertises only algorithms with complete runtime primitives', () => {
  assert(CIPHER_INFO['aes128-gcm@openssh.com']);
  assert(CIPHER_INFO['aes256-gcm@openssh.com']);
  const chacha = Boolean(CIPHER_INFO['chacha20-poly1305@openssh.com']);
  if (chacha) {
    assert(native.getCiphers().includes('chacha20'));
    assert.equal(typeof native.createMac, 'function');
    const key = Buffer.from('85d6be7857556d337f4452fe42d506a80103808afb0db2fd4abff6af4149f51b', 'hex');
    assert.equal(
      native.createMac('Poly1305', key).update('Cryptographic Forum Research Group').final('hex'),
      'a8061dc1305136c6c22b8baf0c0127a9'
    );
  }
  assert.equal(
    Object.keys(CIPHER_INFO).some((name) => /cbc|arcfour|3des/.test(name)),
    false
  );
});

for (const name of Object.keys(CIPHER_INFO)) {
  test(`${name}: fragmented authenticated records preserve binary payload and sequence`, () => {
    const received = [],
      p = pair(name, (data) => received.push(Buffer.from(data)));
    const expected = Array.from({ length: 3 }, (_, n) => Buffer.from([0, 255, 192, n, 10]));
    try {
      for (const data of expected) encrypt(p.cipher, data);
      for (const record of p.wire)
        for (const byte of record) {
          const fragment = Buffer.from([byte]);
          p.decipher.decrypt(fragment, 0, 1);
        }
      assert.deepEqual(received, expected);
      assert.equal(p.cipher.outSeqno, 3);
      assert.equal(p.decipher.inSeqno, 3);
      assert.deepEqual(p.key, Buffer.alloc(p.key.length, 3));
      assert.deepEqual(p.iv, Buffer.alloc(p.iv.length, 9));
    } finally {
      p.cipher.free();
      p.decipher.free();
    }
  });
  test(`${name}: corruption never delivers unauthenticated plaintext`, () => {
    for (const mutation of ['body', 'tag', 'length']) {
      const received = [],
        p = pair(name, (data) => received.push(data));
      try {
        encrypt(p.cipher, Buffer.from('must remain private until authentication'));
        const wire = p.wire[0];
        wire[mutation === 'body' ? 5 : mutation === 'tag' ? wire.length - 1 : 0] ^= 1;
        assert.throws(() => p.decipher.decrypt(wire, 0, wire.length));
        assert.deepEqual(received, []);
      } finally {
        p.cipher.free();
        p.decipher.free();
      }
    }
  });
  test(`${name}: re-entrant writes reserve distinct packet state`, () => {
    const received = [],
      p = pair(name, (data) => received.push(Buffer.from(data)));
    let first = true;
    p.cipher._onWrite = (data) => {
      p.wire.push(Buffer.from(data));
      if (first) {
        first = false;
        encrypt(p.cipher, Buffer.from('nested'));
      }
    };
    try {
      encrypt(p.cipher, Buffer.from('outer'));
      for (const wire of p.wire) p.decipher.decrypt(wire, 0, wire.length);
      assert.deepEqual(received, [Buffer.from('outer'), Buffer.from('nested')]);
    } finally {
      p.cipher.free();
      p.decipher.free();
    }
  });
  test(`${name}: key budgets request rekey and cannot wrap indefinitely`, () => {
    const p = pair(name);
    let requested = 0;
    try {
      p.cipher.lifetime.onRekey = () => requested++;
      p.cipher.lifetime.bytes = 1024 * 1024 * 1024 - 1;
      encrypt(p.cipher, Buffer.from('limit'));
      encrypt(p.cipher, Buffer.from('later'));
      assert.equal(requested, 1);
      p.cipher.lifetime.packets = 2 ** 31 - 1;
      const count = p.wire.length;
      assert.throws(() => encrypt(p.cipher, Buffer.from('refused')), /limit exhausted/);
      assert.equal(p.wire.length, count);
    } finally {
      p.cipher.free();
      p.decipher.free();
    }
  });
}

test('AES-GCM fails closed at invocation-counter exhaustion', () => {
  const info = CIPHER_INFO['aes256-gcm@openssh.com'],
    key = Buffer.alloc(32, 5),
    iv = Buffer.alloc(12, 255),
    wire = [],
    got = [];
  const cipher = createCipher({
    outbound: { cipherInfo: info, cipherKey: key, cipherIV: iv, seqno: 0, onWrite: (data) => wire.push(data) },
  });
  const decipher = createDecipher({
    inbound: { decipherInfo: info, decipherKey: key, decipherIV: iv, seqno: 0, onPayload: (data) => got.push(data) },
  });
  try {
    encrypt(cipher, Buffer.from('last unique nonce'));
    assert.throws(() => encrypt(cipher, Buffer.from('must not reuse nonce')), /exhausted/);
    decipher.decrypt(wire[0], 0, wire[0].length);
    assert.equal(got.length, 1);
    assert.throws(() => decipher.decrypt(wire[0], 0, wire[0].length), /exhausted/);
  } finally {
    cipher.free();
    decipher.free();
  }
});

test('framing rejects invalid padding before delivering initial handshake data', () => {
  const wire = [],
    received = [];
  const cipher = new NullCipher(0, (value) => wire.push(value));
  const decipher = new NullDecipher(0, (value) => received.push(value));
  const packet = cipher.allocPacket(1);
  packet[4] = 255;
  packet[5] = 20;
  cipher.encrypt(packet);
  assert.throws(() => decipher.decrypt(wire[0], 0, wire[0].length), /padding/);
  assert.deepEqual(received, []);
});
