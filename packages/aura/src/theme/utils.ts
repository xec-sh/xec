/**
 * Aura Terminal Theming System - Utilities
 * Phase 1: Core Theme System
 */

import { RGBA } from '../lib/colors.js';
import { resolveColor } from './context.js';

import type {
  AuraTheme,
  ThemeColor,
  ColorToken,
  ThemeStateColors,
  ThemeBorderStyle
} from './types.js';

/**
 * Apply state-based colors based on component state
 * @param base - Base colors
 * @param states - State-specific color overrides
 * @param currentState - Current component state
 * @param theme - Optional theme to resolve colors from
 * @returns Resolved colors for the current state
 */
export function applyStateColors(
  base: ThemeStateColors,
  states: Record<string, ThemeStateColors | undefined> | undefined,
  currentState: string,
  theme?: AuraTheme
): { background?: RGBA; foreground?: RGBA; border?: RGBA } {
  const result: { background?: RGBA; foreground?: RGBA; border?: RGBA } = {};

  // Apply base colors
  if (base.background) {
    result.background = resolveColor(base.background, theme);
  }
  if (base.foreground) {
    result.foreground = resolveColor(base.foreground, theme);
  }
  if (base.border) {
    result.border = resolveColor(base.border, theme);
  }

  // Apply state-specific overrides
  if (states && states[currentState]) {
    const stateColors = states[currentState];
    if (stateColors?.background) {
      result.background = resolveColor(stateColors.background, theme);
    }
    if (stateColors?.foreground) {
      result.foreground = resolveColor(stateColors.foreground, theme);
    }
    if (stateColors?.border) {
      result.border = resolveColor(stateColors.border, theme);
    }
  }

  return result;
}

/**
 * Get component state based on focus and selection
 * @param focused - Whether component is focused
 * @param selected - Whether component is selected
 * @param disabled - Whether component is disabled
 * @returns State name
 */
export function getComponentState(
  focused?: boolean,
  selected?: boolean,
  disabled?: boolean
): string {
  if (disabled) return 'disabled';
  if (selected) return 'selected';
  if (focused) return 'focused';
  return 'default';
}

/**
 * Merge multiple color values, with later values taking precedence
 * @param colors - Color values to merge
 * @param theme - Optional theme to resolve colors from
 * @returns Merged color
 */
export function mergeColors(
  colors: (ThemeColor | undefined)[],
  theme?: AuraTheme
): RGBA | undefined {
  for (let i = colors.length - 1; i >= 0; i--) {
    const color = colors[i];
    if (color !== undefined) {
      return resolveColor(color as ColorToken, theme);
    }
  }
  return undefined;
}

/**
 * Create a color with modified alpha
 * @param color - Base color
 * @param alpha - New alpha value (0-1)
 * @param theme - Optional theme to resolve colors from
 * @returns Color with modified alpha
 */
export function withAlpha(
  color: ColorToken,
  alpha: number,
  theme?: AuraTheme
): RGBA {
  const resolved = resolveColor(color, theme);
  return resolved.withAlpha(alpha);
}

/**
 * Darken a color by a percentage
 * @param color - Base color
 * @param amount - Amount to darken (0-1)
 * @param theme - Optional theme to resolve colors from
 * @returns Darkened color
 */
export function darken(
  color: ColorToken,
  amount: number,
  theme?: AuraTheme
): RGBA {
  const resolved = resolveColor(color, theme);
  const factor = 1 - amount;
  const buffer = new Float32Array([
    resolved.r * factor,
    resolved.g * factor,
    resolved.b * factor,
    resolved.a
  ]);
  return RGBA.fromArray(buffer);
}

/**
 * Lighten a color by a percentage
 * @param color - Base color
 * @param amount - Amount to lighten (0-1)
 * @param theme - Optional theme to resolve colors from
 * @returns Lightened color
 */
export function lighten(
  color: ColorToken,
  amount: number,
  theme?: AuraTheme
): RGBA {
  const resolved = resolveColor(color, theme);
  const factor = amount;
  const buffer = new Float32Array([
    Math.min(1, resolved.r + (1 - resolved.r) * factor),
    Math.min(1, resolved.g + (1 - resolved.g) * factor),
    Math.min(1, resolved.b + (1 - resolved.b) * factor),
    resolved.a
  ]);
  return RGBA.fromArray(buffer);
}

/**
 * Mix two colors together
 * @param color1 - First color
 * @param color2 - Second color
 * @param ratio - Mix ratio (0 = all color1, 1 = all color2)
 * @param theme - Optional theme to resolve colors from
 * @returns Mixed color
 */
