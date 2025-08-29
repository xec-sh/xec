/**
 * Xec UI Theme Configuration
 * Based on the Material Design color palette with a dark theme
 */

import type { AuraTheme, PartialTheme } from '@xec-sh/aura';

import { createTheme as auraCreateTheme } from '@xec-sh/aura';

// Core color palette
const colors = {
  // Material Blue Grey
  blueGrey: {
    900: '#263238',
    800: '#37474f',
    700: '#455a64',
    600: '#546e7a',
    500: '#607d8b',
    400: '#78909c',
    300: '#90a4ae',
    200: '#b0bec5',
    100: '#cfd8dc',
    50: '#eceff1',
  },

  // Material Green
  green: {
    900: '#1b5e20',
    800: '#2e7d32',
    700: '#388e3c',
    600: '#43a047',
    500: '#4caf50',  // Primary
    400: '#66bb6a',
    300: '#81c784',  // Active border
    200: '#a5d6a7',
    100: '#c8e6c9',
    50: '#e8f5e9',
  },

  // Material Deep Purple
  purple: {
    900: '#311b92',
    800: '#4527a0',
    700: '#512da8',
    600: '#5e35b1',  // Title
    500: '#673ab7',
    400: '#7e57c2',
    300: '#9575cd',  // Active title
    200: '#b39ddb',
    100: '#d1c4e9',
    50: '#ede7f6',
  },

  // Semantic colors
  red: {
    500: '#f44336',
    300: '#e57373',
  },

  amber: {
    500: '#ffc107',
    300: '#ffd54f',
  },

  blue: {
    500: '#2196f3',
    300: '#64b5f6',
  },
};

/**
 * Dark theme for xec application
 * Using createTheme to properly convert colors to RGBA
 */
export const darkTheme: AuraTheme = auraCreateTheme({
  colors: {
    // Base colors
    background: 'transparent',                    // Terminal background
    foreground: colors.blueGrey[600],             // Default text
    primary: colors.green[500],                  // Primary actions
    secondary: colors.purple[600],               // Secondary elements
    accent: colors.purple[300],                  // Highlights
    muted: colors.blueGrey[600],                 // Subdued text

    // Semantic colors
    success: colors.green[500],
    warning: colors.amber[500],
    error: colors.red[500],
    info: colors.blue[500],

    // Interactive states
    focus: colors.green[300],                    // Focused elements
    selected: colors.green[500],                 // Selected items
    disabled: colors.blueGrey[700],              // Disabled elements

    // UI elements
    border: colors.blueGrey[800],                // Default borders
    selection: colors.purple[600] + '40',        // Text selection (with alpha)
    placeholder: colors.blueGrey[500],           // Input placeholders
    cursor: colors.green[300],                   // Text cursor
    description: colors.blueGrey[400],           // Secondary text
  },

  borders: {
    default: 'rounded',                           // Default rounded borders
    focused: 'rounded',                           // Keep rounded when focused
  },

  textAttributes: {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    dim: false,
    inverse: false,
    hidden: false,
    blink: false,
  },

  // Component-specific overrides
  components: {
    box: {
      background: 'transparent',
      foreground: 'foreground',
      border: 'border',
      states: {
        focused: {
          border: 'focus',
        },
        disabled: {
          border: 'disabled',
          foreground: 'disabled',
        },
      },
    },

    select: {
      background: 'transparent',
      text: 'secondary',
      border: 'border',
      states: {
        focused: {
          foreground: 'accent',
          border: 'focus',
        },
        selected: {
          foreground: 'primary',
          background: 'transparent',
        },
        disabled: {
          foreground: 'disabled',
        },
      },
      elements: {
        description: {
          text: 'description',
          selectedText: 'accent',
        },
        indicator: {
          text: 'primary',
          symbol: '�',
        },
        scrollbar: {
          track: 'muted',
          thumb: 'accent',
        },
      },
    },

    input: {
      background: 'transparent',
      foreground: 'foreground',
      placeholder: 'placeholder',
      cursor: 'cursor',
      border: 'border',
      states: {
        focused: {
          border: 'focus',
          background: colors.blueGrey[900] + '20',  // Slight tint when focused
        },
        disabled: {
          foreground: 'disabled',
          border: 'disabled',
        },
      },
    },

    tabs: {
      background: 'transparent',
      foreground: 'foreground',
      border: 'border',
      states: {
        active: {
          background: colors.purple[600] + '30',     // Highlighted tab
          foreground: 'accent',
        },
        hover: {
          background: colors.blueGrey[700] + '40',
          foreground: 'foreground',
        },
        disabled: {
          foreground: 'disabled',
        },
      },
      elements: {
        scrollIndicator: {
          left: 'accent',
          right: 'accent',
        },
      },
    },

    text: {
      foreground: 'foreground',
      selection: {
        background: 'selection',
        foreground: 'foreground',
      },
    },
  },
});

