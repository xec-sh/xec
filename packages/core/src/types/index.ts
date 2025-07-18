/**
 * Consolidated type exports for @xec-js/core
 * 
 * This file provides a single entry point for all core types,
 * ensuring consistency and preventing circular dependencies.
 */

// Base types - fundamental types used throughout the system
export * from './base-types.js';

// Task types - all task-related definitions
export * from './task-types.js';

// Recipe types - recipe system definitions
export * from './recipe-types.js';

// Module types - module system definitions
export * from './module-types.js';

// Pattern types - pattern definitions
export * from './pattern-types.js';

// Environment types - environment-specific definitions
export * from './environment-types.js';

// Re-export specific types to resolve conflicts
export type {
  SetupHook,
  XecModule,
  TeardownHook,
  HelperFunction
} from './module-types.js';