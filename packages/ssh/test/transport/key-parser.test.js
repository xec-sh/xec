import test from 'node:test';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { verify, createPublicKey, generateKeyPairSync } from 'node:crypto';

import { parseKey, KEY_LIMITS } from '../../src/transport/protocol/keyParser.js';

const require = createRequire(import.meta.url);
const fixture = (name) => readFileSync(require.resolve(`ssh2/test/fixtures/keyParser/${name}`));
const message = Buffer.from('synthetic key proof');
function field(value) {
  const data = typeof value === 'string' ? Buffer.from(value) : value,
    out = Buffer.alloc(data.length + 4);
  out.writeUInt32BE(data.length);
  data.copy(out, 4);
  return out;
}
function number(value) {
  const out = Buffer.alloc(4);
  out.writeUInt32BE(value);
  return out;
}
function container(values) {
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${Buffer.concat([Buffer.from('openssh-key-v1\0'), ...values]).toString('base64')}\n-----END OPENSSH PRIVATE KEY-----`;
}
function valid(value) {
  assert(!(value instanceof Error), value?.stack);
  return value;
}

for (const type of ['ed25519', 'ec', 'rsa']) {
  test(`native ${type} PEM, PKCS8 and SSH public identities share sign/verify semantics`, () => {
    const pair = generateKeyPairSync(
      type,
      type === 'ec' ? { namedCurve: 'prime256v1' } : type === 'rsa' ? { modulusLength: 2048 } : {}
    );
    const privateKey = valid(parseKey(pair.privateKey.export({ format: 'pem', type: 'pkcs8' })));
    const publicKey = valid(parseKey(pair.publicKey.export({ format: 'pem', type: 'spki' })));
    const ssh = valid(parseKey(privateKey.getPublicSSH()));
    assert(privateKey.isPrivateKey());
    assert(!publicKey.isPrivateKey());
    assert(privateKey.equals(publicKey));
    assert(ssh.equals(privateKey));
    const signature = valid(privateKey.sign(message));
    assert.equal(publicKey.verify(message, signature), true);
    assert.equal(ssh.verify(Buffer.from('changed'), signature), false);
    assert.equal(
      verify(type === 'ed25519' ? null : type === 'rsa' ? 'sha512' : 'sha256', message, pair.publicKey, signature),
      true
    );
    assert(privateKey.sign(message, 'sha1') instanceof Error);
    assert(publicKey.sign(message) instanceof Error);
  });
}

for (const type of ['rsa', 'ecdsa', 'ed25519']) {
  test(`independently generated OpenSSH ${type} fixture preserves exact public identity`, () => {
    const key = valid(parseKey(fixture(`openssh_new_${type}`)));
    const expected = JSON.parse(fixture(`openssh_new_${type}.result`).toString());
    assert.equal(key.getPublicSSH().toString('base64'), expected.publicSSH);
    assert.deepEqual(
      createPublicKey(key.getPrivatePEM()).export({ type: 'spki', format: 'der' }),
      createPublicKey(expected.public).export({ type: 'spki', format: 'der' })
    );
    assert.equal(key.verify(message, valid(key.sign(message))), true);
  });
}

test('encrypted OpenSSH key uses bounded bcrypt and rejects a wrong password', () => {
  const key = valid(parseKey(fixture('openssh_new_ecdsa_enc'), 'password'));
  const gcm = valid(parseKey(fixture('openssh_new_ecdsa_enc_gcm'), 'password'));
  assert.equal(gcm.verify(message, valid(gcm.sign(message))), true);
  assert.equal(key.verify(message, valid(key.sign(message))), true);
  assert(parseKey(fixture('openssh_new_ecdsa_enc'), 'wrong') instanceof Error);
  assert(parseKey(fixture('openssh_new_ecdsa_enc')) instanceof Error);
});

test('hostile KDF rounds, salt lengths, key counts and input sizes reject before key derivation', () => {
  const synthetic = (rounds, salt = Buffer.alloc(16), count = 1) =>
    container([
      field('aes256-ctr'),
      field('bcrypt'),
      field(Buffer.concat([field(salt), number(rounds)])),
      number(count),
      field(Buffer.alloc(0)),
      field(Buffer.alloc(16)),
    ]);
  assert.match(parseKey(synthetic(0xffffffff), 'password').message, /rounds/);
  assert.match(parseKey(synthetic(KEY_LIMITS.bcryptRounds + 1), 'password').message, /rounds/);
  assert.match(parseKey(synthetic(0), 'password').message, /rounds/);
  assert.match(parseKey(synthetic(1, Buffer.alloc(8)), 'password').message, /salt/);
  assert.match(parseKey(synthetic(1, Buffer.alloc(65)), 'password').message, /field length/);
  assert.match(parseKey(synthetic(1, Buffer.alloc(16), 0xffffffff), 'password').message, /Exactly one/);
  assert.match(parseKey(Buffer.alloc(KEY_LIMITS.bytes + 1)).message, /1 MiB/);
  assert.match(
    parseKey(fixture('openssh_new_ecdsa'), Buffer.alloc(KEY_LIMITS.passphraseBytes + 1)).message,
    /1024 bytes/
  );
});

test('ECDSA curve confusion, trailing bytes and forged public identities are rejected', () => {
  const key = valid(parseKey(fixture('openssh_new_ecdsa'))),
    blob = key.getPublicSSH();
  const index = blob.indexOf(Buffer.from('nistp256'), 4 + 19);
  const changed = Buffer.from(blob);
  changed.write('nistp384', index);
  assert(parseKey(changed) instanceof Error);
  assert(parseKey(Buffer.concat([blob, Buffer.from([0])])) instanceof Error);
  assert(parseKey(`ssh-ed25519 ${blob.toString('base64')}`) instanceof Error);
  const data = fixture('openssh_new_ed25519').toString(),
    bytes = Buffer.from(data.split('\n').slice(1, -2).join(''), 'base64');
  // Alter the declared public key without changing the independent private body.
  const publicStart = 15 + field('none').length + field('none').length + 4 + 4 + 4;
  bytes[publicStart + 4 + 11 + 4] ^= 1;
  const altered = `-----BEGIN OPENSSH PRIVATE KEY-----\n${bytes.toString('base64')}\n-----END OPENSSH PRIVATE KEY-----`;
  assert(parseKey(altered) instanceof Error);
});

test('truncated keys and obsolete DSA do not pass a header-only validation', () => {
  assert(parseKey('-----BEGIN RSA PRIVATE KEY-----\nAAAA\n-----END RSA PRIVATE KEY-----') instanceof Error);
  assert(parseKey('-----BEGIN OPENSSH PRIVATE KEY-----\nAAAA\n-----END OPENSSH PRIVATE KEY-----') instanceof Error);
  assert(parseKey(fixture('openssh_old_dsa')) instanceof Error);
});
