/**
 * Color system implementation
 * Supports ANSI, 256-color, and true color with automatic degradation
 */

import { ansi } from './ansi.js';
import { ColorDepth } from '../types.js';

import type {
  Color,
  Colors,
  RGBColor,
  HSLColor,
  AnsiColor,
  Ansi256Color,
  AnsiColorName
} from '../types.js';

// ANSI color indices
const ANSI_COLOR_MAP: Record<AnsiColorName, number> = {
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7
};

/**
 * Color system implementation
 */
export class ColorSystem implements Colors {
  constructor(private colorDepth: ColorDepth = ColorDepth.TrueColor) { }

  // ============================================================================
  // Color Creation
  // ============================================================================

  ansi(nameOrValue: AnsiColorName | number, bright = false): AnsiColor {
    let value: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    if (typeof nameOrValue === 'string') {
      value = ANSI_COLOR_MAP[nameOrValue] as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    } else {
      value = nameOrValue as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
    }
    return { type: 'ansi', value, bright };
  }

  ansi256(value: number): Ansi256Color {
    // Clamp value to valid range
    const clampedValue = Math.max(0, Math.min(255, Math.round(value)));
    return { type: 'ansi256', value: clampedValue };
  }

  rgb(r: number, g: number, b: number, a?: number): RGBColor {
    // Clamp values instead of throwing
    r = Math.max(0, Math.min(255, Math.round(r)));
    g = Math.max(0, Math.min(255, Math.round(g)));
    b = Math.max(0, Math.min(255, Math.round(b)));
    
    const color: RGBColor = { type: 'rgb', r, g, b };
    if (a !== undefined) {
      (color as any).a = Math.max(0, Math.min(1, a));
    }
    return color;
  }

  hsl(h: number, s: number, l: number, a?: number): HSLColor {
    // Clamp values instead of throwing
    h = ((h % 360) + 360) % 360; // Wrap hue
    s = Math.max(0, Math.min(100, s));
    l = Math.max(0, Math.min(100, l));
    
    const color: HSLColor = { type: 'hsl', h, s, l };
    if (a !== undefined) {
      (color as any).a = Math.max(0, Math.min(1, a));
    }
    return color;
  }

  hex(hex: string): RGBColor {
    // Parse hex color to RGB
    const normalized = hex.startsWith('#') ? hex : `#${hex}`;
    let r = 0, g = 0, b = 0;
    
    if (normalized.length === 4) {
      // #RGB format
      r = parseInt(normalized[1] + normalized[1], 16);
      g = parseInt(normalized[2] + normalized[2], 16);
      b = parseInt(normalized[3] + normalized[3], 16);
    } else if (normalized.length === 7) {
      // #RRGGBB format
      r = parseInt(normalized.slice(1, 3), 16);
      g = parseInt(normalized.slice(3, 5), 16);
      b = parseInt(normalized.slice(5, 7), 16);
    }
    
    return this.rgb(r, g, b);
  }

  // ============================================================================
  // Color Conversion
  // ============================================================================

  toAnsi256(color: Color): Ansi256Color {
    if (color === 'default' || color === 'transparent') {
      return this.ansi256(0);
    }

    if (color.type === 'ansi256') {
      return color;
    }

    if (color.type === 'ansi') {
      const base = color.value;
      return this.ansi256(color.bright ? base + 8 : base);
    }

    const rgb = this.toRGB(color);

    // Convert RGB to ANSI 256
    // Colors 0-15 are the standard ANSI colors
    // Colors 16-231 are a 6x6x6 RGB cube
    // Colors 232-255 are grayscale

    const { r, g, b } = rgb;

    // Check for grayscale
    if (r === g && g === b) {
      if (r < 8) return this.ansi256(16);
      if (r > 248) return this.ansi256(231);
      return this.ansi256(Math.round(((r - 8) / 247) * 24) + 232);
    }

    // Map to 6x6x6 cube
    const levels = [0, 95, 135, 175, 215, 255];
    const findLevel = (n: number) => {
      let minDist = Infinity;
      let level = 0;
      for (let i = 0; i < levels.length; i++) {
        const dist = Math.abs(n - levels[i]);
        if (dist < minDist) {
          minDist = dist;
          level = i;
        }
      }
      return level;
    };

    const ri = findLevel(r);
    const gi = findLevel(g);
    const bi = findLevel(b);

    return this.ansi256(16 + (ri * 36) + (gi * 6) + bi);
  }

