/**
 * Configuration utilities tests
 */

import { it, expect, describe } from '@jest/globals';

import {
  isCI,
  deepMerge,
  matchPattern,
  expandBraces,
  parseDuration,
  flattenObject,
  formatDuration,
  parseMemorySize,
  getDefaultShell,
  parseTargetReference,
  isValidTargetReference
} from '../../src/config/utils.js';

describe('Configuration Utils', () => {
  describe('deepMerge()', () => {
    it('should merge simple objects', () => {
      const target = { a: 1, b: 2 };
      const source = { b: 3, c: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, b: 3, c: 4 });
    });

    it('should merge nested objects', () => {
      const target = {
        level1: {
          a: 1,
          level2: {
            x: 10
          }
        }
      };

      const source = {
        level1: {
          b: 2,
          level2: {
            y: 20
          }
        }
      };

      const result = deepMerge(target, source);

      expect(result).toEqual({
        level1: {
          a: 1,
          b: 2,
          level2: {
            x: 10,
            y: 20
          }
        }
      });
    });

    it('should replace arrays by default', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: [4, 5] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ arr: [4, 5] });
    });

    it('should handle $merge marker for arrays', () => {
      const target = { arr: [1, 2, 3] };
      const source = { arr: ['$merge', 4, 5] };
      const result = deepMerge(target, source);

      expect(result).toEqual({ arr: [1, 2, 3, 4, 5] });
    });

    it('should handle $unset marker', () => {
      const target = { a: 1, b: 2, c: 3 };
      const source = { b: '$unset', d: 4 };
      const result = deepMerge(target, source);

      expect(result).toEqual({ a: 1, c: 3, d: 4 });
    });

    it('should handle null and undefined', () => {
      expect(deepMerge(null, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, null)).toEqual({ a: 1 });
      expect(deepMerge(undefined, { a: 1 })).toEqual({ a: 1 });
      expect(deepMerge({ a: 1 }, undefined)).toEqual({ a: 1 });
    });

    it('should handle primitives', () => {
      expect(deepMerge('target', 'source')).toBe('source');
      expect(deepMerge(1, 2)).toBe(2);
      expect(deepMerge(true, false)).toBe(false);
    });

    it('should handle $merge marker in nested array', () => {
      const target = {
        nested: {
          arr: [1, 2, 3]
        }
      };
      const source = {
        nested: {
          arr: ['$merge', 4, 5]
        }
      };
      const result = deepMerge(target, source);

      expect(result.nested.arr).toEqual([1, 2, 3, 4, 5]);
    });

    it('should skip undefined values when skipUndefined is true', () => {
      const target = { a: 1, b: 2 };
      const source = { b: undefined, c: 3 };
      const result = deepMerge(target, source, { skipUndefined: true });

      expect(result).toEqual({ a: 1, b: 2, c: 3 });
    });

    it('should handle $merge marker on primitive arrays', () => {
      const target = [1, 2, 3];
      const source = ['$merge', 4, 5];
      const result = deepMerge(target, source);

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should return source array when target is not an array', () => {
      const target = { notArray: true };
      const source = ['$merge', 1, 2, 3];
      const result = deepMerge(target, source);

      expect(result).toEqual(['$merge', 1, 2, 3]);
    });
  });

  describe('parseDuration()', () => {
    it('should parse number as milliseconds', () => {
      expect(parseDuration(1000)).toBe(1000);
      expect(parseDuration(500)).toBe(500);
    });

    it('should parse milliseconds string', () => {
      expect(parseDuration('100')).toBe(100);
      expect(parseDuration('100ms')).toBe(100);
    });

    it('should parse seconds', () => {
      expect(parseDuration('30s')).toBe(30000);
      expect(parseDuration('1s')).toBe(1000);
    });

    it('should parse minutes', () => {
      expect(parseDuration('5m')).toBe(300000);
      expect(parseDuration('1m')).toBe(60000);
    });

    it('should parse hours', () => {
      expect(parseDuration('1h')).toBe(3600000);
      expect(parseDuration('2h')).toBe(7200000);
    });

    it('should throw on invalid format', () => {
      expect(() => parseDuration('invalid')).toThrow('Invalid duration format');
      expect(() => parseDuration('30x')).toThrow('Invalid duration format');
      expect(() => parseDuration('s30')).toThrow('Invalid duration format');
    });
  });

  describe('formatDuration()', () => {
    it('should format milliseconds', () => {
      expect(formatDuration(500)).toBe('500ms');
      expect(formatDuration(999)).toBe('999ms');
    });

    it('should format seconds', () => {
      expect(formatDuration(1000)).toBe('1s');
      expect(formatDuration(30000)).toBe('30s');
      expect(formatDuration(59999)).toBe('59s');
    });

    it('should format minutes', () => {
      expect(formatDuration(60000)).toBe('1m');
      expect(formatDuration(300000)).toBe('5m');
      expect(formatDuration(3599999)).toBe('59m');
    });

    it('should format hours', () => {
      expect(formatDuration(3600000)).toBe('1h');
      expect(formatDuration(7200000)).toBe('2h');
      expect(formatDuration(86400000)).toBe('24h');
    });
  });

  describe('parseMemorySize()', () => {
    it('should parse number as bytes', () => {
      expect(parseMemorySize(1024)).toBe(1024);
      expect(parseMemorySize(0)).toBe(0);
    });

    it('should parse bytes', () => {
      expect(parseMemorySize('512')).toBe(512);
      expect(parseMemorySize('512B')).toBe(512);
    });

    it('should parse kilobytes', () => {
      expect(parseMemorySize('1K')).toBe(1024);
      expect(parseMemorySize('1KB')).toBe(1024);
      expect(parseMemorySize('10KB')).toBe(10240);
    });

    it('should parse megabytes', () => {
      expect(parseMemorySize('1M')).toBe(1048576);
      expect(parseMemorySize('1MB')).toBe(1048576);
      expect(parseMemorySize('100MB')).toBe(104857600);
    });

    it('should parse gigabytes', () => {
      expect(parseMemorySize('1G')).toBe(1073741824);
      expect(parseMemorySize('1GB')).toBe(1073741824);
      expect(parseMemorySize('2GB')).toBe(2147483648);
    });

    it('should be case insensitive', () => {
      expect(parseMemorySize('1kb')).toBe(1024);
      expect(parseMemorySize('1Kb')).toBe(1024);
      expect(parseMemorySize('1kB')).toBe(1024);
    });

    it('should throw on invalid format', () => {
      expect(() => parseMemorySize('invalid')).toThrow('Invalid memory size format');
      expect(() => parseMemorySize('1TB')).toThrow('Unknown memory size unit');
    });
  });

  describe('isValidTargetReference()', () => {
    it('should validate type prefix format', () => {
      expect(isValidTargetReference('docker:mycontainer')).toBe(true);
      expect(isValidTargetReference('pod:mypod')).toBe(true);
      expect(isValidTargetReference('ssh:hostname')).toBe(true);
    });

    it('should validate dot notation', () => {
      expect(isValidTargetReference('hosts.web-1')).toBe(true);
      expect(isValidTargetReference('containers.app')).toBe(true);
      expect(isValidTargetReference('pods.api')).toBe(true);
    });

    it('should validate special cases', () => {
      expect(isValidTargetReference('local')).toBe(true);
      expect(isValidTargetReference('hostname.com')).toBe(true);
      expect(isValidTargetReference('container-name')).toBe(true);
    });

    it('should reject invalid references', () => {
      expect(isValidTargetReference('')).toBe(false);
      expect(isValidTargetReference('invalid:')).toBe(false);
      expect(isValidTargetReference('unknown.type')).toBe(false);
    });
  });

  describe('parseTargetReference()', () => {
    it('should parse local reference', () => {
      expect(parseTargetReference('local')).toEqual({
        type: 'local',
        isWildcard: false
      });
    });

    it('should parse type prefix format', () => {
      expect(parseTargetReference('ssh:hostname')).toEqual({
        type: 'hosts',
        name: 'hostname',
        isWildcard: false
      });

      expect(parseTargetReference('docker:container')).toEqual({
        type: 'containers',
        name: 'container',
        isWildcard: false
      });

      expect(parseTargetReference('pod:mypod')).toEqual({
        type: 'pods',
        name: 'mypod',
        isWildcard: false
      });
    });

    it('should parse dot notation', () => {
      expect(parseTargetReference('hosts.web-1')).toEqual({
        type: 'hosts',
        name: 'web-1',
        isWildcard: false
      });

      expect(parseTargetReference('containers.app')).toEqual({
        type: 'containers',
        name: 'app',
        isWildcard: false
      });
    });

    it('should detect wildcards', () => {
      expect(parseTargetReference('hosts.web-*')).toEqual({
        type: 'hosts',
        name: 'web-*',
        isWildcard: true
      });

      expect(parseTargetReference('containers.app?')).toEqual({
        type: 'containers',
        name: 'app?',
        isWildcard: true
      });
    });

    it('should auto-detect type', () => {
      expect(parseTargetReference('hostname')).toEqual({
        type: 'auto',
        name: 'hostname',
        isWildcard: false
      });
    });
  });

  describe('matchPattern()', () => {
    it('should match exact strings', () => {
      expect(matchPattern('exact', 'exact')).toBe(true);
      expect(matchPattern('exact', 'different')).toBe(false);
    });

    it('should match * wildcard', () => {
      expect(matchPattern('web-*', 'web-1')).toBe(true);
      expect(matchPattern('web-*', 'web-server')).toBe(true);
      expect(matchPattern('web-*', 'api-1')).toBe(false);

      expect(matchPattern('*-server', 'web-server')).toBe(true);
      expect(matchPattern('*-server', 'api-server')).toBe(true);
      expect(matchPattern('*-server', 'server-api')).toBe(false);

      expect(matchPattern('*', 'anything')).toBe(true);
    });

    it('should match ? wildcard', () => {
      expect(matchPattern('web-?', 'web-1')).toBe(true);
      expect(matchPattern('web-?', 'web-a')).toBe(true);
      expect(matchPattern('web-?', 'web-10')).toBe(false);

      expect(matchPattern('???', 'abc')).toBe(true);
      expect(matchPattern('???', 'abcd')).toBe(false);
    });

    it('should match combined wildcards', () => {
      expect(matchPattern('web-?-*', 'web-1-server')).toBe(true);
      expect(matchPattern('web-?-*', 'web-a-api')).toBe(true);
      expect(matchPattern('web-?-*', 'web-10-server')).toBe(false);
    });

    it('should handle special regex characters', () => {
      expect(matchPattern('file.txt', 'file.txt')).toBe(true);
      expect(matchPattern('file.txt', 'fileatxt')).toBe(false);

      expect(matchPattern('array[0]', 'array[0]')).toBe(true);
      expect(matchPattern('price$100', 'price$100')).toBe(true);
    });
  });

  describe('expandBraces()', () => {
    it('should expand simple braces', () => {
      expect(expandBraces('web-{1,2,3}')).toEqual(['web-1', 'web-2', 'web-3']);
      expect(expandBraces('{a,b,c}')).toEqual(['a', 'b', 'c']);
    });

    it('should expand ranges', () => {
      expect(expandBraces('web-{1..3}')).toEqual(['web-1', 'web-2', 'web-3']);
      expect(expandBraces('server-{10..12}')).toEqual(['server-10', 'server-11', 'server-12']);
    });

    it('should handle mixed content', () => {
      const result = expandBraces('web-{prod,staging}-{1..2}');
      expect(result).toHaveLength(4);
      expect(result).toContain('web-prod-1');
      expect(result).toContain('web-prod-2');
      expect(result).toContain('web-staging-1');
      expect(result).toContain('web-staging-2');
    });

    it('should handle no braces', () => {
      expect(expandBraces('no-braces')).toEqual(['no-braces']);
    });

    it('should handle spaces in braces', () => {
      expect(expandBraces('{a, b, c}')).toEqual(['a', 'b', 'c']);
    });

    it('should handle complex nested patterns with ranges', () => {
      const result = expandBraces('{a,b}-{1..2}-{x,y}');
      expect(result).toHaveLength(8);
      expect(result).toContain('a-1-x');
      expect(result).toContain('a-1-y');
      expect(result).toContain('a-2-x');
      expect(result).toContain('a-2-y');
      expect(result).toContain('b-1-x');
      expect(result).toContain('b-1-y');
      expect(result).toContain('b-2-x');
      expect(result).toContain('b-2-y');
    });

    it('should handle ranges with same start and end', () => {
      expect(expandBraces('file-{5..5}')).toEqual(['file-5']);
    });

    it('should handle invalid range patterns', () => {
      expect(expandBraces('{1..}')).toEqual(['1..']);
      expect(expandBraces('{..5}')).toEqual(['..5']);
    });
  });

  describe('flattenObject()', () => {
    it('should flatten simple object', () => {
      const obj = {
        a: 1,
        b: 2
      };

      expect(flattenObject(obj)).toEqual({
        a: 1,
        b: 2
      });
    });

    it('should flatten nested object', () => {
      const obj = {
        level1: {
          a: 1,
          level2: {
            b: 2,
            level3: {
              c: 3
            }
          }
        },
        d: 4
      };

      expect(flattenObject(obj)).toEqual({
        'level1.a': 1,
        'level1.level2.b': 2,
        'level1.level2.level3.c': 3,
        'd': 4
      });
    });

    it('should handle arrays and primitives', () => {
      const obj = {
        arr: [1, 2, 3],
        nested: {
          bool: true,
          str: 'value',
          num: 42
        }
      };

      expect(flattenObject(obj)).toEqual({
        'arr': [1, 2, 3],
        'nested.bool': true,
        'nested.str': 'value',
        'nested.num': 42
      });
    });

    it('should handle empty object', () => {
      expect(flattenObject({})).toEqual({});
    });
  });

  describe('isCI()', () => {
    it('should detect CI environment', () => {
      const originalEnv = process.env;

      // Test various CI environment variables
      process.env = { ...originalEnv, CI: 'true' };
      expect(isCI()).toBe(true);

      process.env = { ...originalEnv, GITHUB_ACTIONS: 'true' };
      expect(isCI()).toBe(true);

      process.env = { ...originalEnv, GITLAB_CI: 'true' };
      expect(isCI()).toBe(true);

      process.env = { ...originalEnv, CIRCLECI: 'true' };
      expect(isCI()).toBe(true);

      process.env = { ...originalEnv, JENKINS_URL: 'http://jenkins' };
      expect(isCI()).toBe(true);

      process.env = { ...originalEnv, TEAMCITY_VERSION: '2021.1' };
      expect(isCI()).toBe(true);

      // Test non-CI environment
      process.env = { ...originalEnv };
      // Remove all CI-related env vars
      delete process.env.CI;
      delete process.env.GITHUB_ACTIONS;
      expect(isCI()).toBe(false);

      // Restore
      process.env = originalEnv;
    });
  });

  describe('getDefaultShell()', () => {
    it('should return shell based on platform', () => {
      const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
      const originalEnv = process.env;

      // Test Windows
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true
      });
      process.env = { ...originalEnv, COMSPEC: 'C:\\Windows\\System32\\cmd.exe' };
      expect(getDefaultShell()).toBe('C:\\Windows\\System32\\cmd.exe');

      process.env = { ...originalEnv };
      delete process.env.COMSPEC;
      expect(getDefaultShell()).toBe('cmd.exe');

      // Test Unix-like
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true
      });
      process.env = { ...originalEnv, SHELL: '/bin/bash' };
      expect(getDefaultShell()).toBe('/bin/bash');

      process.env = { ...originalEnv };
      delete process.env.SHELL;
      expect(getDefaultShell()).toBe('/bin/sh');

      // Restore
      if (originalPlatform) {
        Object.defineProperty(process, 'platform', originalPlatform);
      }
      process.env = originalEnv;
    });
  });
});