/**
 * Runtime Adapter Factory
 * Automatically selects the appropriate adapter based on the current runtime
 */

import { BunAdapter } from './bun.js';
import { NodeAdapter } from './node.js';
import { DenoAdapter } from './deno.js';
import { BaseRuntimeAdapter } from './base.js';

import type { Runtime, RuntimeAdapter } from '../core/types.js';

/**
 * Registry of custom adapters
 */
const adapterRegistry = new Map<string, {
  adapterClass: new () => RuntimeAdapter;
  detect?: () => boolean;
  priority?: number;
}>();

/**
 * Register a custom adapter
 */
export function registerAdapter(
  name: string, 
  adapterClass: new () => RuntimeAdapter,
  options?: {
    detect?: () => boolean;
    priority?: number;
  }
): void {
  adapterRegistry.set(name.toLowerCase(), {
    adapterClass,
    detect: options?.detect,
    priority: options?.priority ?? 0
  });
}

/**
 * Set the default adapter to use
 */
let defaultAdapterName: string | null = null;

export function setDefaultAdapter(name: string): void {
  defaultAdapterName = name.toLowerCase();
}

/**
 * Detect the current JavaScript runtime
 */
export function detectRuntime(): Runtime {
  // Check environment variable first
  if (typeof process !== 'undefined' && process.env?.TUI_TESTER_ADAPTER) {
    const envAdapter = process.env.TUI_TESTER_ADAPTER.toLowerCase();
    if (envAdapter === 'node' || envAdapter === 'deno' || envAdapter === 'bun') {
      return envAdapter as Runtime;
    }
  }
  
  // @ts-ignore - Check for Deno
  if (typeof Deno !== 'undefined' && typeof Deno.version !== 'undefined') {
    return 'deno';
  }
  
  // @ts-ignore - Check for Bun
  if (typeof Bun !== 'undefined' && typeof Bun.version !== 'undefined') {
    return 'bun';
  }
  
  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    return 'node';
  }
  
  // Default to Node.js
  return 'node';
}

/**
 * Create a runtime adapter for the current environment
 */
export function createAdapter(runtime?: Runtime | string): RuntimeAdapter {
  // Check if a default adapter name is set
  if (defaultAdapterName) {
    // Check if it's a registered custom adapter
    const customAdapter = adapterRegistry.get(defaultAdapterName);
    if (customAdapter) {
      return new customAdapter.adapterClass();
    }
    
    // Check if it's a built-in adapter
    if (defaultAdapterName === 'node' || defaultAdapterName === 'deno' || defaultAdapterName === 'bun') {
      runtime = defaultAdapterName as Runtime;
    }
  }
  
  // Check for custom adapters with detection functions
  if (!runtime) {
    // Sort by priority and check detection functions
    const sortedAdapters = Array.from(adapterRegistry.entries())
      .filter(([, config]) => config.detect)
      .sort(([, a], [, b]) => (b.priority ?? 0) - (a.priority ?? 0));
    
    for (const [, config] of sortedAdapters) {
      if (config.detect && config.detect()) {
        return new config.adapterClass();
      }
    }
  }
  
  // Check if runtime is a string that's in the registry
  if (typeof runtime === 'string' && adapterRegistry.has(runtime.toLowerCase())) {
    const customAdapter = adapterRegistry.get(runtime.toLowerCase())!;
    return new customAdapter.adapterClass();
  }
  
  const detectedRuntime = (typeof runtime === 'string' ? runtime : runtime || detectRuntime()) as Runtime;
  
  switch (detectedRuntime) {
    case 'node':
      return new NodeAdapter();
    case 'deno':
      return new DenoAdapter();
    case 'bun':
      return new BunAdapter();
    default:
      // Default to Node adapter for unknown runtimes
      return new NodeAdapter();
  }
}

/**
 * Get the current runtime adapter (singleton)
 */
let currentAdapter: RuntimeAdapter | null = null;

export function getAdapter(): RuntimeAdapter {
  if (!currentAdapter) {
    currentAdapter = createAdapter();
  }
  return currentAdapter;
}

/**
 * Set a custom adapter (useful for testing)
 */
export function setAdapter(adapter: RuntimeAdapter): void {
  currentAdapter = adapter;
}

/**
 * Reset the adapter to auto-detect
 */
export function resetAdapter(): void {
  currentAdapter = null;
}

// Re-export types and base class
export { BaseRuntimeAdapter };
export type { Runtime, RuntimeAdapter };