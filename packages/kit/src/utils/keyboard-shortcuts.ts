// Keyboard shortcut customization system

import { Key } from '../core/types.js';
import { EventEmitter } from '../core/event-emitter.js';

export interface SimpleShortcut {
  key: string;
  modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>;
  description?: string;
}

export interface Shortcut extends SimpleShortcut {
  action: string | (() => void | Promise<void>);
  when?: () => boolean;
}

export interface ShortcutMap {
  [action: string]: string | string[] | Shortcut | SimpleShortcut;
}

export interface KeyboardShortcutsOptions {
  shortcuts: ShortcutMap;
  preventDefault?: boolean;
  caseSensitive?: boolean;
}

export class KeyboardShortcuts extends EventEmitter {
  private shortcuts: Map<string, Shortcut[]> = new Map();
  private actions: Map<string, Shortcut> = new Map();
  private preventDefault: boolean;
  private caseSensitive: boolean;
  
  constructor(options: KeyboardShortcutsOptions) {
    super();
    
    this.preventDefault = options.preventDefault ?? true;
    this.caseSensitive = options.caseSensitive ?? false;
    
    this.registerShortcuts(options.shortcuts);
  }
  
  private registerShortcuts(shortcuts: ShortcutMap) {
    Object.entries(shortcuts).forEach(([action, config]) => {
      if (typeof config === 'string') {
        this.addShortcut(action, { key: config, action });
      } else if (Array.isArray(config)) {
        config.forEach(key => {
          this.addShortcut(action, { key, action });
        });
      } else {
        // Don't override action if it's already a function in the config
        const shortcut: Shortcut = 'action' in config && typeof config.action === 'function' 
          ? config as Shortcut
          : { ...config, action };
        this.addShortcut(action, shortcut);
      }
    });
  }
  
  addShortcut(action: string, shortcut: Shortcut) {
    const key = this.normalizeKey(shortcut.key, shortcut.modifiers);
    
    if (!this.shortcuts.has(key)) {
      this.shortcuts.set(key, []);
    }
    
    this.shortcuts.get(key)!.push(shortcut);
    this.actions.set(action, shortcut);
    
    this.emit('shortcut-added', { action, shortcut });
  }
  
  removeShortcut(action: string) {
    const shortcut = this.actions.get(action);
    if (!shortcut) return;
    
    const key = this.normalizeKey(shortcut.key, shortcut.modifiers);
    const shortcuts = this.shortcuts.get(key);
    
    if (shortcuts) {
      const index = shortcuts.indexOf(shortcut);
      if (index !== -1) {
        shortcuts.splice(index, 1);
        if (shortcuts.length === 0) {
          this.shortcuts.delete(key);
        }
      }
    }
    
    this.actions.delete(action);
    this.emit('shortcut-removed', { action, shortcut });
  }
  
  updateShortcut(action: string, newKey: string, modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>) {
    const existing = this.actions.get(action);
    if (!existing) return;
    
    this.removeShortcut(action);
    this.addShortcut(action, {
      ...existing,
      key: newKey,
      modifiers,
    });
    
    this.emit('shortcut-updated', { action, key: newKey, modifiers });
  }
  
  private normalizeKey(key: string, modifiers?: Array<'ctrl' | 'alt' | 'shift' | 'meta'>): string {
    const parts: string[] = [];
    
    if (modifiers) {
      if (modifiers.includes('ctrl')) parts.push('ctrl');
      if (modifiers.includes('alt')) parts.push('alt');
      if (modifiers.includes('shift')) parts.push('shift');
      if (modifiers.includes('meta')) parts.push('meta');
    }
    
    parts.push(this.caseSensitive ? key : key.toLowerCase());
    
    return parts.join('+');
  }
  
  private keyToString(key: Key): string {
    const parts: string[] = [];
    
    if (key.ctrl) parts.push('ctrl');
    if (key.meta) parts.push('meta');
    if (key.shift) parts.push('shift');
    
    // Handle special keys
    if (key.name) {
      parts.push(key.name);
    } else if (key.sequence) {
      parts.push(this.caseSensitive ? key.sequence : key.sequence.toLowerCase());
    }
    
    return parts.join('+');
  }
  
  async handleKey(key: Key): Promise<boolean> {
    const keyString = this.keyToString(key);
    const shortcuts = this.shortcuts.get(keyString);
    
    if (!shortcuts || shortcuts.length === 0) {
      return false;
    }
    
    // Find applicable shortcut
    const applicable = shortcuts.find(s => !s.when || s.when());
    if (!applicable) {
      return false;
    }
    
    // Execute action
    if (typeof applicable.action === 'function') {
      await applicable.action();
    } else {
      this.emit('action', applicable.action);
    }
    
    this.emit('shortcut-triggered', {
      key: keyString,
      action: applicable.action,
      shortcut: applicable,
    });
    
    return this.preventDefault;
  }
  
  getShortcut(action: string): Shortcut | undefined {
    return this.actions.get(action);
  }
  
  getShortcutKey(action: string): string | undefined {
    const shortcut = this.actions.get(action);
    if (!shortcut) return undefined;
    
    return this.formatShortcut(shortcut);
  }
  
  formatShortcut(shortcut: Shortcut): string {
    const parts: string[] = [];
    
    if (shortcut.modifiers) {
      if (shortcut.modifiers.includes('ctrl')) parts.push('Ctrl');
      if (shortcut.modifiers.includes('alt')) parts.push('Alt');
      if (shortcut.modifiers.includes('shift')) parts.push('Shift');
      if (shortcut.modifiers.includes('meta')) parts.push('Cmd');
    }
    
    // Format key name
    const key = shortcut.key.charAt(0).toUpperCase() + shortcut.key.slice(1);
    parts.push(key);
    
    return parts.join('+');
  }
  
