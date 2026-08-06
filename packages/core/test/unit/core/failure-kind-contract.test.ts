import { isRecoverable, classifyFailure, type FailureKind } from '../../../src/core/failure-kind.js';

/**
 * Which failures a retry can fix, and how a failure is recognised.
 *
 * `isRecoverable` is a ten-entry table, and every entry could be flipped
 * without a test noticing — so "retry this" and "do not retry this" were
 * both unverified for eight of the ten kinds. Getting it wrong in one
 * direction retries an authentication failure until the account locks;
 * in the other it gives up on a connection that a reconnect would fix.
 *
 * The classification is what everything else branches on, so each rule is
 * checked by the text it exists to recognise — and against text it must
 * not claim, since the first matching rule wins and a broad one silently
 * shadows every rule after it.
 */
describe('whether a retry is worth trying', () => {
  const kinds: Array<[FailureKind, boolean]> = [
    // A fresh connection may succeed: the far side was reachable and
    // something in between gave out.
    ['connection-lost', true],
    ['connection-refused', true],

    // Nothing about reconnecting changes any of these.
    ['command-failed', false],
    ['timeout', false],
    ['authentication', false],
    ['not-found', false],
    ['permission-denied', false],
    ['invalid-usage', false],
    ['host-key-mismatch', false],
    ['unknown', false],
  ];

  for (const [kind, expected] of kinds) {
    it(`${expected ? 'retries' : 'does not retry'} ${kind}`, () => {
      expect(isRecoverable(kind)).toBe(expected);
    });
  }

  it('never retries a host key mismatch', () => {
    // The one where retrying is not merely useless: a changed host key is
    // what a machine-in-the-middle looks like, and a tool that reconnects
    // through it is the tool doing the damage.
    expect(isRecoverable('host-key-mismatch')).toBe(false);
  });
});

