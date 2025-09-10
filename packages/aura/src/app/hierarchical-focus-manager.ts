/**
 * Hierarchical Focus Management System
 * Supports multi-level focus where multiple components can be focused simultaneously
 * at different hierarchical levels (e.g., container and its child)
 */

import { batch, signal, computed, type Signal, type WritableSignal } from 'vibrancy';

import { onCleanup } from './lifecycle.js';
import { registerCleanup } from './lifecycle-manager.js';
import { Component, ComponentEvents } from '../component.js';

import type { ParsedKey } from '../types.js';

/**
 * Focus level defines the hierarchical level of a component
 */
export enum FocusLevel {
  /** Top-level containers/panels */
  CONTAINER = 0,
  /** Groups within containers */
  GROUP = 1,
  /** Individual interactive components */
  COMPONENT = 2,
  /** Sub-components or details within components */
  DETAIL = 3
}

/**
 * Navigation key configuration for a scope
 */
export interface NavigationKeys {
  /** Key to move to next item (default: 'tab') */
  next?: string | string[];
  /** Key to move to previous item (default: 'shift+tab') */
  previous?: string | string[];
  /** Key to enter a scope (default: 'enter') */
  enter?: string | string[];
  /** Key to exit a scope (default: 'escape') */
  exit?: string | string[];
  /** Custom navigation handler */
  custom?: (key: ParsedKey) => boolean;
}

/**
 * Focus scope configuration
 */
export interface FocusScope {
  /** Unique identifier for the scope */
  id: string;
  /** Hierarchical level of this scope */
  level: FocusLevel;
  /** Parent scope ID (null for root) */
  parentId?: string | null;
  /** Navigation keys for this scope */
  navigationKeys?: NavigationKeys;
  /** If true, focus cannot leave this scope using standard navigation */
  trap?: boolean;
  /** If true, navigation wraps around */
  circular?: boolean;
  /** If true, this scope can have focus simultaneously with its children */
  allowSimultaneousFocus?: boolean;
  /** Priority for navigation (higher = first) */
  priority?: number;
  /** Custom enter handler */
  onEnter?: () => void;
  /** Custom exit handler */
  onExit?: () => void;
}

/**
 * Component focus registration options
 */
export interface HierarchicalFocusOptions {
  /** Scope ID this component belongs to */
  scopeId?: string;
  /** Focus level of this component */
  level?: FocusLevel;
  /** Order within the scope (lower = first) */
  order?: number;
  /** Whether the component is focusable */
  enabled?: boolean | Signal<boolean>;
  /** Auto-focus on mount */
  autoFocus?: boolean;
  /** If true, keeps parent containers focused when this is focused */
  maintainParentFocus?: boolean;
}

/**
 * Focus entry in the hierarchical system
 */
interface FocusEntry {
  component: Component;
  scopeId?: string;
  level: FocusLevel;
  order: number;
  enabled: WritableSignal<boolean>;
  maintainParentFocus: boolean;
  cleanup?: () => void;
}

/**
 * Focus state at a specific level
 */
interface LevelFocusState {
  componentId: string | null;
  scopeId: string | null;
}

/**
 * Hierarchical Focus Manager Implementation
 */
class HierarchicalFocusManagerImpl {
  // Scopes registry
  private scopes = new Map<string, FocusScope>();

  // Components registry
  private entries = signal<FocusEntry[]>([]);

  // Multi-level focus state - tracks focused component at each level
  private focusState = new Map<FocusLevel, WritableSignal<LevelFocusState>>();

  // Active scope stack for navigation context
  private activeScopeStack: string[] = [];

  // Debug mode
  private debugMode = false;

  constructor() {
    // Initialize focus state for each level
    for (const level of Object.values(FocusLevel)) {
      if (typeof level === 'number') {
        this.focusState.set(level, signal<LevelFocusState>({
          componentId: null,
          scopeId: null
        }));
      }
    }

    this.debugMode = typeof process !== 'undefined' && process.env?.['DEBUG_FOCUS'] === 'true';
  }

