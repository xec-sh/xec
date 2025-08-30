/**
 * Tests for defaults.ts
 */

import { it, expect, describe } from '@jest/globals';

import {
  sortConfigKeys,
  isDefaultValue,
  ROOT_KEY_ORDER,
  getDefaultConfig,
  mergeWithDefaults
} from '../../src/config/defaults.js';

describe('Configuration Defaults', () => {
  describe('getDefaultConfig()', () => {
    it('should return default configuration with correct structure', () => {
      const defaults = getDefaultConfig();

      expect(defaults).toBeDefined();
      expect(defaults.version).toBe('1.0.0');
      expect(defaults.name).toBe('my-project');
      expect(defaults.description).toBe('A Xec managed project');
    });

    it('should include all default target settings', () => {
      const defaults = getDefaultConfig();

      expect(defaults.targets?.local).toEqual({ type: 'local' });
      expect(defaults.targets?.defaults?.ssh).toMatchObject({
        port: 22,
        keepAlive: true,
        keepAliveInterval: 30000,
        timeout: 60000
      });
      expect(defaults.targets?.defaults?.docker).toMatchObject({
        workdir: '/app',
        tty: true,
        interactive: true
      });
      expect(defaults.targets?.defaults?.kubernetes).toMatchObject({
        namespace: 'default',
        context: undefined
      });
    });

    it('should include all default command settings', () => {
      const defaults = getDefaultConfig();

      expect(defaults.commands?.exec).toMatchObject({
        shell: '/bin/sh',
        tty: true,
        interactive: true
      });
      expect(defaults.commands?.logs).toMatchObject({
        tail: '50',
        timestamps: false,
        follow: false,
        prefix: false,
        color: true
      });
      expect(defaults.commands?.cp).toMatchObject({
        recursive: true,
        preserveMode: true,
        preserveTimestamps: false,
        followSymlinks: false
      });
      expect(defaults.commands?.sync).toMatchObject({
        delete: false,
        exclude: [],
        dryRun: false
      });
    });

    it('should include default secrets configuration', () => {
      const defaults = getDefaultConfig();

      expect(defaults.secrets).toMatchObject({
        provider: 'env',
        path: undefined
      });
    });

    it('should include empty vars and tasks', () => {
      const defaults = getDefaultConfig();

      expect(defaults.vars).toEqual({});
      expect(defaults.tasks).toEqual({});
    });
  });

  describe('sortConfigKeys()', () => {
    it('should sort configuration keys according to ROOT_KEY_ORDER', () => {
      const unsorted = {
        tasks: { test: 'npm test' },
        version: '2.0',
        vars: { env: 'prod' },
        name: 'project',
        description: 'desc'
      };

      const sorted = sortConfigKeys(unsorted);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(['version', 'name', 'description', 'vars', 'tasks']);
    });

    it('should preserve custom keys after standard keys', () => {
      const config = {
        customKey: 'custom',
        version: '2.0',
        name: 'project',
        anotherCustom: 'value'
      };

      const sorted = sortConfigKeys(config);
      const keys = Object.keys(sorted);

      expect(keys[0]).toBe('version');
      expect(keys[1]).toBe('name');
      expect(keys.includes('customKey')).toBe(true);
      expect(keys.includes('anotherCustom')).toBe(true);
    });

    it('should handle null and non-object values', () => {
      expect(sortConfigKeys(null)).toBeNull();
      expect(sortConfigKeys(undefined)).toBeUndefined();
      expect(sortConfigKeys('string')).toBe('string');
      expect(sortConfigKeys(123)).toBe(123);
      expect(sortConfigKeys([1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('should handle empty objects', () => {
      expect(sortConfigKeys({})).toEqual({});
    });

    it('should maintain the correct order for all ROOT_KEY_ORDER keys', () => {
      const config: any = {};
      // Add keys in reverse order
      ROOT_KEY_ORDER.slice().reverse().forEach(key => {
        config[key] = `value_${key}`;
      });

      const sorted = sortConfigKeys(config);
      const keys = Object.keys(sorted);

      expect(keys).toEqual(ROOT_KEY_ORDER);
    });
  });

  describe('mergeWithDefaults()', () => {
    it('should merge configuration with defaults', () => {
      const config = {
        version: '2.0',
        name: 'custom-project'
      };

      const merged = mergeWithDefaults(config);

      expect(merged.version).toBe('2.0'); // From config
      expect(merged.name).toBe('custom-project'); // From config
      expect(merged.description).toBe('A Xec managed project'); // From defaults
    });

    it('should deep merge nested objects', () => {
      const config = {
        targets: {
          defaults: {
            ssh: {
              port: 2222
            }
          }
        }
      };

      const merged = mergeWithDefaults(config);

      expect(merged.targets.defaults.ssh.port).toBe(2222); // Overridden
      expect(merged.targets.defaults.ssh.keepAlive).toBe(true); // From defaults
      expect(merged.targets.defaults.docker.workdir).toBe('/app'); // From defaults
    });

    it('should preserve arrays from config', () => {
      const config = {
        commands: {
          sync: {
            exclude: ['node_modules', '.git']
          }
        }
      };

      const merged = mergeWithDefaults(config);

      expect(merged.commands.sync.exclude).toEqual(['node_modules', '.git']);
      expect(merged.commands.sync.delete).toBe(false); // From defaults
    });

    it('should add custom keys not in defaults', () => {
      const config = {
        customSection: {
          customValue: 'test'
        },
        version: '2.0'
      };

      const merged = mergeWithDefaults(config);

      expect(merged.customSection).toEqual({ customValue: 'test' });
      expect(merged.version).toBe('2.0');
    });

    it('should handle null and undefined values correctly', () => {
      const config = {
        version: null,
        name: undefined,
        description: 'Custom description'
      };

      const merged = mergeWithDefaults(config);

      expect(merged.version).toBeNull(); // Null from config
      expect(merged.name).toBe('my-project'); // From defaults (undefined in config)
      expect(merged.description).toBe('Custom description'); // From config
    });

    it('should work with custom defaults', () => {
      const customDefaults = {
        version: '3.0',
        customDefault: 'value'
      };

      const config = {
        name: 'project'
      };

      const merged = mergeWithDefaults(config, customDefaults);

      expect(merged.version).toBe('3.0');
      expect(merged.customDefault).toBe('value');
      expect(merged.name).toBe('project');
    });
  });

  describe('isDefaultValue()', () => {
    it('should identify default values correctly', () => {
      const defaults = getDefaultConfig();

      expect(isDefaultValue('version', '1.0.0', defaults)).toBe(true);
      expect(isDefaultValue('name', 'my-project', defaults)).toBe(true);
      expect(isDefaultValue('targets.defaults.ssh.port', 22, defaults)).toBe(true);
      expect(isDefaultValue('commands.exec.shell', '/bin/sh', defaults)).toBe(true);
    });

    it('should identify non-default values', () => {
      const defaults = getDefaultConfig();

      expect(isDefaultValue('version', '2.0', defaults)).toBe(false);
      expect(isDefaultValue('name', 'custom', defaults)).toBe(false);
      expect(isDefaultValue('targets.defaults.ssh.port', 2222, defaults)).toBe(false);
    });

    it('should handle nested paths correctly', () => {
      const defaults = getDefaultConfig();

      expect(isDefaultValue('targets.defaults.docker.workdir', '/app', defaults)).toBe(true);
      expect(isDefaultValue('targets.defaults.docker.workdir', '/custom', defaults)).toBe(false);
      expect(isDefaultValue('commands.logs.tail', '50', defaults)).toBe(true);
      expect(isDefaultValue('commands.logs.tail', '100', defaults)).toBe(false);
    });

    it('should handle non-existent paths', () => {
      const defaults = getDefaultConfig();

      expect(isDefaultValue('nonexistent.path', 'value', defaults)).toBe(false);
      expect(isDefaultValue('targets.nonexistent', 'value', defaults)).toBe(false);
    });

    it('should handle empty objects and arrays', () => {
      const defaults = getDefaultConfig();

      expect(isDefaultValue('vars', {}, defaults)).toBe(true);
      expect(isDefaultValue('tasks', {}, defaults)).toBe(true);
      expect(isDefaultValue('commands.sync.exclude', [], defaults)).toBe(true);
    });

    it('should work with custom defaults', () => {
      const customDefaults = {
        custom: {
          nested: {
            value: 'test'
          }
        }
      };

      expect(isDefaultValue('custom.nested.value', 'test', customDefaults)).toBe(true);
      expect(isDefaultValue('custom.nested.value', 'other', customDefaults)).toBe(false);
    });

    it('should handle complex objects comparison', () => {
      const defaults = getDefaultConfig();

      const sshDefaults = {
        port: 22,
        keepAlive: true,
        keepAliveInterval: 30000,
        timeout: 60000
      };

      expect(isDefaultValue('targets.defaults.ssh', sshDefaults, defaults)).toBe(true);

      const modifiedSsh = { ...sshDefaults, port: 2222 };
      expect(isDefaultValue('targets.defaults.ssh', modifiedSsh, defaults)).toBe(false);
    });
  });
});