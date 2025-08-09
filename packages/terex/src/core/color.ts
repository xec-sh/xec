/**
 * Color system module for terminal styling
 * Supports ANSI, 256-color, and true color modes
 */

import {
  RGB,
  HSL,
  Color,
  Style,
  AnsiColor,
  ColorMode,
  TerminalStream
} from './types.js';

// ANSI escape codes
const ESC = '\x1b[';
const RESET = `${ESC}0m`;

// ANSI color codes
const ANSI_COLORS: Record<AnsiColor, number> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  gray: 90,
  brightRed: 91,
  brightGreen: 92,
  brightYellow: 93,
  brightBlue: 94,
  brightMagenta: 95,
  brightCyan: 96,
  brightWhite: 97,
};

/**
 * Create a default color system for when no terminal stream is available
 * Uses a mock stream to avoid direct dependency on process.stdout
 */
function createDefaultColorSystem(stream?: TerminalStream): ColorSystem {
  if (stream) {
    return new ColorSystem(stream);
  }

  // Try to detect color support from environment
  let colorMode: ColorMode = 'none';

  // Check if we're in a TTY environment
  const isTTY = typeof process !== 'undefined' && process.stdout?.isTTY;

  if (isTTY) {
    // Check environment variables for color support
    if (typeof process !== 'undefined' && process.env) {
      if (process.env['COLORTERM'] === 'truecolor' || process.env['COLORTERM'] === '24bit') {
        colorMode = 'truecolor';
      } else if (process.env['TERM']?.includes('256color')) {
        colorMode = '256';
      } else if (process.env['TERM'] && !process.env['NO_COLOR']) {
        colorMode = '16';
      }
    } else {
      // Default to 16 colors if TTY
      colorMode = '16';
    }
  }

  // Create a mock terminal stream that doesn't use process.stdout directly
  const mockStream: TerminalStream = {
    input: {
      // Mock input stream
      on: () => mockStream.input,
      removeListener: () => mockStream.input,
      setRawMode: () => mockStream.input,
      pause: () => mockStream.input,
      resume: () => mockStream.input,
      read: () => null,
      readable: false,
      pipe: () => mockStream.input,
      unpipe: () => mockStream.input
    } as unknown as NodeJS.ReadStream,
    output: {
      // Mock output stream that doesn't actually write
      write: () => true,
      columns: typeof process !== 'undefined' ? process.stdout?.columns ?? 80 : 80,
      rows: typeof process !== 'undefined' ? process.stdout?.rows ?? 24 : 24,
      isTTY: isTTY ?? false,
      on: () => mockStream.output,
      removeListener: () => mockStream.output,
      cork: () => { },
      uncork: () => { },
      end: () => mockStream.output,
      writable: true
    } as unknown as NodeJS.WriteStream,
    isTTY: isTTY ?? false,
    colorMode // Use detected color mode
  };

  return new ColorSystem(mockStream);
}

/**
 * Color converter and style manager
 */
export class ColorSystem {
  private readonly colorMode: ColorMode;
  private readonly output: NodeJS.WriteStream;

  constructor(stream: TerminalStream) {
    this.output = stream.output;
    // Use explicit colorMode from stream if provided, otherwise detect
    // Always check environment variables first, then fall back to stream colorMode or detection
    this.colorMode = this.detectColorMode(stream);
  }

  /**
   * Apply style to text
   */
  style(text: string, style: Style): string {
    if (this.colorMode === 'none') {
      return text;
    }

    const codes: number[] = [];

    // Text attributes
    if (style.bold) codes.push(1);
    if (style.dim) codes.push(2);
    if (style.italic) codes.push(3);
    if (style.underline) codes.push(4);
    if (style.blink) codes.push(5);
    if (style.inverse) codes.push(7);
    if (style.hidden) codes.push(8);
    if (style.strikethrough) codes.push(9);

    // Foreground color
    if (style.foreground) {
      codes.push(...this.getColorCodes(style.foreground, false));
    }

    // Background color
    if (style.background) {
      codes.push(...this.getColorCodes(style.background, true));
    }

    if (codes.length === 0) {
      return text;
    }

    return `${ESC}${codes.join(';')}m${text}${RESET}`;
  }

