import { platform } from 'node:os';
import { delimiter } from 'node:path';
import { it, expect, describe, beforeEach } from 'vitest';

import {
  findBinary,
  EXTENDED_PATH,
  getExtendedEnv,
  clearBinaryCache,
  isBinaryAvailable,
} from '../../src/utils/binary-detector.js';

/**
 * Locating the tools the fixtures drive — docker, kubectl, kind, sshpass.
 *
 * When this answers wrongly a suite does not fail; it *skips*, and reports
 * green having proven nothing. That makes it worth more scrutiny than most
 * code, not less.
 */
describe('the search path', () => {
  it('is joined with this platform’s separator', () => {
    // `':'` was hard-coded. On Windows that produces one unusable entry out
    // of the whole PATH, so every lookup that leaned on it found nothing —
    // and every fixture-backed suite skipped.
    expect(EXTENDED_PATH.includes(delimiter)).toBe(true);

    if (platform() === 'win32') {
      expect(EXTENDED_PATH.includes(';')).toBe(true);
    }
  });

  it('adds POSIX locations only where they can exist', () => {
    const entries = EXTENDED_PATH.split(delimiter);

    if (platform() === 'win32') {
      expect(entries.some(e => e.startsWith('/usr/'))).toBe(false);
    } else {
      expect(entries).toContain('/usr/local/bin');
    }
  });

  it('keeps the inherited PATH first', () => {
    // Prepending ours would shadow a deliberately chosen tool.
    const inherited = (process.env['PATH'] ?? '').split(delimiter)[0];
    if (inherited) {
      expect(EXTENDED_PATH.split(delimiter)[0]).toBe(inherited);
    }
  });

  it('hands the extended path to a child’s environment', () => {
    const env = getExtendedEnv({ XEC_MARKER: 'set' });

    expect(env['PATH']).toBe(EXTENDED_PATH);
    expect(env['XEC_MARKER']).toBe('set');
  });

  it('lets the caller override anything but the path', () => {
    // PATH is the point of the helper; a caller overriding it by accident
    // would silently undo the search.
    expect(getExtendedEnv({ PATH: '/nowhere' })['PATH']).toBe(EXTENDED_PATH);
  });
});

describe('finding a binary', () => {
  beforeEach(() => {
    clearBinaryCache();
  });

  it('finds one that exists', () => {
    // `node` is running this test, so it is on the path by construction.
    expect(findBinary('node')).toBeTruthy();
  });

  it('answers null for one that does not, rather than throwing', () => {
    expect(findBinary('xec-no-such-binary')).toBeNull();
  });

  it('refuses a name that could carry shell syntax', () => {
    // The name reaches `which`/`where` through a shell.
    expect(() => findBinary('node; rm -rf /')).toThrow(/Invalid binary name/);
  });

  it('remembers both answers', () => {
    // Including the negative one: re-running `which` for every absent tool
    // is the common case in a suite that skips.
    expect(findBinary('xec-no-such-binary')).toBeNull();
    expect(findBinary('xec-no-such-binary')).toBeNull();
    expect(findBinary('node')).toBe(findBinary('node'));
  });

  it('forgets when told to', () => {
    const first = findBinary('node');
    clearBinaryCache();

    expect(findBinary('node')).toBe(first);
  });

  it('returns a path with no line ending attached', () => {
    // `where` answers CRLF and can list several matches. A path carrying a
    // carriage return fails every existsSync that follows.
    const found = findBinary('node');

    expect(found).not.toMatch(/[\r\n]/);
  });

  it('agrees with isBinaryAvailable', () => {
    expect(isBinaryAvailable('node')).toBe(true);
    expect(isBinaryAvailable('xec-no-such-binary')).toBe(false);
  });
});
