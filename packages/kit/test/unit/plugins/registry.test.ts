/**
 * Tests for plugin registry
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { PluginRegistry } from '../../../src/plugins/registry.js';
import { emojiPlugin } from '../../../src/plugins/emoji-plugin.js';

import type { KitPlugin } from '../../../src/plugins/plugin.js';

describe('PluginRegistry', () => {
  let registry: PluginRegistry;

  beforeEach(() => {
    registry = new PluginRegistry();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('registration', () => {
    it('should register a plugin', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        description: 'Test plugin',
      };

      await registry.register(plugin);

      expect(registry.isRegistered('test')).toBe(true);
      expect(registry.getPlugin('test')).toBe(plugin);
    });

    it('should prevent duplicate registration', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      
      await expect(registry.register(plugin)).rejects.toThrow('Plugin "test" is already registered');
    });

    it('should check dependencies on registration', async () => {
      const plugin: KitPlugin = {
        name: 'dependent',
        version: '1.0.0',
        dependencies: ['missing'],
      };

      await expect(registry.register(plugin)).rejects.toThrow('Plugin "dependent" depends on "missing" which is not registered');
    });

    it('should call onRegister hook', async () => {
      const onRegister = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { onRegister },
      };

      await registry.register(plugin);

      expect(onRegister).toHaveBeenCalledOnce();
    });

    it('should emit registration event', async () => {
      const listener = vi.fn();
      registry.on('plugin:registered', listener);

      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);

      expect(listener).toHaveBeenCalledWith({ plugin });
    });
  });

  describe('activation', () => {
    it('should activate a registered plugin', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      await registry.activate('test');

      expect(registry.isActive('test')).toBe(true);
    });

    it('should prevent activating unregistered plugin', async () => {
      await expect(registry.activate('unknown')).rejects.toThrow('Plugin "unknown" is not registered');
    });

    it('should prevent duplicate activation', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      await registry.activate('test');

      await expect(registry.activate('test')).rejects.toThrow('Plugin "test" is already active');
    });

    it('should activate dependencies first', async () => {
      const activationOrder: string[] = [];

      const basePlugin: KitPlugin = {
        name: 'base',
        version: '1.0.0',
        hooks: {
          onActivate: async () => {
            activationOrder.push('base');
          },
        },
      };

      const dependentPlugin: KitPlugin = {
        name: 'dependent',
        version: '1.0.0',
        dependencies: ['base'],
        hooks: {
          onActivate: async () => {
            activationOrder.push('dependent');
          },
        },
      };

      await registry.register(basePlugin);
      await registry.register(dependentPlugin);
      await registry.activate('dependent');

      expect(activationOrder).toEqual(['base', 'dependent']);
      expect(registry.isActive('base')).toBe(true);
      expect(registry.isActive('dependent')).toBe(true);
    });

    it('should register components on activation', async () => {
      const mockCreate = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        components: {
          testComponent: {
            name: 'test',
            create: mockCreate,
          },
        },
      };

      await registry.register(plugin);
      await registry.activate('test');

      const component = registry.getComponent('test');
      expect(component).toBeDefined();
      expect(component?.create).toBe(mockCreate);
    });

    it('should apply theme overrides', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        theme: {
          colors: {
            primary: '#ff0000',
          },
        },
      };

      await registry.register(plugin);
      await registry.activate('test');

      const theme = registry.getMergedTheme();
      expect(theme.colors?.primary).toBe('#ff0000');
    });

    it('should call onActivate hook', async () => {
      const onActivate = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { onActivate },
      };

      await registry.register(plugin);
      await registry.activate('test');

      expect(onActivate).toHaveBeenCalledOnce();
    });

    it('should emit activation event', async () => {
      const listener = vi.fn();
      registry.on('plugin:activated', listener);

      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      await registry.activate('test');

      expect(listener).toHaveBeenCalledWith({ plugin });
    });
  });

  describe('deactivation', () => {
    it('should deactivate an active plugin', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.deactivate('test');

      expect(registry.isActive('test')).toBe(false);
    });

    it('should prevent deactivating unregistered plugin', async () => {
      await expect(registry.deactivate('unknown')).rejects.toThrow('Plugin "unknown" is not registered');
    });

    it('should prevent deactivating inactive plugin', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);

      await expect(registry.deactivate('test')).rejects.toThrow('Plugin "test" is not active');
    });

    it('should prevent deactivating if other plugins depend on it', async () => {
      const basePlugin: KitPlugin = {
        name: 'base',
        version: '1.0.0',
      };

      const dependentPlugin: KitPlugin = {
        name: 'dependent',
        version: '1.0.0',
        dependencies: ['base'],
      };

      await registry.register(basePlugin);
      await registry.register(dependentPlugin);
      await registry.activate('dependent');

      await expect(registry.deactivate('base')).rejects.toThrow('Cannot deactivate "base" because "dependent" depends on it');
    });

    it('should remove components on deactivation', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        components: {
          testComponent: {
            name: 'test',
            create: vi.fn(),
          },
        },
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.deactivate('test');

      expect(registry.getComponent('test')).toBeUndefined();
    });

    it('should remove theme overrides', async () => {
      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
        theme: {
          colors: {
            primary: '#ff0000',
          },
        },
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
        theme: {
          colors: {
            secondary: '#00ff00',
          },
        },
      };

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.activate('test1');
      await registry.activate('test2');

      let theme = registry.getMergedTheme();
      expect(theme.colors?.primary).toBe('#ff0000');
      expect(theme.colors?.secondary).toBe('#00ff00');

      await registry.deactivate('test1');

      theme = registry.getMergedTheme();
      expect(theme.colors?.primary).toBeUndefined();
      expect(theme.colors?.secondary).toBe('#00ff00');
    });

    it('should call onDeactivate hook', async () => {
      const onDeactivate = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { onDeactivate },
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.deactivate('test');

      expect(onDeactivate).toHaveBeenCalledOnce();
    });
  });

  describe('unregistration', () => {
    it('should unregister a plugin', async () => {
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
      };

      await registry.register(plugin);
      await registry.unregister('test');

      expect(registry.isRegistered('test')).toBe(false);
    });

    it('should deactivate before unregistering if active', async () => {
      const onDeactivate = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { onDeactivate },
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.unregister('test');

      expect(onDeactivate).toHaveBeenCalledOnce();
      expect(registry.isRegistered('test')).toBe(false);
    });
  });

  describe('querying', () => {
    it('should get all plugins', async () => {
      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
      };

      await registry.register(plugin1);
      await registry.register(plugin2);

      const plugins = registry.getAllPlugins();
      expect(plugins).toHaveLength(2);
      expect(plugins).toContain(plugin1);
      expect(plugins).toContain(plugin2);
    });

    it('should get active plugins', async () => {
      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
      };

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.activate('test1');

      const activePlugins = registry.getActivePlugins();
      expect(activePlugins).toHaveLength(1);
      expect(activePlugins).toContain(plugin1);
      expect(activePlugins).not.toContain(plugin2);
    });

    it('should get all components', async () => {
      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
        components: {
          comp1: {
            name: 'comp1',
            create: vi.fn(),
          },
        },
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
        components: {
          comp2: {
            name: 'comp2',
            create: vi.fn(),
          },
        },
      };

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.activate('test1');
      await registry.activate('test2');

      const components = registry.getComponents();
      expect(components.size).toBe(2);
      expect(components.has('comp1')).toBe(true);
      expect(components.has('comp2')).toBe(true);
    });
  });

  describe('hooks', () => {
    it('should execute beforePrompt hooks', async () => {
      const beforePrompt = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { beforePrompt },
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.executeBeforePrompt('text', { message: 'Test' });

      expect(beforePrompt).toHaveBeenCalledWith('text', { message: 'Test' });
    });

    it('should execute afterPrompt hooks', async () => {
      const afterPrompt = vi.fn();
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        hooks: { afterPrompt },
      };

      await registry.register(plugin);
      await registry.activate('test');
      await registry.executeAfterPrompt('text', 'result');

      expect(afterPrompt).toHaveBeenCalledWith('text', 'result');
    });

    it('should execute hooks in order', async () => {
      const order: string[] = [];

      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
        hooks: {
          beforePrompt: async () => {
            order.push('plugin1');
          },
        },
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
        hooks: {
          beforePrompt: async () => {
            order.push('plugin2');
          },
        },
      };

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.activate('test1');
      await registry.activate('test2');
      await registry.executeBeforePrompt('text', {});

      expect(order).toEqual(['plugin1', 'plugin2']);
    });
  });

  describe('enhancement', () => {
    it('should apply enhancements to kit instance', async () => {
      const kit = {} as any;
      
      const plugin: KitPlugin = {
        name: 'test',
        version: '1.0.0',
        enhance: (k) => {
          k.testMethod = () => 'test result';
          k.testProperty = 'test value';
        },
      };

      await registry.register(plugin);
      await registry.activate('test');
      registry.enhance(kit);

      expect(kit.testMethod()).toBe('test result');
      expect(kit.testProperty).toBe('test value');
    });

    it('should apply multiple enhancements', async () => {
      const kit = {} as any;
      
      const plugin1: KitPlugin = {
        name: 'test1',
        version: '1.0.0',
        enhance: (k) => {
          k.method1 = () => 'from plugin 1';
        },
      };

      const plugin2: KitPlugin = {
        name: 'test2',
        version: '1.0.0',
        enhance: (k) => {
          k.method2 = () => 'from plugin 2';
        },
      };

      await registry.register(plugin1);
      await registry.register(plugin2);
      await registry.activate('test1');
      await registry.activate('test2');
      registry.enhance(kit);

      expect(kit.method1()).toBe('from plugin 1');
      expect(kit.method2()).toBe('from plugin 2');
    });
  });

  describe('emoji plugin integration', () => {
    it('should register and activate emoji plugin', async () => {
      await registry.register(emojiPlugin);
      await registry.activate('emoji');

      expect(registry.isActive('emoji')).toBe(true);
      expect(registry.getComponent('emojiPicker')).toBeDefined();
    });

    it('should apply emoji theme', async () => {
      await registry.register(emojiPlugin);
      await registry.activate('emoji');

      const theme = registry.getMergedTheme();
      expect(theme.symbols?.success).toBe('✅');
      expect(theme.symbols?.error).toBe('❌');
    });

    it('should enhance kit with emoji methods', async () => {
      const kit = {} as any;

      await registry.register(emojiPlugin);
      await registry.activate('emoji');
      registry.enhance(kit);

      expect(kit.emoji('smile')).toBe('😊');
      expect(kit.emoji('unknown')).toBe('unknown');
      expect(typeof kit.hasEmojiSupport).toBe('function');
      expect(typeof kit.getEmojis).toBe('function');
    });
  });
});