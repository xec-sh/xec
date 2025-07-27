/**
 * Interface for objects that need to clean up resources
 */
export interface Disposable {
  /**
   * Dispose of the resources held by this object.
   * After calling dispose, the object should not be used.
   * 
   * @returns A promise that resolves when the resource has been disposed
   */
  dispose(): Promise<void>;
}

/**
 * Interface for objects that can track disposable resources
 */
export interface DisposableContainer {
  /**
   * Register a disposable resource for automatic cleanup
   */
  registerDisposable(disposable: Disposable): void;
  
  /**
   * Unregister a disposable resource
   */
  unregisterDisposable(disposable: Disposable): void;
  
  /**
   * Dispose all registered resources
   */
  disposeAll(): Promise<void>;
}

/**
 * Type guard to check if an object is disposable
 */
export function isDisposable(obj: any): obj is Disposable {
  return obj != null && (typeof obj === 'object' || typeof obj === 'function') && typeof obj.dispose === 'function';
}