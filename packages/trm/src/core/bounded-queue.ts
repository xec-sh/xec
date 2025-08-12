/**
 * Bounded queue implementation to prevent unbounded memory growth
 * Used by event emitters and other components that queue data
 */

export interface QueueConfig {
  maxSize: number;
  overflowStrategy: 'drop-oldest' | 'drop-newest' | 'error';
  onOverflow?: (droppedItem: any) => void;
}

export class BoundedQueue<T> {
  private items: T[] = [];
  private readonly config: QueueConfig;
  private droppedCount = 0;
  
  constructor(config: Partial<QueueConfig> = {}) {
    this.config = {
      maxSize: config.maxSize ?? 1000,
      overflowStrategy: config.overflowStrategy ?? 'drop-oldest',
      onOverflow: config.onOverflow
    };
  }
  
  /**
   * Add an item to the queue
   * Returns true if the item was added, false if dropped
   */
  push(item: T): boolean {
    if (this.items.length >= this.config.maxSize) {
      return this.handleOverflow(item);
    }
    
    this.items.push(item);
    return true;
  }
  
  /**
   * Remove and return the first item
   */
  shift(): T | undefined {
    return this.items.shift();
  }
  
  /**
   * Get the first item without removing it
   */
  peek(): T | undefined {
    return this.items[0];
  }
  
  /**
   * Get the number of items in the queue
   */
  get length(): number {
    return this.items.length;
  }
  
  /**
   * Check if the queue is empty
   */
  get isEmpty(): boolean {
    return this.items.length === 0;
  }
  
  /**
   * Check if the queue is full
   */
  get isFull(): boolean {
    return this.items.length >= this.config.maxSize;
  }
  
  /**
   * Clear all items from the queue
   */
  clear(): void {
    this.items = [];
    this.droppedCount = 0;
  }
  
  /**
   * Get queue statistics
   */
  getStats(): {
    size: number;
    maxSize: number;
    droppedCount: number;
    utilization: number;
  } {
    return {
      size: this.items.length,
      maxSize: this.config.maxSize,
      droppedCount: this.droppedCount,
      utilization: this.items.length / this.config.maxSize
    };
  }
  
  /**
   * Handle overflow based on configured strategy
   */
  private handleOverflow(newItem: T): boolean {
    switch (this.config.overflowStrategy) {
      case 'drop-oldest': {
        const dropped = this.items.shift();
        if (dropped !== undefined) {
          this.droppedCount++;
          this.config.onOverflow?.(dropped);
        }
        this.items.push(newItem);
        return true;
      }
      
      case 'drop-newest': {
        this.droppedCount++;
        this.config.onOverflow?.(newItem);
        return false;
      }
      
      case 'error': {
        throw new Error(
          `Queue overflow: size ${this.items.length} reached max ${this.config.maxSize}`
        );
      }
      
      default:
        // This should never happen but TypeScript wants exhaustive checking
        throw new Error(`Unknown overflow strategy: ${this.config.overflowStrategy}`);
    }
  }
  
  /**
   * Create an async iterator over the queue
   * This allows consuming items as they become available
   */
  async *[Symbol.asyncIterator](): AsyncIterableIterator<T> {
    while (true) {
      const item = this.shift();
      if (item !== undefined) {
        yield item;
      } else {
        // Wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }
}