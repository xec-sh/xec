/**
 * Enhanced event system with proper bubbling and propagation control
 * Implements DOM-like event handling for components
 */

import type { Key, Component, MouseEvent } from './types.js';

// ============================================================================
// Event Types
// ============================================================================

export interface EventOptions {
  readonly bubbles?: boolean;
  readonly cancelable?: boolean;
  readonly composed?: boolean;
}

export interface TerexEvent<T = unknown> {
  readonly type: string;
  readonly target: Component<unknown>;
  readonly currentTarget: Component<unknown> | null;
  readonly detail: T;
  readonly bubbles: boolean;
  readonly cancelable: boolean;
  readonly composed: boolean;
  readonly timeStamp: number;
  
  // State tracking
  defaultPrevented: boolean;
  propagationStopped: boolean;
  immediatePropagationStopped: boolean;
  
  // Methods
  preventDefault(): void;
  stopPropagation(): void;
  stopImmediatePropagation(): void;
}

export interface KeyEvent extends TerexEvent<Key> {
  readonly type: 'keydown' | 'keyup' | 'keypress';
  readonly detail: Key;
  readonly key: Key;
}

export interface MouseEventTerex extends TerexEvent<MouseEvent> {
  readonly type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'dblclick';
  readonly detail: MouseEvent;
  readonly mouseEvent: MouseEvent;
}

export interface ComponentEvent<T = unknown> extends TerexEvent<T> {
  readonly type: 'mount' | 'unmount' | 'focus' | 'blur' | 'stateChange' | 'resize';
}

export type EventHandler<T extends TerexEvent = TerexEvent> = (event: T) => void | boolean;
export type EventListener<T extends TerexEvent = TerexEvent> = (event: T) => void;

// ============================================================================
// Event Implementation
// ============================================================================

/**
 * Internal event implementation
 */
class TerexEventImpl<T = unknown> implements TerexEvent<T> {
  public defaultPrevented = false;
  public propagationStopped = false;
  public immediatePropagationStopped = false;
  public currentTarget: Component<unknown> | null = null;
  public readonly timeStamp: number;
  
  constructor(
    public readonly type: string,
    public readonly target: Component<unknown>,
    public readonly detail: T,
    options: EventOptions = {}
  ) {
    this.bubbles = options.bubbles ?? true;
    this.cancelable = options.cancelable ?? true;
    this.composed = options.composed ?? false;
    this.timeStamp = performance.now();
  }
  
  public readonly bubbles: boolean;
  public readonly cancelable: boolean;
  public readonly composed: boolean;
  
  preventDefault(): void {
    if (this.cancelable) {
      this.defaultPrevented = true;
    }
  }
  
  stopPropagation(): void {
    this.propagationStopped = true;
  }
  
  stopImmediatePropagation(): void {
    this.propagationStopped = true;
    this.immediatePropagationStopped = true;
  }
}

// ============================================================================
// Event Dispatcher
// ============================================================================

/**
 * Event dispatcher that handles proper event bubbling and propagation
 */
export class EventDispatcher {
  private readonly listeners = new Map<Component<unknown>, Map<string, Set<EventListener>>>();
  
  /**
   * Add event listener to a component
   */
  addEventListener<T extends TerexEvent>(
    component: Component<unknown>,
    type: string,
    listener: EventListener<T>
  ): void {
    if (!this.listeners.has(component)) {
      this.listeners.set(component, new Map());
    }
    
    const componentListeners = this.listeners.get(component)!;
    if (!componentListeners.has(type)) {
      componentListeners.set(type, new Set());
    }
    
    componentListeners.get(type)!.add(listener as EventListener);
  }
  
  /**
   * Remove event listener from a component
   */
  removeEventListener<T extends TerexEvent>(
    component: Component<unknown>,
    type: string,
    listener: EventListener<T>
  ): void {
    const componentListeners = this.listeners.get(component);
    if (!componentListeners) return;
    
    const typeListeners = componentListeners.get(type);
    if (!typeListeners) return;
    
    typeListeners.delete(listener as EventListener);
    
    // Cleanup empty sets
    if (typeListeners.size === 0) {
      componentListeners.delete(type);
    }
    if (componentListeners.size === 0) {
      this.listeners.delete(component);
    }
  }
  
  /**
   * Remove all event listeners from a component
   */
  removeAllListeners(component: Component<unknown>): void {
    this.listeners.delete(component);
  }
  
  /**
   * Dispatch event with proper bubbling
   */
  dispatchEvent<T>(
    target: Component<unknown>,
    type: string,
    detail: T,
    options?: EventOptions
  ): boolean {
    const event = new TerexEventImpl(type, target, detail, options);
    
    // Build path from target to root for bubbling
    const path = this.buildEventPath(target);
    
    // Capture phase (not implemented yet - could be added later)
    
    // Target phase
    event.currentTarget = target;
    this.invokeListeners(target, event);
    
    // Bubble phase
    if (event.bubbles && !event.propagationStopped && path.length > 1) {
      for (let i = 1; i < path.length && !event.propagationStopped; i++) {
        event.currentTarget = path[i]!;
        this.invokeListeners(path[i]!, event);
      }
    }
    
    return !event.defaultPrevented;
  }
  
  /**
   * Dispatch keyboard event with proper handling
   */
  dispatchKeyEvent(
    target: Component<unknown>,
    type: 'keydown' | 'keyup' | 'keypress',
    key: Key
  ): boolean {
    return this.dispatchEvent(target, type, key, { bubbles: true, cancelable: true });
  }
  
