// Factory for creating and managing shared StreamHandler instances

import { StreamHandler, StreamHandlerOptions } from './stream-handler.js';

export class StreamHandlerFactory {
  private static sharedInstance?: StreamHandler;
  private static instances = new Map<string, StreamHandler>();
  
  /**
   * Get the default shared StreamHandler instance
   */
  static getShared(): StreamHandler {
    if (!this.sharedInstance) {
      this.sharedInstance = new StreamHandler({
        shared: true,
        isTTY: process.stdin.isTTY && process.stdout.isTTY
      });
    }
    return this.sharedInstance;
  }
  
  /**
   * Create a new exclusive StreamHandler
   */
  static createExclusive(options?: StreamHandlerOptions): StreamHandler {
    return new StreamHandler({
      ...options,
      shared: false
    });
  }
  
  /**
   * Create or get a named shared StreamHandler
   */
  static getNamedShared(name: string, options?: StreamHandlerOptions): StreamHandler {
    if (!this.instances.has(name)) {
      this.instances.set(name, new StreamHandler({
        ...options,
        shared: true
      }));
    }
    return this.instances.get(name)!;
  }
  
  /**
   * Reset all shared instances
   * Useful for testing
   */
  static reset(): void {
    // Stop all instances
    if (this.sharedInstance) {
      this.sharedInstance.stop();
      this.sharedInstance = undefined;
    }
    
    this.instances.forEach(instance => instance.stop());
    this.instances.clear();
  }
  
  /**
   * Get statistics about active streams
   */
  static getStats(): {
    sharedInstance: boolean;
    namedInstances: string[];
    activeCount: number;
  } {
    const activeCount = [
      this.sharedInstance?.isActive() ? 1 : 0,
      ...Array.from(this.instances.values()).filter(s => s.isActive()).map(() => 1)
    ].reduce((a, b) => a + b, 0);
    
    return {
      sharedInstance: !!this.sharedInstance,
      namedInstances: Array.from(this.instances.keys()),
      activeCount
    };
  }
}