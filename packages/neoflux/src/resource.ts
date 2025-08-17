/**
 * Resource - Manage async data with loading and error states
 */

import { batch } from './batch.js';
import { effect } from './effect.js';
import { computed } from './computed.js';
import { signal, type WritableSignal } from './signal.js';

import type { Resource } from './types.js';

interface ResourceState<T> {
  data?: T;
  loading: boolean;
  error?: Error;
}

class ResourceImpl<T> {
  private state: WritableSignal<ResourceState<T>>;
  private fetcher: () => Promise<T>;
  private dataSignal: any;
  private loadingSignal: any;
  private errorSignal: any;
  private fetchId = 0;

  constructor(fetcher: () => Promise<T>) {
    this.fetcher = fetcher;
    this.state = signal<ResourceState<T>>({
      loading: true,
      data: undefined,
      error: undefined
    });
    
    // Create reactive signals for each property
    this.dataSignal = computed(() => this.state().data);
    this.loadingSignal = computed(() => this.state().loading);
    this.errorSignal = computed(() => this.state().error);
    
    // Track execution count to detect refetches
    let executionCount = 0;
    
    // Create a signal to track when we should fetch
    const fetchTrigger = signal(0);
    
    // Use a computed to track the fetcher's dependencies
    const trackedDeps = computed(() => {
      // Run the fetcher to track dependencies
      // We need to wrap this in a try-catch since the fetcher might throw synchronously
      try {
        const result = this.fetcher();
        // Increment the trigger to cause refetch
        if (executionCount > 0) {
          // Dependencies changed, trigger a refetch
          fetchTrigger.set(fetchTrigger.peek() + 1);
        }
        return result;
      } catch (e) {
        // If the fetcher throws synchronously, still trigger
        if (executionCount > 0) {
          fetchTrigger.set(fetchTrigger.peek() + 1);
        }
        throw e;
      }
    });
    
    // Use an effect to handle the actual fetching
    effect(() => {
      // Track the trigger
      fetchTrigger();
      
      // Increment fetch ID to cancel stale fetches
      const currentFetchId = ++this.fetchId;
      
      // Set loading immediately (except on first run where it's already true)
      if (executionCount > 0) {
        this.state.set({
          loading: true,
          data: this.state.peek().data,
          error: undefined
        });
      }
      
      executionCount++;
      
      // Execute the fetcher
      try {
        // Access the tracked deps to get the result
        const result = trackedDeps();
        
        // Handle the promise result
        Promise.resolve(result)
          .then(data => {
            // Only update if this is still the latest fetch
            if (currentFetchId === this.fetchId) {
              batch(() => {
                this.state.set({
                  loading: false,
                  data,
                  error: undefined
                });
              });
            }
          })
          .catch(error => {
            // Only update if this is still the latest fetch  
            if (currentFetchId === this.fetchId) {
              batch(() => {
                this.state.set({
                  loading: false,
                  data: undefined,
                  error: error as Error
                });
              });
            }
          });
      } catch (error) {
        // Handle synchronous errors
        if (currentFetchId === this.fetchId) {
          batch(() => {
            this.state.set({
              loading: false,
              data: undefined,
              error: error as Error
            });
          });
        }
      }
    }, { defer: false }); // Don't defer - run synchronously on dependency changes
  }


  call(): T | undefined {
    return this.dataSignal();
  }

  loading(): boolean {
    return this.loadingSignal();
  }

  error(): Error | undefined {
    return this.errorSignal();
  }

  async refetch(): Promise<void> {
    batch(() => {
      this.state.set({
        loading: true,
        data: this.state.peek().data,
        error: undefined
      });
    });
    
    try {
      const data = await this.fetcher();
      batch(() => {
        this.state.set({
          loading: false,
          data,
          error: undefined
        });
      });
    } catch (error) {
      batch(() => {
        this.state.set({
          loading: false,
          data: undefined,
          error: error as Error
        });
      });
    }
  }

}

/**
 * Create a resource for async data
 */
export function resource<T>(fetcher: () => Promise<T>): Resource<T> {
  const r = new ResourceImpl(fetcher);

  // Create callable interface
  const callable = Object.assign(
    () => r.call(),
    {
      loading: () => r.loading(),
      error: () => r.error(),
      refetch: () => r.refetch()
    }
  );

  return callable as Resource<T>;
}

export type { Resource } from './types.js';