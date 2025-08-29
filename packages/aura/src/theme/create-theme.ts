/**
 * Aura Terminal Theming System - Theme Creation
 * Phase 1: Core Theme System
 */

import { RGBA } from '../lib/colors.js';

import type {
  AuraTheme,
  ThemeColor,
  ThemeColors,
  PartialTheme,
  ThemeBorders,
  ThemeTextAttributes,
  ComponentThemeOverrides
} from './types.js';

/**
 * Default theme colors
 */
const defaultColors: ThemeColors = {
  // Base colors
  background: RGBA.fromHex('#1a1a1a'),
  foreground: RGBA.fromHex('#e0e0e0'),
  primary: RGBA.fromHex('#00aaff'),
  secondary: RGBA.fromHex('#ff6b6b'),
  accent: RGBA.fromHex('#4ecdc4'),
  muted: RGBA.fromHex('#666666'),

  // Semantic colors
  success: RGBA.fromHex('#00ff88'),
  warning: RGBA.fromHex('#ffaa00'),
  error: RGBA.fromHex('#ff4444'),
  info: RGBA.fromHex('#00aaff'),

  // Interactive states
  focus: RGBA.fromHex('#00aaff'),
  selected: RGBA.fromHex('#334455'),
  disabled: RGBA.fromHex('#666666'),

  // UI elements
  border: RGBA.fromHex('#333333'),
  selection: RGBA.fromHex('#334455'),
  placeholder: RGBA.fromHex('#888888'),
  cursor: RGBA.fromHex('#ffffff'),
  description: RGBA.fromHex('#aaaaaa')
};

/**
 * Default text attributes
 */
const defaultTextAttributes: ThemeTextAttributes = {
  bold: true,
  italic: true,
  underline: true,
  strikethrough: true
};

/**
 * Default border styles
 */
const defaultBorders: ThemeBorders = {
  default: 'single',
  focused: 'double'
};

/**
 * Normalize a color value to RGBA
 * @param color - Color value (RGBA, hex string, or theme token)
 * @returns Normalized RGBA color
 */
export function normalizeColor(color: ThemeColor, themeColors?: ThemeColors): RGBA {
  if (color instanceof RGBA) {
    return color;
  }

  if (typeof color === 'string') {
    // Handle 'transparent' special case
    if (color === 'transparent') {
      return RGBA.fromValues(0, 0, 0, 0);
    }

    // Check if it's a hex color with # prefix
    if (color.startsWith('#')) {
      return RGBA.fromHex(color);
    }

    // Check if it's a hex color without # prefix (6 or 8 characters)
    // This handles cases like "45546440" (RRGGBBAA format without #)
    if (/^[0-9A-Fa-f]{6}$/.test(color) || /^[0-9A-Fa-f]{8}$/.test(color)) {
      return RGBA.fromHex(color);
    }

    // Try to resolve as a theme token if themeColors provided
    if (themeColors && color in themeColors) {
      const resolved = themeColors[color as keyof ThemeColors];
      if (resolved instanceof RGBA) {
        return resolved;
      }
    }

    // Otherwise treat as a theme token (will be resolved by theme context)
    // Return a reasonable default instead of white
    return defaultColors.foreground as RGBA;
  }

  throw new Error(`Invalid color value: ${color}`);
}

/**
 * Validate a theme colors object
 * @param colors - Theme colors to validate
 * @returns Validated theme colors
 */
function validateThemeColors(colors: Partial<ThemeColors>): ThemeColors {
  const validated: ThemeColors = { ...defaultColors };

  for (const [key, value] of Object.entries(colors)) {
    if (value !== undefined) {
      try {
        validated[key as keyof ThemeColors] = normalizeColor(value, validated);
      } catch (error) {
        console.warn(`Invalid color for theme key '${key}':`, error);
      }
    }
  }

  return validated;
}

/**
 * Create a complete theme object with defaults
 * @param theme - Partial theme configuration
 * @returns Complete AuraTheme object
 */
export function createTheme(theme?: PartialTheme): AuraTheme {
  // Start with defaults
  const completeTheme: AuraTheme = {
    colors: defaultColors,
    textAttributes: defaultTextAttributes,
    borders: defaultBorders,
    components: {}
  };

  if (!theme) {
    return completeTheme;
  }

  // Merge colors
  if (theme.colors) {
    completeTheme.colors = validateThemeColors(theme.colors);
  }

  // Merge text attributes
  if (theme.textAttributes) {
    completeTheme.textAttributes = {
      ...defaultTextAttributes,
      ...theme.textAttributes
    };
  }

  // Merge borders
  if (theme.borders) {
    completeTheme.borders = {
      ...defaultBorders,
      ...theme.borders
    };
  }

  // Merge components
  if (theme.components) {
    completeTheme.components = {
      ...completeTheme.components,
      ...theme.components
    };
  }

  return completeTheme;
}

