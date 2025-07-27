import { EventEmitter } from 'events';

import type { UshEventMap, TypedEventEmitter } from '../types/events.js';

/**
 * Event filter options
 */
export interface EventFilter {
  adapter?: string | string[];
  host?: string;
  [key: string]: any;
}

/**
 * Enhanced event listener with filter support
 */
export interface FilteredEventListener<T> {
  listener: (data: T) => void;
  filter?: EventFilter;
}

/**
 * Enhanced EventEmitter with filtering and wildcard support
 */
export class EnhancedEventEmitter extends (EventEmitter as new () => TypedEventEmitter<UshEventMap>) {
  private filteredListeners: Map<string, FilteredEventListener<any>[]> = new Map();
  private wildcardListeners: Map<string, FilteredEventListener<any>[]> = new Map();

  /**
   * Subscribe to events with optional filtering
   */
  onFiltered<K extends keyof UshEventMap>(
    event: K | string,
    filterOrListener: EventFilter | ((data: UshEventMap[K]) => void),
    listener?: (data: UshEventMap[K]) => void
  ): this {
    let filter: EventFilter | undefined;
    let handler: (data: any) => void;

    if (typeof filterOrListener === 'function') {
      handler = filterOrListener;
    } else {
      filter = filterOrListener;
      handler = listener!;
    }

    const eventStr = String(event);

    // Handle wildcard patterns
    if (eventStr.includes('*')) {
      const pattern = eventStr.replace(/\*/g, '.*');
      const regex = new RegExp(`^${pattern}$`);
      
      if (!this.wildcardListeners.has(eventStr)) {
        this.wildcardListeners.set(eventStr, []);
      }
      
      this.wildcardListeners.get(eventStr)!.push({ listener: handler, filter });
      
      // Set up internal listener for all events
      this.setupWildcardListener(regex, eventStr);
    } else {
      // Regular event
      if (!this.filteredListeners.has(eventStr)) {
        this.filteredListeners.set(eventStr, []);
        
        // Set up internal listener
        super.on(eventStr as any, (data: any) => {
          this.handleFilteredEvent(eventStr, data);
        });
      }
      
      this.filteredListeners.get(eventStr)!.push({ listener: handler, filter });
    }

    return this;
  }

  /**
   * Handle filtered event delivery
   */
  private handleFilteredEvent(event: string, data: any): void {
    const listeners = this.filteredListeners.get(event) || [];
    
    for (const { listener, filter } of listeners) {
      if (this.matchesFilter(data, filter)) {
        listener(data);
      }
    }
  }

  /**
   * Set up wildcard listener
   */
  private setupWildcardListener(regex: RegExp, pattern: string): void {
    // Get all event names
    const eventNames = this.eventNames() as string[];
    
    // Listen to existing events
    for (const eventName of eventNames) {
      if (regex.test(eventName) && !this.hasWildcardListenerSetup(eventName, pattern)) {
        this.markWildcardListenerSetup(eventName, pattern);
        super.on(eventName as any, (data: any) => {
          this.handleWildcardEvent(pattern, eventName, data);
        });
      }
    }
    
    // Also override emit to catch new events
    const originalEmit = this.emit.bind(this);
    this.emit = (event: string | symbol, ...args: any[]): boolean => {
      const eventStr = String(event);
      
      // Check if any wildcard patterns match this event
      for (const [pattern, listeners] of this.wildcardListeners.entries()) {
        const regex = new RegExp(`^${pattern.replace(/\*/g, '.*')}$`);
        if (regex.test(eventStr) && !this.hasWildcardListenerSetup(eventStr, pattern)) {
          this.markWildcardListenerSetup(eventStr, pattern);
          super.on(eventStr as any, (data: any) => {
            this.handleWildcardEvent(pattern, eventStr, data);
          });
        }
      }
      
      return originalEmit(event, ...args);
    };
  }

  private wildcardSetupMap: Map<string, Set<string>> = new Map();

  private hasWildcardListenerSetup(event: string, pattern: string): boolean {
    return this.wildcardSetupMap.get(event)?.has(pattern) || false;
  }

  private markWildcardListenerSetup(event: string, pattern: string): void {
    if (!this.wildcardSetupMap.has(event)) {
      this.wildcardSetupMap.set(event, new Set());
    }
    this.wildcardSetupMap.get(event)!.add(pattern);
  }

  /**
   * Handle wildcard event delivery
   */
  private handleWildcardEvent(pattern: string, actualEvent: string, data: any): void {
    const listeners = this.wildcardListeners.get(pattern) || [];
    
    for (const { listener, filter } of listeners) {
      if (this.matchesFilter(data, filter)) {
        listener(data);
      }
    }
  }

  /**
   * Check if event data matches filter
   */
  private matchesFilter(data: any, filter?: EventFilter): boolean {
    if (!filter) return true;

    for (const [key, value] of Object.entries(filter)) {
      if (key === 'adapter') {
        // Special handling for adapter filter
        const adapters = Array.isArray(value) ? value : [value];
        if (!adapters.includes(data.adapter)) {
          return false;
        }
      } else if (data[key] !== value) {
        return false;
      }
    }

    return true;
  }

  /**
   * Remove filtered listener
   */
  offFiltered<K extends keyof UshEventMap>(
    event: K | string,
    listener: (data: UshEventMap[K]) => void
  ): this {
    const eventStr = String(event);

    if (eventStr.includes('*')) {
      // Remove from wildcard listeners
      const listeners = this.wildcardListeners.get(eventStr);
      if (listeners) {
        const index = listeners.findIndex(l => l.listener === listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this.wildcardListeners.delete(eventStr);
        }
      }
    } else {
      // Remove from regular filtered listeners
      const listeners = this.filteredListeners.get(eventStr);
      if (listeners) {
        const index = listeners.findIndex(l => l.listener === listener);
        if (index !== -1) {
          listeners.splice(index, 1);
        }
        if (listeners.length === 0) {
          this.filteredListeners.delete(eventStr);
          // Remove the internal listener
          this.removeAllListeners(eventStr as any);
        }
      }
    }

    return this;
  }

  /**
   * Emit event with automatic metadata
   */
  emitEnhanced<K extends keyof UshEventMap>(
    event: K,
    data: Omit<UshEventMap[K], 'timestamp' | 'adapter'>,
    adapter: string
  ): boolean {
    return this.emit(event, {
      ...data,
      timestamp: new Date(),
      adapter
    } as UshEventMap[K]);
  }
}

/**
 * Create an enhanced event emitter instance
 */
export function createEnhancedEventEmitter(): EnhancedEventEmitter {
  return new EnhancedEventEmitter();
}