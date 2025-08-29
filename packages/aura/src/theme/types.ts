/**
 * Aura Terminal Theming System - Type Definitions
 * Phase 1: Core Theme System
 */

import type { RGBA } from '../lib/colors.js';

/**
 * Theme color value that can be either an RGBA object, hex string, or theme token
 */
export type ThemeColor = RGBA | string;

/**
 * Theme border style options for terminal box-drawing
 */
export type ThemeBorderStyle = 
  | 'single'   // ┌─┐│└┘
  | 'double'   // ╔═╗║╚╝
  | 'rounded'  // ╭─╮│╰╯
  | 'bold'     // ┏━┓┃┗┛
  | 'ascii'    // +-+|++
  | 'none';    // No border

/**
 * Theme text attribute options for terminal text styling
 */
export interface ThemeTextAttributes {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  dim?: boolean;
  inverse?: boolean;
  hidden?: boolean;
  blink?: boolean;
}

/**
 * Core color tokens for the theme system
 */
export interface ThemeColors {
  // Base colors
  background: ThemeColor;       // Default background
  foreground: ThemeColor;       // Default text
  primary: ThemeColor;          // Primary brand color
  secondary: ThemeColor;        // Secondary brand color
  accent: ThemeColor;           // Accent/highlight color
  muted: ThemeColor;            // Subdued elements
  
  // Semantic colors
  success: ThemeColor;          // Success states
  warning: ThemeColor;          // Warning states
  error: ThemeColor;            // Error states
  info: ThemeColor;             // Informational
  
  // Interactive states
  focus: ThemeColor;            // Focused element border/highlight
  selected: ThemeColor;         // Selected item background
  disabled: ThemeColor;         // Disabled element color
  
  // UI elements
  border: ThemeColor;           // Default border color
  selection: ThemeColor;        // Text selection background
  placeholder: ThemeColor;      // Input placeholder text
  cursor: ThemeColor;           // Text cursor color
  description: ThemeColor;      // Secondary/description text
}

/**
 * Border configuration for the theme
 */
export interface ThemeBorders {
  default: ThemeBorderStyle;    // Default border style
  focused?: ThemeBorderStyle;   // Style when focused
}

/**
 * Component-specific theme overrides
 */
export interface ComponentThemeOverrides {
  box?: Partial<BoxTheme>;
  select?: Partial<SelectTheme>;
  input?: Partial<InputTheme>;
  tabs?: Partial<TabsTheme>;
  text?: Partial<TextTheme>;
}

/**
 * Theme state-based colors for interactive components
 */
export interface ThemeStateColors {
  background?: ThemeColor;
  foreground?: ThemeColor;
  border?: ThemeColor;
}

/**
 * Box component theme
 */
export interface BoxTheme {
  background: ThemeColor;
  foreground: ThemeColor;
  border?: ThemeColor;
  states?: {
    focused?: ThemeStateColors;
    disabled?: ThemeStateColors;
  };
}

/**
 * Select component theme
 */
export interface SelectTheme {
  // Base styling
  background: ThemeColor;
  text: ThemeColor;
  border?: ThemeColor;
  
  // State variants
  states?: {
    focused?: ThemeStateColors;
    selected?: ThemeStateColors;
    disabled?: ThemeStateColors;
  };
  
  // Sub-element styling
  elements?: {
    description?: {
      text: ThemeColor;
      selectedText?: ThemeColor;
    };
    indicator?: {
      text: ThemeColor;
      symbol?: string;
    };
    scrollbar?: {
      track?: ThemeColor;
      thumb?: ThemeColor;
    };
  };
}

/**
 * Input component theme
 */
export interface InputTheme {
  background: ThemeColor;
  foreground: ThemeColor;
  placeholder?: ThemeColor;
  cursor?: ThemeColor;
  border?: ThemeColor;
  states?: {
    focused?: ThemeStateColors;
    disabled?: ThemeStateColors;
  };
}

/**
 * Tabs component theme
 */
export interface TabsTheme {
  background: ThemeColor;
  foreground: ThemeColor;
  border?: ThemeColor;
  states?: {
    active?: ThemeStateColors;
    hover?: ThemeStateColors;
    disabled?: ThemeStateColors;
  };
  elements?: {
    scrollIndicator?: {
      left?: ThemeColor;
      right?: ThemeColor;
    };
  };
}

/**
 * Text component theme
 */
export interface TextTheme {
  foreground: ThemeColor;
  background?: ThemeColor;
  selection?: {
    background?: ThemeColor;
    foreground?: ThemeColor;
  };
}

/**
 * Complete Aura theme object
 */
export interface AuraTheme {
  // Semantic color tokens
  colors: ThemeColors;
  
  // Text attributes (terminal capabilities)
  textAttributes?: ThemeTextAttributes;
  
  // Border styles (box-drawing characters)
  borders?: ThemeBorders;
  
  // Component-specific overrides (optional)
  components?: ComponentThemeOverrides;
}

/**
 * Partial theme for extending or overriding
 */
export type PartialTheme = {
  colors?: Partial<ThemeColors>;
  textAttributes?: Partial<ThemeTextAttributes>;
  borders?: Partial<ThemeBorders>;
  components?: Partial<ComponentThemeOverrides>;
};

/**
 * Color token type - can be a key from ThemeColors or a direct color
 */
export type ColorToken = keyof ThemeColors | ThemeColor;

/**
 * Theme provider props
 */
export interface ThemeProviderProps {
  theme: AuraTheme | PartialTheme;
  children?: any;
}