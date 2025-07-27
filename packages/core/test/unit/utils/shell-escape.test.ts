import { it, expect, describe } from '@jest/globals';

import { escapeArg, escapeCommand } from '../../../src/utils/shell-escape.js';

describe('shell-escape utilities', () => {
  describe('escapeArg', () => {
    describe('cross-platform behavior', () => {
      it('should handle basic strings', () => {
        const result = escapeArg('hello');
        expect(result).toBe('hello');
      });

      it('should handle numbers', () => {
        const result = escapeArg(42);
        expect(result).toBe('42');
      });

      it('should handle booleans', () => {
        expect(escapeArg(true)).toBe('true');
        expect(escapeArg(false)).toBe('false');
      });
    });
  });

  describe('escapeCommand', () => {
    it('should return command as-is when no args provided', () => {
      const result = escapeCommand('echo');
      expect(result).toBe('echo');
    });

    it('should escape command with arguments', () => {
      const result = escapeCommand('echo', ['hello', 'world']);
      expect(result).toBe('echo hello world');
    });

    it('should handle mixed argument types', () => {
      const result = escapeCommand('test', ['string', 42, true]);
      expect(result).toBe('test string 42 true');
    });
  });
});