  /**
   * Create a styled text builder
   */
  createStyleBuilder(): StyleBuilder {
    return new StyleBuilder(this);
  }

  /**
   * Convert color to ANSI codes
   */
  private getColorCodes(color: Color, background: boolean): number[] {
    const offset = background ? 10 : 0;

    if (typeof color === 'string') {
      if (color in ANSI_COLORS) {
        return [ANSI_COLORS[color as AnsiColor] + offset];
      }
      // Try to parse as hex color (with or without #)
      const rgb = this.hexToRgb(color);
      if (rgb) {
        return this.getRgbCodes(rgb, background);
      }
    } else if (this.isRgb(color)) {
      return this.getRgbCodes(color, background);
    } else if (this.isHsl(color)) {
      const rgb = this.hslToRgb(color);
      return this.getRgbCodes(rgb, background);
    }

    return [];
  }

  /**
   * Get RGB color codes based on color mode
   */
  private getRgbCodes(rgb: RGB, background: boolean): number[] {
    switch (this.colorMode) {
      case 'truecolor':
        return background
          ? [48, 2, rgb.r, rgb.g, rgb.b]
          : [38, 2, rgb.r, rgb.g, rgb.b];

      case '256':
        {
          const index = this.rgbTo256(rgb);
          return background ? [48, 5, index] : [38, 5, index];
        }

      case '16':
      case 'none':
      default:
        {
          const ansi = this.rgbToAnsi(rgb);
          return [ANSI_COLORS[ansi] + (background ? 10 : 0)];
        }
    }
  }

  /**
   * Convert RGB to 256-color palette index
   */
  private rgbTo256(rgb: RGB): number {
    const { r, g, b } = rgb;

    // Grayscale
    if (r === g && g === b) {
      if (r < 8) return 16;
      if (r > 248) return 231;
      return Math.round(((r - 8) / 247) * 24) + 232;
    }

    // Color cube (6x6x6)
    const ri = Math.round(r / 51);
    const gi = Math.round(g / 51);
    const bi = Math.round(b / 51);
    return 16 + (36 * ri) + (6 * gi) + bi;
  }

  /**
   * Convert RGB to nearest ANSI color
   */
  private rgbToAnsi(rgb: RGB): AnsiColor {
    const { r, g, b } = rgb;

    // Determine if it's a bright color - check if any channel is > 200
    // or if average brightness is high
    const maxChannel = Math.max(r, g, b);
    const brightness = (r + g + b) / 3;
    const bright = maxChannel > 200 || brightness > 127;

    // Find dominant color channel
    const max = Math.max(r, g, b);

    if (max === r && r > g + b) {
      return bright ? 'brightRed' : 'red';
    } else if (max === g && g > r + b) {
      return bright ? 'brightGreen' : 'green';
    } else if (max === b && b > r + g) {
      return bright ? 'brightBlue' : 'blue';
    } else if (r > 200 && g > 200 && b < 100) {
      return bright ? 'brightYellow' : 'yellow';
    } else if (r > 200 && b > 200 && g < 100) {
      return bright ? 'brightMagenta' : 'magenta';
    } else if (g > 200 && b > 200 && r < 100) {
      return bright ? 'brightCyan' : 'cyan';
    } else if (brightness < 50) {
      return 'black';
    } else if (brightness < 128) {
      return 'gray';
    } else {
      return bright ? 'brightWhite' : 'white';
    }
  }