describe('recognising a failure', () => {
  describe('by errno, which is authoritative', () => {
    const errnos: Array<[string, FailureKind]> = [
      ['EHOSTKEY', 'host-key-mismatch'],
      ['ECONNREFUSED', 'connection-refused'],
      ['ENOTFOUND', 'connection-refused'],
      ['EHOSTUNREACH', 'connection-refused'],
    ];

    for (const [code, kind] of errnos) {
      it(`reads ${code} as ${kind}`, () => {
        expect(classifyFailure({ code })).toBe(kind);
      });
    }

    it('prefers the errno to the text', () => {
      // An errno is locale-independent; a message is whatever the remote
      // system's language settings produced.
      expect(classifyFailure({ code: 'ECONNREFUSED', message: 'permission denied' }))
        .toBe('connection-refused');
    });
  });

  describe('by message, when there is no errno', () => {
    const messages: Array<[string, FailureKind]> = [
      ['Host key verification failed.', 'host-key-mismatch'],
      ['REMOTE HOST IDENTIFICATION HAS CHANGED! The key does not match', 'host-key-mismatch'],
      ['Cannot connect to the Docker daemon at unix:///var/run/docker.sock', 'connection-refused'],
      ['Is the docker daemon running?', 'connection-refused'],
      ['connection reset by peer', 'connection-lost'],
      ['Connection lost', 'connection-lost'],
      ['connection closed by remote host', 'connection-lost'],
      ['write EPIPE: broken pipe', 'connection-lost'],
      ['unexpected EOF', 'connection-lost'],
      ['connect ECONNREFUSED: connection refused', 'connection-refused'],
      ['could not resolve host: nope.example', 'connection-refused'],
      ['no route to host', 'connection-refused'],
      ['Authentication failed.', 'authentication'],
      ['Authentication failure', 'authentication'],
      ['Permission denied (publickey).', 'authentication'],
      ['All configured authentication methods failed', 'authentication'],
      ['401 Unauthorized', 'authentication'],
      ['No such container: api', 'not-found'],
      ['no such file or directory', 'not-found'],
      ['Error: not found', 'not-found'],
      ['permission denied', 'permission-denied'],
      ['Access is denied.', 'permission-denied'],
      ['403 Forbidden', 'permission-denied'],
    ];

    for (const [message, kind] of messages) {
      it(`reads ${JSON.stringify(message.slice(0, 42))} as ${kind}`, () => {
        expect(classifyFailure(new Error(message))).toBe(kind);
      });
    }

    it('reads a bare string as its own message', () => {
      expect(classifyFailure('connection refused')).toBe('connection-refused');
    });

    it('gives up rather than guessing', () => {
      // `unknown` is a useful answer. A wrong classification is not, and
      // every consumer branches on this.
      expect(classifyFailure(new Error('the flux capacitor is unhappy'))).toBe('unknown');
      expect(classifyFailure({})).toBe('unknown');
      expect(classifyFailure(undefined)).toBe('unknown');
      expect(classifyFailure(null)).toBe('unknown');
    });
  });

  describe('order between the rules', () => {
    it('prefers a publickey denial to a plain one', () => {
      // `permission denied (publickey)` is an authentication failure and
      // `permission denied` alone is not. The narrower rule must be first,
      // or every key problem reads as a file-permission problem.
      expect(classifyFailure(new Error('Permission denied (publickey,password).')))
        .toBe('authentication');
    });

    it('prefers a docker daemon refusal to a plain refusal', () => {
      expect(classifyFailure(new Error('Cannot connect to the Docker daemon. Is the docker daemon running?')))
        .toBe('connection-refused');
    });

    it('prefers a host key mismatch to anything else in the line', () => {
      expect(classifyFailure(new Error('Host key verification failed. Permission denied (publickey).')))
        .toBe('host-key-mismatch');
    });
  });

  describe('an error that already knows what it is', () => {
    it('keeps its verdict', () => {
      expect(classifyFailure({ kind: 'timeout', message: 'connection refused' })).toBe('timeout');
    });

    it('ignores a kind that is not one', () => {
      // Anything can set `.kind`; only the ten names mean something.
      expect(classifyFailure({ kind: 'made-up', message: 'connection refused' }))
        .toBe('connection-refused');
    });
  });

  describe('an aggregate error', () => {
    it('looks inside for the real cause', () => {
      // Node reports one AggregateError when several address families
      // fail; the classification lives in the members, not the wrapper.
      const aggregate = Object.assign(new Error('connect failed'), {
        errors: [new Error('nothing helpful'), Object.assign(new Error('x'), { code: 'ECONNREFUSED' })],
      });

      expect(classifyFailure(aggregate)).toBe('connection-refused');
    });

    it('takes the first member that classifies', () => {
      const aggregate = Object.assign(new Error('connect failed'), {
        errors: [new Error('Authentication failed'), Object.assign(new Error('x'), { code: 'ECONNREFUSED' })],
      });

      expect(classifyFailure(aggregate)).toBe('authentication');
    });

    it('stays unknown when no member says anything', () => {
      const aggregate = Object.assign(new Error('failed'), {
        errors: [new Error('a'), new Error('b')],
      });

      expect(classifyFailure(aggregate)).toBe('unknown');
    });
  });
  describe('the exact wording each rule was written for', () => {
    it('reads a key mismatch however many words separate the phrase', () => {
      // `host key .* not match`: the words between vary by OpenSSH version
      // and by what it is comparing against.
      expect(classifyFailure(new Error('The ECDSA host key for h has changed and does not match'))).toBe('host-key-mismatch');
      expect(classifyFailure(new Error('host key for [h]:22 does not match'))).toBe('host-key-mismatch');
    });

    it('reads a key missing from the checking file', () => {
      expect(classifyFailure(new Error('The host key is not in the file used for host key checking')))
        .toBe('host-key-mismatch');
    });

    it('reads EOF only at the end of the line', () => {
      // `eof$` is deliberately anchored: "eof" appears inside ordinary
      // words and inside paths, and a rule that fires on any of them
      // reports a lost connection where there was none.
      expect(classifyFailure(new Error('stream closed with EOF'))).toBe('connection-lost');
      expect(classifyFailure(new Error('reading /var/eof/report succeeded'))).toBe('unknown');
    });

    it('reads the spellings of a closed connection', () => {
      expect(classifyFailure(new Error('Connection reset by peer'))).toBe('connection-lost');
      // The words must be adjacent: 'connection' near 'lost' anywhere in a
      // paragraph is not the same statement.
      expect(classifyFailure(new Error('ssh: connection lost'))).toBe('connection-lost');
      expect(classifyFailure(new Error('the connection to the archive was lost in 2019'))).toBe('unknown');
      expect(classifyFailure(new Error('connection closed'))).toBe('connection-lost');
    });
  });

  describe('a kind set by the caller', () => {
    const kinds: FailureKind[] = [
      'command-failed', 'timeout', 'connection-lost', 'connection-refused',
      'authentication', 'not-found', 'permission-denied', 'invalid-usage',
      'host-key-mismatch', 'unknown',
    ];

    for (const kind of kinds) {
      it(`keeps ${kind}`, () => {
        // Every name has to be recognised as valid, or an error that had
        // already been classified is silently re-classified from its text.
        expect(classifyFailure({ kind, message: 'authentication failed' })).toBe(kind);
      });
    }
  });
});