/**
 * Light theme variant (for future use)
 * Using createTheme to properly convert colors to RGBA
 */
export const lightTheme: AuraTheme = auraCreateTheme({
  colors: {
    // Base colors from dark theme
    ...Object.fromEntries(
      Object.entries(darkTheme.colors).map(([key, value]) => [
        key,
        value instanceof Object && 'r' in value ? `#${value.toHex()}` : value
      ])
    ),
    // Light theme overrides
    background: colors.blueGrey[50],
    foreground: colors.blueGrey[900],
    border: colors.blueGrey[300],
    focus: colors.green[600],
    selected: colors.green[600],
    disabled: colors.blueGrey[400],
    muted: colors.blueGrey[600],
    description: colors.blueGrey[700],
  },
  borders: darkTheme.borders,
  textAttributes: darkTheme.textAttributes,
  components: darkTheme.components,
});

/**
 * Get theme by name
 */
export function getTheme(name: 'dark' | 'light' = 'dark'): AuraTheme {
  return name === 'light' ? lightTheme : darkTheme;
}

/**
 * Export color constants for backward compatibility
 * These map to theme tokens
 */
export const UI_BORDER_COLOR = colors.blueGrey[800];
export const UI_BORDER_ACTIVE_COLOR = colors.green[300];
export const UI_TITLE_ACTIVE_COLOR = colors.purple[300];
export const UI_TITLE_COLOR = colors.purple[600];
export const UI_PRIMARY_COLOR = colors.green[500];

/**
 * Create a custom theme with overrides
 */
export function createCustomTheme(overrides: PartialTheme): AuraTheme {
  // Use auraCreateTheme to properly convert colors
  return auraCreateTheme({
    colors: {
      // Convert RGBA objects back to hex strings for merging
      ...Object.fromEntries(
        Object.entries(darkTheme.colors).map(([key, value]) => [
          key,
          value instanceof Object && 'r' in value ? `#${value.toHex()}` : value
        ])
      ),
      ...(overrides.colors || {}),
    },
    borders: {
      ...darkTheme.borders,
      ...(overrides.borders || {}),
    },
    textAttributes: {
      ...darkTheme.textAttributes,
      ...(overrides.textAttributes || {}),
    },
    components: {
      ...darkTheme.components,
      ...(overrides.components || {}),
    },
  });
}

/**
 * Theme presets
 */
export const themes = {
  dark: darkTheme,
  light: lightTheme,

  // Additional preset themes using createCustomTheme
  ocean: createCustomTheme({
    colors: {
      primary: '#00bcd4',
      secondary: '#0097a7',
      accent: '#00e5ff',
      focus: '#00acc1',
      border: '#006064',
    },
  }),

  forest: createCustomTheme({
    colors: {
      primary: '#689f38',
      secondary: '#558b2f',
      accent: '#8bc34a',
      focus: '#7cb342',
      border: '#33691e',
    },
  }),

  sunset: createCustomTheme({
    colors: {
      primary: '#ff6f00',
      secondary: '#e65100',
      accent: '#ff9100',
      focus: '#ff8f00',
      border: '#bf360c',
    },
  }),
};

// Export default theme
export default darkTheme;