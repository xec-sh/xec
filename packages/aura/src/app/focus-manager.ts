/**
 * Aura Focus Management System
 * Universal focus management with reactive state and component lifecycle integration
 */

import { batch, signal, computed, type Signal, type WritableSignal } from 'vibrancy';

import { onCleanup } from './lifecycle.js';
import { registerCleanup } from './lifecycle-manager.js';
import { Component, ComponentEvents } from '../component.js';

import type { ParsedKey } from '../types.js';

/**
 * Focusable component interface extending base Component
 */
export interface FocusableComponent extends Component {
  /** Called when component receives focus (in addition to focus event) */
  onFocus?(): void;
  /** Called when component loses focus (in addition to blur event) */
  onBlur?(): void;
}

/**
 * Focus group configuration
 */
export interface FocusGroup {
  /** Unique identifier for the group */
  id: string;
  /** Priority for focus navigation (higher = first) */
  priority?: number;
  /** If true, focus cannot leave this group using Tab */
  trap?: boolean;
  /** If true, Tab at last item goes to first */
  circular?: boolean;
  /** Custom navigation handler */
  onNavigate?: (direction: 'next' | 'previous') => boolean;
}

/**
 * Focus options for component registration
 */
export interface FocusOptions {
  /** Group ID this component belongs to */
  groupId?: string;
  /** Order within the group (lower = first) */
  order?: number;
  /** Whether the component is focusable */
  enabled?: boolean | Signal<boolean>;
  /** Auto-focus on mount */
  autoFocus?: boolean;
}

/**
 * Internal focus entry
 */
interface FocusEntry {
  component: FocusableComponent;
  groupId?: string;
  order: number;
  enabled: WritableSignal<boolean>;
  cleanup?: () => void;
}

/**
 * Focus Manager Implementation
 */
class FocusManagerImpl {
  // Reactive state
  private entries = signal<FocusEntry[]>([]);
  private currentFocusId = signal<string | null>(null);
  private groups = new Map<string, FocusGroup>();
  private focusStack: string[] = [];
  private debugMode = false;

  // Computed focusable list
  public readonly focusableList = computed(() => {
    const allEntries = this.entries();
    const currentGroup = this.getCurrentGroup();

    // Filter enabled and focusable components
    let filtered = allEntries.filter(entry => {
      const enabled = typeof entry.enabled === 'function' ? entry.enabled() : entry.enabled;
      if (!enabled) return false;

      const component = entry.component;
      // Use the unified canReceiveFocus getter from Component
      if (!component.canReceiveFocus) return false;

      return true;
    });

    // Apply group trap if active
    if (currentGroup?.trap) {
      filtered = filtered.filter(e => e.groupId === currentGroup.id);
    }

    // Sort by group priority, then by order
    return filtered.sort((a, b) => {
      const groupA = a.groupId ? this.groups.get(a.groupId) : null;
      const groupB = b.groupId ? this.groups.get(b.groupId) : null;

      const priorityA = groupA?.priority ?? 0;
      const priorityB = groupB?.priority ?? 0;

      if (priorityA !== priorityB) {
        return priorityB - priorityA;
      }

      return a.order - b.order;
    });
  });

  // Current focused component
  public readonly currentFocus = computed(() => {
    const id = this.currentFocusId();
    if (!id) return null;

    const entry = this.entries().find(e => e.component.id === id);
    return entry?.component ?? null;
  });

  constructor() {
    // Enable debug mode from environment
    this.debugMode = typeof process !== 'undefined' && process.env?.['DEBUG_FOCUS'] === 'true';
  }

  /**
   * Register a component for focus management
   */
  register(component: FocusableComponent, options: FocusOptions = {}): () => void {
    // Create reactive enabled signal
    const enabled = typeof options.enabled === 'boolean'
      ? signal(options.enabled)
      : typeof options.enabled === 'function'
        ? options.enabled as WritableSignal<boolean>
        : signal(true);

    const entry: FocusEntry = {
      component,
      groupId: options.groupId,
      order: options.order ?? 0,
      enabled
    };

    // Add to entries
    batch(() => {
      this.entries.update(list => [...list, entry]);
    });

    // Listen to component events
    const onFocused = () => {
      this.currentFocusId.set(component.id);
      if (this.debugMode) {
        console.log(`[FocusManager] Component focused: ${component.id}`);
      }
    };

    const onBlurred = () => {
      if (this.currentFocusId() === component.id) {
        this.currentFocusId.set(null);
      }
      if (this.debugMode) {
        console.log(`[FocusManager] Component blurred: ${component.id}`);
      }
    };

    const onDestroyed = () => {
      this.unregister(entry);
    };

    // Attach listeners
    component.on(ComponentEvents.FOCUSED, onFocused);
    component.on(ComponentEvents.BLURRED, onBlurred);
    component.on(ComponentEvents.DESTROYED, onDestroyed);

    // Cleanup function
    const cleanup = () => {
      component.off(ComponentEvents.FOCUSED, onFocused);
      component.off(ComponentEvents.BLURRED, onBlurred);
      component.off(ComponentEvents.DESTROYED, onDestroyed);
      this.unregister(entry);
    };

    entry.cleanup = cleanup;

    // Auto-focus if requested
    if (options.autoFocus) {
      // Defer to next tick to ensure component is mounted
      setTimeout(() => this.focus(component), 0);
    }

    if (this.debugMode) {
      console.log(`[FocusManager] Registered: ${component.id} (group: ${options.groupId || 'none'}, order: ${options.order ?? 0})`);
    }

    return cleanup;
  }

