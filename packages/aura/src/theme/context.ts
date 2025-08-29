/**
 * Aura Terminal Theming System - Theme Context
 * Phase 1: Core Theme System
 */

import { signal, type Signal, type WritableSignal } from 'vibrancy';

import { RGBA } from '../lib/colors.js';
import { createTheme, extendTheme, normalizeColor } from './create-theme.js';
import { useContext, createContext, setContextValue } from '../app/context.js';

import type { AuraTheme, ColorToken, ThemeColors, PartialTheme } from './types.js';

/**
 * Theme context value
 */
export interface ThemeContextValue extends AuraTheme {
  theme: Signal<AuraTheme>;
  setTheme: (theme: AuraTheme | PartialTheme) => void;
  extendTheme: (overrides: PartialTheme) => void;
  resolveColor: (color: ColorToken) => RGBA;
}

/**
 * Create the theme context
 */
// Create context with a default value that matches ThemeContextValue
const defaultTheme = createTheme({});
const defaultThemeContext: ThemeContextValue = {
  ...defaultTheme,
  theme: signal(defaultTheme),
  setTheme: () => { },
  extendTheme: () => { },
  resolveColor: (color: ColorToken) => normalizeColor(color)
};

const ThemeContext = createContext<ThemeContextValue>(defaultThemeContext);

/**
 * Global theme signal
 */
let globalTheme: WritableSignal<AuraTheme> | null = null;

/**
 * Update the theme context with a new theme
 * @param theme - The theme to set in the context
 */
function updateThemeContext(theme: AuraTheme): void {
  const themeContextValue: ThemeContextValue = {
    ...theme,
    theme: globalTheme || signal(theme),
    setTheme: setGlobalTheme,
    extendTheme: extendGlobalTheme,
    resolveColor: (color: ColorToken) => resolveColor(color, theme)
  };
  setContextValue(ThemeContext, themeContextValue);
}

/**
 * Initialize the global theme
 * @param initialTheme - Initial theme configuration
 */
export function initializeTheme(initialTheme?: AuraTheme | PartialTheme): void {
  if (!globalTheme) {
    const theme = initialTheme instanceof Object && 'colors' in initialTheme && initialTheme.colors
      ? initialTheme as AuraTheme
      : createTheme(initialTheme as PartialTheme);
    globalTheme = signal(theme);

    // Also update the context with the initialized theme
    updateThemeContext(theme);
  } else if (initialTheme) {
    // Update existing theme
    const theme = initialTheme instanceof Object && 'colors' in initialTheme && initialTheme.colors
      ? initialTheme as AuraTheme
      : createTheme(initialTheme as PartialTheme);
    globalTheme.set(theme);

    // Also update the context with the new theme
    updateThemeContext(theme);
  }
}

/**
 * Get the current global theme
 * @returns Current theme or default if not initialized
 */
export function getGlobalTheme(): AuraTheme {
  if (!globalTheme) {
    initializeTheme();
  }
  return globalTheme!();
}

/**
 * Set the global theme
 * @param theme - New theme configuration
 */
export function setGlobalTheme(theme: AuraTheme | PartialTheme): void {
  if (!globalTheme) {
    initializeTheme(theme);
  } else {
    const newTheme = theme instanceof Object && 'colors' in theme && theme.colors
      ? theme as AuraTheme
      : createTheme(theme as PartialTheme);
    globalTheme.set(newTheme);

    // Also update the context with the new theme
    updateThemeContext(newTheme);
  }
}

/**
 * Extend the current global theme
 * @param overrides - Partial theme overrides
 */
export function extendGlobalTheme(overrides: PartialTheme): void {
  const currentTheme = getGlobalTheme();
  const newTheme = extendTheme(currentTheme, overrides);
  setGlobalTheme(newTheme);  // This will also update the context
}

/**
 * Resolve a color token to an RGBA value
 * @param color - Color token or direct color value
 * @param theme - Optional theme to resolve from (defaults to global)
 * @returns Resolved RGBA color
 */
export function resolveColor(color: ColorToken, theme?: AuraTheme | ThemeContextValue): RGBA {
  const currentTheme = theme || getGlobalTheme();

  // If it's already an RGBA, return it
  if (color instanceof RGBA) {
    return color;
  }

  // If it's a string
  if (typeof color === 'string') {
    // Handle 'transparent' special case
    if (color === 'transparent') {
      return RGBA.fromValues(0, 0, 0, 0);
    }

    // Check if it's a hex color
    if (color.startsWith('#')) {
      return RGBA.fromHex(color);
    }

    // Try to resolve as a theme token
    const themeColor = currentTheme.colors[color as keyof ThemeColors];
    if (themeColor) {
      return normalizeColor(themeColor);
    }

    // If not found, try to parse as hex anyway
    try {
      return RGBA.fromHex(color);
    } catch {
      // Default to white if all else fails
      console.warn(`Unable to resolve color: ${color}`);
      return RGBA.fromHex('#ffffff');
    }
  }

  throw new Error(`Invalid color value: ${color}`);
}

/**
 * Use the theme context
 * @returns Theme context value
 */
export function useTheme(): ThemeContextValue {
  const contextSignal = useContext(ThemeContext);
  const context = contextSignal();

  if (!context) {
    // Return global theme utilities if no context
    if (!globalTheme) {
      initializeTheme();
    }

    const currentTheme = getGlobalTheme();
    return {
      ...currentTheme,
      theme: globalTheme!,
      setTheme: setGlobalTheme,
      extendTheme: extendGlobalTheme,
      resolveColor: (color: ColorToken) => resolveColor(color)
    };
  }

  return context;
}

/**
 * Theme provider component props
 */
export interface ThemeProviderProps {
  theme?: AuraTheme | PartialTheme;
  children?: any;
}

/**
 * Create a theme provider value
 * @param theme - Theme configuration
 * @returns Theme context value
 */
export function createThemeProvider(theme?: AuraTheme | PartialTheme): ThemeContextValue {
  const resolvedTheme = theme instanceof Object && 'colors' in theme && theme.colors
    ? theme as AuraTheme
    : createTheme(theme as PartialTheme);
  const themeSignal = signal(resolvedTheme);

  return {
    ...resolvedTheme,
    theme: themeSignal,
    setTheme: (newTheme: AuraTheme | PartialTheme) => {
      const resolvedNewTheme = newTheme instanceof Object && 'colors' in newTheme && newTheme.colors
        ? newTheme as AuraTheme
        : createTheme(newTheme as PartialTheme);
      themeSignal.set(resolvedNewTheme);
    },
    extendTheme: (overrides: PartialTheme) => {
      const current = themeSignal();
      const extended = extendTheme(current, overrides);
      themeSignal.set(extended);
    },
    resolveColor: (color: ColorToken) => resolveColor(color, themeSignal())
  };
}

/**
 * Provide theme context
 * Note: This would be used with a ThemeProvider component in a full implementation
 */
export const ThemeProvider = ThemeContext.Provider;

/**
 * Export the context for direct use if needed
 */
export { ThemeContext };