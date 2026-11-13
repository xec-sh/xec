import { ExecutionEngine } from '@xec-sh/core';
import { it, vi, expect, describe, afterEach } from 'vitest';

import { ps, which, parseArgs } from '../../../src/utils/script-utils.js';

afterEach(() => vi.restoreAllMocks());

describe('script argument boundaries', () => {
  it('keeps adjacent boolean flags separate', () => {
    expect(parseArgs(['--verbose', '--force', '-q'])).toEqual({ _: [], verbose: true, force: true, q: true });
  });

  it('preserves equals signs, empty strings and signed values', () => {
    expect(parseArgs(['--token=a=b==', '--empty=', '--count', '-5', '-n', 'sample']))
      .toEqual({ _: [], token: 'a=b==', empty: '', count: '-5', n: 'sample' });
  });

  it('keeps the positional terminator and literal dash distinct', () => {
    expect(parseArgs(['-', 'file', '--', '--verbose', '-n']))
      .toEqual({ _: ['-', 'file', '--verbose', '-n'] });
  });

  it('stores prototype-looking keys as data and protects positional arguments', () => {
    const parsed = parseArgs(['--__proto__', 'value', '--constructor', 'other']);
    expect(Object.hasOwn(parsed, '__proto__')).toBe(true);
    expect(parsed['__proto__']).toBe('value');
    expect(Object.getPrototypeOf(parsed)).toBeNull();
    expect(() => parseArgs(['--_', 'bad'])).toThrow(/cannot be _/);
  });
});

describe('canonical script utilities', () => {
  it('delegates executable lookup without interpolating shell text', async () => {
    const lookup = vi.spyOn(ExecutionEngine.prototype, 'which').mockResolvedValue(null);
    const input = 'missing; echo injected';
    expect(await which(input)).toBeNull();
    expect(lookup).toHaveBeenCalledExactlyOnceWith(input);
  });

  it('preserves lookup transport failures', async () => {
    const failure = new Error('transport unavailable');
    vi.spyOn(ExecutionEngine.prototype, 'which').mockRejectedValue(failure);
    await expect(which('node')).rejects.toBe(failure);
  });

  it('lists the current process through the ordinary API', async () => {
    const processes = await ps();
    expect(processes.some(item => item.pid === process.pid && item.name.length > 0)).toBe(true);
  });
});