  /**
   * Unregister a component
   */
  private unregister(entry: FocusEntry): void {
    batch(() => {
      this.entries.update(list => list.filter(e => e !== entry));

      if (this.currentFocusId() === entry.component.id) {
        this.currentFocusId.set(null);
      }
    });

    if (this.debugMode) {
      console.log(`[FocusManager] Unregistered: ${entry.component.id}`);
    }
  }

  /**
   * Register a focus group
   */
  registerGroup(group: FocusGroup): () => void {
    this.groups.set(group.id, group);

    if (this.debugMode) {
      console.log(`[FocusManager] Group registered: ${group.id}`);
    }

    return () => {
      this.groups.delete(group.id);
      if (this.debugMode) {
        console.log(`[FocusManager] Group unregistered: ${group.id}`);
      }
    };
  }

  /**
   * Focus a specific component
   */
  focus(componentOrId: FocusableComponent | string): boolean {
    const id = typeof componentOrId === 'string'
      ? componentOrId
      : componentOrId.id;

    const entry = this.entries().find(e => e.component.id === id);
    if (!entry) return false;

    const enabled = typeof entry.enabled === 'function' ? entry.enabled() : entry.enabled;
    if (!enabled) return false;

    const component = entry.component;
    // Use the unified canReceiveFocus getter from Component
    if (!component.canReceiveFocus) return false;

    // Check if already focused
    if (this.currentFocusId() === id && component.focused) {
      return true;
    }

    // Blur current focused component
    const current = this.currentFocus();
    if (current && current !== component) {
      current.blur();
      current.onBlur?.();
    }

    // Focus new component
    component.focus();
    component.onFocus?.();
    this.currentFocusId.set(id);

    if (this.debugMode) {
      console.log(`[FocusManager] Focused: ${id} (group: ${entry.groupId || 'none'})`);
    }

    return true;
  }

  /**
   * Move focus to next component
   */
  focusNext(): boolean {
    const list = this.focusableList();
    if (list.length === 0) return false;

    const currentId = this.currentFocusId();
    const currentIndex = currentId
      ? list.findIndex(e => e.component.id === currentId)
      : -1;

    let nextIndex = currentIndex + 1;
    const currentGroup = this.getCurrentGroup();

    // Handle custom navigation
    if (currentGroup?.onNavigate) {
      if (currentGroup.onNavigate('next')) {
        return true;
      }
    }

    if (nextIndex >= list.length) {
      if (currentGroup?.circular) {
        nextIndex = 0;
      } else if (!currentGroup?.trap) {
        nextIndex = 0;
      } else {
        return false;
      }
    }

    const nextEntry = list[nextIndex];
    return nextEntry ? this.focus(nextEntry.component) : false;
  }

  /**
   * Move focus to previous component
   */
  focusPrevious(): boolean {
    const list = this.focusableList();
    if (list.length === 0) return false;

    const currentId = this.currentFocusId();
    const currentIndex = currentId
      ? list.findIndex(e => e.component.id === currentId)
      : 0;

    let prevIndex = currentIndex - 1;
    const currentGroup = this.getCurrentGroup();

    // Handle custom navigation
    if (currentGroup?.onNavigate) {
      if (currentGroup.onNavigate('previous')) {
        return true;
      }
    }

    if (prevIndex < 0) {
      if (currentGroup?.circular) {
        prevIndex = list.length - 1;
      } else if (!currentGroup?.trap) {
        prevIndex = list.length - 1;
      } else {
        return false;
      }
    }

    const prevEntry = list[prevIndex];
    return prevEntry ? this.focus(prevEntry.component) : false;
  }

  /**
   * Focus first component in a group
   */
  focusGroup(groupId: string): boolean {
    const list = this.focusableList().filter(e => e.groupId === groupId);
    if (list.length === 0) return false;

    const first = list[0];
    return first ? this.focus(first.component) : false;
  }