  toRGB(color: Color | string): RGBColor {
    // Handle hex strings
    if (typeof color === 'string') {
      if (color === 'default') {
        return this.rgb(255, 255, 255);
      }
      if (color === 'transparent') {
        return { type: 'rgb', r: 0, g: 0, b: 0, a: 0 } as any;
      }
      // Parse hex string
      if (color.startsWith('#')) {
        let hex = color.replace(/^#/, '');
        if (hex.length === 3) {
          hex = hex.split('').map(c => c + c).join('');
        }
        if (hex.length === 6) {
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);
          return this.rgb(r, g, b);
        }
      }
      return this.rgb(0, 0, 0);
    }

    if (color.type === 'rgb') {
      return color;
    }

    if (color.type === 'hsl') {
      return this.hslToRgb(color);
    }

    if (color.type === 'ansi') {
      // Standard ANSI color values
      const colors: Record<AnsiColorName, [number, number, number]> = {
        black: [0, 0, 0],
        red: [170, 0, 0],
        green: [0, 170, 0],
        yellow: [170, 85, 0],
        blue: [0, 0, 170],
        magenta: [170, 0, 170],
        cyan: [0, 170, 170],
        white: [170, 170, 170]
      };

      const brightColors: Record<AnsiColorName, [number, number, number]> = {
        black: [85, 85, 85],
        red: [255, 85, 85],
        green: [85, 255, 85],
        yellow: [255, 255, 85],
        blue: [85, 85, 255],
        magenta: [255, 85, 255],
        cyan: [85, 255, 255],
        white: [255, 255, 255]
      };

      // Convert value to color name
      const ansiNames: AnsiColorName[] = Object.keys(ANSI_COLOR_MAP) as AnsiColorName[];
      const colorName = ansiNames[color.value];
      const [r, g, b] = color.bright ? brightColors[colorName] : colors[colorName];
      return this.rgb(r, g, b);
    }

    if (color.type === 'ansi256') {
      const v = color.value;

      // Standard ANSI colors (0-15)
      if (v < 16) {
        const ansiNames: AnsiColorName[] = Object.keys(ANSI_COLOR_MAP) as AnsiColorName[];
        const name = ansiNames[v % 8];
        const bright = v >= 8;
        return this.toRGB(this.ansi(name, bright));
      }

      // Grayscale (232-255)
      if (v >= 232) {
        const gray = 8 + (v - 232) * 10;
        return this.rgb(gray, gray, gray);
      }

      // 6x6x6 RGB cube (16-231)
      const n = v - 16;
      const b = n % 6;
      const g = Math.floor(n / 6) % 6;
      const r = Math.floor(n / 36);

      const levels = [0, 95, 135, 175, 215, 255];
      return this.rgb(levels[r], levels[g], levels[b]);
    }

    return this.rgb(0, 0, 0);
  }

  toHSL(color: Color): HSLColor {
    if (color === 'default' || color === 'transparent') {
      return this.hsl(0, 0, 0);
    }

    if (color.type === 'hsl') {
      return color;
    }

    const rgb = this.toRGB(color);
    return this.rgbToHsl(rgb);
  }

