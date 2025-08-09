/**
 * Event system for terminal UI components
 * Provides type-safe event handling with support for bubbling, capturing, and async handlers
 */

import type { Key, MouseEvent, EventEmitter, TerminalSize } from './types.js';

// ============================================================================
// Event Types
// ============================================================================

export interface TerminalEvents {
  keypress: [key: Key];
  mouseEvent: [event: MouseEvent];
  resize: [size: TerminalSize];
  focus: [];
  blur: [];
  data: [data: string];
  error: [error: Error];
}

export interface ComponentEvents extends TerminalEvents {
  mount: [];
  unmount: [];
  stateChange: [state: unknown, oldState: unknown];
  childAdded: [child: unknown];
  childRemoved: [child: unknown];
  render: [];
  // Allow for additional event types
  [key: string]: unknown[];
}

// ============================================================================
// Event Emitter Implementation
// ============================================================================

/**
 * Type-safe event emitter implementation
 * Supports once handlers, async handlers, and proper cleanup
 */
export class TypedEventEmitter<TEvents extends Record<string, unknown[]>> 
  implements EventEmitter<TEvents> {
  
  private handlers = new Map<keyof TEvents, Set<Function>>();
  private onceHandlers = new Map<keyof TEvents, Set<Function>>();
  
  /**
   * Register an event handler
   */
  on<K extends keyof TEvents>(
    event: K, 
    handler: (...args: TEvents[K]) => void
  ): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }
  
  /**
   * Remove an event handler
   */
  off<K extends keyof TEvents>(
    event: K, 
    handler: (...args: TEvents[K]) => void
  ): void {
    this.handlers.get(event)?.delete(handler);
    this.onceHandlers.get(event)?.delete(handler);
  }
  
  /**
   * Emit an event to all registered handlers
   */
  emit<K extends keyof TEvents>(
    event: K, 
    ...args: TEvents[K]
  ): void {
    // Regular handlers
    const handlers = this.handlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      }
    }
    
    // Once handlers
    const onceHandlers = this.onceHandlers.get(event);
    if (onceHandlers) {
      const handlersToRun = Array.from(onceHandlers);
      this.onceHandlers.delete(event);
      for (const handler of handlersToRun) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in once handler for ${String(event)}:`, error);
        }
      }
    }
  }
  
  /**
   * Register a handler that only fires once
   */
  once<K extends keyof TEvents>(
    event: K, 
    handler: (...args: TEvents[K]) => void
  ): void {
    if (!this.onceHandlers.has(event)) {
      this.onceHandlers.set(event, new Set());
    }
    this.onceHandlers.get(event)!.add(handler);
  }
  
  /**
   * Remove all handlers for an event
   */
  removeAllListeners<K extends keyof TEvents>(event?: K): void {
    if (event) {
      this.handlers.delete(event);
      this.onceHandlers.delete(event);
    } else {
      this.handlers.clear();
      this.onceHandlers.clear();
    }
  }
  
  /**
   * Get the count of listeners for an event
   */
  listenerCount<K extends keyof TEvents>(event: K): number {
    const regular = this.handlers.get(event)?.size ?? 0;
    const once = this.onceHandlers.get(event)?.size ?? 0;
    return regular + once;
  }
  
  /**
   * Get all events that have listeners
   */
  eventNames(): Array<keyof TEvents> {
    const names = new Set<keyof TEvents>();
    for (const key of this.handlers.keys()) {
      names.add(key);
    }
    for (const key of this.onceHandlers.keys()) {
      names.add(key);
    }
    return Array.from(names);
  }
}

// ============================================================================
// Event Bus for Component Communication
// ============================================================================

/**
 * Global event bus for inter-component communication
 * Supports event bubbling and capturing phases
 */
export class EventBus extends TypedEventEmitter<ComponentEvents> {
  private captureHandlers = new Map<keyof ComponentEvents, Set<Function>>();
  private bubbleHandlers = new Map<keyof ComponentEvents, Set<Function>>();
  
  /**
   * Register a capture phase handler
   */
  onCapture<K extends keyof ComponentEvents>(
    event: K,
    handler: (...args: ComponentEvents[K]) => void | boolean
  ): void {
    if (!this.captureHandlers.has(event)) {
      this.captureHandlers.set(event, new Set());
    }
    this.captureHandlers.get(event)!.add(handler);
  }
  
  /**
   * Register a bubble phase handler
   */
  onBubble<K extends keyof ComponentEvents>(
    event: K,
    handler: (...args: ComponentEvents[K]) => void | boolean
  ): void {
    if (!this.bubbleHandlers.has(event)) {
      this.bubbleHandlers.set(event, new Set());
    }
    this.bubbleHandlers.get(event)!.add(handler);
  }
  
  /**
   * Dispatch event through capture and bubble phases
   * Returns true if event was not cancelled
   */
  dispatch<K extends keyof ComponentEvents>(
    event: K,
    ...args: ComponentEvents[K]
  ): boolean {
    let cancelled = false;
    
    // Capture phase (top-down)
    const captureHandlers = this.captureHandlers.get(event);
    if (captureHandlers) {
      for (const handler of captureHandlers) {
        try {
          const result = handler(...args);
          if (result === false) {
            cancelled = true;
            break;
          }
        } catch (error) {
          console.error(`Error in capture handler for ${String(event)}:`, error);
        }
      }
    }
    
    if (cancelled) return false;
    
    // Target phase (normal emit)
    this.emit(event, ...args);
    
    // Bubble phase (bottom-up)
    const bubbleHandlers = this.bubbleHandlers.get(event);
    if (bubbleHandlers) {
      for (const handler of bubbleHandlers) {
        try {
          const result = handler(...args);
          if (result === false) {
            cancelled = true;
            break;
          }
        } catch (error) {
          console.error(`Error in bubble handler for ${String(event)}:`, error);
        }
      }
    }
    
    return !cancelled;
  }
}

// ============================================================================
// Keyboard Event Handling
// ============================================================================

/**
 * Parse raw terminal input into Key events
 */
export class KeyboardEventParser {
  private readonly escapeSequences = new Map<string, Partial<Key>>([
    // Arrow keys
    ['\x1b[A', { name: 'up' }],
    ['\x1b[B', { name: 'down' }],
    ['\x1b[C', { name: 'right' }],
    ['\x1b[D', { name: 'left' }],
    
    // Function keys
    ['\x1bOP', { name: 'f1' }],
    ['\x1bOQ', { name: 'f2' }],
    ['\x1bOR', { name: 'f3' }],
    ['\x1bOS', { name: 'f4' }],
    ['\x1b[15~', { name: 'f5' }],
    ['\x1b[17~', { name: 'f6' }],
    ['\x1b[18~', { name: 'f7' }],
    ['\x1b[19~', { name: 'f8' }],
    ['\x1b[20~', { name: 'f9' }],
    ['\x1b[21~', { name: 'f10' }],
    ['\x1b[23~', { name: 'f11' }],
    ['\x1b[24~', { name: 'f12' }],
    
    // Navigation keys
    ['\x1b[H', { name: 'home' }],
    ['\x1b[F', { name: 'end' }],
    ['\x1b[5~', { name: 'pageup' }],
    ['\x1b[6~', { name: 'pagedown' }],
    ['\x1b[2~', { name: 'insert' }],
    ['\x1b[3~', { name: 'delete' }],
    
    // Special keys
    ['\r', { name: 'return' }],
    ['\n', { name: 'return' }],
    ['\t', { name: 'tab' }],
    ['\x1b[Z', { name: 'tab', shift: true }],
    ['\x1b', { name: 'escape' }],
    ['\x7f', { name: 'backspace' }],
    ['\x1b[3~', { name: 'delete' }],
  ]);
  
  /**
   * Parse raw input buffer into Key event
   */
  parse(data: Buffer | string): Key | null {
    const sequence = typeof data === 'string' ? data : data.toString();
    
    // Check for known escape sequences
    const known = this.escapeSequences.get(sequence);
    if (known) {
      return {
        sequence,
        name: known.name ?? 'unknown',
        ctrl: known.ctrl ?? false,
        meta: known.meta ?? false,
        shift: known.shift ?? false,
        code: known.code
      };
    }
    
    // Handle Ctrl+key combinations
    if (sequence.length === 1) {
      const code = sequence.charCodeAt(0);
      
      // Ctrl+A through Ctrl+Z
      if (code >= 1 && code <= 26) {
        return {
          sequence,
          name: String.fromCharCode(code + 96), // Convert to letter
          ctrl: true,
          meta: false,
          shift: false,
          code: sequence
        };
      }
      
      // Regular character
      return {
        sequence,
        name: sequence,
        ctrl: false,
        meta: false,
        shift: /[A-Z]/.test(sequence),
        code: sequence
      };
    }
    
    // Meta/Alt key combinations
    if (sequence.startsWith('\x1b') && sequence.length === 2) {
      return {
        sequence,
        name: sequence[1] || '',
        ctrl: false,
        meta: true,
        shift: /[A-Z]/.test(sequence[1] || ''),
        code: sequence[1] || ''
      };
    }
    
    // Unknown sequence
    return null;
  }
}

// ============================================================================
// Mouse Event Handling
// ============================================================================

/**
 * Parse mouse event sequences
 */
export class MouseEventParser {
  /**
   * Parse X10 mouse protocol
   */
  parseX10(data: Buffer): MouseEvent | null {
    if (data.length < 6 || data[0] !== 0x1b || data[1] !== 0x5b || data[2] !== 0x4d) {
      return null;
    }
    
    const button = (data[3] ?? 32) - 32;
    const x = (data[4] ?? 33) - 33;
    const y = (data[5] ?? 33) - 33;
    
    let type: MouseEvent['type'] = 'click';
    let buttonName: MouseEvent['button'] = 'left';
    
    if (button & 32) type = 'mousemove';
    if (button & 64) type = 'wheel';
    
    if ((button & 3) === 0) buttonName = 'left';
    else if ((button & 3) === 1) buttonName = 'middle';
    else if ((button & 3) === 2) buttonName = 'right';
    
    return {
      type,
      x,
      y,
      button: type === 'mousemove' ? undefined : buttonName,
      modifiers: {
        ctrl: !!(button & 16),
        meta: !!(button & 8),
        shift: !!(button & 4),
        alt: false
      }
    };
  }
  
  /**
   * Parse SGR mouse protocol
   */
  parseSGR(data: string): MouseEvent | null {
    const match = data.match(/^\x1b\[<(\d+);(\d+);(\d+)([Mm])/);
    if (!match || !match[1] || !match[2] || !match[3] || !match[4]) return null;
    
    const [, buttonStr, xStr, yStr, release] = match;
    const button = parseInt(buttonStr, 10);
    const x = parseInt(xStr, 10) - 1;
    const y = parseInt(yStr, 10) - 1;
    
    let type: MouseEvent['type'] = release === 'm' ? 'mouseup' : 'mousedown';
    let buttonName: MouseEvent['button'] = 'left';
    
    if (button & 32) type = 'mousemove';
    if (button & 64) type = 'wheel';
    
    if ((button & 3) === 0) buttonName = 'left';
    else if ((button & 3) === 1) buttonName = 'middle';
    else if ((button & 3) === 2) buttonName = 'right';
    
    return {
      type,
      x,
      y,
      button: type === 'mousemove' ? undefined : buttonName,
      modifiers: {
        ctrl: !!(button & 16),
        meta: !!(button & 8),
        shift: !!(button & 4),
        alt: false
      }
    };
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new event emitter
 */
export function createEventEmitter<TEvents extends Record<string, unknown[]>>(): 
  TypedEventEmitter<TEvents> {
  return new TypedEventEmitter<TEvents>();
}

/**
 * Create a global event bus
 */
export function createEventBus(): EventBus {
  return new EventBus();
}

/**
 * Create a keyboard event parser
 */
export function createKeyboardParser(): KeyboardEventParser {
  return new KeyboardEventParser();
}

/**
 * Create a mouse event parser
 */
export function createMouseParser(): MouseEventParser {
  return new MouseEventParser();
}