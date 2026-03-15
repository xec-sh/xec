import { describe, it, expect, beforeEach } from 'vitest';

import { PluginManager, type LoaderPlugin } from '../../../src/plugin/index.js';

describe('PluginManager', () => {
  let manager: PluginManager;

  beforeEach(() => {
    manager = new PluginManager();
  });

  describe('registration', () => {
    it('should register a plugin', () => {
      manager.register({ name: 'test-plugin' });
      expect(manager.count).toBe(1);
      expect(manager.has('test-plugin')).toBe(true);
    });

    it('should prevent duplicate names', () => {
      manager.register({ name: 'test' });
      expect(() => manager.register({ name: 'test' })).toThrow('already registered');
    });

    it('should prevent registration after setup', async () => {
      await manager.setup();
      expect(() => manager.register({ name: 'late' })).toThrow('after setup');
    });
  });

  describe('lifecycle', () => {
    it('should call setup hooks in order', async () => {
      const order: string[] = [];

      manager.register({ name: 'a', setup: () => { order.push('a'); } });
      manager.register({ name: 'b', setup: () => { order.push('b'); } });

      await manager.setup();

      expect(order).toEqual(['a', 'b']);
    });

    it('should call teardown hooks in reverse order', async () => {
      const order: string[] = [];

      manager.register({ name: 'a', teardown: () => { order.push('a'); } });
      manager.register({ name: 'b', teardown: () => { order.push('b'); } });

      await manager.setup();
      await manager.teardown();

      expect(order).toEqual(['b', 'a']);
    });

    it('should handle teardown errors gracefully', async () => {
      manager.register({
        name: 'failing',
        teardown: () => { throw new Error('teardown failed'); },
      });

      await manager.setup();
      // Should not throw
      await manager.teardown();
    });
  });

  describe('resolveSpecifier', () => {
    it('should return modified specifier from plugin', async () => {
      manager.register({
        name: 'alias',
        resolveSpecifier: (spec) => {
          if (spec.startsWith('@/')) return spec.replace('@/', './src/');
          return undefined;
        },
      });

      await manager.setup();

      expect(await manager.resolveSpecifier('@/utils')).toBe('./src/utils');
      expect(await manager.resolveSpecifier('lodash')).toBe('lodash');
    });

    it('should use first matching plugin', async () => {
      manager.register({
        name: 'first',
        resolveSpecifier: (spec) => spec === 'test' ? 'first-result' : undefined,
      });
      manager.register({
        name: 'second',
        resolveSpecifier: (spec) => spec === 'test' ? 'second-result' : undefined,
      });

      await manager.setup();

      expect(await manager.resolveSpecifier('test')).toBe('first-result');
    });
  });

  describe('transformCode', () => {
    it('should chain transformations', async () => {
      manager.register({
        name: 'prepend',
        transformCode: (code) => `// header\n${code}`,
      });
      manager.register({
        name: 'append',
        transformCode: (code) => `${code}\n// footer`,
      });

      await manager.setup();

      const result = await manager.transformCode('const x = 1;', 'test.js');
      expect(result).toBe('// header\nconst x = 1;\n// footer');
    });

    it('should skip when plugin returns undefined', async () => {
      manager.register({
        name: 'noop',
        transformCode: () => undefined,
      });

      await manager.setup();

      const result = await manager.transformCode('const x = 1;', 'test.js');
      expect(result).toBe('const x = 1;');
    });
  });

  describe('beforeExecute', () => {
    it('should allow execution by default', async () => {
      await manager.setup();
      expect(await manager.beforeExecute('test.ts')).toBe(true);
    });

    it('should cancel execution when plugin returns false', async () => {
      manager.register({
        name: 'blocker',
        beforeExecute: (path) => !path.includes('blocked'),
      });

      await manager.setup();

      expect(await manager.beforeExecute('ok.ts')).toBe(true);
      expect(await manager.beforeExecute('blocked.ts')).toBe(false);
    });
  });

  describe('onError', () => {
    it('should pass through error when no plugin handles it', async () => {
      await manager.setup();
      const error = new Error('original');
      expect(await manager.onError(error)).toBe(error);
    });

    it('should return modified error from plugin', async () => {
      manager.register({
        name: 'enricher',
        onError: (error) => new Error(`Enhanced: ${error.message}`),
      });

      await manager.setup();
      const result = await manager.onError(new Error('test'));
      expect(result.message).toBe('Enhanced: test');
    });
  });

  describe('getResolvers', () => {
    it('should collect resolvers from plugins', () => {
      const resolver = {
        canResolve: () => true,
        resolve: async () => ({ resolved: 'test', type: 'local' as const, fromCache: false }),
      };

      manager.register({ name: 'with-resolver', resolver });
      manager.register({ name: 'without-resolver' });

      expect(manager.getResolvers()).toHaveLength(1);
      expect(manager.getResolvers()[0]).toBe(resolver);
    });
  });
});
