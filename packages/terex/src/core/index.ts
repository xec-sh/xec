/**
 * Core terminal control exports
 * Low-level terminal manipulation utilities
 */

// Re-export all types
export * from './types.js';
// Terminal control modules
export { CursorController, createCursorController } from './cursor.js';
export { ColorSystem, StyleBuilder, createColorSystem } from './color.js';

// Rendering system
export {
  RenderScheduler,
  createRenderScheduler,
} from './renderer-scheduler.js';

export {
  Screen,
  type ClearMode,
  type BufferType,
  ScreenController
} from './screen.js';

// Component system
export {
  BaseComponent,
  createComponentClass,
  type ComponentEventMap
} from './component.js';

// Layer management system (z-index)
export {
  type Layer,
  LayerManager,
  type LayerType,
  type LayerManagerOptions
} from './layer-manager.js';

// Enhanced terminal management
export {
  TerminalManager,
  createTerminalManager,
  type TerminalManagerOptions,
  createDefaultTerminalManager
} from './terminal-manager.js';

export {
  InputManager,
  type InputState,
  createInputManager,
  type KeypressEvent,
  type InputManagerOptions,
  createDefaultInputManager
} from './input-manager.js';

// Unified render engine
export {
  RenderEngine,
  type RenderMode,
  type RenderStats,
  createRenderEngine,
  type RenderEngineOptions,
  createCustomRenderEngine,
  createDefaultRenderEngine
} from './render-engine.js';

// Reactive state management
export {
  useState,
  reactive,
  isReactive,
  useComputed,
  ReactiveState,
  createReactiveState,
  type StateChangeListener,
  type ReactiveStateOptions,
  createReactiveComponentState
} from './reactive-state.js';

// Event system
export {
  EventBus,
  createEventBus,
  MouseEventParser,
  TypedEventEmitter,
  createMouseParser,
  createEventEmitter,
  KeyboardEventParser,
  type TerminalEvents,
  createKeyboardParser,
  type ComponentEvents
} from './events.js';

// Enhanced event system
export {
  type KeyEvent,
  createKeyEvent,
  EventDispatcher,
  type TerexEvent,
  addEventHandling,
  createMouseEvent,
  type EventOptions,
  type EventHandler,
  type EventListener,
  type ComponentEvent,
  createComponentEvent,
  type MouseEventTerex,
  globalEventDispatcher,
  type EventTargetMixin
} from './event-system.js';

// Re-export specific types for convenience
export type {
  RGB,
  HSL,
  Key,
  Color,
  Style,
  Theme,
  Pixel,
  Layout,
  Output,
  Change,
  Padding,
  Branded,
  Position,
  Rectangle,
  ColorMode,
  AnsiColor,
  Component,
  MouseEvent,
  Typography,
  Percentage,
  TestHarness,
  DeepPartial,
  TerminalSize,
  StateManager,
  EventEmitter,
  ColorPalette,
  BorderStyles,
  MockTerminal,
  DeepReadonly,
  Milliseconds,
  RenderContext,
  StateListener,
  TerminalStream,
  ComponentConfig,
  ComponentLifecycle,
  ComponentEventHandlers
} from './types.js';