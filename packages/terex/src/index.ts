/**
 * Terex - Terminal Experience Framework
 * A modern, minimalist terminal UI framework with fractal architecture
 * 
 * @packageDocumentation
 */

// Type-safe version of tx with automatic type inference
import tx from './instant.js';

export { tx };
// Core terminal control
export * from './core/index.js';

// Performance utilities
export * from './utils/index.js';

// Test utilities (available for users to test their components)
export * as test from './test/index.js';

export * from './components/input/index.js';

export * from './components/complex/index.js';
export * from './components/advanced/index.js';
// Components
export * from './components/primitives/index.js';
export * from './components/containers/index.js';
export type {
  FormSchema,
  FormResult,
  TxInterface,
  TextBuilder,
  BuilderState,
  NumberBuilder,
  SelectBuilder,
  ConfirmBuilder
} from './instant.js';
