/**
 * Aura Terminal Theming System - Main Export
 * Phase 1: Core Theme System
 */

// Theme creation and management
export {
  themes,
  createTheme,
  extendTheme,
  normalizeColor
} from './create-theme.js';

// Theme context and state management
export {
  useTheme,
  resolveColor,
  ThemeContext,
  ThemeProvider,
  getGlobalTheme,
  setGlobalTheme,
  initializeTheme,
  extendGlobalTheme,
  createThemeProvider
} from './context.js';

// Theme utilities
export {
  darken,
  lighten,

  withAlpha,
  mixColors,
  // Color manipulation
  mergeColors,
  isLightColor,
  hasTransparency,
  // State management
  applyStateColors,
  getContrastRatio,
  getComponentState,
  getContrastingText,

  // Border utilities
  getBorderCharacters
} from './utils.js';

// Type exports
export type {
  BoxTheme,
  // Core types
  AuraTheme,
  TabsTheme,
  TextTheme,
  ThemeColor,
  ColorToken,
  InputTheme,
  ThemeColors,

  SelectTheme,
  PartialTheme,
  ThemeBorders,
  ThemeBorderStyle,
  // State types
  ThemeStateColors,
  // Provider types
  ThemeProviderProps,

  ThemeTextAttributes,

  // Component themes
  ComponentThemeOverrides
} from './types.js';