  /**
   * Register a focus scope
   */
  registerScope(scope: FocusScope): () => void {
    this.scopes.set(scope.id, scope);

    if (this.debugMode) {
      console.log(`[HierarchicalFocus] Scope registered: ${scope.id} (level: ${FocusLevel[scope.level]})`);
    }

    return () => {
      this.scopes.delete(scope.id);
      // Remove from active stack if present
      this.activeScopeStack = this.activeScopeStack.filter(id => id !== scope.id);

      if (this.debugMode) {
        console.log(`[HierarchicalFocus] Scope unregistered: ${scope.id}`);
      }
    };
  }

  /**
   * Register a component for hierarchical focus management
   */
  register(component: Component, options: HierarchicalFocusOptions = {}): () => void {
    const enabled = typeof options.enabled === 'boolean'
      ? signal(options.enabled)
      : typeof options.enabled === 'function'
        ? options.enabled as WritableSignal<boolean>
        : signal(true);

    const entry: FocusEntry = {
      component,
      scopeId: options.scopeId,
      level: options.level ?? FocusLevel.COMPONENT,
      order: options.order ?? 0,
      enabled,
      maintainParentFocus: options.maintainParentFocus ?? false
    };

    // Add to entries
    batch(() => {
      this.entries.update(list => [...list, entry]);
    });

    // Listen to component focus events
    const onFocused = () => {
      this.handleComponentFocus(entry);
    };

    const onBlurred = () => {
      this.handleComponentBlur(entry);
    };

    const onDestroyed = () => {
      this.unregister(entry);
    };

    component.on(ComponentEvents.FOCUSED, onFocused);
    component.on(ComponentEvents.BLURRED, onBlurred);
    component.on(ComponentEvents.DESTROYED, onDestroyed);

    const cleanup = () => {
      component.off(ComponentEvents.FOCUSED, onFocused);
      component.off(ComponentEvents.BLURRED, onBlurred);
      component.off(ComponentEvents.DESTROYED, onDestroyed);
      this.unregister(entry);
    };

    entry.cleanup = cleanup;

    // Auto-focus if requested
    if (options.autoFocus) {
      setTimeout(() => this.focus(component, entry.level), 0);
    }

    if (this.debugMode) {
      console.log(`[HierarchicalFocus] Registered: ${component.id} (scope: ${options.scopeId}, level: ${FocusLevel[entry.level]})`);
    }

    return cleanup;
  }

  /**
   * Unregister a component
   */
  private unregister(entry: FocusEntry): void {
    batch(() => {
      this.entries.update(list => list.filter(e => e !== entry));

      // Clear focus state if this component was focused
      const levelState = this.focusState.get(entry.level);
      if (levelState && levelState().componentId === entry.component.id) {
        levelState.set({ componentId: null, scopeId: null });
      }
    });

    if (this.debugMode) {
      console.log(`[HierarchicalFocus] Unregistered: ${entry.component.id}`);
    }
  }

  /**
   * Handle component receiving focus
   */
  private handleComponentFocus(entry: FocusEntry): void {
    const levelState = this.focusState.get(entry.level);
    if (!levelState) return;

    batch(() => {
      // Update focus state for this level
      levelState.set({
        componentId: entry.component.id,
        scopeId: entry.scopeId ?? null
      });

      // Handle parent focus maintenance
      if (entry.maintainParentFocus && entry.scopeId) {
        this.maintainParentScopeFocus(entry.scopeId, entry.level);
      }

      // Update active scope stack
      if (entry.scopeId && !this.activeScopeStack.includes(entry.scopeId)) {
        this.activeScopeStack.push(entry.scopeId);
      }
    });

    if (this.debugMode) {
      console.log(`[HierarchicalFocus] Component focused: ${entry.component.id} at level ${FocusLevel[entry.level]}`);
    }
  }

