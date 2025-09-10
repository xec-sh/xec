/**
 * Aura Application Layer
 * Provides reactive components with composition support
 * 
 * Refactored with:
 * - Full type safety (no any types)
 * - Component registry for extensibility
 * - Improved reactive control flow
 * - Better context management
 * - Proper cleanup and lifecycle handling
 */

// Core component factory and helpers
export * from './aura.js';

// Hooks and state management
export * from './hooks.js';

// Context system for dependency injection
export * from './context.js';

// Lifecycle management
export * from './lifecycle.js';

// Application class
export * from './application.js';

// Control flow utilities
export * from './control-flow.js';

// Reactive system bridge
export * from './reactive-bridge.js';

// Global lifecycle manager for graceful shutdown
export * from './lifecycle-manager.js';

// Screen dimensions reactive utilities
export * from './screen-dimensions.js';

// Component registry for extensibility (class implementation)
export * from './component-registry.js';

// Hierarchical focus management system
export * from './hierarchical-focus-manager.js';

// Type definitions and guards (excluding ComponentRegistry interface to avoid conflict)
export {
  type Context,
  isAuraElement,
  type AuraElement,
  type ShowOptions,
  type ExtractProps,
  type ComponentType,
  type ReactiveProps,
  type SwitchOptions,
  type EffectCleanup,
  type ComponentProps,
  type AnyAuraElement,
  type ForEachOptions,
  type EffectCallback,
  type ExtractInstance,
  type ComponentPropsMap,
  type ComponentInstance,
  type ComponentInstanceMap
} from './types.js';