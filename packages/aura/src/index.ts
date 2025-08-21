export * from "./lib"
export * from "./types"
export * from "./utils"
export * from "./component"
export * from "./components"

// Export the Aura app layer
// Re-export everything except types that might conflict
export * from "./app/aura.js"
export * from "./app/hooks.js"
export * from "./lib/selection"
export * from "./app/context.js"
export * from "./renderer/buffer"
export * from "./lib/styled-text"
export * from "./app/lifecycle.js"
export * from "./renderer/renderer"

export * from "./app/application.js"
export * from "./animation/timeline"
export * from "./lib/parse.keypress"
export * from "./renderer/native.js"
export * from "./app/control-flow.js"
export * from "./renderer/text-buffer"
export * from "./app/reactive-bridge.js"

export * from "./renderer/console/console.js"
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