  getAllShortcuts(): Array<{ action: string; shortcut: Shortcut; formatted: string }> {
    const results: Array<{ action: string; shortcut: Shortcut; formatted: string }> = [];
    
    this.actions.forEach((shortcut, action) => {
      results.push({
        action,
        shortcut,
        formatted: this.formatShortcut(shortcut),
      });
    });
    
    return results.sort((a, b) => a.action.localeCompare(b.action));
  }
  
  reset() {
    this.shortcuts.clear();
    this.actions.clear();
    this.emit('reset');
  }
  
  clone(): KeyboardShortcuts {
    const shortcuts: ShortcutMap = {};
    
    this.actions.forEach((shortcut, action) => {
      shortcuts[action] = shortcut;
    });
    
    return new KeyboardShortcuts({
      shortcuts,
      preventDefault: this.preventDefault,
      caseSensitive: this.caseSensitive,
    });
  }
}

// Default shortcuts for common prompt actions
export const DEFAULT_SHORTCUTS: ShortcutMap = {
  submit: { key: 'return', description: 'Submit' },
  cancel: { key: 'escape', description: 'Cancel' },
  up: { key: 'up', description: 'Move up' },
  down: { key: 'down', description: 'Move down' },
  left: { key: 'left', description: 'Move left' },
  right: { key: 'right', description: 'Move right' },
  pageUp: { key: 'pageup', description: 'Page up' },
  pageDown: { key: 'pagedown', description: 'Page down' },
  home: { key: 'home', description: 'Go to start' },
  end: { key: 'end', description: 'Go to end' },
  selectAll: { key: 'a', modifiers: ['ctrl'], description: 'Select all' },
  clear: { key: 'l', modifiers: ['ctrl'], description: 'Clear screen' },
  undo: { key: 'z', modifiers: ['ctrl'], description: 'Undo' },
  redo: { key: 'y', modifiers: ['ctrl'], description: 'Redo' },
  help: { key: '?', description: 'Show help' },
  toggleAll: { key: 'a', modifiers: ['ctrl'], description: 'Toggle all' },
  search: { key: 'f', modifiers: ['ctrl'], description: 'Search' },
  refresh: { key: 'r', modifiers: ['ctrl'], description: 'Refresh' },
};

// Preset shortcut schemes
export const SHORTCUT_SCHEMES = {
  default: DEFAULT_SHORTCUTS,
  
  vim: {
    ...DEFAULT_SHORTCUTS,
    up: ['k', 'up'],
    down: ['j', 'down'],
    left: ['h', 'left'],
    right: ['l', 'right'],
    submit: ['return', { key: 'return', modifiers: ['ctrl'] }],
    cancel: ['escape', { key: 'c', modifiers: ['ctrl'] }],
    top: 'g',
    bottom: { key: 'g', modifiers: ['shift'] },
  },
  
  emacs: {
    ...DEFAULT_SHORTCUTS,
    up: { key: 'p', modifiers: ['ctrl'] },
    down: { key: 'n', modifiers: ['ctrl'] },
    left: { key: 'b', modifiers: ['ctrl'] },
    right: { key: 'f', modifiers: ['ctrl'] },
    home: { key: 'a', modifiers: ['ctrl'] },
    end: { key: 'e', modifiers: ['ctrl'] },
    cancel: { key: 'g', modifiers: ['ctrl'] },
  },
};

// Helper to merge shortcut schemes
export function mergeShortcuts(...schemes: ShortcutMap[]): ShortcutMap {
  const merged: ShortcutMap = {};
  
  schemes.forEach(scheme => {
    Object.entries(scheme).forEach(([action, config]) => {
      merged[action] = config;
    });
  });
  
  return merged;
}

// Mixin for adding keyboard shortcuts to prompts
export interface WithKeyboardShortcuts {
  shortcuts?: KeyboardShortcuts;
  
  handleShortcutKey(key: Key): Promise<boolean>;
  getShortcutHelp(): Array<{ key: string; description: string }>;
}

export function withKeyboardShortcuts<T extends new (...args: any[]) => any>(Base: T) {
  return class extends Base implements WithKeyboardShortcuts {
    shortcuts?: KeyboardShortcuts;
    
    constructor(...args: any[]) {
      super(...args);
      
      const options = args[0];
      if (options?.shortcuts) {
        this.shortcuts = new KeyboardShortcuts({
          shortcuts: options.shortcuts,
          preventDefault: options.shortcutPreventDefault,
          caseSensitive: options.shortcutCaseSensitive,
        });
        
        // Listen for actions
        this.shortcuts.on('action', (action: string) => {
          if (this.handleAction) {
            this.handleAction(action);
          }
        });
      }
    }
    
    async handleShortcutKey(key: Key): Promise<boolean> {
      if (!this.shortcuts) return false;
      return await this.shortcuts.handleKey(key);
    }
    
    getShortcutHelp(): Array<{ key: string; description: string }> {
      if (!this.shortcuts) return [];
      
      return this.shortcuts.getAllShortcuts()
        .filter(s => s.shortcut.description)
        .map(s => ({
          key: s.formatted,
          description: s.shortcut.description!,
        }));
    }
    
    // Override this in subclasses to handle actions
    handleAction?(action: string): void | Promise<void>;
  };
}