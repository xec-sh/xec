import { CommandError, TimeoutError, ConnectionError } from '../../../src/core/error.js';
import { isRecoverable, classifyFailure, resolveExitCode, type FailureKind } from '../../../src/core/failure-kind.js';

/**
 * Consumers branch on *why* an operation failed — reconnect after a daemon
 * restart, re-prompt on bad credentials. Without a stable classification they
 * pattern-match on error text, which breaks on any rewording. These tests pin
 * the classification contract.
 */
describe('classifyFailure', () => {
  it('prefers an authoritative errno over message text', () => {
    expect(classifyFailure({ code: 'ECONNREFUSED', message: 'whatever' })).toBe(
      'connection-refused'
    );
    expect(classifyFailure({ code: 'ECONNRESET', message: 'whatever' })).toBe('connection-lost');
    expect(classifyFailure({ code: 'EACCES' })).toBe('permission-denied');
    expect(classifyFailure({ code: 'ENOENT' })).toBe('not-found');
  });

  it('recognises the Docker daemon being down', () => {
    // This is the exact wording a consumer had to regex for.
    expect(classifyFailure(new Error('Cannot connect to the Docker daemon at unix:///var/run/docker.sock'))).toBe(
      'connection-refused'
    );
    expect(classifyFailure(new Error('Is the docker daemon running?'))).toBe('connection-refused');
  });

  it('recognises a transport that died mid-flight', () => {
    expect(classifyFailure(new Error('connection reset by peer'))).toBe('connection-lost');
    expect(classifyFailure(new Error('Connection lost before handshake'))).toBe('connection-lost');
    expect(classifyFailure(new Error('write EPIPE: broken pipe'))).toBe('connection-lost');
  });

  it('recognises rejected credentials', () => {
    expect(classifyFailure(new Error('All configured authentication methods failed'))).toBe(
      'authentication'
    );
    expect(classifyFailure(new Error('sudo: Authentication failed, try again.'))).toBe(
      'authentication'
    );
  });

  it('recognises a missing target', () => {
    expect(classifyFailure(new Error("Error: No such container: web-1"))).toBe('not-found');
    expect(classifyFailure(new Error('pods "api" not found'))).toBe('not-found');
  });

  it('unwraps an AggregateError to find the real cause', () => {
    const aggregate = Object.assign(new Error(''), {
      errors: [
        { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED ::1:2207' },
        { code: 'ECONNREFUSED', message: 'connect ECONNREFUSED 127.0.0.1:2207' },
      ],
    });

    expect(classifyFailure(aggregate)).toBe('connection-refused');
  });

  it('accepts a bare stderr string', () => {
    expect(classifyFailure('no such container: api')).toBe('not-found');
  });

  it('returns unknown rather than guessing', () => {
    expect(classifyFailure(new Error('something entirely novel'))).toBe('unknown');
    expect(classifyFailure(null)).toBe('unknown');
    expect(classifyFailure(undefined)).toBe('unknown');
  });

  it('maps every errno it knows to its kind, without reading the message', () => {
    // An errno is authoritative and locale-independent; the message alongside
    // it may say something else entirely and must not win.
    const byErrno: Array<[string, FailureKind]> = [
      ['EHOSTKEY', 'host-key-mismatch'],
      ['ECONNREFUSED', 'connection-refused'],
      ['ENOTFOUND', 'connection-refused'],
      ['EHOSTUNREACH', 'connection-refused'],
      ['ENETUNREACH', 'connection-refused'],
      ['ECONNRESET', 'connection-lost'],
      ['EPIPE', 'connection-lost'],
      ['ETIMEDOUT', 'timeout'],
      ['EACCES', 'permission-denied'],
      ['EPERM', 'permission-denied'],
      ['ENOENT', 'not-found'],
    ];

    for (const [code, kind] of byErrno) {
      expect(classifyFailure({ code, message: 'unrelated wording' }), code).toBe(kind);
    }
  });

  it('keeps the verdict of an already-classified error', () => {
    // A re-thrown ExecutionError already carries its kind; re-deriving it
    // from the message would let wording overrule the original classification.
    expect(classifyFailure({ kind: 'timeout', message: 'connection refused' })).toBe('timeout');
    expect(classifyFailure({ kind: 'command-failed', message: 'timed out' })).toBe('command-failed');
  });

  it('ignores a kind it does not recognise and falls back to the message', () => {
    expect(classifyFailure({ kind: 'nonsense', message: 'connection refused' })).toBe(
      'connection-refused'
    );
  });

  it('recognises each documented wording of a transport loss', () => {
    expect(classifyFailure('connection closed by remote host')).toBe('connection-lost');
    expect(classifyFailure('unexpected EOF while reading')).toBe('connection-lost');
    expect(classifyFailure('stream ended: EOF')).toBe('connection-lost');
  });

  it('recognises each documented wording of an unreachable peer', () => {
    expect(classifyFailure('could not resolve host: registry.internal')).toBe('connection-refused');
    expect(classifyFailure('no route to host')).toBe('connection-refused');
  });

  it('classifies an SSH publickey rejection as authentication, not permission', () => {
    // The wording contains "permission denied", but retrying with the same
    // key will not help — it must not be filed under permission-denied.
    expect(classifyFailure('Permission denied (publickey,password)')).toBe('authentication');
    expect(classifyFailure('401 Unauthorized')).toBe('authentication');
  });

  it('recognises each documented wording of a missing target', () => {
    expect(classifyFailure('no such file or directory')).toBe('not-found');
    expect(classifyFailure('no such host')).toBe('not-found');
    expect(classifyFailure('secret "tls-cert" not found')).toBe('not-found');
  });

  it('recognises each documented wording of a denied operation', () => {
    expect(classifyFailure('open /root/.ssh: permission denied')).toBe('permission-denied');
    expect(classifyFailure('Access is denied.')).toBe('permission-denied');
    expect(classifyFailure('403 Forbidden')).toBe('permission-denied');
  });

  it('recognises a timeout reported as text', () => {
    expect(classifyFailure('operation timed out')).toBe('timeout');
    expect(classifyFailure('context deadline exceeded (timeout)')).toBe('timeout');
  });

  it('ignores an empty aggregate and keeps looking at nothing', () => {
    expect(classifyFailure({ errors: [] })).toBe('unknown');
    expect(classifyFailure({ errors: [{ message: 'novel' }] })).toBe('unknown');
  });
});

describe('resolveExitCode', () => {
  it('passes a numeric exit code through, including zero', () => {
    expect(resolveExitCode(0)).toBe(0);
    expect(resolveExitCode(3)).toBe(3);
    expect(resolveExitCode(137)).toBe(137);
    // A number wins even when a signal is also reported.
    expect(resolveExitCode(0, 'SIGKILL')).toBe(0);
  });

  it('reports 128 + signum for a signalled process, like a shell', () => {
    // Coalescing a SIGKILL to 0 made an OOM kill read as success.
    const bySignal: Array<[string, number]> = [
      ['SIGHUP', 129],
      ['SIGINT', 130],
      ['SIGQUIT', 131],
      ['SIGILL', 132],
      ['SIGABRT', 134],
      ['SIGFPE', 136],
      ['SIGKILL', 137],
      ['SIGSEGV', 139],
      ['SIGPIPE', 141],
      ['SIGALRM', 142],
      ['SIGTERM', 143],
    ];

    for (const [signal, code] of bySignal) {
      expect(resolveExitCode(null, signal), signal).toBe(code);
      expect(resolveExitCode(undefined, signal), signal).toBe(code);
    }
  });

  it('reports 128 for a signal it has no number for', () => {
    expect(resolveExitCode(null, 'SIGUSR2')).toBe(128);
  });

  it('reports 0 only when there is neither a code nor a signal', () => {
    expect(resolveExitCode(null)).toBe(0);
    expect(resolveExitCode(undefined, null)).toBe(0);
  });
});

describe('isRecoverable', () => {
  it('marks transport failures worth retrying after a reconnect', () => {
    expect(isRecoverable('connection-lost')).toBe(true);
    expect(isRecoverable('connection-refused')).toBe(true);
  });

  it('never treats a host key mismatch as recoverable', () => {
    // Auto-reconnecting after a key mismatch would hand a possible impostor
    // another attempt at the session.
    expect(isRecoverable('host-key-mismatch')).toBe(false);
    expect(classifyFailure({ code: 'EHOSTKEY', message: 'HOST KEY VERIFICATION FAILED' })).toBe(
      'host-key-mismatch'
    );
    expect(classifyFailure(new Error('HOST KEY VERIFICATION FAILED for [host]:22'))).toBe(
      'host-key-mismatch'
    );
  });

  it('refuses to call a rejected credential or a missing target recoverable', () => {
    // Retrying these only multiplies the error.
    expect(isRecoverable('authentication')).toBe(false);
    expect(isRecoverable('not-found')).toBe(false);
    expect(isRecoverable('permission-denied')).toBe(false);
    expect(isRecoverable('command-failed')).toBe(false);
    expect(isRecoverable('unknown')).toBe(false);
  });
});

describe('built-in errors carry an authoritative classification', () => {
  it('classifies a non-zero exit as command-failed, not by message text', () => {
    const error = new CommandError('cat /etc/shadow', 1, undefined, '', 'Permission denied', 5);

    // The stderr says "Permission denied", but the command ran — the process
    // exited non-zero, which is a different thing from the API being denied.
    expect(error.kind).toBe('command-failed');
    expect(error.recoverable).toBe(false);
  });

  it('classifies a timeout', () => {
    const error = new TimeoutError('sleep 100', 5000);
    expect(error.kind).toBe('timeout');
    expect(error.recoverable).toBe(false);
  });

  it('classifies a connection failure from its underlying cause', () => {
    const error = new ConnectionError(
      'web-1',
      Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    );

    expect(error.kind).toBe('connection-refused');
    expect(error.recoverable).toBe(true);
  });
});