  /**
   * Handle component losing focus
   */
  private handleComponentBlur(entry: FocusEntry): void {
    const levelState = this.focusState.get(entry.level);
    if (!levelState) return;

    const state = levelState();
    if (state.componentId === entry.component.id) {
      levelState.set({ componentId: null, scopeId: null });

      // CASCADE: Blur all child components in the same scope at deeper levels
      // This ensures that when a container loses focus, its children do too
      if (entry.scopeId) {
        this.blurChildrenInScope(entry.scopeId, entry.level);
      }

      if (this.debugMode) {
        console.log(`[HierarchicalFocus] Component blurred: ${entry.component.id} at level ${FocusLevel[entry.level]}`);
      }
    }
  }

  /**
   * Blur all child components in a scope when parent loses focus
   */
  private blurChildrenInScope(scopeId: string, parentLevel: FocusLevel): void {
    // Find all components in the same scope at deeper levels
    const childEntries = this.entries().filter(e =>
      e.scopeId === scopeId &&
      e.level > parentLevel &&
      e.component.focused
    );

    // Blur each child component
    for (const child of childEntries) {
      if (child.component.focused) {
        child.component.blur();

        // Also clear the focus state for this level
        const childLevelState = this.focusState.get(child.level);
        if (childLevelState && childLevelState().componentId === child.component.id) {
          childLevelState.set({ componentId: null, scopeId: null });
        }

        if (this.debugMode) {
          console.log(`[HierarchicalFocus] Cascading blur to child: ${child.component.id} at level ${FocusLevel[child.level]}`);
        }
      }
    }
  }

  /**
   * Maintain parent scope focus when child is focused
   */
  private maintainParentScopeFocus(scopeId: string, childLevel: FocusLevel): void {
    const scope = this.scopes.get(scopeId);
    if (!scope || !scope.parentId) return;

    const parentScope = this.scopes.get(scope.parentId);
    if (!parentScope || !parentScope.allowSimultaneousFocus) return;

    // Find and focus a component in the parent scope at the parent level
    const parentEntries = this.entries().filter(e =>
      e.scopeId === parentScope.id &&
      e.level < childLevel &&
      e.component.canReceiveFocus
    );

    if (parentEntries.length > 0) {
      // Keep the first focusable parent focused
      const parentEntry = parentEntries[0];
      if (!parentEntry.component.focused) {
        parentEntry.component.focus();
      }
    }
  }

  /**
   * Focus a specific component at a specific level
   */
  focus(component: Component | string, level?: FocusLevel): boolean {
    const id = typeof component === 'string' ? component : component.id;
    const entry = this.entries().find(e => e.component.id === id);

    if (!entry) return false;

    const enabled = typeof entry.enabled === 'function' ? entry.enabled() : entry.enabled;
    if (!enabled || !entry.component.canReceiveFocus) return false;

    const targetLevel = level ?? entry.level;
    const levelState = this.focusState.get(targetLevel);
    if (!levelState) return false;

    // Check if already focused at this level
    if (levelState().componentId === id && entry.component.focused) {
      return true;
    }

    // Handle blur at the same level
    const currentAtLevel = this.entries().find(e =>
      e.component.id === levelState().componentId
    );

    if (currentAtLevel && currentAtLevel.component !== entry.component) {
      // Check if we're switching between different scopes at the same level
      const switchingScopes = currentAtLevel.scopeId !== entry.scopeId;

      if (this.debugMode && switchingScopes) {
        console.log(`[HierarchicalFocus] Switching from scope ${currentAtLevel.scopeId} to ${entry.scopeId}`);
      }

      // Only blur if not maintaining simultaneous focus
      const scope = entry.scopeId ? this.scopes.get(entry.scopeId) : null;
      if (!scope?.allowSimultaneousFocus || currentAtLevel.level === entry.level) {
        currentAtLevel.component.blur();
      }
    }

    // Focus the new component
    entry.component.focus();

    if (this.debugMode) {
      console.log(`[HierarchicalFocus] Focused: ${id} at level ${FocusLevel[targetLevel]} (scope: ${entry.scopeId})`);
    }

    return true;
  }