export function mixColors(
  color1: ColorToken,
  color2: ColorToken,
  ratio: number = 0.5,
  theme?: AuraTheme
): RGBA {
  const c1 = resolveColor(color1, theme);
  const c2 = resolveColor(color2, theme);
  const invRatio = 1 - ratio;

  const buffer = new Float32Array([
    c1.r * invRatio + c2.r * ratio,
    c1.g * invRatio + c2.g * ratio,
    c1.b * invRatio + c2.b * ratio,
    c1.a * invRatio + c2.a * ratio
  ]);
  return RGBA.fromArray(buffer);
}

/**
 * Get border characters for a border style
 * @param style - Border style name
 * @returns Border character set
 */
export function getBorderCharacters(style: ThemeBorderStyle): {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
  horizontalDown?: string;
  horizontalUp?: string;
  verticalLeft?: string;
  verticalRight?: string;
  cross?: string;
} | null {
  switch (style) {
    case 'single':
      return {
        topLeft: '┌',
        topRight: '┐',
        bottomLeft: '└',
        bottomRight: '┘',
        horizontal: '─',
        vertical: '│',
        horizontalDown: '┬',
        horizontalUp: '┴',
        verticalLeft: '┤',
        verticalRight: '├',
        cross: '┼'
      };

    case 'double':
      return {
        topLeft: '╔',
        topRight: '╗',
        bottomLeft: '╚',
        bottomRight: '╝',
        horizontal: '═',
        vertical: '║',
        horizontalDown: '╦',
        horizontalUp: '╩',
        verticalLeft: '╣',
        verticalRight: '╠',
        cross: '╬'
      };

    case 'rounded':
      return {
        topLeft: '╭',
        topRight: '╮',
        bottomLeft: '╰',
        bottomRight: '╯',
        horizontal: '─',
        vertical: '│',
        horizontalDown: '┬',
        horizontalUp: '┴',
        verticalLeft: '┤',
        verticalRight: '├',
        cross: '┼'
      };

    case 'bold':
      return {
        topLeft: '┏',
        topRight: '┓',
        bottomLeft: '┗',
        bottomRight: '┛',
        horizontal: '━',
        vertical: '┃',
        horizontalDown: '┳',
        horizontalUp: '┻',
        verticalLeft: '┫',
        verticalRight: '┣',
        cross: '╋'
      };

    case 'ascii':
      return {
        topLeft: '+',
        topRight: '+',
        bottomLeft: '+',
        bottomRight: '+',
        horizontal: '-',
        vertical: '|',
        horizontalDown: '+',
        horizontalUp: '+',
        verticalLeft: '+',
        verticalRight: '+',
        cross: '+'
      };

    case 'none':
    default:
      return null;
  }
}

/**
 * Check if a color has transparency
 * @param color - Color to check
 * @param theme - Optional theme to resolve colors from
 * @returns True if color has alpha < 1
 */
export function hasTransparency(
  color: ColorToken,
  theme?: AuraTheme
): boolean {
  const resolved = resolveColor(color, theme);
  return resolved.a < 1;
}

/**
 * Get contrast ratio between two colors
 * @param color1 - First color
 * @param color2 - Second color
 * @param theme - Optional theme to resolve colors from
 * @returns Contrast ratio (1-21)
 */
export function getContrastRatio(
  color1: ColorToken,
  color2: ColorToken,
  theme?: AuraTheme
): number {
  const c1 = resolveColor(color1, theme);
  const c2 = resolveColor(color2, theme);

  // Calculate relative luminance
  const getLuminance = (c: RGBA): number => {
    const srgb = [c.r, c.g, c.b].map(val => {
      if (val <= 0.03928) {
        return val / 12.92;
      }
      return Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
  };

  const l1 = getLuminance(c1);
  const l2 = getLuminance(c2);

  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Check if a color is considered "light"
 * @param color - Color to check
 * @param theme - Optional theme to resolve colors from
 * @param threshold - Luminance threshold (0-1, default 0.5)
 * @returns True if color is light
 */
export function isLightColor(
  color: ColorToken,
  theme?: AuraTheme,
  threshold: number = 0.5
): boolean {
  const resolved = resolveColor(color, theme);
  const luminance = 0.299 * resolved.r + 0.587 * resolved.g + 0.114 * resolved.b;
  return luminance > threshold;
}

/**
 * Get a contrasting text color for a background
 * @param background - Background color
 * @param theme - Optional theme to resolve colors from
 * @returns White or black for contrast
 */
export function getContrastingText(
  background: ColorToken,
  theme?: AuraTheme
): RGBA {
  return isLightColor(background, theme)
    ? RGBA.fromHex('#000000')
    : RGBA.fromHex('#ffffff');
}