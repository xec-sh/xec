/**
 * Event emitter implementation
 * Type-safe event system for terminal events
 */

import { BoundedQueue } from './bounded-queue.js';
import type { Disposable, EventEmitter } from '../types.js';

/**
 * Type-safe event emitter implementation
 */
export class TypedEventEmitter<T extends Record<string, any[]>> implements EventEmitter<T> {
  private listeners = new Map<keyof T, Set<(...args: any[]) => void>>();
  private onceListeners = new Map<keyof T, Set<(...args: any[]) => void>>();
  private wildcardListeners = new Set<(event: keyof T, ...args: any[]) => void>();

  /**
   * Add an event listener
   */
  on<K extends keyof T>(event: K, handler: (...args: T[K]) => void): Disposable {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    
    const handlers = this.listeners.get(event)!;
    handlers.add(handler);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(event);
      }
    };

    return {
      get disposed() { return disposed; },
      dispose,
      [Symbol.dispose]: dispose
    };
  }

  /**
   * Remove an event listener
   */
  off<K extends keyof T>(event: K, handler?: (...args: T[K]) => void): void {
    if (handler === undefined) {
      // Remove all listeners for this event
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      // Remove specific handler
      const handlers = this.listeners.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.listeners.delete(event);
        }
      }

      const onceHandlers = this.onceListeners.get(event);
      if (onceHandlers) {
        onceHandlers.delete(handler);
        if (onceHandlers.size === 0) {
          this.onceListeners.delete(event);
        }
      }
    }
  }

  /**
   * Add a one-time event listener
   */
  once<K extends keyof T>(event: K, handler: (...args: T[K]) => void): Disposable {
    if (!this.onceListeners.has(event)) {
      this.onceListeners.set(event, new Set());
    }
    
    const handlers = this.onceListeners.get(event)!;
    handlers.add(handler);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.onceListeners.delete(event);
      }
    };

    return {
      get disposed() { return disposed; },
      dispose,
      [Symbol.dispose]: dispose
    };
  }

  /**
   * Emit an event
   */
  emit<K extends keyof T>(event: K, ...args: T[K]): void {
    // Call wildcard listeners
    for (const handler of this.wildcardListeners) {
      try {
        handler(event, ...args);
      } catch (error) {
        console.error(`Error in wildcard handler for ${String(event)}:`, error);
      }
    }

    // Call regular listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      }
    }

    // Call once listeners and remove them
    const onceHandlers = this.onceListeners.get(event);
    if (onceHandlers) {
      const handlersToCall = Array.from(onceHandlers);
      this.onceListeners.delete(event);
      
      for (const handler of handlersToCall) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in once handler for ${String(event)}:`, error);
        }
      }
    }
  }

  /**
   * Remove all listeners for an event, or all events
   */
  removeAllListeners<K extends keyof T>(event?: K): void {
    if (event !== undefined) {
      this.listeners.delete(event);
      this.onceListeners.delete(event);
    } else {
      this.listeners.clear();
      this.onceListeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   */
  listenerCount<K extends keyof T>(event: K): number {
    const regularCount = this.listeners.get(event)?.size || 0;
    const onceCount = this.onceListeners.get(event)?.size || 0;
    return regularCount + onceCount;
  }

  /**
   * Get all listeners for an event
   */
  getListeners<K extends keyof T>(event: K): Array<(...args: T[K]) => void> {
    const regular = Array.from(this.listeners.get(event) || []);
    const once = Array.from(this.onceListeners.get(event) || []);
    return [...regular, ...once];
  }

  /**
   * Wait for an event (returns a promise)
   */
  waitFor<K extends keyof T>(event: K): Promise<T[K]> {
    return new Promise((resolve) => {
      this.once(event, (...args: T[K]) => {
        resolve(args);
      });
    });
  }

  /**
   * Create an async iterator for events
   */
  async *iterate<K extends keyof T>(event: K): AsyncIterableIterator<T[K]> {
    // Use bounded queue to prevent unbounded memory growth
    const queue = new BoundedQueue<T[K]>({
      maxSize: 100, // Reasonable limit for event queue
      overflowStrategy: 'drop-oldest',
      onOverflow: (_dropped) => {
        // Optionally log or handle dropped events
        // Note: We can't emit errors here as 'error' may not be in T
        // Just silently drop the oldest events
      }
    });
    
    let resolve: ((value: IteratorResult<T[K]>) => void) | null = null;
    let disposed = false;

    const handler = (...args: T[K]) => {
      if (resolve) {
        resolve({ value: args, done: false });
        resolve = null;
      } else {
        queue.push(args);
      }
    };

    const disposable = this.on(event, handler);

    try {
      while (!disposed) {
        const item = queue.shift();
        if (item !== undefined) {
          yield item;
        } else {
          const result = await new Promise<IteratorResult<T[K]>>((r) => {
            resolve = r;
            // Check if data arrived while setting up promise
            const immediate = queue.shift();
            if (immediate !== undefined) {
              resolve = null;
              r({ value: immediate, done: false });
            }
          });
          
          if (result.done) {
            break;
          }
          
          yield result.value;
        }
      }
    } finally {
      disposed = true;
      disposable.dispose();
      queue.clear();
    }
  }

  /**
   * Add a wildcard listener for all events
   */
  onAny(handler: (event: keyof T, ...args: any[]) => void): Disposable {
    this.wildcardListeners.add(handler);

    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      this.wildcardListeners.delete(handler);
    };

    return {
      get disposed() { return disposed; },
      dispose,
      [Symbol.dispose]: dispose
    };
  }

  /**
   * Emit an event asynchronously
   */
  async emitAsync<K extends keyof T>(event: K, ...args: T[K]): Promise<void> {
    // Create an array of all handlers
    const allHandlers: Array<() => Promise<void>> = [];
    const errors: Error[] = [];

    // Add wildcard listeners
    for (const handler of this.wildcardListeners) {
      allHandlers.push(async () => {
        try {
          await handler(event, ...args);
        } catch (error) {
          console.error(`Error in async wildcard handler for ${String(event)}:`, error);
          errors.push(error as Error);
        }
      });
    }

    // Add regular listeners
    const handlers = this.listeners.get(event);
    if (handlers) {
      for (const handler of handlers) {
        allHandlers.push(async () => {
          try {
            await handler(...args);
          } catch (error) {
            console.error(`Error in async event handler for ${String(event)}:`, error);
            errors.push(error as Error);
          }
        });
      }
    }

    // Add once listeners
    const onceHandlers = this.onceListeners.get(event);
    if (onceHandlers) {
      const handlersToCall = Array.from(onceHandlers);
      this.onceListeners.delete(event);
      
      for (const handler of handlersToCall) {
        allHandlers.push(async () => {
          try {
            await handler(...args);
          } catch (error) {
            console.error(`Error in async once handler for ${String(event)}:`, error);
            errors.push(error as Error);
          }
        });
      }
    }

    // Execute all handlers in parallel
    await Promise.all(allHandlers.map(h => h()));
    
    // If any errors occurred, throw the first one
    if (errors.length > 0) {
      throw errors[0];
    }
  }

  /**
   * Create a filtered event emitter
   */
  filter<K extends keyof T>(
    event: K,
    predicate: (...args: T[K]) => boolean
  ): EventEmitter<Pick<T, K>> {
    const filtered = new TypedEventEmitter<Pick<T, K>>();
    
    this.on(event, (...args: T[K]) => {
      if (predicate(...args)) {
        filtered.emit(event as any, ...args);
      }
    });

    return filtered;
  }

  /**
   * Create a mapped event emitter
   */
  map<K extends keyof T, U>(
    event: K,
    mapper: (...args: T[K]) => U
  ): EventEmitter<any> {
    const mapped = new TypedEventEmitter<any>();
    
    this.on(event, (...args: T[K]) => {
      const mappedValue = mapper(...args);
      mapped.emit(event as any, mappedValue);
    });

    return mapped;
  }

  /**
   * Dispose of the event emitter
   */
  dispose(): void {
    this.removeAllListeners();
    this.wildcardListeners.clear();
  }
}

// Export alias for consistency with other modules
export class EventEmitterImpl<T extends Record<string, any[]>> extends TypedEventEmitter<T> {}

// Export EventEmitter as main export for tests
export { TypedEventEmitter as EventEmitter };

export default TypedEventEmitter;