  /**
   * Navigate within current scope
   */
  navigate(direction: 'next' | 'previous'): boolean {
    const currentScope = this.getCurrentScope();
    if (!currentScope) return this.navigateGlobal(direction);

    const scopeEntries = this.getScopeEntries(currentScope.id);
    if (scopeEntries.length === 0) return false;

    const currentFocus = this.getCurrentFocusAtLevel(currentScope.level);
    const currentIndex = currentFocus
      ? scopeEntries.findIndex(e => e.component.id === currentFocus.componentId)
      : -1;

    let nextIndex: number;
    if (direction === 'next') {
      nextIndex = currentIndex + 1;
      if (nextIndex >= scopeEntries.length) {
        nextIndex = currentScope.circular ? 0 : scopeEntries.length - 1;
      }
    } else {
      nextIndex = currentIndex - 1;
      if (nextIndex < 0) {
        nextIndex = currentScope.circular ? scopeEntries.length - 1 : 0;
      }
    }

    const nextEntry = scopeEntries[nextIndex];
    return nextEntry ? this.focus(nextEntry.component, nextEntry.level) : false;
  }

  /**
   * Navigate globally (fallback)
   */
  private navigateGlobal(direction: 'next' | 'previous'): boolean {
    const allFocusable = this.entries().filter(e => {
      const enabled = typeof e.enabled === 'function' ? e.enabled() : e.enabled;
      return enabled && e.component.canReceiveFocus;
    }).sort((a, b) => {
      if (a.level !== b.level) return a.level - b.level;
      return a.order - b.order;
    });

    if (allFocusable.length === 0) return false;

    // Find any currently focused component
    let currentIndex = -1;
    for (let i = 0; i < allFocusable.length; i++) {
      if (allFocusable[i].component.focused) {
        currentIndex = i;
        break;
      }
    }

    const nextIndex = direction === 'next'
      ? (currentIndex + 1) % allFocusable.length
      : (currentIndex - 1 + allFocusable.length) % allFocusable.length;

    const nextEntry = allFocusable[nextIndex];
    return nextEntry ? this.focus(nextEntry.component, nextEntry.level) : false;
  }

  /**
   * Enter a scope (focus first item in scope)
   */
  enterScope(scopeId: string): boolean {
    const scope = this.scopes.get(scopeId);
    if (!scope) return false;

    // Add to active scope stack
    if (!this.activeScopeStack.includes(scopeId)) {
      this.activeScopeStack.push(scopeId);
    }

    // Call enter handler
    scope.onEnter?.();

    // Focus first item in scope
    const scopeEntries = this.getScopeEntries(scopeId);
    if (scopeEntries.length > 0) {
      return this.focus(scopeEntries[0].component, scopeEntries[0].level);
    }

    return true;
  }

  /**
   * Exit current scope
   */
  exitScope(): boolean {
    if (this.activeScopeStack.length === 0) return false;

    const currentScopeId = this.activeScopeStack.pop();
    if (!currentScopeId) return false;

    const scope = this.scopes.get(currentScopeId);
    scope?.onExit?.();

    // If there's a parent scope, focus something in it
    if (this.activeScopeStack.length > 0) {
      const parentScopeId = this.activeScopeStack[this.activeScopeStack.length - 1];
      const parentEntries = this.getScopeEntries(parentScopeId);
      if (parentEntries.length > 0) {
        return this.focus(parentEntries[0].component, parentEntries[0].level);
      }
    }

    return true;
  }

  /**
   * Handle keyboard input
   */
  handleKey(key: ParsedKey): boolean {
    const currentScope = this.getCurrentScope();

    // Check for custom navigation handler
    if (currentScope?.navigationKeys?.custom) {
      if (currentScope.navigationKeys.custom(key)) {
        return true;
      }
    }

    // Get navigation keys for current scope or use defaults
    const navKeys = currentScope?.navigationKeys || {};

    // Check for navigation keys
    if (this.matchKey(key, navKeys.next || 'tab')) {
      return this.navigate('next');
    }

    if (this.matchKey(key, navKeys.previous || ['shift+tab'])) {
      return this.navigate('previous');
    }

    if (this.matchKey(key, navKeys.enter || 'enter')) {
      // Find a child scope to enter
      const currentFocus = this.getCurrentFocusAtLevel(currentScope?.level ?? FocusLevel.COMPONENT);
      if (currentFocus) {
        const childScopes = Array.from(this.scopes.values()).filter(s =>
          s.parentId === currentScope?.id
        );
        if (childScopes.length > 0) {
          return this.enterScope(childScopes[0].id);
        }
      }
    }

    if (this.matchKey(key, navKeys.exit || 'escape')) {
      return this.exitScope();
    }

    // Default tab navigation as fallback
    if (key.name === 'tab' && !currentScope) {
      return this.navigate(key.shift ? 'previous' : 'next');
    }

    return false;
  }