  toHex(color: Color): string {
    const rgb = this.toRGB(color);
    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(rgb.r)}${toHex(rgb.g)}${toHex(rgb.b)}`;
  }

  // ============================================================================
  // Escape Sequences
  // ============================================================================

  toForeground(color: Color): string {
    if (color === 'default') {
      return ansi.fgDefault();
    }

    if (color === 'transparent') {
      return '';
    }

    // Degrade color based on color depth
    switch (this.colorDepth) {
      case ColorDepth.None:
        return '';

      case ColorDepth.Basic: {
        // Convert to basic ANSI color
        if (color.type === 'ansi') {
          const index = color.value;
          return color.bright ? ansi.fgColor(index + 8) : ansi.fgColor(index);
        }
        // Convert other colors to nearest ANSI
        const rgb = this.toRGB(color);
        const nearest = this.findNearestAnsi(rgb);
        return ansi.fgColor(nearest);
      }

      case ColorDepth.Extended: {
        // Convert to 256 colors
        const ansi256 = this.toAnsi256(color);
        return ansi.fgColor(ansi256.value);
      }

      case ColorDepth.TrueColor: {
        // For ANSI colors, use basic sequences
        if (color.type === 'ansi') {
          const index = color.value;
          return color.bright ? ansi.fgColor(index + 8) : ansi.fgColor(index);
        }
        // For ANSI256 colors, preserve them
        if (color.type === 'ansi256') {
          return ansi.fgColor256(color.value);
        }
        // Use full RGB for other colors
        const rgb = this.toRGB(color);
        return ansi.fgRGB(rgb.r, rgb.g, rgb.b);
      }

      default:
        return '';
    }
  }

  toBackground(color: Color): string {
    if (color === 'default') {
      return ansi.bgDefault();
    }

    if (color === 'transparent') {
      return '';
    }

    // Degrade color based on color depth
    switch (this.colorDepth) {
      case ColorDepth.None:
        return '';

      case ColorDepth.Basic: {
        // Convert to basic ANSI color
        if (color.type === 'ansi') {
          const index = color.value;
          return color.bright ? ansi.bgColor(index + 8) : ansi.bgColor(index);
        }
        // Convert other colors to nearest ANSI
        const rgb = this.toRGB(color);
        const nearest = this.findNearestAnsi(rgb);
        return ansi.bgColor(nearest);
      }

      case ColorDepth.Extended: {
        // Convert to 256 colors
        const ansi256 = this.toAnsi256(color);
        return ansi.bgColor(ansi256.value);
      }

      case ColorDepth.TrueColor: {
        // For ANSI colors, use basic sequences
        if (color.type === 'ansi') {
          const index = color.value;
          return color.bright ? ansi.bgColor(index + 8) : ansi.bgColor(index);
        }
        // For ANSI256 colors, preserve them
        if (color.type === 'ansi256') {
          return ansi.bgColor256(color.value);
        }
        // Use full RGB for other colors
        const rgb = this.toRGB(color);
        return ansi.bgRGB(rgb.r, rgb.g, rgb.b);
      }

      default:
        return '';
    }
  }

  // ============================================================================
  // Reset
  // ============================================================================

  reset(): string {
    return '\x1b[39;49m';
  }

  resetForeground(): string {
    return ansi.fgDefault();
  }

  resetBackground(): string {
    return ansi.bgDefault();
  }

  // ============================================================================
  // Standard Colors
  // ============================================================================

  readonly black = this.ansi('black');
  readonly red = this.ansi('red');
  readonly green = this.ansi('green');
  readonly yellow = this.ansi('yellow');
  readonly blue = this.ansi('blue');
  readonly magenta = this.ansi('magenta');
  readonly cyan = this.ansi('cyan');
  readonly white = this.ansi('white');
  readonly gray = this.ansi('black', true);

  readonly brightBlack = this.ansi('black', true);
  readonly brightRed = this.ansi('red', true);
  readonly brightGreen = this.ansi('green', true);
  readonly brightYellow = this.ansi('yellow', true);
  readonly brightBlue = this.ansi('blue', true);
  readonly brightMagenta = this.ansi('magenta', true);
  readonly brightCyan = this.ansi('cyan', true);
  readonly brightWhite = this.ansi('white', true);

  // ============================================================================
  // Helper Methods
  // ============================================================================

  private hslToRgb(hsl: HSLColor): RGBColor {
    const h = hsl.h / 360;
    const s = hsl.s / 100;
    const l = hsl.l / 100;

    let r: number, g: number, b: number;

    if (s === 0) {
      r = g = b = l; // Achromatic
    } else {
      const hue2rgb = (p: number, q: number, t: number) => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
      const p = 2 * l - q;
      r = hue2rgb(p, q, h + 1 / 3);
      g = hue2rgb(p, q, h);
      b = hue2rgb(p, q, h - 1 / 3);
    }

    return this.rgb(
      Math.round(r * 255),
      Math.round(g * 255),
      Math.round(b * 255)
    );
  }

  private rgbToHsl(rgb: RGBColor): HSLColor {
    const r = rgb.r / 255;
    const g = rgb.g / 255;
    const b = rgb.b / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h: number, s: number;
    const l = (max + min) / 2;

    if (max === min) {
      h = s = 0; // Achromatic
    } else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
        default: h = 0;
      }
    }

    return this.hsl(
      Math.round(h * 360),
      Math.round(s * 100),
      Math.round(l * 100)
    );
  }

  // ============================================================================
  // Additional Conversion Methods
  // ============================================================================

  toAnsi(color: Color): AnsiColor {
    const rgb = this.toRGB(color);
    const nearest = this.findNearestAnsi(rgb);
    return {
      type: 'ansi',
      value: (nearest % 8) as 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7,
      bright: nearest >= 8
    };
  }

  // ============================================================================
  // Color Manipulation
  // ============================================================================

  lighten(color: Color, amount: number): Color {
    const hsl = this.toHSL(color);
    return this.hsl(hsl.h, hsl.s, Math.min(100, hsl.l + amount));
  }

  darken(color: Color, amount: number): Color {
    const hsl = this.toHSL(color);
    return this.hsl(hsl.h, hsl.s, Math.max(0, hsl.l - amount));
  }

  saturate(color: Color, amount: number): Color {
    const hsl = this.toHSL(color);
    return this.hsl(hsl.h, Math.min(100, hsl.s + amount), hsl.l);
  }

  desaturate(color: Color, amount: number): Color {
    const hsl = this.toHSL(color);
    return this.hsl(hsl.h, Math.max(0, hsl.s - amount), hsl.l);
  }

  rotate(color: Color, degrees: number): Color {
    const hsl = this.toHSL(color);
    return this.hsl((hsl.h + degrees + 360) % 360, hsl.s, hsl.l);
  }

  mix(color1: Color, color2: Color, weight = 0.5): Color {
    const rgb1 = this.toRGB(color1);
    const rgb2 = this.toRGB(color2);
    
    const w = Math.max(0, Math.min(1, weight));
    const w1 = w;
    const w2 = 1 - w;
    
    return this.rgb(
      Math.round(rgb1.r * w1 + rgb2.r * w2),
      Math.round(rgb1.g * w1 + rgb2.g * w2),
      Math.round(rgb1.b * w1 + rgb2.b * w2)
    );
  }

  private findNearestAnsi(rgb: RGBColor): number {
    // Find the nearest basic ANSI color (0-15)
    const colors = [
      [0, 0, 0],       // 0: black
      [170, 0, 0],     // 1: red
      [0, 170, 0],     // 2: green
      [170, 85, 0],    // 3: yellow
      [0, 0, 170],     // 4: blue
      [170, 0, 170],   // 5: magenta
      [0, 170, 170],   // 6: cyan
      [170, 170, 170], // 7: white
      [85, 85, 85],    // 8: bright black
      [255, 85, 85],   // 9: bright red
      [85, 255, 85],   // 10: bright green
      [255, 255, 85],  // 11: bright yellow
      [85, 85, 255],   // 12: bright blue
      [255, 85, 255],  // 13: bright magenta
      [85, 255, 255],  // 14: bright cyan
      [255, 255, 255]  // 15: bright white
    ];

    let minDist = Infinity;
    let nearest = 0;

    for (let i = 0; i < colors.length; i++) {
      const [r, g, b] = colors[i];
      const dist = Math.sqrt(
        Math.pow(rgb.r - r, 2) +
        Math.pow(rgb.g - g, 2) +
        Math.pow(rgb.b - b, 2)
      );

      if (dist < minDist) {
        minDist = dist;
        nearest = i;
      }
    }

    return nearest;
  }
}

// Export singleton with true color support
export const colors = new ColorSystem(ColorDepth.TrueColor);

// Also export the class for custom instantiation
export default ColorSystem;