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

// Export from theme but avoid duplicates
export {
  themes,
  darken,
  lighten,
  useTheme,
  withAlpha,
  mixColors,
  // Theme functions
  createTheme,
  extendTheme,
  mergeColors,
  resolveColor,
  ThemeContext,
  isLightColor,
  type BoxTheme,

  ThemeProvider,
  // Theme types (not BorderStyle, Color, TextAttributes - already exported from other modules)
  type AuraTheme,
  type TabsTheme,
  type TextTheme,
  normalizeColor,
  getGlobalTheme,
  setGlobalTheme,
  type ColorToken,
  type InputTheme,
  initializeTheme,
  hasTransparency,
  type ThemeColors,
  type SelectTheme,

  // Theme utilities
  applyStateColors,
  getContrastRatio,
  type PartialTheme,
  type ThemeBorders,
  extendGlobalTheme,
  getComponentState,
  getContrastingText,
  createThemeProvider,
  getBorderCharacters,
  type ThemeStateColors,
  type ThemeProviderProps,
  type ComponentThemeOverrides
} from "./theme/index.js"
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