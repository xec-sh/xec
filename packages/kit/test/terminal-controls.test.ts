import { it, expect, describe } from 'vitest';

import { erase, cursor } from '../src/prism/utils/ansi.js';

// Assert wire bytes independently of renderer snapshots so renderer and helper
// changes cannot agree on an incorrect control sequence.
describe('owned terminal controls', () => {
  it('preserves cursor visibility and zero-based horizontal positioning', () => {
    expect(cursor.hide).toBe('\x1b[?25l');
    expect(cursor.show).toBe('\x1b[?25h');
    expect(cursor.to(0)).toBe('\x1b[1G');
    expect(cursor.to(79)).toBe('\x1b[80G');
  });

  it('moves each axis without inserting a terminal-default step for zero', () => {
    expect(cursor.move(-2, -3)).toBe('\x1b[2D\x1b[3A');
    expect(cursor.move(2, 3)).toBe('\x1b[2C\x1b[3B');
    expect(cursor.move(0, -1)).toBe('\x1b[1A');
    expect(cursor.move(0, 0)).toBe('');
    expect(cursor.up()).toBe('\x1b[1A');
    expect(cursor.up(0)).toBe('');
  });

  it('erases only the requested current and preceding rows', () => {
    expect(erase.down()).toBe('\x1b[J');
    expect(erase.lines(0)).toBe('');
    expect(erase.lines(1)).toBe('\x1b[2K\x1b[G');
    expect(erase.lines(3)).toBe('\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[G');
  });

  it.each([NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid dimensions %s before emitting a sequence',
    (value) => {
      expect(() => cursor.to(value)).toThrow(RangeError);
      expect(() => cursor.move(value, 0)).toThrow(RangeError);
      expect(() => cursor.move(0, value)).toThrow(RangeError);
      expect(() => cursor.up(value)).toThrow(RangeError);
      expect(() => erase.lines(value)).toThrow(RangeError);
    }
  );

  it('refuses negative counts, injected terminal bytes and oversized redraw allocations', () => {
    expect(() => cursor.to(-1)).toThrow(RangeError);
    expect(() => cursor.up(-1)).toThrow(RangeError);
    expect(() => erase.lines(-1)).toThrow(RangeError);
    expect(() => erase.lines(65_536)).toThrow(RangeError);
    expect(() => cursor.to(Number.MAX_SAFE_INTEGER)).toThrow(RangeError);
    expect(() => cursor.to('1G\x1b[2J' as unknown as number)).toThrow(RangeError);
    expect(() => cursor.move(0, '1B\x1b[2J' as unknown as number)).toThrow(RangeError);
    expect(() => erase.lines('2' as unknown as number)).toThrow(RangeError);
    expect(erase.lines(65_535).length).toBeLessThan(512 * 1024);
  });
});
