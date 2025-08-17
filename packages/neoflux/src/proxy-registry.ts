/**
 * Proxy Registry with automatic cleanup using FinalizationRegistry
 * Provides memory-efficient management of proxy objects in stores
 */

/**
 * Registry for managing proxy references with automatic cleanup
 */
export class ProxyRegistry {
  private proxies = new Map<string, WeakRef<any>>();
  private registry: FinalizationRegistry<string> | null = null;
  
  constructor() {
    // Only use FinalizationRegistry if available (Node 14.6+, modern browsers)
    if (typeof FinalizationRegistry !== 'undefined') {
      this.registry = new FinalizationRegistry((key: string) => {
        // Automatically clean up the WeakRef when the proxy is garbage collected
        this.proxies.delete(key);
      });
    }
  }
  
  /**
   * Register a proxy with a key
   */
  register(key: string, proxy: any): void {
    // Store the weak reference
    this.proxies.set(key, new WeakRef(proxy));
    
    // Register for automatic cleanup if FinalizationRegistry is available
    if (this.registry) {
      this.registry.register(proxy, key, proxy);
    }
  }
  
  /**
   * Get a proxy by key (may return undefined if GC'd)
   */
  get(key: string): any | undefined {
    const ref = this.proxies.get(key);
    if (!ref) return undefined;
    
    const proxy = ref.deref();
    if (!proxy) {
      // Proxy was garbage collected, clean up the entry
      this.proxies.delete(key);
      return undefined;
    }
    
    return proxy;
  }
  
  /**
   * Check if a key exists (doesn't guarantee the proxy is still alive)
   */
  has(key: string): boolean {
    return this.proxies.has(key);
  }
  
  /**
   * Manually delete a proxy reference
   */
  delete(key: string): boolean {
    const ref = this.proxies.get(key);
    if (ref && this.registry) {
      const proxy = ref.deref();
      if (proxy) {
        // Unregister from FinalizationRegistry
        this.registry.unregister(proxy);
      }
    }
    return this.proxies.delete(key);
  }
  
  /**
   * Clear all proxy references
   */
  clear(): void {
    // Unregister all proxies if FinalizationRegistry is available
    if (this.registry) {
      for (const [key, ref] of this.proxies) {
        const proxy = ref.deref();
        if (proxy) {
          this.registry.unregister(proxy);
        }
      }
    }
    
    this.proxies.clear();
  }
  
  /**
   * Get the number of registered proxies
   * Note: This includes entries where the proxy may have been GC'd
   */
  get size(): number {
    return this.proxies.size;
  }
  
  /**
   * Clean up dead references manually
   * This is called periodically to remove entries where the proxy was GC'd
   */
  cleanup(): void {
    const deadKeys: string[] = [];
    
    for (const [key, ref] of this.proxies) {
      if (!ref.deref()) {
        deadKeys.push(key);
      }
    }
    
    for (const key of deadKeys) {
      this.proxies.delete(key);
    }
  }
  
  /**
   * Get statistics about the registry
   */
  getStats(): { total: number; alive: number; dead: number } {
    let alive = 0;
    let dead = 0;
    
    for (const [, ref] of this.proxies) {
      if (ref.deref()) {
        alive++;
      } else {
        dead++;
      }
    }
    
    return {
      total: this.proxies.size,
      alive,
      dead
    };
  }
}

/**
 * Global singleton instance for convenience
 */
export const globalProxyRegistry = new ProxyRegistry();