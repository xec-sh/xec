/**
 * Aura Next - Lifecycle Hooks
 * Component lifecycle management integrated with NeoFlux
 */

import {
  effect,
  getCurrentComponent,
  onMount as neoFluxOnMount,
  onUpdate as neoFluxOnUpdate,
  onCleanup as neoFluxOnCleanup
} from 'vibrancy';

import type { EffectCleanup, EffectCallback } from './types.js';

/**
 * Register a callback to run when the component is mounted
 */
export function onMount(callback: EffectCallback): void {
  neoFluxOnMount(() => {
    const cleanup = callback();
    if (cleanup) {
      neoFluxOnCleanup(cleanup);
    }
  });
}

/**
 * Register a callback to run when the component is cleaned up
 */
export function onCleanup(callback: () => void): void {
  neoFluxOnCleanup(callback);
}

/**
 * Register a callback to run when the component updates
 */
export function onUpdate(callback: () => void): void {
  neoFluxOnUpdate(callback);
}

/**
 * Create an effect that automatically cleans up when the component unmounts
 */
export function useEffect(callback: EffectCallback, deps?: any[]): void {
  let cleanup: EffectCleanup;

  const dispose = effect(() => {
    // Clean up previous effect
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }

    // Run new effect
    cleanup = callback();
  });

  // Register cleanup
  onCleanup(() => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
    if (dispose && typeof dispose.dispose === 'function') {
      dispose.dispose();
    }
  });
}

/**
 * Register a callback to run on the next frame
 */
export function onFrame(callback: () => void): void {
  const handle = setImmediate(callback);
  onCleanup(() => clearImmediate(handle));
}

/**
 * Register a callback to run after a delay
 */
export function onTimeout(callback: () => void, delay: number): void {
  const handle = setTimeout(callback, delay);
  onCleanup(() => clearTimeout(handle));
}

/**
 * Register a callback to run at an interval
 */
export function onInterval(callback: () => void, interval: number): void {
  const handle = setInterval(callback, interval);
  onCleanup(() => clearInterval(handle));
}

/**
 * Register event listeners that automatically clean up
 */
export function onEvent<K extends keyof GlobalEventHandlersEventMap>(
  target: EventTarget,
  event: K,
  handler: (event: GlobalEventHandlersEventMap[K]) => void,
  options?: AddEventListenerOptions
): void {
  target.addEventListener(event, handler as any, options);
  onCleanup(() => {
    target.removeEventListener(event, handler as any, options);
  });
}

/**
 * Register process event listeners
 */
export function onProcessEvent(
  event: 'exit' | 'SIGINT' | 'SIGTERM' | 'uncaughtException' | 'unhandledRejection',
  handler: (...args: any[]) => void
): void {
  process.on(event, handler);
  onCleanup(() => {
    process.off(event, handler);
  });
}

/**
 * Focus management hooks
 */
let focusedComponent: any = null;

export function onFocus(callback: () => void): void {
  const component = getCurrentComponent();
  if (!component) return;

  (component as any).onFocus = () => {
    focusedComponent = component;
    callback();
  };
}

export function onBlur(callback: () => void): void {
  const component = getCurrentComponent();
  if (!component) return;

  (component as any).onBlur = () => {
    if (focusedComponent === component) {
      focusedComponent = null;
    }
    callback();
  };
}

export function getFocusedComponent(): any {
  return focusedComponent;
}

export function setFocus(component: any): void {
  if (focusedComponent && focusedComponent.onBlur) {
    focusedComponent.onBlur();
  }

  focusedComponent = component;

  if (component && component.onFocus) {
    component.onFocus();
  }
}