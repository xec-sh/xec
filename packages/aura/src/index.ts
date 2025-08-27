export * from "./types.js"
export * from "./utils.js"

export * from "./app/aura.js"
export * from "./lib/index.js"
export * from "./component.js"

export * from "./app/hooks.js"
export * from "./app/context.js"
export * from "./lib/selection.js"
export * from "./app/lifecycle.js"
export * from "./renderer/buffer.js"
export * from "./lib/styled-text.js"
export * from "./app/application.js"
export * from "./renderer/native.js"
export * from "./components/index.js"

export * from "./app/control-flow.js"
export * from "./renderer/renderer.js"
export * from "./animation/timeline.js"
export * from "./lib/parse.keypress.js"
export * from "./app/reactive-bridge.js"
export * from "./renderer/text-buffer.js"
export * from "./app/screen-dimensions.js"

export * from "./renderer/console/console.js"

// Re-export commonly used reactive primitives from vibrancy
export {
  batch,
  store,
  signal,
  effect,
  untrack,
  computed,
  onCleanup,
  createRoot,
  type Signal,
  type Disposable,
  type WritableSignal
} from "vibrancy"
// Export specific types from app/types.js to avoid ComponentProps conflict
export type {
  Context,
  AuraElement,
  ComponentType,
  ReactiveProps,
  EffectCleanup,
  EffectCallback,
  ComponentPropsMap,
  ComponentInstance,
  ComponentInstanceMap,
  ComponentProps as AuraComponentProps
} from "./app/types.js"