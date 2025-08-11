/**
 * Store - Global state management with nested reactivity
 */

import { batch } from './batch.js';
import { signal, type WritableSignal } from './signal.js';

import type { Store } from '../../types.js';

class StoreImpl<T extends object> implements Store<T> {
  private signals: Map<keyof T, WritableSignal<any>> = new Map();
  private data: T;
  private subscribers = new Set<(state: T) => void>();

  constructor(initial: T) {
    this.data = { ...initial };
    
    // Create signals for each property
    for (const key in initial) {
      if (initial.hasOwnProperty(key)) {
        this.signals.set(key, signal(initial[key]));
      }
    }
  }

  get<K extends keyof T>(key: K): T[K] {
    const sig = this.signals.get(key);
    return sig ? sig() : this.data[key];
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    const sig = this.signals.get(key);
    if (sig) {
      sig.set(value);
    } else {
      // Create new signal for new property
      this.signals.set(key, signal(value));
    }
    
    this.data[key] = value;
    this.notify();
  }

  update(updates: Partial<T>): void {
    batch(() => {
      for (const key in updates) {
        if (updates.hasOwnProperty(key)) {
          this.set(key, updates[key]!);
        }
      }
    });
  }

  subscribe(fn: (state: T) => void): () => void {
    this.subscribers.add(fn);
    
    // Return unsubscribe function
    return () => {
      this.subscribers.delete(fn);
    };
  }

  transaction(fn: (state: T) => void): void {
    batch(() => {
      const proxy = new Proxy(this.data, {
        set: (_target, prop, value) => {
          this.set(prop as keyof T, value);
          return true;
        },
        get: (_target, prop) => this.get(prop as keyof T)
      });
      
      fn(proxy);
    });
  }

  private notify(): void {
    const state = { ...this.data };
    for (const subscriber of this.subscribers) {
      subscriber(state);
    }
  }
}

/**
 * Create a reactive store
 */
export function store<T extends object>(initial: T): Store<T> {
  return new StoreImpl(initial);
}

export type { Store } from '../../types.js';