// Protocol constants adapted from ssh2 1.17.0; see package LICENSE.
import * as crypto from 'node:crypto';

import { MAC_INFO, CIPHER_INFO } from './crypto.js';

function supported(operation) {
  try {
    operation();
    return true;
  } catch {
    return false;
  }
}
const empty = Buffer.alloc(0);
const hashes = Object.fromEntries(
  ['sha256', 'sha384', 'sha512'].map((hash) => [hash, supported(() => crypto.createHash(hash).update(empty).digest())])
);
const eddsaSupported = supported(() => {
  const pair = crypto.generateKeyPairSync('ed25519');
  if (!crypto.verify(null, empty, pair.publicKey, crypto.sign(null, empty, pair.privateKey)))
    throw new Error('Ed25519 unavailable');
});
const curve25519Supported =
  hashes.sha256 &&
  supported(() => {
    const pair = crypto.generateKeyPairSync('x25519');
    crypto.diffieHellman({ privateKey: pair.privateKey, publicKey: pair.publicKey });
  });
const ecCurves = [
  ['nistp256', 'prime256v1', 'sha256'],
  ['nistp384', 'secp384r1', 'sha384'],
  ['nistp521', 'secp521r1', 'sha512'],
];
const ec = ecCurves.filter(
  ([, namedCurve, hash]) =>
    hashes[hash] &&
    supported(() => {
      const exchange = crypto.createECDH(namedCurve);
      const publicKey = exchange.generateKeys();
      exchange.computeSecret(publicKey);
      const pair = crypto.generateKeyPairSync('ec', { namedCurve });
      const signature = crypto.sign(hash, empty, { key: pair.privateKey, dsaEncoding: 'ieee-p1363' });
      if (!crypto.verify(hash, empty, { key: pair.publicKey, dsaEncoding: 'ieee-p1363' }, signature))
        throw new Error('Native IEEE-P1363 ECDSA unavailable');
    })
);
// A public-only, synthetic ssh2 test fixture checks RSA verification without
// generating an expensive RSA key at transport import. No private key is stored.
const rsaPublic = {
  kty: 'RSA',
  e: 'AQAB',
  n: '4q6eZdx7LYh46PcZNcS3CnO7GuYsEJZeTj5LQSgp21IyTelaBPprijnMwKa-pLQt5TEobpKFFNecPdT6oPoOKKMe6oH_pX0BNyAEB9KFZfZgh0v4J4IOiO0KHMBNkoTFeGrursPkqYRJ0HL4CqYqRdINy1sgDU6jUIOuDD5XZzlpDXb1ftZoCei9OHSWrMKbzibJc64JFM7tUoK6Vl64YiPgxsNXOJYMTrelVJYebtsNrJFmh3XXQABDVutWMYb8I6IrNs8zjxsf6c6N2tKXkk9G4EDKKip4g0bzDmD_fREPQ9vLi59N-ZsyjWCKKE3PZSvwtoyLQN38KvTx3wjNQw',
};
const rsa = ['sha512', 'sha256'].filter(
  (hash) =>
    hashes[hash] &&
    supported(() => {
      crypto.verify(hash, empty, crypto.createPublicKey({ key: rsaPublic, format: 'jwk' }), Buffer.alloc(256));
    })
);
const groups = [
  ['group14-sha256', 'modp14', 'sha256'],
  ['group16-sha512', 'modp16', 'sha512'],
].filter(([, group, hash]) => hashes[hash] && supported(() => crypto.createDiffieHellmanGroup(group).generateKeys()));
const DEFAULT_KEX = Object.freeze([
  ...(curve25519Supported ? ['curve25519-sha256'] : []),
  ...ec.map(([name]) => `ecdh-sha2-${name}`),
  ...groups.map(([name]) => `diffie-hellman-${name}`),
]);
const SUPPORTED_KEX = DEFAULT_KEX;
const DEFAULT_SERVER_HOST_KEY = Object.freeze([
  ...(eddsaSupported ? ['ssh-ed25519'] : []),
  ...ec.map(([name]) => `ecdsa-sha2-${name}`),
  ...rsa.map((hash) => `rsa-sha2-${hash.slice(3)}`),
]);
const SUPPORTED_SERVER_HOST_KEY = DEFAULT_SERVER_HOST_KEY;
const DEFAULT_CIPHER = Object.keys(CIPHER_INFO);
const SUPPORTED_CIPHER = DEFAULT_CIPHER;
const DEFAULT_MAC = Object.keys(MAC_INFO);
const SUPPORTED_MAC = DEFAULT_MAC;
const DEFAULT_COMPRESSION = ['none'];
const SUPPORTED_COMPRESSION = DEFAULT_COMPRESSION;
export const MESSAGE = {
  // Transport layer protocol -- generic (1-19)
  DISCONNECT: 1,
  IGNORE: 2,
  UNIMPLEMENTED: 3,
  DEBUG: 4,
  SERVICE_REQUEST: 5,
  SERVICE_ACCEPT: 6,
  EXT_INFO: 7, // RFC 8308

  // Transport layer protocol -- algorithm negotiation (20-29)
  KEXINIT: 20,
  NEWKEYS: 21,

  // Transport layer protocol -- key exchange method-specific (30-49)
  KEXDH_INIT: 30,
  KEXDH_REPLY: 31,

  KEXDH_GEX_GROUP: 31,
  KEXDH_GEX_INIT: 32,
  KEXDH_GEX_REPLY: 33,
  KEXDH_GEX_REQUEST: 34,

  KEXECDH_INIT: 30,
  KEXECDH_REPLY: 31,

  // User auth protocol -- generic (50-59)
  USERAUTH_REQUEST: 50,
  USERAUTH_FAILURE: 51,
  USERAUTH_SUCCESS: 52,
  USERAUTH_BANNER: 53,

  // User auth protocol -- user auth method-specific (60-79)
  USERAUTH_PASSWD_CHANGEREQ: 60,

  USERAUTH_PK_OK: 60,

  USERAUTH_INFO_REQUEST: 60,
  USERAUTH_INFO_RESPONSE: 61,

  // Connection protocol -- generic (80-89)
  GLOBAL_REQUEST: 80,
  REQUEST_SUCCESS: 81,
  REQUEST_FAILURE: 82,

  // Connection protocol -- channel-related (90-127)
  CHANNEL_OPEN: 90,
  CHANNEL_OPEN_CONFIRMATION: 91,
  CHANNEL_OPEN_FAILURE: 92,
  CHANNEL_WINDOW_ADJUST: 93,
  CHANNEL_DATA: 94,
  CHANNEL_EXTENDED_DATA: 95,
  CHANNEL_EOF: 96,
  CHANNEL_CLOSE: 97,
  CHANNEL_REQUEST: 98,
  CHANNEL_SUCCESS: 99,
  CHANNEL_FAILURE: 100,

  // Reserved for client protocols (128-191)

  // Local extensions (192-155)
};
export const DISCONNECT_REASON = {
  HOST_NOT_ALLOWED_TO_CONNECT: 1,
  PROTOCOL_ERROR: 2,
  KEY_EXCHANGE_FAILED: 3,
  RESERVED: 4,
  MAC_ERROR: 5,
  COMPRESSION_ERROR: 6,
  SERVICE_NOT_AVAILABLE: 7,
  PROTOCOL_VERSION_NOT_SUPPORTED: 8,
  HOST_KEY_NOT_VERIFIABLE: 9,
  CONNECTION_LOST: 10,
  BY_APPLICATION: 11,
  TOO_MANY_CONNECTIONS: 12,
  AUTH_CANCELED_BY_USER: 13,
  NO_MORE_AUTH_METHODS_AVAILABLE: 14,
  ILLEGAL_USER_NAME: 15,
};
export const DISCONNECT_REASON_STR = undefined;
export const CHANNEL_OPEN_FAILURE = {
  ADMINISTRATIVELY_PROHIBITED: 1,
  CONNECT_FAILED: 2,
  UNKNOWN_CHANNEL_TYPE: 3,
  RESOURCE_SHORTAGE: 4,
};
export const TERMINAL_MODE = {
  TTY_OP_END: 0, // Indicates end of options.
  VINTR: 1, // Interrupt character; 255 if none. Similarly for the
  //  other characters.  Not all of these characters are
  //  supported on all systems.
  VQUIT: 2, // The quit character (sends SIGQUIT signal on POSIX
  //  systems).
  VERASE: 3, // Erase the character to left of the cursor.
  VKILL: 4, // Kill the current input line.
  VEOF: 5, // End-of-file character (sends EOF from the
  //  terminal).
  VEOL: 6, // End-of-line character in addition to carriage
  //  return and/or linefeed.
  VEOL2: 7, // Additional end-of-line character.
  VSTART: 8, // Continues paused output (normally control-Q).
  VSTOP: 9, // Pauses output (normally control-S).
  VSUSP: 10, // Suspends the current program.
  VDSUSP: 11, // Another suspend character.
  VREPRINT: 12, // Reprints the current input line.
  VWERASE: 13, // Erases a word left of cursor.
  VLNEXT: 14, // Enter the next character typed literally, even if
  //  it is a special character
  VFLUSH: 15, // Character to flush output.
  VSWTCH: 16, // Switch to a different shell layer.
  VSTATUS: 17, // Prints system status line (load, command, pid,
  //  etc).
  VDISCARD: 18, // Toggles the flushing of terminal output.
  IGNPAR: 30, // The ignore parity flag.  The parameter SHOULD be 0
  //  if this flag is FALSE, and 1 if it is TRUE.
  PARMRK: 31, // Mark parity and framing errors.
  INPCK: 32, // Enable checking of parity errors.
  ISTRIP: 33, // Strip 8th bit off characters.
  INLCR: 34, // Map NL into CR on input.
  IGNCR: 35, // Ignore CR on input.
  ICRNL: 36, // Map CR to NL on input.
  IUCLC: 37, // Translate uppercase characters to lowercase.
  IXON: 38, // Enable output flow control.
  IXANY: 39, // Any char will restart after stop.
  IXOFF: 40, // Enable input flow control.
  IMAXBEL: 41, // Ring bell on input queue full.
  ISIG: 50, // Enable signals INTR, QUIT, [D]SUSP.
  ICANON: 51, // Canonicalize input lines.
  XCASE: 52, // Enable input and output of uppercase characters by
  //  preceding their lowercase equivalents with "\".
  ECHO: 53, // Enable echoing.
  ECHOE: 54, // Visually erase chars.
  ECHOK: 55, // Kill character discards current line.
  ECHONL: 56, // Echo NL even if ECHO is off.
  NOFLSH: 57, // Don't flush after interrupt.
  TOSTOP: 58, // Stop background jobs from output.
  IEXTEN: 59, // Enable extensions.
  ECHOCTL: 60, // Echo control characters as ^(Char).
  ECHOKE: 61, // Visual erase for line kill.
  PENDIN: 62, // Retype pending input.
  OPOST: 70, // Enable output processing.
  OLCUC: 71, // Convert lowercase to uppercase.
  ONLCR: 72, // Map NL to CR-NL.
  OCRNL: 73, // Translate carriage return to newline (output).
  ONOCR: 74, // Translate newline to carriage return-newline
  //  (output).
  ONLRET: 75, // Newline performs a carriage return (output).
  CS7: 90, // 7 bit mode.
  CS8: 91, // 8 bit mode.
  PARENB: 92, // Parity enable.
  PARODD: 93, // Odd parity, else even.
  TTY_OP_ISPEED: 128, // Specifies the input baud rate in bits per second.
  TTY_OP_OSPEED: 129, // Specifies the output baud rate in bits per second.
};
export const CHANNEL_EXTENDED_DATATYPE = {
  STDERR: 1,
};
export const SIGNALS = [
  'ABRT',
  'ALRM',
  'FPE',
  'HUP',
  'ILL',
  'INT',
  'QUIT',
  'SEGV',
  'TERM',
  'USR1',
  'USR2',
  'KILL',
  'PIPE',
].reduce((cur, val) => ({ ...cur, [val]: 1 }), {});
export { DEFAULT_KEX };
export { SUPPORTED_KEX };
export { DEFAULT_SERVER_HOST_KEY };
export { SUPPORTED_SERVER_HOST_KEY };
export { DEFAULT_CIPHER };
export { SUPPORTED_CIPHER };
export { DEFAULT_MAC };
export { SUPPORTED_MAC };
export { DEFAULT_COMPRESSION };
export { SUPPORTED_COMPRESSION };
export { curve25519Supported };
export { eddsaSupported };

export const DISCONNECT_REASON_BY_VALUE = Array.from(Object.entries(DISCONNECT_REASON)).reduce(
  (obj, [key, value]) => ({ ...obj, [value]: key }),
  {}
);
