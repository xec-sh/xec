import { it, vi, expect, describe } from 'vitest';

import {
  mergeShortcuts,
  SHORTCUT_SCHEMES,
  type ShortcutMap,
  KeyboardShortcuts,
  DEFAULT_SHORTCUTS,
  withKeyboardShortcuts
} from '../../../src/utils/keyboard-shortcuts.js';

describe('KeyboardShortcuts', () => {
  describe('basic functionality', () => {
    it('should create shortcuts instance', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          submit: 'return',
          cancel: 'escape',
        },
      });
      
      expect(shortcuts).toBeDefined();
    });

    it('should register string shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          submit: 'return',
          cancel: 'escape',
        },
      });
      
      expect(shortcuts.getShortcut('submit')).toBeDefined();
      expect(shortcuts.getShortcut('cancel')).toBeDefined();
    });

    it('should register array shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          up: ['k', 'up'],
          down: ['j', 'down'],
        },
      });
      
      expect(shortcuts.getShortcut('up')).toBeDefined();
      expect(shortcuts.getShortcut('down')).toBeDefined();
    });

    it('should register shortcut objects', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          save: {
            key: 's',
            modifiers: ['ctrl'],
            description: 'Save file',
            action: 'save',
          },
        },
      });
      
      const shortcut = shortcuts.getShortcut('save');
      expect(shortcut).toBeDefined();
      expect(shortcut?.modifiers).toEqual(['ctrl']);
      expect(shortcut?.description).toBe('Save file');
    });
  });

  describe('key handling', () => {
    it('should handle simple key press', async () => {
      const actionHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          submit: 'return',
        },
      });
      
      shortcuts.on('action', actionHandler);
      
      const handled = await shortcuts.handleKey({ name: 'return' });
      
      expect(handled).toBe(true);
      expect(actionHandler).toHaveBeenCalledWith('submit');
    });

    it('should handle key with modifiers', async () => {
      const actionHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          save: { key: 's', modifiers: ['ctrl'], action: 'save' },
        },
      });
      
      shortcuts.on('action', actionHandler);
      
      const handled = await shortcuts.handleKey({ 
        name: 's',
        ctrl: true,
      });
      
      expect(handled).toBe(true);
      expect(actionHandler).toHaveBeenCalledWith('save');
    });

    it('should handle function actions', async () => {
      const actionFn = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          custom: { key: 'x', action: actionFn },
        },
      });
      
      await shortcuts.handleKey({ name: 'x' });
      
      expect(actionFn).toHaveBeenCalled();
    });

    it('should respect when condition', async () => {
      let enabled = false;
      const actionHandler = vi.fn();
      
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          conditional: {
            key: 'c',
            action: 'conditional',
            when: () => enabled,
          },
        },
      });
      
      shortcuts.on('action', actionHandler);
      
      // Should not trigger when disabled
      await shortcuts.handleKey({ name: 'c' });
      expect(actionHandler).not.toHaveBeenCalled();
      
      // Should trigger when enabled
      enabled = true;
      await shortcuts.handleKey({ name: 'c' });
      expect(actionHandler).toHaveBeenCalledWith('conditional');
    });

    it('should handle case sensitivity', async () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          upper: 'A',
          lower: 'a',
        },
        caseSensitive: true,
      });
      
      const upperShortcut = shortcuts.getShortcut('upper');
      expect(upperShortcut?.key).toBe('A');
      
      const lowerShortcut = shortcuts.getShortcut('lower');
      expect(lowerShortcut?.key).toBe('a');
    });

    it('should ignore case when not sensitive', async () => {
      const actionHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test: 'a',
        },
        caseSensitive: false,
      });
      
      shortcuts.on('action', actionHandler);
      
      await shortcuts.handleKey({ sequence: 'A' });
      expect(actionHandler).toHaveBeenCalledWith('test');
    });

    it('should not handle unknown keys', async () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          submit: 'return',
        },
      });
      
      const handled = await shortcuts.handleKey({ name: 'x' });
      expect(handled).toBe(false);
    });

    it('should respect preventDefault option', async () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test: 'x',
        },
        preventDefault: false,
      });
      
      const handled = await shortcuts.handleKey({ name: 'x' });
      expect(handled).toBe(false);
    });
  });

  describe('shortcut management', () => {
    it('should add shortcuts dynamically', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {},
      });
      
      shortcuts.addShortcut('test', {
        key: 't',
        action: 'test',
      });
      
      expect(shortcuts.getShortcut('test')).toBeDefined();
    });

    it('should remove shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test: 't',
        },
      });
      
      shortcuts.removeShortcut('test');
      expect(shortcuts.getShortcut('test')).toBeUndefined();
    });

    it('should update shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test: 't',
        },
      });
      
      shortcuts.updateShortcut('test', 'x', ['ctrl']);
      
      const shortcut = shortcuts.getShortcut('test');
      expect(shortcut?.key).toBe('x');
      expect(shortcut?.modifiers).toEqual(['ctrl']);
    });

    it('should emit events on changes', () => {
      const addHandler = vi.fn();
      const removeHandler = vi.fn();
      const updateHandler = vi.fn();
      
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {},
      });
      
      shortcuts.on('shortcut-added', addHandler);
      shortcuts.on('shortcut-removed', removeHandler);
      shortcuts.on('shortcut-updated', updateHandler);
      
      shortcuts.addShortcut('test', { key: 't', action: 'test' });
      expect(addHandler).toHaveBeenCalled();
      
      shortcuts.updateShortcut('test', 'x');
      expect(updateHandler).toHaveBeenCalled();
      
      shortcuts.removeShortcut('test');
      expect(removeHandler).toHaveBeenCalled();
    });
  });

  describe('formatting', () => {
    it('should format simple shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          submit: 'return',
        },
      });
      
      expect(shortcuts.getShortcutKey('submit')).toBe('Return');
    });

    it('should format shortcuts with modifiers', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          save: { key: 's', modifiers: ['ctrl'], action: 'save' },
          selectAll: { key: 'a', modifiers: ['ctrl', 'shift'], action: 'selectAll' },
        },
      });
      
      expect(shortcuts.getShortcutKey('save')).toBe('Ctrl+S');
      expect(shortcuts.getShortcutKey('selectAll')).toBe('Ctrl+Shift+A');
    });

    it('should format meta key as Cmd', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          cmd: { key: 'c', modifiers: ['meta'], action: 'cmd' },
        },
      });
      
      expect(shortcuts.getShortcutKey('cmd')).toBe('Cmd+C');
    });
  });

  describe('getAllShortcuts', () => {
    it('should return all shortcuts sorted', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          cancel: 'escape',
          submit: 'return',
          up: 'up',
          down: 'down',
        },
      });
      
      const all = shortcuts.getAllShortcuts();
      
      expect(all.length).toBe(4);
      expect(all[0].action).toBe('cancel');
      expect(all[1].action).toBe('down');
      expect(all[2].action).toBe('submit');
      expect(all[3].action).toBe('up');
    });
  });

  describe('reset and clone', () => {
    it('should reset all shortcuts', () => {
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test1: 't',
          test2: 'x',
        },
      });
      
      shortcuts.reset();
      
      expect(shortcuts.getShortcut('test1')).toBeUndefined();
      expect(shortcuts.getShortcut('test2')).toBeUndefined();
    });

    it('should emit reset event', () => {
      const resetHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: { test: 't' },
      });
      
      shortcuts.on('reset', resetHandler);
      shortcuts.reset();
      
      expect(resetHandler).toHaveBeenCalled();
    });

    it('should clone shortcuts', () => {
      const original = new KeyboardShortcuts({
        shortcuts: {
          test1: 't',
          test2: { key: 'x', modifiers: ['ctrl'], action: 'test2' },
        },
      });
      
      const cloned = original.clone();
      
      expect(cloned.getShortcut('test1')).toBeDefined();
      expect(cloned.getShortcut('test2')).toBeDefined();
      
      // Modifications to clone should not affect original
      cloned.removeShortcut('test1');
      expect(original.getShortcut('test1')).toBeDefined();
    });
  });

  describe('default shortcuts', () => {
    it('should include common actions', () => {
      expect(DEFAULT_SHORTCUTS.submit).toBeDefined();
      expect(DEFAULT_SHORTCUTS.cancel).toBeDefined();
      expect(DEFAULT_SHORTCUTS.up).toBeDefined();
      expect(DEFAULT_SHORTCUTS.down).toBeDefined();
      expect(DEFAULT_SHORTCUTS.help).toBeDefined();
    });
  });

  describe('shortcut schemes', () => {
    it('should provide vim scheme', () => {
      const vim = SHORTCUT_SCHEMES.vim;
      
      expect(vim.up).toContain('k');
      expect(vim.down).toContain('j');
      expect(vim.left).toContain('h');
      expect(vim.right).toContain('l');
    });

    it('should provide emacs scheme', () => {
      const emacs = SHORTCUT_SCHEMES.emacs;
      
      expect(emacs.up).toEqual({ key: 'p', modifiers: ['ctrl'] });
      expect(emacs.down).toEqual({ key: 'n', modifiers: ['ctrl'] });
    });
  });

  describe('mergeShortcuts', () => {
    it('should merge multiple shortcut maps', () => {
      const base: ShortcutMap = {
        submit: 'return',
        cancel: 'escape',
      };
      
      const custom: ShortcutMap = {
        cancel: 'q', // Override
        custom: 'x', // Add new
      };
      
      const merged = mergeShortcuts(base, custom);
      
      expect(merged.submit).toBe('return');
      expect(merged.cancel).toBe('q'); // Overridden
      expect(merged.custom).toBe('x'); // Added
    });
  });

  describe('withKeyboardShortcuts mixin', () => {
    class TestPrompt {
      constructor(public options: any) {}
    }

    it('should add shortcuts functionality', () => {
      const PromptWithShortcuts = withKeyboardShortcuts(TestPrompt);
      const instance = new PromptWithShortcuts({
        shortcuts: {
          submit: 'return',
        },
      });
      
      expect(instance.shortcuts).toBeDefined();
      expect(instance.handleShortcutKey).toBeDefined();
      expect(instance.getShortcutHelp).toBeDefined();
    });

    it('should handle shortcut keys', async () => {
      const PromptWithShortcuts = withKeyboardShortcuts(TestPrompt);
      const instance = new PromptWithShortcuts({
        shortcuts: {
          test: 'x',
        },
      });
      
      const handled = await instance.handleShortcutKey({ name: 'x' });
      expect(handled).toBe(true);
    });

    it('should call handleAction method', async () => {
      const actionHandler = vi.fn();
      
      class TestPromptWithAction {
        constructor(public options: any) {}
        handleAction = actionHandler;
      }
      
      const PromptWithShortcuts = withKeyboardShortcuts(TestPromptWithAction);
      const instance = new PromptWithShortcuts({
        shortcuts: {
          test: 'x',
        },
      });
      
      await instance.handleShortcutKey({ name: 'x' });
      expect(actionHandler).toHaveBeenCalledWith('test');
    });

    it('should get shortcut help', () => {
      const PromptWithShortcuts = withKeyboardShortcuts(TestPrompt);
      const instance = new PromptWithShortcuts({
        shortcuts: {
          submit: { key: 'return', description: 'Submit form', action: 'submit' },
          cancel: { key: 'escape', description: 'Cancel', action: 'cancel' },
          hidden: 'h', // No description
        },
      });
      
      const help = instance.getShortcutHelp();
      
      expect(help.length).toBe(2); // Only with descriptions
      expect(help[0]).toEqual({ key: 'Escape', description: 'Cancel' });
      expect(help[1]).toEqual({ key: 'Return', description: 'Submit form' });
    });

    it('should work without shortcuts', () => {
      const PromptWithShortcuts = withKeyboardShortcuts(TestPrompt);
      const instance = new PromptWithShortcuts({});
      
      expect(instance.shortcuts).toBeUndefined();
      expect(instance.getShortcutHelp()).toEqual([]);
    });
  });

  describe('event handling', () => {
    it('should emit shortcut-triggered event', async () => {
      const triggerHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          test: 't',
        },
      });
      
      shortcuts.on('shortcut-triggered', triggerHandler);
      await shortcuts.handleKey({ name: 't' });
      
      expect(triggerHandler).toHaveBeenCalledWith({
        key: 't',
        action: 'test',
        shortcut: expect.objectContaining({ key: 't' }),
      });
    });
  });

  describe('complex key combinations', () => {
    it('should handle multiple modifiers', async () => {
      const actionHandler = vi.fn();
      const shortcuts = new KeyboardShortcuts({
        shortcuts: {
          complex: {
            key: 's',
            modifiers: ['ctrl', 'shift', 'alt'],
            action: 'complex',
          },
        },
      });
      
      shortcuts.on('action', actionHandler);
      
      await shortcuts.handleKey({
        name: 's',
        ctrl: true,
        shift: true,
        // Missing alt - should not trigger
      });
      
      expect(actionHandler).not.toHaveBeenCalled();
      
      // With all modifiers
      await shortcuts.handleKey({
        name: 's',
        ctrl: true,
        shift: true,
        meta: true, // Wrong modifier
      });
      
      expect(actionHandler).not.toHaveBeenCalled();
    });
  });
});