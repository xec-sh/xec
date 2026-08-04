import { isRecoverable, classifyFailure } from '../../../src/core/failure-kind.js';
import { CommandError, TimeoutError, ConnectionError } from '../../../src/core/error.js';

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
