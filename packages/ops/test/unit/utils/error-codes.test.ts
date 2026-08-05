import * as path from 'node:path';
import { statSync, readdirSync, readFileSync } from 'node:fs';

import {
  isXecErrorCode,
  XEC_ERROR_CODES,
  XEC_ERROR_MEANINGS,
} from '../../../src/utils/error-codes.js';

/**
 * The `code` on a failure is the part a script matches on, so it is a
 * promise in the same way an exported name is. This pins the vocabulary
 * so that adding a code is a decision and losing one is a failure, and
 * checks that the catalogue still describes the codes the source emits —
 * a documented code nothing produces is as misleading as an undocumented
 * one that appears in someone's output.
 */
describe('the error code vocabulary', () => {
  it('explains every code it defines', () => {
    for (const code of XEC_ERROR_CODES) {
      expect(XEC_ERROR_MEANINGS[code], code).toBeTruthy();
      expect(XEC_ERROR_MEANINGS[code].length, code).toBeGreaterThan(20);
    }
  });

  it('describes nothing it does not define', () => {
    const described = Object.keys(XEC_ERROR_MEANINGS);
    const defined = new Set<string>(XEC_ERROR_CODES);

    expect(described.filter(code => !defined.has(code))).toEqual([]);
  });

  it('has no two codes for one idea', () => {
    // `TIMEOUT` and `TIMEOUT_ERROR` both existed, produced by different
    // layers for the same event, so a matcher written against one silently
    // missed half the cases.
    const stems = XEC_ERROR_CODES.map(code => code.replace(/_ERROR$/, ''));

    expect(new Set(stems).size).toBe(stems.length);
  });

  it('recognises its own codes and not system ones', () => {
    // System error numbers are passed through unchanged: they are already
    // a vocabulary everyone knows, and a parallel one would be worse.
    expect(isXecErrorCode('VALIDATION_ERROR')).toBe(true);
    expect(isXecErrorCode('ENOENT')).toBe(false);
    expect(isXecErrorCode('')).toBe(false);
  });

  describe('against the source', () => {
    /** Every string literal that looks like a code, as the source emits it. */
    const emitted = (): Set<string> => {
      const found = new Set<string>();
      const root = path.resolve(__dirname, '../../../src');

      const walk = (dir: string): void => {
        for (const entry of readdirSync(dir)) {
          const full = path.join(dir, entry);
          if (statSync(full).isDirectory()) {
            walk(full);
            continue;
          }
          if (!entry.endsWith('.ts') || entry === 'error-codes.ts') continue;

          const text = readFileSync(full, 'utf-8');
          // A code appears as the second argument to an error constructor
          // or as a `code:` property. Both are quoted screaming snake case.
          for (const match of text.matchAll(/'([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)'/g)) {
            found.add(match[1]!);
          }
        }
      };

      walk(root);
      return found;
    };

    it('defines every code the source produces', () => {
      // Known non-codes: environment variables and system errnos share the
      // shape, and neither belongs in the catalogue.
      const notCodes = /^(XEC_|E[A-Z]+$|NODE_|npm_|SIGN?[A-Z]*$)/;
      const systemErrno = new Set([
        'ENOENT', 'EACCES', 'EADDRINUSE', 'ECONNREFUSED', 'EHOSTUNREACH',
        'EISDIR', 'EMFILE', 'ENOMEM', 'ENOSPC', 'ENOTDIR', 'ETIMEDOUT',
        'MODULE_NOT_FOUND', 'PERMISSION_DENIED',
      ]);

      const candidates = [...emitted()].filter(code =>
        code.endsWith('_ERROR') || code.endsWith('_FAILED') || code.endsWith('_NOT_FOUND')
      );

      const undocumented = candidates.filter(code =>
        !isXecErrorCode(code) && !notCodes.test(code) && !systemErrno.has(code)
      );

      expect(
        undocumented,
        `emitted but not in the catalogue: ${undocumented.join(', ')}. ` +
        'A code a caller can see is one they may match on; add it, or stop emitting it.'
      ).toEqual([]);
    });
  });
});
