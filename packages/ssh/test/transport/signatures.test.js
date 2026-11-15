import test from 'node:test';
import assert from 'node:assert/strict';
import { sign, verify, generateKeyPairSync } from 'node:crypto';

import { signatureToSSH, signatureToNative } from '../../src/transport/protocol/utils.js';

const message = Buffer.from('native ECDSA signature oracle');
function field(bytes) {
  const value = Buffer.alloc(bytes.length + 4);
  value.writeUInt32BE(bytes.length);
  value.set(bytes, 4);
  return value;
}
for (const [name, nativeCurve, hash, width] of [
  ['nistp256', 'prime256v1', 'sha256', 32],
  ['nistp384', 'secp384r1', 'sha384', 48],
  ['nistp521', 'secp521r1', 'sha512', 66],
]) {
  const type = `ecdsa-sha2-${name}`;
  test(`${name}: native P1363 signatures cross the exact SSH mpint boundary`, () => {
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: nativeCurve });
    const signature = sign(hash, message, { key: privateKey, dsaEncoding: 'ieee-p1363' });
    assert.equal(signature.length, width * 2);
    const wire = signatureToSSH(signature, type);
    assert.deepEqual(signatureToNative(wire, type), signature);
    assert(verify(hash, message, { key: publicKey, dsaEncoding: 'ieee-p1363' }, signatureToNative(wire, type)));
    const leadingZero = Buffer.alloc(width * 2);
    leadingZero[width - 1] = 1;
    leadingZero[width * 2 - 1] = 2;
    assert.deepEqual(
      signatureToSSH(leadingZero, type),
      Buffer.concat([field(Buffer.from([1])), field(Buffer.from([2]))])
    );
    assert.deepEqual(signatureToNative(signatureToSSH(leadingZero, type), type), leadingZero);
  });
  test(`${name}: hostile mpints and native size confusion fail closed`, () => {
    const one = field(Buffer.from([1]));
    for (const value of [
      Buffer.alloc(0),
      Buffer.from([0]),
      Buffer.from([0, 1]),
      Buffer.from([0x80]),
      Buffer.from([0, 0, 0x80]),
      Buffer.alloc(width + 1, 1),
    ])
      assert.equal(signatureToNative(Buffer.concat([field(value), one]), type), undefined);
    for (const invalid of [
      Buffer.alloc(0),
      Buffer.from([0xff, 0xff, 0xff, 0xff]),
      one,
      Buffer.concat([one, one, Buffer.from([0])]),
    ])
      assert.equal(signatureToNative(invalid, type), undefined);
    for (const invalid of [
      Buffer.alloc(0),
      Buffer.alloc(width * 2 - 1),
      Buffer.alloc(width * 2),
      Buffer.alloc(width * 2 + 1),
    ])
      assert.equal(signatureToSSH(invalid, type), undefined);
    if (width === 66)
      assert.equal(signatureToNative(Buffer.concat([field(Buffer.alloc(width, 2)), one]), type), undefined);
  });
}
test('obsolete or forged algorithm names never select a signature fallback', () => {
  for (const type of ['ssh-dss', 'unknown', 'constructor', '__proto__', 'ecdsa-sha2-nistp256-cert-v01@openssh.com']) {
    assert.equal(signatureToNative(Buffer.alloc(64), type), undefined);
    assert.equal(signatureToSSH(Buffer.alloc(64), type), undefined);
  }
  assert.equal(signatureToNative(Buffer.alloc(63), 'ssh-ed25519'), undefined);
  assert.equal(signatureToNative(Buffer.alloc(1025), 'rsa-sha2-512'), undefined);
});
