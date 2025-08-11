/**
 * @trm/core - Terminal Manipulation Library
 * 
 * A comprehensive, type-safe, low-level terminal manipulation library
 * for Node.js, Deno, and Bun environments.
 */

// ============================================================================
// Core Exports
// ============================================================================

// Import for internal use
import { isTTY as checkTTY } from './core/platform.js';

// Re-export all advanced modules
export * from './advanced/index.js';

export { InputImpl } from './core/input.js';
export { ScreenImpl } from './core/screen.js';
export { CursorImpl } from './core/cursor.js';
export { StylesImpl } from './core/styles.js';
export { ansi, ANSISequences } from './core/ansi.js';
export { colors, ColorSystem } from './core/color.js';
// Main terminal factory
export { TerminalImpl, createTerminal } from './core/terminal.js';
export { ScreenBufferImpl, BufferManagerImpl } from './core/buffer.js';
export { EventEmitterImpl, TypedEventEmitter } from './core/events.js';

// Core components
export { BunTerminalStream, NodeTerminalStream, DenoTerminalStream, createTerminalStream } from './core/stream.js';

// ============================================================================
// Type Exports
// ============================================================================

// Export enums and classes as values
export {
  x,
  y,
  // Helper functions for branded types
  rows,
  cols,
  ErrorCode,
  
  // Enums
  ColorDepth,
  
  CursorShape,
  MouseButton,
  MouseAction,
  // Classes
  TerminalError
} from './types.js';

// Platform utilities
export {
  isWSL,
  isSSH,
  isTTY,
  getEnv,
  hrtime,
  detectOS,
  getShell,
  setTimeout,
  getPlatform,
  setInterval,
  initPlatform,
  clearTimeout,
  detectRuntime,
  clearInterval,
  getTerminalType,
  getTerminalSize,
  getColorSupport
} from './core/platform.js';

// ============================================================================
// Advanced Modules Export
// ============================================================================

// Re-export all types
export type {
  X,
  Y,
  OS,
  // Branded types
  Rows,
  
  Cols,
  // Buffer types
  Cell,
  ANSI,
  Color,
  // Style types
  Style,
  
  Input,
  Screen,
  Cursor,
  Colors,
  Styles,
  // Platform types
  Runtime,
  
  Platform,
  RGBColor,
  
  HSLColor,
  
  // Input types
  KeyEvent,
  Terminal,
  AnsiColor,
  Disposable,
  MouseEvent,
  FocusEvent,
  
  PasteEvent,
  InputEvent,
  ResizeEvent,
  
  BufferPatch,
  Ansi256Color,
  StyleBuilder,
  ScreenBuffer,
  EventEmitter,
  // Mock terminal
  MockTerminal,
  // Color types
  AnsiColorName,
  BufferManager,
  TerminalState,
  BufferEncoding,
  
  // Cursor types
  CursorPosition,
  // Core interfaces
  TerminalStream,
  TerminalEvents,
  
  // Terminal types
  TerminalOptions,
  
  // Factory types
  TerminalFactory,
  MockTerminalFactory
} from './types.js';

// Named export for advanced namespace
import * as advanced from './advanced/index.js';

export { advanced };

// ============================================================================
// Default Export
// ============================================================================

// Default export is the main factory function
import { createTerminal } from './core/terminal.js';

export default createTerminal;

// ============================================================================
// Convenience Exports
// ============================================================================

/**
 * Quick start function that creates and initializes a terminal
 * 
 * @example
 * ```typescript
 * import { quickStart } from '@trm/core';
 * 
 * const term = await quickStart({
 *   rawMode: true,
 *   alternateBuffer: true
 * });
 * 
 * term.screen.clear();
 * term.screen.writeAt(10, 5, 'Hello, Terminal!');
 * 
 * await term.close();
 * ```
 */
export async function quickStart(options?: import('./types.js').TerminalOptions) {
  const terminal = createTerminal(options);
  await terminal.init();
  return terminal;
}

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Check if the current environment supports terminal operations
 */
export function isTerminalSupported(): boolean {
  return checkTTY();
}