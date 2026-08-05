import { parseTaskArgs, coerceParamValue } from '../../src/utils/task-params.js';

/**
 * One grammar for task parameters, at the root and under `run`.
 *
 * The root dispatcher used to cut `--who=a=b` down to `a` (split with a
 * limit truncates, it does not keep the remainder), dropped `--flag` with no
 * value on the floor, and did not know `-p` at all — while `run` knew only
 * `-p`. The same invocation named different parameters depending on which
 * door it came through.
 */
describe('parseTaskArgs', () => {
  it('keeps every = after the first in --key=value', () => {
    expect(parseTaskArgs(['--conn=postgres://u@h?a=b']).params).toEqual({
      conn: 'postgres://u@h?a=b',
    });
  });

  it('reads --key value pairs', () => {
    expect(parseTaskArgs(['--who', 'world']).params).toEqual({ who: 'world' });
  });

  it('treats a valueless --flag as a true switch', () => {
    expect(parseTaskArgs(['--force']).params).toEqual({ force: true });
    expect(parseTaskArgs(['--force', '--who', 'x']).params).toEqual({ force: true, who: 'x' });
  });

  it('accepts -p and --param pairs', () => {
    expect(parseTaskArgs(['-p', 'who=z']).params).toEqual({ who: 'z' });
    expect(parseTaskArgs(['--param', 'who=z']).params).toEqual({ who: 'z' });
    expect(parseTaskArgs(['--param=who=a=b']).params).toEqual({ who: 'a=b' });
  });

  it('rejects a -p pair without key=value shape', () => {
    expect(() => parseTaskArgs(['-p'])).toThrow('key=value');
    expect(() => parseTaskArgs(['-p', 'novalue'])).toThrow('key=value');
    expect(() => parseTaskArgs(['-p', '=v'])).toThrow('key=value');
  });

  it('stops parsing at -- and passes the tail through', () => {
    const { params, rest } = parseTaskArgs(['--who', 'x', '--', '--force', 'literal']);
    expect(params).toEqual({ who: 'x' });
    expect(rest).toEqual(['--force', 'literal']);
  });

  it('collects positional tokens as rest', () => {
    expect(parseTaskArgs(['stray', '--who', 'x']).rest).toEqual(['stray']);
  });

  it('coerces booleans, numbers and JSON', () => {
    expect(parseTaskArgs(['--a', 'true']).params).toEqual({ a: true });
    expect(parseTaskArgs(['--a', '42']).params).toEqual({ a: 42 });
    expect(parseTaskArgs(['--a', '{"b":1}']).params).toEqual({ a: { b: 1 } });
  });
});

describe('coerceParamValue', () => {
  it('keeps malformed JSON and plain text as strings', () => {
    expect(coerceParamValue('{oops')).toBe('{oops');
    expect(coerceParamValue('plain')).toBe('plain');
    expect(coerceParamValue('')).toBe('');
  });
});