  /**
   * Dispatch mouse event with proper handling
   */
  dispatchMouseEvent(
    target: Component<unknown>,
    type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'dblclick',
    mouseEvent: MouseEvent
  ): boolean {
    return this.dispatchEvent(target, type, mouseEvent, { bubbles: true, cancelable: true });
  }
  
  // ============================================================================
  // Private Methods
  // ============================================================================
  
  /**
   * Build event path from target to root
   */
  private buildEventPath(target: Component<unknown>): Component<unknown>[] {
    const path: Component<unknown>[] = [target];
    
    let current = target;
    while (current && 'parent' in current && current.parent) {
      current = current.parent as Component<unknown>;
      path.push(current);
    }
    
    return path;
  }
  
  /**
   * Invoke all listeners for a component and event type
   */
  private invokeListeners(component: Component<unknown>, event: TerexEvent): void {
    const componentListeners = this.listeners.get(component);
    if (!componentListeners) return;
    
    const typeListeners = componentListeners.get(event.type);
    if (!typeListeners || typeListeners.size === 0) return;
    
    // Create array to avoid modification during iteration
    const listeners = Array.from(typeListeners);
    
    // Capture currentTarget for this phase to avoid mutation issues
    const currentTarget = event.currentTarget;
    
    for (const listener of listeners) {
      if (event.immediatePropagationStopped) break;
      
      try {
        // Create an event proxy that preserves the currentTarget for this phase
        // This prevents issues with test spies capturing mutated references
        const eventForPhase = new Proxy(event, {
          get(target, prop) {
            if (prop === 'currentTarget') {
              return currentTarget;
            }
            return Reflect.get(target, prop);
          }
        });
        
        listener(eventForPhase);
      } catch (error) {
        console.error(`Error in event listener for ${event.type}:`, error);
      }
    }
  }
}

// ============================================================================
// Enhanced Component Mixin
// ============================================================================

/**
 * Enhanced event handling mixin for components
 */
export interface EventTargetMixin {
  addEventListener<T extends TerexEvent>(
    type: string,
    listener: EventListener<T>,
    options?: EventOptions
  ): void;
  
  removeEventListener<T extends TerexEvent>(
    type: string,
    listener: EventListener<T>
  ): void;
  
  dispatchEvent<T>(type: string, detail: T, options?: EventOptions): boolean;
  
  removeAllEventListeners(): void;
}

/**
 * Add enhanced event handling to a component
 */
export function addEventHandling<T extends Component<unknown>>(
  component: T,
  dispatcher?: EventDispatcher
): T & EventTargetMixin {
  const eventDispatcher = dispatcher ?? new EventDispatcher();
  
  const enhanced = component as T & EventTargetMixin;
  
  enhanced.addEventListener = function<U extends TerexEvent>(
    type: string,
    listener: EventListener<U>
  ): void {
    eventDispatcher.addEventListener(this, type, listener);
  };
  
  enhanced.removeEventListener = function<U extends TerexEvent>(
    type: string,
    listener: EventListener<U>
  ): void {
    eventDispatcher.removeEventListener(this, type, listener);
  };
  
  enhanced.dispatchEvent = function<U>(
    type: string,
    detail: U,
    options?: EventOptions
  ): boolean {
    return eventDispatcher.dispatchEvent(this, type, detail, options);
  };
  
  enhanced.removeAllEventListeners = function(): void {
    eventDispatcher.removeAllListeners(this);
  };
  
  return enhanced;
}

// ============================================================================
// Global Event Dispatcher
// ============================================================================

/**
 * Global event dispatcher instance
 */
export const globalEventDispatcher = new EventDispatcher();

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * KeyEvent implementation
 */
class TerexKeyEvent extends TerexEventImpl<Key> implements KeyEvent {
  declare public readonly type: 'keydown' | 'keyup' | 'keypress';
  
  constructor(
    type: 'keydown' | 'keyup' | 'keypress',
    target: Component<unknown>,
    detail: Key,
    options?: EventOptions
  ) {
    super(type, target, detail, options);
  }
  
  get key(): Key {
    return this.detail;
  }
}

/**
 * Create a keyboard event
 */
export function createKeyEvent(
  target: Component<unknown>,
  type: 'keydown' | 'keyup' | 'keypress',
  key: Key,
  options?: EventOptions
): KeyEvent {
  return new TerexKeyEvent(type, target, key, options);
}

/**
 * MouseEvent implementation
 */
class TerexMouseEventImpl extends TerexEventImpl<MouseEvent> implements MouseEventTerex {
  declare public readonly type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'dblclick';
  
  constructor(
    type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'dblclick',
    target: Component<unknown>,
    detail: MouseEvent,
    options?: EventOptions
  ) {
    super(type, target, detail, options);
  }
  
  get mouseEvent(): MouseEvent {
    return this.detail;
  }
}

/**
 * Create a mouse event
 */
export function createMouseEvent(
  target: Component<unknown>,
  type: 'mousedown' | 'mouseup' | 'mousemove' | 'click' | 'dblclick',
  mouseEvent: MouseEvent,
  options?: EventOptions
): MouseEventTerex {
  return new TerexMouseEventImpl(type, target, mouseEvent, options);
}

/**
 * Create a component event
 */
export function createComponentEvent<T>(
  target: Component<unknown>,
  type: 'mount' | 'unmount' | 'focus' | 'blur' | 'stateChange' | 'resize',
  detail: T,
  options?: EventOptions
): ComponentEvent<T> {
  return new TerexEventImpl(type, target, detail, options) as ComponentEvent<T>;
}