/**
 * Extend an existing theme with partial overrides
 * @param baseTheme - Base theme to extend
 * @param overrides - Partial theme overrides
 * @returns Extended theme
 */
export function extendTheme(
  baseTheme: AuraTheme,
  overrides: PartialTheme
): AuraTheme {
  const extendedTheme: AuraTheme = {
    colors: { ...baseTheme.colors },
    textAttributes: { ...baseTheme.textAttributes },
    borders: baseTheme.borders ? { ...baseTheme.borders } : { default: 'single' },
    components: { ...baseTheme.components }
  };

  // Merge colors
  if (overrides.colors) {
    const validatedColors = {} as ThemeColors;
    for (const [key, value] of Object.entries(overrides.colors)) {
      if (value !== undefined) {
        try {
          validatedColors[key as keyof ThemeColors] = normalizeColor(value, extendedTheme.colors);
        } catch (error) {
          console.warn(`Invalid color for theme key '${key}':`, error);
        }
      }
    }
    Object.assign(extendedTheme.colors, validatedColors);
  }

  // Merge text attributes
  if (overrides.textAttributes && extendedTheme.textAttributes) {
    Object.assign(extendedTheme.textAttributes, overrides.textAttributes);
  } else if (overrides.textAttributes) {
    extendedTheme.textAttributes = overrides.textAttributes;
  }

  // Merge borders
  if (overrides.borders && extendedTheme.borders) {
    Object.assign(extendedTheme.borders, overrides.borders);
  } else if (overrides.borders) {
    extendedTheme.borders = { default: 'single', ...overrides.borders };
  }

  // Deep merge components
  if (overrides.components) {
    if (!extendedTheme.components) {
      extendedTheme.components = {};
    }

    for (const [component, componentTheme] of Object.entries(overrides.components)) {
      if (componentTheme) {
        const key = component as keyof ComponentThemeOverrides;
        (extendedTheme.components as any)[key] = {
          ...(extendedTheme.components as any)[key],
          ...componentTheme
        };
      }
    }
  }

  return extendedTheme;
}

/**
 * Preset themes
 */
export const themes = {
  /**
   * Default dark theme
   */
  dark: createTheme(),

  /**
   * Light theme for terminals with light backgrounds
   */
  light: createTheme({
    colors: {
      background: RGBA.fromHex('#ffffff'),
      foreground: RGBA.fromHex('#2a2a2a'),
      primary: RGBA.fromHex('#0066cc'),
      secondary: RGBA.fromHex('#cc3333'),
      accent: RGBA.fromHex('#00aa55'),
      muted: RGBA.fromHex('#f0f0f0'),
      success: RGBA.fromHex('#00aa00'),
      warning: RGBA.fromHex('#cc8800'),
      error: RGBA.fromHex('#cc0000'),
      info: RGBA.fromHex('#0066cc'),
      focus: RGBA.fromHex('#0066cc'),
      selected: RGBA.fromHex('#e0e8f0'),
      disabled: RGBA.fromHex('#cccccc'),
      border: RGBA.fromHex('#cccccc'),
      selection: RGBA.fromHex('#b0c4de'),
      placeholder: RGBA.fromHex('#999999'),
      cursor: RGBA.fromHex('#000000'),
      description: RGBA.fromHex('#666666')
    },
    borders: {
      default: 'single',
      focused: 'bold'
    }
  }),

  /**
   * High contrast theme for accessibility
   */
  highContrast: createTheme({
    colors: {
      background: RGBA.fromHex('#000000'),
      foreground: RGBA.fromHex('#ffffff'),
      primary: RGBA.fromHex('#ffff00'),
      secondary: RGBA.fromHex('#ff00ff'),
      accent: RGBA.fromHex('#00ffff'),
      muted: RGBA.fromHex('#333333'),
      success: RGBA.fromHex('#00ff00'),
      warning: RGBA.fromHex('#ff8800'),
      error: RGBA.fromHex('#ff0000'),
      info: RGBA.fromHex('#0088ff'),
      focus: RGBA.fromHex('#ffff00'),
      selected: RGBA.fromHex('#444444'),
      disabled: RGBA.fromHex('#555555'),
      border: RGBA.fromHex('#ffffff'),
      selection: RGBA.fromHex('#ffff00').withAlpha(0.3),
      placeholder: RGBA.fromHex('#aaaaaa'),
      cursor: RGBA.fromHex('#ffff00'),
      description: RGBA.fromHex('#cccccc')
    },
    borders: {
      default: 'double',
      focused: 'bold'
    },
    textAttributes: {
      bold: true,
      underline: true
    }
  })
};