  /**
   * Push focus context (for modal-like behavior)
   */
  pushContext(groupId: string): void {
    const current = this.currentFocusId();
    if (current) {
      this.focusStack.push(current);
    }
    this.focusGroup(groupId);

    if (this.debugMode) {
      console.log(`[FocusManager] Pushed context: ${groupId} (stack depth: ${this.focusStack.length})`);
    }
  }

  /**
   * Pop focus context
   */
  popContext(): boolean {
    const previousId = this.focusStack.pop();
    if (previousId) {
      if (this.debugMode) {
        console.log(`[FocusManager] Popped context to: ${previousId} (stack depth: ${this.focusStack.length})`);
      }
      return this.focus(previousId);
    }
    return false;
  }

  /**
   * Clear all focus
   */
  clear(): void {
    const current = this.currentFocus();
    if (current) {
      current.blur();
      current.onBlur?.();
    }
    this.currentFocusId.set(null);

    if (this.debugMode) {
      console.log('[FocusManager] Cleared all focus');
    }
  }

  /**
   * Handle keyboard navigation
   */
  handleKey(key: ParsedKey): boolean {
    // Tab navigation
    if (key.name === 'tab') {
      const result = key.shift ? this.focusPrevious() : this.focusNext();
      if (this.debugMode && result) {
        console.log(`[FocusManager] Tab navigation: ${key.shift ? 'previous' : 'next'}`);
      }
      return result;
    }

    // Escape handling
    if (key.name === 'escape') {
      const currentGroup = this.getCurrentGroup();
      if (currentGroup?.trap) {
        const result = this.popContext();
        if (this.debugMode) {
          console.log(`[FocusManager] Escaped from trapped group: ${currentGroup.id}`);
        }
        return result;
      } else {
        this.clear();
        if (this.debugMode) {
          console.log('[FocusManager] Escaped - cleared focus');
        }
        return true;
      }
    }

    return false;
  }

  /**
   * Get current focus group
   */
  private getCurrentGroup(): FocusGroup | null {
    const current = this.currentFocus();
    if (!current) return null;

    const entry = this.entries().find(e => e.component === current);
    if (!entry?.groupId) return null;

    return this.groups.get(entry.groupId) ?? null;
  }

  /**
   * Reset the focus manager
   */
  reset(): void {
    this.clear();
    this.focusStack = [];
    this.groups.clear();
    this.entries.set([]);

    if (this.debugMode) {
      console.log('[FocusManager] Reset complete');
    }
  }
}

// Singleton instance
export const focusManager = new FocusManagerImpl();

// Register for global cleanup
registerCleanup(() => {
  focusManager.reset();
});

/**
 * Hook to register a component with focus management
 * Automatically cleans up on component unmount
 */
export function useFocusable(
  component: FocusableComponent,
  options: FocusOptions = {}
): {
  isFocused: Signal<boolean>;
  focus: () => boolean;
  blur: () => void;
} {
  // Register with focus manager
  const cleanup = focusManager.register(component, options);

  // Set up cleanup on unmount
  onCleanup(cleanup);

  // Create reactive focused state
  const isFocused = computed(() => focusManager.currentFocus() === component);

  return {
    isFocused,
    focus: () => focusManager.focus(component),
    blur: () => component.blur()
  };
}

/**
 * Hook to create and manage a focus group
 */
export function useFocusGroup(config: FocusGroup): {
  focusFirst: () => boolean;
  push: () => void;
  pop: () => boolean;
} {
  const cleanup = focusManager.registerGroup(config);

  onCleanup(cleanup);

  return {
    focusFirst: () => focusManager.focusGroup(config.id),
    push: () => focusManager.pushContext(config.id),
    pop: () => focusManager.popContext()
  };
}

/**
 * Hook to handle keyboard navigation
 */
export function useFocusNavigation(): {
  handleKey: (key: ParsedKey) => boolean;
  focusNext: () => boolean;
  focusPrevious: () => boolean;
} {
  return {
    handleKey: (key: ParsedKey) => focusManager.handleKey(key),
    focusNext: () => focusManager.focusNext(),
    focusPrevious: () => focusManager.focusPrevious()
  };
}

/**
 * Focus control shortcuts
 */
export const focus = {
  next: () => focusManager.focusNext(),
  previous: () => focusManager.focusPrevious(),
  clear: () => focusManager.clear(),
  group: (id: string) => focusManager.focusGroup(id),
  push: (groupId: string) => focusManager.pushContext(groupId),
  pop: () => focusManager.popContext(),
  current: () => focusManager.currentFocus(),
  set: (componentOrId: FocusableComponent | string) => focusManager.focus(componentOrId),
  list: () => focusManager.focusableList(),
  reset: () => focusManager.reset()
};