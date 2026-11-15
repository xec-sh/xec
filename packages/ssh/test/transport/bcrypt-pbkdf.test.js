// Vectors: OpenBSD bcrypt_pbkdf_test.c v1.7 (2014), Ted Unangst.
// ISC permission/disclaimer retained in BCRYPT-LICENSE and PROVENANCE.json.
import test from 'node:test';
import assert from 'node:assert/strict';

import { bcryptPbkdf, BCRYPT_LIMITS } from '../../src/transport/protocol/bcrypt-pbkdf.js';

const vectors = [
  ['password', 'salt', 4, 32, '5bbf0cc293587f1c3635555c27796598d47e579071bf427e9d8fbe842aba34d9'],
  ['password', '\0', 4, 16, 'c12b566235eee04c212598970a579a67'],
  ['\0', 'salt', 4, 16, '6051be18c2f4f82cbf0efee5471b4bb9'],
  ['password\0', 'salt\0', 4, 32, '7410e44cf4fa07bfaac8a928b1727fac001375e7bf7384370f48efd121743050'],
  ['pass\0wor', 'sa\0l', 4, 16, 'c2bffd9db38f6569efef4372f4de83c0'],
  ['pass\0word', 'sa\0lt', 4, 16, '4ba4ac3925c0e8d7f0cdb6bb1684a56f'],
  [
    'password',
    'salt',
    8,
    64,
    'e1367ec5151a33faac4cc1c144cd23fa15d5548493ecc99b9b5d9c0d3b27bec76227ea66088b849b20ab7aa478010246e74bba51723fefa9f9474d6508845e8d',
  ],
  ['password', 'salt', 42, 16, '833cf0dcf56db65608e8f0dc0ce882bd'],
];
for (const [index, [password, salt, rounds, length, expected]] of vectors.entries()) {
  test(`OpenBSD bcrypt-PBKDF vector ${index + 1} preserves exact output and caller buffers`, () => {
    const pass = Buffer.from(password),
      inputSalt = Buffer.from(salt);
    assert.equal(bcryptPbkdf(pass, inputSalt, rounds, length).toString('hex'), expected);
    assert.equal(pass.toString(), password);
    assert.equal(inputSalt.toString(), salt);
  });
}
test('bcrypt-PBKDF bounds reject unsupported work before deriving or allocating output', () => {
  const password = Buffer.from('password'),
    salt = Buffer.from('salt');
  for (const rounds of [0, -1, 0.5, NaN, Infinity, BCRYPT_LIMITS.rounds + 1])
    assert.throws(() => bcryptPbkdf(password, salt, rounds, 32), /rounds/);
  for (const length of [0, -1, 0.5, NaN, Infinity, BCRYPT_LIMITS.keyBytes + 1])
    assert.throws(() => bcryptPbkdf(password, salt, 4, length), /output/);
  for (const pass of [Buffer.alloc(0), Buffer.alloc(BCRYPT_LIMITS.passwordBytes + 1), 'password'])
    assert.throws(() => bcryptPbkdf(pass, salt, 4, 32), /password/);
  for (const inputSalt of [Buffer.alloc(0), Buffer.alloc(BCRYPT_LIMITS.saltBytes + 1), 'salt'])
    assert.throws(() => bcryptPbkdf(password, inputSalt, 4, 32), /salt/);
});
