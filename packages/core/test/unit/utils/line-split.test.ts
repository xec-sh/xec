import { splitLines, stripCarriageReturn } from '../../../src/utils/line-split.js';

import { ExecutionResultImpl } from '../../../src/core/result.js';

/**
 * Line endings, which are the transport's business and never the caller's.
 *
 * Every one of these went wrong the same way: the code split on `\n` and
 * kept the `\r`, so a Windows command answered `'ok\r'` where a Unix one
 * answered `'ok'`. Nothing threw — the values were simply wrong, which is
 * why a whole platform's worth of it survived until a runner was pointed
 * at it.
 */
describe('splitting lines', () => {
  it('takes a line feed', () => {
    expect(splitLines('a\nb')).toEqual(['a', 'b']);
  });

  it('takes a carriage return and line feed', () => {
    expect(splitLines('a\r\nb')).toEqual(['a', 'b']);
  });

  it('takes both in one stream', () => {
    // A Windows tool run from Linux, or ssh from a Windows host: one
    // stream, two conventions.
    expect(splitLines('a\r\nb\nc\r\n')).toEqual(['a', 'b', 'c', '']);
  });

  it('leaves a lone carriage return alone', () => {
    // What a progress bar writes to return to the start of the line.
    // Treating it as a terminator turns one download into a thousand
    // lines.
    expect(splitLines('50%\r60%\r70%')).toEqual(['50%\r60%\r70%']);
  });

  it('keeps the remainder after a final newline', () => {
    // Streaming callers pop it and carry it to the next chunk; losing it
    // joins two lines into one.
    expect(splitLines('a\n')).toEqual(['a', '']);
    expect(splitLines('a\r\n')).toEqual(['a', '']);
  });

  it('leaves a carriage return inside a line', () => {
    expect(splitLines('a\rb\nc')).toEqual(['a\rb', 'c']);
  });

  it('answers a single line for text with no newline', () => {
    expect(splitLines('alone')).toEqual(['alone']);
    expect(splitLines('')).toEqual(['']);
  });
});

describe('stripping one carriage return', () => {
  it('removes it from the end', () => {
    expect(stripCarriageReturn('a\r')).toBe('a');
  });

  it('removes only one', () => {
    expect(stripCarriageReturn('a\r\r')).toBe('a\r');
  });

  it('leaves a line without one', () => {
    expect(stripCarriageReturn('a')).toBe('a');
    expect(stripCarriageReturn('')).toBe('');
  });
});

describe('lines() on a result', () => {
  const resultWith = (stdout: string): ExecutionResultImpl =>
    new ExecutionResultImpl(
      stdout, '', 0, undefined, 'cmd', 1, new Date(), new Date(), 'local'
    );

  it('does not hand back the carriage returns', () => {
    // The documented shape is a list of lines. A trailing `\r` is the
    // transport showing through, and every comparison a caller writes
    // against it fails on Windows and nowhere else.
    expect(resultWith('one\r\ntwo\r\n').lines()).toEqual(['one', 'two']);
  });

  it('drops a line that was only a carriage return', () => {
    // `filter(length > 0)` ran before the strip, so a blank CRLF line
    // survived as `'\r'`.
    expect(resultWith('one\r\n\r\ntwo\r\n').lines()).toEqual(['one', 'two']);
  });

  it('behaves the same for line feeds', () => {
    expect(resultWith('one\ntwo\n').lines()).toEqual(['one', 'two']);
  });
});
