/**
 * Core utilities tests
 * Tests the fundamental utility functions used throughout the library
 */

import { it, expect, describe } from 'vitest';

import {
  sleep,
  waitFor,
  stripAnsi,
  splitLines,
  screenDiff,
  parseTmuxKey,
  normalizeText,
  escapeShellArg,
  compareScreens,
  parseTmuxMouse,
  generateSessionName
} from '../../src/core/utils.js';

describe('Core Utils', () => {
  describe('sleep', () => {
    it('should wait for specified milliseconds', async () => {
      const start = Date.now();
      await sleep(100);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeGreaterThanOrEqual(95); // Allow some variance
      expect(elapsed).toBeLessThan(150);
    });

    it('should handle zero delay', async () => {
      const start = Date.now();
      await sleep(0);
      const elapsed = Date.now() - start;
      expect(elapsed).toBeLessThan(10);
    });
  });

  describe('stripAnsi', () => {
    it('should remove ANSI escape codes', () => {
      const input = '\x1b[31mHello\x1b[0m \x1b[32mWorld\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Hello World');
    });

    it('should handle text without ANSI codes', () => {
      const input = 'Plain text';
      const result = stripAnsi(input);
      expect(result).toBe('Plain text');
    });

    it('should handle complex ANSI sequences', () => {
      const input = '\x1b[1;31;40mBold Red on Black\x1b[0m';
      const result = stripAnsi(input);
      expect(result).toBe('Bold Red on Black');
    });

    it('should handle cursor movement codes', () => {
      const input = '\x1b[2J\x1b[H\x1b[3AHello\x1b[2B';
      const result = stripAnsi(input);
      expect(result).toBe('Hello');
    });
  });

  describe('splitLines', () => {
    it('should split content into lines', () => {
      const content = 'Line 1\nLine 2\nLine 3';
      const lines = splitLines(content);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle CRLF line endings', () => {
      const content = 'Line 1\r\nLine 2\r\nLine 3';
      const lines = splitLines(content);
      expect(lines).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should handle empty lines', () => {
      const content = 'Line 1\n\nLine 3\n';
      const lines = splitLines(content);
      expect(lines).toEqual(['Line 1', '', 'Line 3', '']);
    });

    it('should handle lines with only whitespace', () => {
      const content = 'Line 1\n   \nLine 3';
      const lines = splitLines(content);
      expect(lines).toEqual(['Line 1', '   ', 'Line 3']);
    });
  });

  describe('waitFor', () => {
    it('should resolve when condition is met', async () => {
      let counter = 0;
      const condition = () => {
        counter++;
        return counter === 3 ? true : undefined;
      };
      
      await waitFor(condition, {
        timeout: 1000,
        interval: 10
      });
      
      expect(counter).toBe(3);
    });

    it('should timeout if condition is never met', async () => {
      const condition = () => undefined;
      
      const start = Date.now();
      await expect(waitFor(condition, {
        timeout: 100,
        interval: 10
      })).rejects.toThrow();
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(95);
      expect(elapsed).toBeLessThan(150);
    });

    it('should handle async conditions', async () => {
      let counter = 0;
      const condition = async () => {
        await sleep(5);
        counter++;
        return counter === 2 ? true : undefined;
      };
      
      await waitFor(condition, {
        timeout: 1000,
        interval: 10
      });
      
      expect(counter).toBe(2);
    });
  });

  describe('escapeShellArg', () => {
    it('should escape shell arguments', () => {
      const input = 'Hello World';
      const escaped = escapeShellArg(input);
      expect(escaped).toBe("'Hello World'");
    });

    it('should handle single quotes', () => {
      const input = "It's a test";
      const escaped = escapeShellArg(input);
      expect(escaped).toBe("'It'\\''s a test'");
    });

    it('should handle empty string', () => {
      const escaped = escapeShellArg('');
      expect(escaped).toBe("''");
    });

    it('should handle special characters', () => {
      const input = '$HOME && echo test';
      const escaped = escapeShellArg(input);
      expect(escaped).toBe("'$HOME && echo test'");
    });
  });

  describe('normalizeText', () => {
    it('should normalize text with default options', () => {
      const input = '  Hello  World  ';
      const result = normalizeText(input);
      expect(result).toBe('  Hello  World  ');
    });

    it('should ignore whitespace when option is set', () => {
      const input = '  Hello  World  ';
      const result = normalizeText(input, { ignoreWhitespace: true });
      expect(result).toBe('Hello World');
    });

    it('should ignore case when option is set', () => {
      const input = 'Hello World';
      const result = normalizeText(input, { ignoreCase: true });
      expect(result).toBe('hello world');
    });

    it('should ignore ANSI codes when option is set', () => {
      const input = '\x1b[31mHello\x1b[0m World';
      const result = normalizeText(input, { ignoreAnsi: true });
      expect(result).toBe('Hello World');
    });

    it('should apply multiple options', () => {
      const input = '  \x1b[31mHello\x1b[0m  World  ';
      const result = normalizeText(input, {
        ignoreWhitespace: true,
        ignoreAnsi: true,
        ignoreCase: true
      });
      expect(result).toBe('hello world');
    });
  });

  describe('compareScreens', () => {
    it('should return true for identical screens', () => {
      const screen1 = 'Hello World';
      const screen2 = 'Hello World';
      const result = compareScreens(screen1, screen2);
      expect(result).toBe(true);
    });

    it('should return false for different screens', () => {
      const screen1 = 'Hello World';
      const screen2 = 'Goodbye World';
      const result = compareScreens(screen1, screen2);
      expect(result).toBe(false);
    });

    it('should ignore whitespace differences when option is set', () => {
      const screen1 = '  Hello  World  ';
      const screen2 = 'Hello World';
      const result = compareScreens(screen1, screen2, { ignoreWhitespace: true });
      expect(result).toBe(true);
    });

    it('should ignore case differences when option is set', () => {
      const screen1 = 'Hello World';
      const screen2 = 'hello world';
      const result = compareScreens(screen1, screen2, { ignoreCase: true });
      expect(result).toBe(true);
    });

    it('should ignore ANSI differences when option is set', () => {
      const screen1 = '\x1b[31mHello\x1b[0m World';
      const screen2 = 'Hello World';
      const result = compareScreens(screen1, screen2, { ignoreAnsi: true });
      expect(result).toBe(true);
    });
  });

  describe('generateSessionName', () => {
    it('should generate unique session names', () => {
      const name1 = generateSessionName();
      const name2 = generateSessionName();
      expect(name1).not.toBe(name2);
    });

    it('should include prefix in session name', () => {
      const name = generateSessionName('test');
      expect(name).toMatch(/^test-/);
    });

    it('should use default prefix', () => {
      const name = generateSessionName();
      expect(name).toMatch(/^tui-test-/);
    });

    it('should include timestamp and random string', () => {
      const name = generateSessionName();
      expect(name).toMatch(/^tui-test-\d+-[a-z0-9]+$/);
    });
  });

  describe('parseTmuxKey', () => {
    it('should parse simple keys', () => {
      const result = parseTmuxKey('a');
      expect(result).toBe('a');
    });

    it('should parse Enter key', () => {
      const result = parseTmuxKey('Enter');
      expect(result).toBe('Enter');
    });

    it('should parse special keys', () => {
      expect(parseTmuxKey('Tab')).toBe('Tab');
      expect(parseTmuxKey('Escape')).toBe('Escape');
      expect(parseTmuxKey('Backspace')).toBe('BSpace');
      expect(parseTmuxKey('Delete')).toBe('Delete');
    });

    it('should handle Ctrl modifier', () => {
      const result = parseTmuxKey('c', { ctrl: true });
      expect(result).toBe('C-c');
    });

    it('should handle Alt modifier', () => {
      const result = parseTmuxKey('x', { alt: true });
      expect(result).toBe('M-x');
    });

    it('should handle Shift modifier', () => {
      const result = parseTmuxKey('Tab', { shift: true });
      expect(result).toBe('S-Tab');
    });

    it('should handle multiple modifiers', () => {
      const result = parseTmuxKey('a', { ctrl: true, alt: true });
      expect(result).toBe('C-M-a');
    });

    it('should handle arrow keys', () => {
      expect(parseTmuxKey('Up')).toBe('Up');
      expect(parseTmuxKey('Down')).toBe('Down');
      expect(parseTmuxKey('Left')).toBe('Left');
      expect(parseTmuxKey('Right')).toBe('Right');
    });

    it('should handle function keys', () => {
      expect(parseTmuxKey('F1')).toBe('F1');
      expect(parseTmuxKey('F12')).toBe('F12');
    });

    it('should handle Page keys', () => {
      expect(parseTmuxKey('PageUp')).toBe('PageUp');
      expect(parseTmuxKey('PageDown')).toBe('PageDown');
    });

    it('should handle Home and End keys', () => {
      expect(parseTmuxKey('Home')).toBe('Home');
      expect(parseTmuxKey('End')).toBe('End');
    });
  });

  describe('parseTmuxMouse', () => {
    it('should generate mouse click sequences', () => {
      const result = parseTmuxMouse(10, 5, 'left');
      expect(result).toContain('\x1b[<');
      expect(result).toContain('M');
    });

    it('should handle different mouse buttons', () => {
      const left = parseTmuxMouse(0, 0, 'left');
      const middle = parseTmuxMouse(0, 0, 'middle');
      const right = parseTmuxMouse(0, 0, 'right');
      
      expect(left).not.toBe(middle);
      expect(middle).not.toBe(right);
      expect(left).not.toBe(right);
    });

    it('should adjust coordinates (1-indexed)', () => {
      const result = parseTmuxMouse(0, 0, 'left');
      expect(result).toContain(';1;1M');
    });

    it('should handle different positions', () => {
      const result1 = parseTmuxMouse(5, 10, 'left');
      const result2 = parseTmuxMouse(15, 20, 'left');
      
      expect(result1).toContain(';6;11M');
      expect(result2).toContain(';16;21M');
    });
  });

  describe('screenDiff', () => {
    it('should generate diff between two screens', () => {
      const actual = 'Line 1\nLine 2\nLine 3';
      const expected = 'Line 1\nLine X\nLine 3';
      const diff = screenDiff(actual, expected);
      
      expect(diff).toContain('Expected');
      expect(diff).toContain('Actual');
      expect(diff).toContain('Line X');
      expect(diff).toContain('Line 2');
    });

    it('should show line numbers in diff', () => {
      const actual = 'Line 1\nLine 2';
      const expected = 'Line 1\nLine X';
      const diff = screenDiff(actual, expected);
      
      expect(diff).toMatch(/Line \d+:/);
    });

    it('should handle identical screens', () => {
      const screen = 'Line 1\nLine 2';
      const diff = screenDiff(screen, screen);
      
      expect(diff).toBe('');
    });

    it('should handle added lines', () => {
      const actual = 'Line 1';
      const expected = 'Line 1\nLine 2';
      const diff = screenDiff(actual, expected);
      
      expect(diff).toContain('Line 2');
    });

    it('should handle removed lines', () => {
      const actual = 'Line 1\nLine 2';
      const expected = 'Line 1';
      const diff = screenDiff(actual, expected);
      
      expect(diff).toContain('Line 2');
    });
  });
});