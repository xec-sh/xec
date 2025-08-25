/**
 * Default keybindings for the editor
 */

import type { KeyBinding } from '../types.js';

export const DefaultKeyBindings: KeyBinding[] = [
  // Basic movement
  { key: 'ArrowUp', action: 'cursorUp' },
  { key: 'ArrowDown', action: 'cursorDown' },
  { key: 'ArrowLeft', action: 'cursorLeft' },
  { key: 'ArrowRight', action: 'cursorRight' },

  // Word movement
  { key: 'ArrowLeft', ctrl: true, action: 'cursorWordLeft' },
  { key: 'ArrowRight', ctrl: true, action: 'cursorWordRight' },
  { key: 'ArrowLeft', alt: true, action: 'cursorWordLeft' },
  { key: 'ArrowRight', alt: true, action: 'cursorWordRight' },

  // Line movement
  { key: 'Home', action: 'cursorLineStart' },
  { key: 'End', action: 'cursorLineEnd' },
  { key: 'a', ctrl: true, action: 'cursorLineStart' },
  { key: 'e', ctrl: true, action: 'cursorLineEnd' },

  // Document movement
  { key: 'Home', ctrl: true, action: 'cursorDocumentStart' },
  { key: 'End', ctrl: true, action: 'cursorDocumentEnd' },

  // Selection movement
  { key: 'ArrowUp', shift: true, action: 'selectUp' },
  { key: 'ArrowDown', shift: true, action: 'selectDown' },
  { key: 'ArrowLeft', shift: true, action: 'selectLeft' },
  { key: 'ArrowRight', shift: true, action: 'selectRight' },

  // Word selection
  { key: 'ArrowLeft', shift: true, ctrl: true, action: 'selectWordLeft' },
  { key: 'ArrowRight', shift: true, ctrl: true, action: 'selectWordRight' },

  // Select all
  { key: 'a', ctrl: true, action: 'selectAll' },

  // Deletion
  { key: 'Backspace', action: 'deleteLeft' },
  { key: 'Delete', action: 'deleteRight' },
  { key: 'Backspace', ctrl: true, action: 'deleteWordLeft' },
  { key: 'Delete', ctrl: true, action: 'deleteWordRight' },
  { key: 'Backspace', alt: true, action: 'deleteWordLeft' },
  { key: 'Delete', alt: true, action: 'deleteWordRight' },

  // Special keys
  { key: 'Enter', action: 'insertNewLine' },
  { key: 'Tab', action: 'insertTab' },

  // Undo/Redo
  { key: 'z', ctrl: true, action: 'undo' },
  { key: 'y', ctrl: true, action: 'redo' },
  { key: 'z', ctrl: true, shift: true, action: 'redo' },
];

/**
 * Get a human-readable string for a key binding
 */
export function getKeyBindingLabel(binding: KeyBinding): string {
  const parts: string[] = [];

  if (binding.ctrl) parts.push('Ctrl');
  if (binding.alt) parts.push('Alt');
  if (binding.shift) parts.push('Shift');
  if (binding.meta) parts.push('Cmd');

  // Convert key name to readable format
  let key = binding.key;
  switch (key) {
    case 'ArrowUp': key = '↑'; break;
    case 'ArrowDown': key = '↓'; break;
    case 'ArrowLeft': key = '←'; break;
    case 'ArrowRight': key = '→'; break;
    case 'Enter': key = '⏎'; break;
    case 'Tab': key = '⇥'; break;
    case 'Backspace': key = '⌫'; break;
    case 'Delete': key = '⌦'; break;
    case 'Escape': key = 'Esc'; break;
    case ' ': key = 'Space'; break;
  }

  parts.push(key);
  return parts.join('+');
}

/**
 * Parse a key event into a key binding format
 */
export function parseKeyEvent(event: KeyboardEvent): Partial<KeyBinding> {
  return {
    key: event.key,
    ctrl: event.ctrlKey,
    alt: event.altKey,
    shift: event.shiftKey,
    meta: event.metaKey
  };
}

/**
 * Check if two key bindings match
 */
export function keyBindingsMatch(a: Partial<KeyBinding>, b: Partial<KeyBinding>): boolean {
  return a.key === b.key &&
    !!a.ctrl === !!b.ctrl &&
    !!a.alt === !!b.alt &&
    !!a.shift === !!b.shift &&
    !!a.meta === !!b.meta;
}