import { describe, expect, it } from 'vitest';
import { getDefaultConfig, isDefaultValue, mergeWithDefaults, ROOT_KEY_ORDER, sortConfigKeys } from '../../../src/config/defaults.js';

describe('configuration baseline helpers', () => {
  it('returns independent data and leaves execution defaults with the owning API', () => {
    const first = getDefaultConfig();
    first.targets!.local!.workdir = '/changed';
    expect(getDefaultConfig()).toEqual({ version: '1.0', targets: { local: { type: 'local' } } });
    expect(getDefaultConfig()).not.toHaveProperty('secrets');
    expect(getDefaultConfig()).not.toHaveProperty('commands');
  });
  it('sorts only the root and preserves custom data, arrays and falsy values', () => {
    const source = { custom: { zero: 0 }, tasks: {}, version: '1.0', name: '', vars: { enabled: false } };
    const result = sortConfigKeys(source);
    expect(Object.keys(result)).toEqual(['version', 'name', 'vars', 'tasks', 'custom']);
    expect(result).toEqual(source);
    expect(result.custom).toBe(source.custom);
    for (const value of [null, undefined, 'text', 0, false, [1, 2]]) expect(sortConfigKeys(value)).toBe(value);
  });
  it('includes every known root key once', () => {
    expect(new Set(ROOT_KEY_ORDER).size).toBe(ROOT_KEY_ORDER.length);
    const data = Object.fromEntries([...ROOT_KEY_ORDER].reverse().map(key => [key, {}]));
    expect(Object.keys(sortConfigKeys(data))).toEqual(ROOT_KEY_ORDER);
  });
  it('shares merge semantics with configuration loading without mutating inputs', () => {
    const baseline = { vars: { nested: { a: 1, b: 2 }, list: ['default'], unset: true, keep: 'yes' } };
    const input = { vars: { nested: { a: 3 }, list: ['own'], unset: '$unset', keep: undefined } };
    expect(mergeWithDefaults(input, baseline)).toEqual({ vars: { nested: { a: 3, b: 2 }, list: ['own'], keep: 'yes' } });
    expect(baseline.vars.nested.a).toBe(1);
    expect(input.vars.nested).not.toHaveProperty('b');
  });
  it('does not replace null, false, zero or empty text with defaults', () => {
    const input = { a: null, b: false, c: 0, d: '' };
    expect(mergeWithDefaults(input, { a: true, b: true, c: 1, d: 'text' })).toEqual(input);
  });
  it('compares declared defaults without traversing prototypes', () => {
    expect(isDefaultValue('version', '1.0')).toBe(true);
    expect(isDefaultValue('targets.local', { type: 'local' })).toBe(true);
    expect(isDefaultValue('missing', undefined)).toBe(false);
    expect(isDefaultValue('vars.list', [], { vars: { list: [] } })).toBe(true);
    expect(() => isDefaultValue('constructor.prototype', {})).toThrow(/Unsafe/);
    expect(() => sortConfigKeys(JSON.parse('{"__proto__": {"injected": true}}'))).toThrow(/Unsafe/);
  });
});
