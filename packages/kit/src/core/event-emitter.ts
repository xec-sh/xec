// Event emitter for handling prompt events

export type EventHandler = (...args: any[]) => void;

export class EventEmitter {
  private events: Map<string | symbol, Set<EventHandler>> = new Map();

  on(event: string | symbol, handler: EventHandler): () => void {
    if (!this.events.has(event)) {
      this.events.set(event, new Set());
    }
    this.events.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      const handlers = this.events.get(event);
      if (handlers) {
        handlers.delete(handler);
        if (handlers.size === 0) {
          this.events.delete(event);
        }
      }
    };
  }

  once(event: string | symbol, handler: EventHandler): () => void {
    const wrapped = (...args: any[]) => {
      handler(...args);
      this.off(event, wrapped);
    };
    return this.on(event, wrapped);
  }

  off(event: string | symbol, handler?: EventHandler): void {
    if (!handler) {
      this.events.delete(event);
      return;
    }

    const handlers = this.events.get(event);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.events.delete(event);
      }
    }
  }

  emit(event: string | symbol, ...args: any[]): void {
    const handlers = this.events.get(event);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args);
        } catch (error) {
          console.error(`Error in event handler for ${String(event)}:`, error);
        }
      });
    }
  }

  listenerCount(event: string | symbol): number {
    const handlers = this.events.get(event);
    return handlers ? handlers.size : 0;
  }

  removeAllListeners(event?: string | symbol): void {
    if (event) {
      this.events.delete(event);
    } else {
      this.events.clear();
    }
  }
}