  /**
   * Convert hex color to RGB
   */
  private hexToRgb(hex: string): RGB | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result || !result[1] || !result[2] || !result[3]) return null;

    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    };
  }

  /**
   * Convert HSL to RGB
   */
  private hslToRgb(hsl: HSL): RGB {
    const { h, s, l } = hsl;
    const hNorm = h / 360;
    const sNorm = s / 100;
    const lNorm = l / 100;

    let r: number, g: number, b: number;

    if (sNorm === 0) {
      r = g = b = lNorm;
    } else {
      const hue2rgb = (p: number, q: number, t: number): number => {
        if (t < 0) t += 1;
        if (t > 1) t -= 1;
        if (t < 1 / 6) return p + (q - p) * 6 * t;
        if (t < 1 / 2) return q;
        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
        return p;
      };

      const q = lNorm < 0.5
        ? lNorm * (1 + sNorm)
        : lNorm + sNorm - lNorm * sNorm;
      const p = 2 * lNorm - q;

      r = hue2rgb(p, q, hNorm + 1 / 3);
      g = hue2rgb(p, q, hNorm);
      b = hue2rgb(p, q, hNorm - 1 / 3);
    }

    return {
      r: Math.round(r * 255),
      g: Math.round(g * 255),
      b: Math.round(b * 255)
    };
  }

  /**
   * Type guard for RGB color
   */
  private isRgb(color: Color): color is RGB {
    return (
      typeof color === 'object' &&
      'r' in color &&
      'g' in color &&
      'b' in color
    );
  }

  /**
   * Type guard for HSL color
   */
  private isHsl(color: Color): color is HSL {
    return (
      typeof color === 'object' &&
      'h' in color &&
      's' in color &&
      'l' in color
    );
  }

  /**
   * Detect terminal color mode
   */
  private detectColorMode(stream: TerminalStream): ColorMode {
    // If stream provides explicit colorMode, use it (for testing/explicit configuration)
    // This should have priority to allow proper testing
    if (stream.colorMode) {
      return stream.colorMode;
    }

    if (!stream.isTTY || process.env['NO_COLOR']) {
      return 'none';
    }

    const colorTerm = process.env['COLORTERM'];
    if (colorTerm === 'truecolor' || colorTerm === '24bit') {
      return 'truecolor';
    }

    const term = process.env['TERM'];
    if (term && (term.includes('256') || term.includes('color'))) {
      return '256';
    }

    return '16';
  }

  /**
   * Get current color mode
   */
  getColorMode(): ColorMode {
    return this.colorMode;
  }

  /**
   * Get color depth (alias for getColorMode)
   */
  getColorDepth(): ColorMode {
    return this.colorMode;
  }

  /**
   * Create ColorSystem from environment
   */
  static fromEnv(): ColorSystem {
    return createDefaultColorSystem();
  }
}

/**
 * Fluent style builder
 */
export class StyleBuilder {
  private style: {
    foreground?: Color;
    background?: Color;
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    dim?: boolean;
    inverse?: boolean;
    hidden?: boolean;
    blink?: boolean;
  } = {};

  private readonly colorSystem: ColorSystem;

  constructor(colorSystem?: ColorSystem) {
    // Use a default color system if none provided
    this.colorSystem = colorSystem ?? createDefaultColorSystem();
  }

  foreground(color: Color): this {
    this.style.foreground = color;
    return this;
  }

  background(color: Color): this {
    this.style.background = color;
    return this;
  }

  bold(): this {
    this.style.bold = true;
    return this;
  }

  italic(): this {
    this.style.italic = true;
    return this;
  }

  underline(): this {
    this.style.underline = true;
    return this;
  }

  strikethrough(): this {
    this.style.strikethrough = true;
    return this;
  }

  dim(): this {
    this.style.dim = true;
    return this;
  }

  inverse(): this {
    this.style.inverse = true;
    return this;
  }

  hidden(): this {
    this.style.hidden = true;
    return this;
  }

  blink(): this {
    this.style.blink = true;
    return this;
  }

  apply(text: string): string {
    return this.colorSystem.style(text, this.style as Style);
  }

  getStyle(): Readonly<Style> {
    return { ...this.style };
  }

  // Convenience methods for common colors
  red(): this {
    return this.foreground('red');
  }

  green(): this {
    return this.foreground('green');
  }

  yellow(): this {
    return this.foreground('yellow');
  }

  blue(): this {
    return this.foreground('blue');
  }

  cyan(): this {
    return this.foreground('cyan');
  }

  magenta(): this {
    return this.foreground('magenta');
  }

  white(): this {
    return this.foreground('white');
  }

  black(): this {
    return this.foreground('black');
  }

  gray(): this {
    return this.foreground('gray');
  }

  // Convenience method to apply styling to text
  text(input: string): string {
    return this.apply(input);
  }

  /**
   * Build the style and return it
   */
  build(): Style {
    return { ...this.style };
  }
}

/**
 * Factory function to create a color system
 */
export function createColorSystem(stream: TerminalStream): ColorSystem {
  return new ColorSystem(stream);
}