  /**
   * Match a key against key patterns
   */
  private matchKey(key: ParsedKey, patterns: string | string[]): boolean {
    const patternList = Array.isArray(patterns) ? patterns : [patterns];

    for (const pattern of patternList) {
      if (pattern.includes('+')) {
        // Handle modifier keys
        const parts = pattern.split('+');
        const keyName = parts[parts.length - 1];
        const hasShift = parts.includes('shift');
        const hasCtrl = parts.includes('ctrl') || parts.includes('control');
        const hasOption = parts.includes('alt') || parts.includes('option');
        const hasMeta = parts.includes('meta') || parts.includes('cmd');

        if (key.name === keyName &&
          key.shift === hasShift &&
          key.ctrl === hasCtrl &&
          key.option === hasOption &&
          key.meta === hasMeta) {
          return true;
        }
      } else {
        // Simple key match
        if (key.name === pattern) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Get current active scope
   */
  private getCurrentScope(): FocusScope | null {
    if (this.activeScopeStack.length === 0) return null;
    const scopeId = this.activeScopeStack[this.activeScopeStack.length - 1];
    return this.scopes.get(scopeId) ?? null;
  }

  /**
   * Get entries in a scope
   */
  private getScopeEntries(scopeId: string): FocusEntry[] {
    return this.entries()
      .filter(e => {
        const enabled = typeof e.enabled === 'function' ? e.enabled() : e.enabled;
        return e.scopeId === scopeId && enabled && e.component.canReceiveFocus;
      })
      .sort((a, b) => a.order - b.order);
  }

  /**
   * Get current focus at a specific level
   */
  private getCurrentFocusAtLevel(level: FocusLevel): LevelFocusState | null {
    const levelState = this.focusState.get(level);
    return levelState ? levelState() : null;
  }

  /**
   * Get all currently focused components
   */
  getAllFocused(): Map<FocusLevel, Component | null> {
    const result = new Map<FocusLevel, Component | null>();

    for (const [level, state] of this.focusState.entries()) {
      const { componentId } = state();
      if (componentId) {
        const entry = this.entries().find(e => e.component.id === componentId);
        result.set(level, entry?.component ?? null);
      } else {
        result.set(level, null);
      }
    }

    return result;
  }

  /**
   * Clear all focus at a specific level
   */
  clearLevel(level: FocusLevel): void {
    const levelState = this.focusState.get(level);
    if (!levelState) return;

    const { componentId } = levelState();
    if (componentId) {
      const entry = this.entries().find(e => e.component.id === componentId);
      entry?.component.blur();
    }

    levelState.set({ componentId: null, scopeId: null });
  }

  /**
   * Clear all focus
   */
  clearAll(): void {
    for (const level of Object.values(FocusLevel)) {
      if (typeof level === 'number') {
        this.clearLevel(level);
      }
    }
    this.activeScopeStack = [];
  }

  /**
   * Check if a specific scope has focus
   */
  isFocused(scopeId: string): boolean {
    // Check if any component in this scope is focused at any level
    for (const state of this.focusState.values()) {
      const { componentId, scopeId: focusedScopeId } = state();
      if (focusedScopeId === scopeId && componentId !== null) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a specific component is focused
   */
  isComponentFocused(componentId: string): boolean {
    for (const state of this.focusState.values()) {
      if (state().componentId === componentId) {
        return true;
      }
    }
    return false;
  }

  /**
   * Check if a scope is active (in the active stack)
   */
  isScopeActive(scopeId: string): boolean {
    return this.activeScopeStack.includes(scopeId);
  }

  /**
   * Get the focused component in a specific scope
   */
  getFocusedInScope(scopeId: string): Component | null {
    for (const state of this.focusState.values()) {
      const { componentId, scopeId: focusedScopeId } = state();
      if (focusedScopeId === scopeId && componentId !== null) {
        const entry = this.entries().find(e => e.component.id === componentId);
        return entry?.component ?? null;
      }
    }
    return null;
  }

  /**
   * Get current focus state across all levels
   */
  getCurrentFocusState(): Map<FocusLevel, { component: Component | null; scope: FocusScope | null }> {
    const result = new Map<FocusLevel, { component: Component | null; scope: FocusScope | null }>();

    for (const [level, state] of this.focusState.entries()) {
      const { componentId, scopeId } = state();
      let component: Component | null = null;
      let scope: FocusScope | null = null;

      if (componentId) {
        const entry = this.entries().find(e => e.component.id === componentId);
        component = entry?.component ?? null;
      }

      if (scopeId) {
        scope = this.scopes.get(scopeId) ?? null;
      }

      result.set(level, { component, scope });
    }

    return result;
  }

  /**
   * Get focus state for a specific scope
   */
  getScopeFocusState(scopeId: string): {
    hasFocus: boolean;
    focusedComponents: Array<{ component: Component; level: FocusLevel }>;
    isActive: boolean;
    childScopes: FocusScope[];
  } {
    const focusedComponents: Array<{ component: Component; level: FocusLevel }> = [];

    // Find all focused components in this scope
    for (const [level, state] of this.focusState.entries()) {
      const { componentId, scopeId: focusedScopeId } = state();
      if (focusedScopeId === scopeId && componentId !== null) {
        const entry = this.entries().find(e => e.component.id === componentId);
        if (entry) {
          focusedComponents.push({ component: entry.component, level });
        }
      }
    }

    // Find child scopes
    const childScopes = Array.from(this.scopes.values()).filter(s => s.parentId === scopeId);

    return {
      hasFocus: focusedComponents.length > 0,
      focusedComponents,
      isActive: this.isScopeActive(scopeId),
      childScopes
    };
  }

  /**
   * Get the active scope at a specific level
   */
  getActiveScopeAtLevel(level: FocusLevel): FocusScope | null {
    const state = this.focusState.get(level);
    if (!state) return null;

    const { scopeId } = state();
    return scopeId ? this.scopes.get(scopeId) ?? null : null;
  }

  /**
   * Get the focused component at a specific level
   */
  getFocusedAtLevel(level: FocusLevel): Component | null {
    const state = this.focusState.get(level);
    if (!state) return null;

    const { componentId } = state();
    if (!componentId) return null;

    const entry = this.entries().find(e => e.component.id === componentId);
    return entry?.component ?? null;
  }

  /**
   * Reset the manager
   */
  reset(): void {
    this.clearAll();
    this.scopes.clear();
    this.entries.set([]);
    this.activeScopeStack = [];

    if (this.debugMode) {
      console.log('[HierarchicalFocus] Reset complete');
    }
  }
}

// Singleton instance
export const hierarchicalFocusManager = new HierarchicalFocusManagerImpl();

// Register for global cleanup
registerCleanup(() => {
  hierarchicalFocusManager.reset();
});

/**
 * Hook to register a component with hierarchical focus
 */
export function useHierarchicalFocus(
  component: Component,
  options: HierarchicalFocusOptions = {}
): {
  isFocused: Signal<boolean>;
  focus: () => boolean;
  blur: () => void;
  focusedAtLevel: (level: FocusLevel) => Signal<boolean>;
} {
  const cleanup = hierarchicalFocusManager.register(component, options);

  onCleanup(cleanup);

  // Create computed signals for focus state
  const isFocused = computed(() => component.focused);

  const focusedAtLevel = (level: FocusLevel) => computed(() => {
    const allFocused = hierarchicalFocusManager.getAllFocused();
    return allFocused.get(level) === component;
  });

  return {
    isFocused,
    focus: () => hierarchicalFocusManager.focus(component, options.level),
    blur: () => component.blur(),
    focusedAtLevel
  };
}

/**
 * Hook to create and manage a focus scope
 */
export function useFocusScope(config: FocusScope): {
  enter: () => boolean;
  exit: () => boolean;
  isActive: Signal<boolean>;
  hasFocus: Signal<boolean>;
  getFocused: () => Component | null;
} {
  const cleanup = hierarchicalFocusManager.registerScope(config);

  onCleanup(cleanup);

  const isActive = computed(() => hierarchicalFocusManager.isScopeActive(config.id));
  const hasFocus = computed(() => hierarchicalFocusManager.isFocused(config.id));

  return {
    enter: () => hierarchicalFocusManager.enterScope(config.id),
    exit: () => hierarchicalFocusManager.exitScope(),
    isActive,
    hasFocus,
    getFocused: () => hierarchicalFocusManager.getFocusedInScope(config.id)
  };
}

/**
 * Hook to track focus state for a specific scope reactively
 */
export function useScopeFocusState(scopeId: string): {
  hasFocus: Signal<boolean>;
  isActive: Signal<boolean>;
  focusedComponent: Signal<Component | null>;
} {
  const hasFocus = computed(() => hierarchicalFocusManager.isFocused(scopeId));
  const isActive = computed(() => hierarchicalFocusManager.isScopeActive(scopeId));
  const focusedComponent = computed(() => hierarchicalFocusManager.getFocusedInScope(scopeId));

  return {
    hasFocus,
    isActive,
    focusedComponent
  };
}

/**
 * Hook to track focus state at a specific level
 */
export function useLevelFocusState(level: FocusLevel): {
  focusedComponent: Signal<Component | null>;
  activeScope: Signal<FocusScope | null>;
} {
  const focusedComponent = computed(() => hierarchicalFocusManager.getFocusedAtLevel(level));
  const activeScope = computed(() => hierarchicalFocusManager.getActiveScopeAtLevel(level));

  return {
    focusedComponent,
    activeScope
  };
}

/**
 * Shortcut functions for hierarchical focus
 */
export const hFocus = {
  // Navigation
  navigate: (direction: 'next' | 'previous') => hierarchicalFocusManager.navigate(direction),
  enterScope: (scopeId: string) => hierarchicalFocusManager.enterScope(scopeId),
  exitScope: () => hierarchicalFocusManager.exitScope(),

  // Focus state queries
  isFocused: (scopeId: string) => hierarchicalFocusManager.isFocused(scopeId),
  isComponentFocused: (componentId: string) => hierarchicalFocusManager.isComponentFocused(componentId),
  isScopeActive: (scopeId: string) => hierarchicalFocusManager.isScopeActive(scopeId),
  getFocusedInScope: (scopeId: string) => hierarchicalFocusManager.getFocusedInScope(scopeId),
  getCurrentFocusState: () => hierarchicalFocusManager.getCurrentFocusState(),
  getScopeFocusState: (scopeId: string) => hierarchicalFocusManager.getScopeFocusState(scopeId),
  getActiveScopeAtLevel: (level: FocusLevel) => hierarchicalFocusManager.getActiveScopeAtLevel(level),
  getFocusedAtLevel: (level: FocusLevel) => hierarchicalFocusManager.getFocusedAtLevel(level),

  // Focus management
  focus: (component: Component | string, level?: FocusLevel) => hierarchicalFocusManager.focus(component, level),
  clearLevel: (level: FocusLevel) => hierarchicalFocusManager.clearLevel(level),
  clearAll: () => hierarchicalFocusManager.clearAll(),
  getAllFocused: () => hierarchicalFocusManager.getAllFocused(),

  // Input handling
  handleKey: (key: ParsedKey) => hierarchicalFocusManager.handleKey(key),

  // System
  reset: () => hierarchicalFocusManager.reset()
};