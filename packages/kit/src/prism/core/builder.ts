/**
 * Prism style builder - provides chainable API
 */

import { parseColor } from '../color/parser.js';
import { ColorLevel } from '../utils/supports.js';
import { RGB, mixRgb, rgbToHsl, hslToRgb, hsvToRgb } from '../color/spaces.js';
import {
  ansi,
  ansi256,
  colors16,
  modifiers,
  bgColors16,
  rgbToAnsi16,
  rgbToAnsi256,
  replaceClose,
  ansi256ToRgb,
  rgb as rgbAnsi,
  handleLineBreaks,
} from '../utils/ansi.js';

export interface StyleInfo {
  open: string;
  close: string;
  openAll: string;
  closeAll: string;
  parent?: StyleInfo;
}

export interface BuilderOptions {
  level: ColorLevel;
  enabled: boolean;
}

/**
 * The foreground color currently in effect on a chain, tracked so color
 * transforms (lighten, mix, ...) can derive from it. Only colors whose RGB
 * Prism knows are tracked: rgb/hex/hsl/hsv/css/ansi256. Named 16-colors are
 * rendered by the terminal's own palette, so they clear the tracked color.
 */
export interface ColorState {
  rgb: RGB;
  styler: StyleInfo;
}

const STYLER = Symbol('STYLER');
const GENERATOR = Symbol('GENERATOR');
const IS_EMPTY = Symbol('IS_EMPTY');
const FG_COLOR = Symbol('FG_COLOR');

/**
 * Clamp a color channel to a valid integer 0-255.
 * Out-of-range or fractional values would otherwise produce
 * invalid ANSI sequences (e.g. `38;2;300;-5;12.7`).
 */
function clampChannel(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

/**
 * Create style info
 */
function createStyler(open: string, close: string, parent?: StyleInfo): StyleInfo {
  let openAll: string;
  let closeAll: string;

  if (parent === undefined) {
    openAll = open;
    closeAll = close;
  } else {
    openAll = parent.openAll + open;
    closeAll = close + parent.closeAll;
  }

  return {
    open,
    close,
    openAll,
    closeAll,
    parent,
  };
}

/**
 * Apply style to text
 */
function applyStyle(builder: PrismBuilder, text: string): string {
  const styler = (builder as any)[STYLER];
  const { level, enabled } = (builder as any)[GENERATOR] as BuilderOptions;
  const isEmpty = (builder as any)[IS_EMPTY];

  if (level <= 0 || !enabled || !text) {
    return isEmpty ? '' : text;
  }

  if (styler === undefined) {
    return text;
  }

  const { openAll, closeAll } = styler;
  let styled = text;

  // Handle nested styles
  if (text.includes('\x1b')) {
    let currentStyler = styler;
    while (currentStyler !== undefined) {
      styled = replaceClose(styled, currentStyler.close, currentStyler.open);
      currentStyler = currentStyler.parent;
    }
  }

  // Handle line breaks
  if (styled.includes('\n')) {
    styled = handleLineBreaks(styled, openAll, closeAll);
  }

  return openAll + styled + closeAll;
}

/**
 * Interface for callable builder
 */
export interface PrismBuilderCallable {
  (text: string): string;
  (...text: unknown[]): string;
}

/**
 * Combined type for PrismBuilder with callable interface
 */
export type PrismBuilderInstance = PrismBuilder & PrismBuilderCallable;

/**
 * Prism builder class
 */
export class PrismBuilder {
  private [GENERATOR]: BuilderOptions;
  private [STYLER]?: StyleInfo;
  private [IS_EMPTY]: boolean;
  private [FG_COLOR]?: ColorState;

  constructor(options: BuilderOptions, styler?: StyleInfo, isEmpty = false, fgColor?: ColorState) {
    this[GENERATOR] = options;
    this[STYLER] = styler;
    this[IS_EMPTY] = isEmpty;
    this[FG_COLOR] = fgColor;

    // Create callable function
    const callable = function prismCallable(...args: unknown[]): string {
      const text = args.length === 1 ? String(args[0]) : args.join(' ');
      return applyStyle(callable as any, text);
    } as any;

    // Set prototype
    Object.setPrototypeOf(callable, PrismBuilder.prototype);

    // Copy symbols
    callable[GENERATOR] = options;
    callable[STYLER] = styler;
    callable[IS_EMPTY] = isEmpty;
    callable[FG_COLOR] = fgColor;

    return callable as PrismBuilderInstance;
  }

  /**
   * Apply style to text
   */
  call(...args: unknown[]): string {
    const text = args.length === 1 ? String(args[0]) : args.join(' ');
    return applyStyle(this, text);
  }

  /**
   * Get current color level
   */
  get level(): ColorLevel {
    return this[GENERATOR].level;
  }

  /**
   * Set color level
   */
  set level(level: ColorLevel) {
    this[GENERATOR].level = level;
  }

  /**
   * Check if colors are enabled
   */
  get enabled(): boolean {
    return this[GENERATOR].enabled && this.level > 0;
  }

  /**
   * Create a new builder with a style
   *
   * `fg` updates the foreground color tracked for color transforms: an RGB
   * value records the new foreground, `null` clears it (named 16-colors and
   * reset, whose actual rendering the terminal decides), `undefined` keeps
   * the current one (modifiers, backgrounds).
   */
  private chain(open: string, close: string, fg?: RGB | null): PrismBuilderInstance {
    const styler = createStyler(open, close, this[STYLER]);

    let fgColor: ColorState | undefined;
    if (fg === undefined) {
      fgColor = this[FG_COLOR];
    } else if (fg !== null) {
      fgColor = { rgb: fg, styler };
    }

    return new PrismBuilder(
      this[GENERATOR],
      styler,
      this[IS_EMPTY],
      fgColor
    ) as PrismBuilderInstance;
  }

  // Modifiers
  get reset(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.reset)[0], ansi(modifiers.reset)[1], null);
  }

  get bold(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.bold)[0], ansi(modifiers.bold)[1]);
  }

  get dim(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.dim)[0], ansi(modifiers.dim)[1]);
  }

  get italic(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.italic)[0], ansi(modifiers.italic)[1]);
  }

  get underline(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.underline)[0], ansi(modifiers.underline)[1]);
  }

  get overline(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.overline)[0], ansi(modifiers.overline)[1]);
  }

  get inverse(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.inverse)[0], ansi(modifiers.inverse)[1]);
  }

  get hidden(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.hidden)[0], ansi(modifiers.hidden)[1]);
  }

  get strikethrough(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.strikethrough)[0], ansi(modifiers.strikethrough)[1]);
  }

  // Basic colors
  //
  // Named 16-colors are rendered by the terminal's own palette, so their
  // actual RGB is unknown; they clear the tracked foreground color (color
  // transforms only apply to colors Prism knows as RGB).
  get black(): PrismBuilderInstance {
    return this.chain(ansi(colors16.black)[0], ansi(colors16.black)[1], null);
  }

  get red(): PrismBuilderInstance {
    return this.chain(ansi(colors16.red)[0], ansi(colors16.red)[1], null);
  }

  get green(): PrismBuilderInstance {
    return this.chain(ansi(colors16.green)[0], ansi(colors16.green)[1], null);
  }

  get yellow(): PrismBuilderInstance {
    return this.chain(ansi(colors16.yellow)[0], ansi(colors16.yellow)[1], null);
  }

  get blue(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blue)[0], ansi(colors16.blue)[1], null);
  }

  get magenta(): PrismBuilderInstance {
    return this.chain(ansi(colors16.magenta)[0], ansi(colors16.magenta)[1], null);
  }

  get cyan(): PrismBuilderInstance {
    return this.chain(ansi(colors16.cyan)[0], ansi(colors16.cyan)[1], null);
  }

  get white(): PrismBuilderInstance {
    return this.chain(ansi(colors16.white)[0], ansi(colors16.white)[1], null);
  }

  get gray(): PrismBuilderInstance {
    return this.chain(ansi(colors16.gray)[0], ansi(colors16.gray)[1], null);
  }

  get grey(): PrismBuilderInstance {
    return this.chain(ansi(colors16.grey)[0], ansi(colors16.grey)[1], null);
  }

  // Bright colors
  get blackBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blackBright)[0], ansi(colors16.blackBright)[1], null);
  }

  get redBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.redBright)[0], ansi(colors16.redBright)[1], null);
  }

  get greenBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.greenBright)[0], ansi(colors16.greenBright)[1], null);
  }

  get yellowBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.yellowBright)[0], ansi(colors16.yellowBright)[1], null);
  }

  get blueBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blueBright)[0], ansi(colors16.blueBright)[1], null);
  }

  get magentaBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.magentaBright)[0], ansi(colors16.magentaBright)[1], null);
  }

  get cyanBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.cyanBright)[0], ansi(colors16.cyanBright)[1], null);
  }

  get whiteBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.whiteBright)[0], ansi(colors16.whiteBright)[1], null);
  }

  // Background colors
  get bgBlack(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgBlack)[0], ansi(bgColors16.bgBlack)[1]);
  }

  get bgRed(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgRed)[0], ansi(bgColors16.bgRed)[1]);
  }

  get bgGreen(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgGreen)[0], ansi(bgColors16.bgGreen)[1]);
  }

  get bgYellow(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgYellow)[0], ansi(bgColors16.bgYellow)[1]);
  }

  get bgBlue(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgBlue)[0], ansi(bgColors16.bgBlue)[1]);
  }

  get bgMagenta(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgMagenta)[0], ansi(bgColors16.bgMagenta)[1]);
  }

  get bgCyan(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgCyan)[0], ansi(bgColors16.bgCyan)[1]);
  }

  get bgWhite(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgWhite)[0], ansi(bgColors16.bgWhite)[1]);
  }

  get bgGray(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgGray)[0], ansi(bgColors16.bgGray)[1]);
  }

  get bgGrey(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgGrey)[0], ansi(bgColors16.bgGrey)[1]);
  }

  // Bright background colors
  get bgBlackBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgBlackBright)[0], ansi(bgColors16.bgBlackBright)[1]);
  }

  get bgRedBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgRedBright)[0], ansi(bgColors16.bgRedBright)[1]);
  }

  get bgGreenBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgGreenBright)[0], ansi(bgColors16.bgGreenBright)[1]);
  }

  get bgYellowBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgYellowBright)[0], ansi(bgColors16.bgYellowBright)[1]);
  }

  get bgBlueBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgBlueBright)[0], ansi(bgColors16.bgBlueBright)[1]);
  }

  get bgMagentaBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgMagentaBright)[0], ansi(bgColors16.bgMagentaBright)[1]);
  }

  get bgCyanBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgCyanBright)[0], ansi(bgColors16.bgCyanBright)[1]);
  }

  get bgWhiteBright(): PrismBuilderInstance {
    return this.chain(ansi(bgColors16.bgWhiteBright)[0], ansi(bgColors16.bgWhiteBright)[1]);
  }

  /**
   * RGB color
   */
  rgb(r: number | string, g?: number, b?: number): PrismBuilderInstance {
    if (typeof r === 'string') {
      const color = parseColor(r);
      if (color) {
        return this.rgb(color.r, color.g, color.b);
      }
      return this as unknown as PrismBuilderInstance;
    }

    if (g === undefined || b === undefined) {
      return this as unknown as PrismBuilderInstance;
    }

    r = clampChannel(r);
    g = clampChannel(g);
    b = clampChannel(b);

    const level = this.level;
    let open: string;
    const close = '\x1b[39m';

    if (level >= ColorLevel.TrueColor) {
      open = rgbAnsi(r, g, b, false);
    } else if (level >= ColorLevel.Ansi256) {
      open = ansi256(rgbToAnsi256(r, g, b), false);
    } else if (level >= ColorLevel.Basic) {
      const code = rgbToAnsi16(r, g, b);
      open = `\x1b[${code}m`;
    } else {
      return this as unknown as PrismBuilderInstance;
    }

    // Track the full-precision RGB so color transforms can derive from it
    // even when the emitted sequence was downgraded to 256/16 colors.
    return this.chain(open, close, { r, g, b });
  }

  /**
   * Background RGB color
   */
  bgRgb(r: number | string, g?: number, b?: number): PrismBuilderInstance {
    if (typeof r === 'string') {
      const color = parseColor(r);
      if (color) {
        return this.bgRgb(color.r, color.g, color.b);
      }
      return this as unknown as PrismBuilderInstance;
    }

    if (g === undefined || b === undefined) {
      return this as unknown as PrismBuilderInstance;
    }

    r = clampChannel(r);
    g = clampChannel(g);
    b = clampChannel(b);

    const level = this.level;
    let open: string;
    const close = '\x1b[49m';

    if (level >= ColorLevel.TrueColor) {
      open = rgbAnsi(r, g, b, true);
    } else if (level >= ColorLevel.Ansi256) {
      open = ansi256(rgbToAnsi256(r, g, b), true);
    } else if (level >= ColorLevel.Basic) {
      const code = rgbToAnsi16(r, g, b) + 10;
      open = `\x1b[${code}m`;
    } else {
      return this as unknown as PrismBuilderInstance;
    }

    return this.chain(open, close);
  }

  /**
   * Hex color
   */
  hex(color: string): PrismBuilderInstance {
    return this.rgb(color);
  }

  /**
   * Background hex color
   */
  bgHex(color: string): PrismBuilderInstance {
    return this.bgRgb(color);
  }

  /**
   * HSL color
   */
  hsl(h: number, s: number, l: number): PrismBuilderInstance {
    const rgb = hslToRgb({ h, s, l });
    return this.rgb(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Background HSL color
   */
  bgHsl(h: number, s: number, l: number): PrismBuilderInstance {
    const rgb = hslToRgb({ h, s, l });
    return this.bgRgb(rgb.r, rgb.g, rgb.b);
  }

  /**
   * HSV color
   */
  hsv(h: number, s: number, v: number): PrismBuilderInstance {
    const rgb = hsvToRgb({ h, s, v });
    return this.rgb(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Background HSV color
   */
  bgHsv(h: number, s: number, v: number): PrismBuilderInstance {
    const rgb = hsvToRgb({ h, s, v });
    return this.bgRgb(rgb.r, rgb.g, rgb.b);
  }

  /**
   * ANSI 256 color
   */
  ansi256(code: number): PrismBuilderInstance {
    if (this.level < ColorLevel.Ansi256) {
      return this as unknown as PrismBuilderInstance;
    }
    const clamped = clampChannel(code);
    return this.chain(ansi256(clamped, false), '\x1b[39m', ansi256ToRgb(clamped));
  }

  /**
   * Background ANSI 256 color
   */
  bgAnsi256(code: number): PrismBuilderInstance {
    if (this.level < ColorLevel.Ansi256) {
      return this as unknown as PrismBuilderInstance;
    }
    return this.chain(ansi256(clampChannel(code), true), '\x1b[49m');
  }

  /**
   * CSS color name
   */
  css(name: string): PrismBuilderInstance {
    return this.rgb(name);
  }

  /**
   * Background CSS color name
   */
  bgCss(name: string): PrismBuilderInstance {
    return this.bgRgb(name);
  }

  // Color transforms
  //
  // Each transform derives a new foreground color from the current one and
  // replaces it in the chain. They apply only when the chain's foreground
  // was set through rgb/hex/hsl/hsv/css/ansi256 (colors Prism knows as
  // RGB); otherwise — no color yet, or a named 16-color/reset applied
  // last — they are a no-op returning the chain unchanged. A style
  // function must never throw at render time, so invalid arguments
  // (non-finite numbers, unparseable colors) are also no-ops, and all
  // results clamp to valid ranges.

  /**
   * Mix the current foreground color toward another color.
   *
   * @param color - Target color: any string `parseColor` accepts (hex,
   *   CSS name, rgb()/hsl() notation) or an [r, g, b] tuple
   * @param ratio - How far to move toward the target, clamped to 0-1:
   *   0 keeps the current color, 1 replaces it (default 0.5)
   */
  mix(color: string | [number, number, number], ratio = 0.5): PrismBuilderInstance {
    if (!Number.isFinite(ratio)) {
      return this as unknown as PrismBuilderInstance;
    }

    let parsed: RGB | null = null;
    if (typeof color === 'string') {
      parsed = parseColor(color);
    } else {
      const [r, g, b] = color;
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        parsed = { r: clampChannel(r), g: clampChannel(g), b: clampChannel(b) };
      }
    }

    if (parsed === null) {
      return this as unknown as PrismBuilderInstance;
    }

    const target = parsed;
    const weight = Math.max(0, Math.min(1, ratio));
    return this.transformForeground((rgb) => mixRgb(rgb, target, weight));
  }

  /**
   * Lighten the current foreground color: HSL lightness +amount (0-1 scale).
   */
  lighten(amount: number): PrismBuilderInstance {
    return this.adjustLightness(amount);
  }

  /**
   * Darken the current foreground color: HSL lightness -amount (0-1 scale).
   */
  darken(amount: number): PrismBuilderInstance {
    return this.adjustLightness(-amount);
  }

  /**
   * Saturate the current foreground color: HSL saturation +amount (0-1 scale).
   */
  saturate(amount: number): PrismBuilderInstance {
    return this.adjustSaturation(amount);
  }

  /**
   * Desaturate the current foreground color: HSL saturation -amount (0-1 scale).
   */
  desaturate(amount: number): PrismBuilderInstance {
    return this.adjustSaturation(-amount);
  }

  /**
   * Rotate the hue of the current foreground color by the given degrees.
   * The resulting hue wraps around the 0-360 circle.
   */
  rotate(degrees: number): PrismBuilderInstance {
    if (!Number.isFinite(degrees)) {
      return this as unknown as PrismBuilderInstance;
    }
    return this.transformForeground((rgb) => {
      const hsl = rgbToHsl(rgb);
      hsl.h = (((hsl.h + degrees) % 360) + 360) % 360;
      return hslToRgb(hsl);
    });
  }

  /**
   * Invert the current foreground color channel-wise (255 - value).
   */
  invert(): PrismBuilderInstance {
    return this.transformForeground((rgb) => ({
      r: 255 - rgb.r,
      g: 255 - rgb.g,
      b: 255 - rgb.b,
    }));
  }

  /**
   * Convert the current foreground color to its luminance-weighted gray
   * (0.299 R + 0.587 G + 0.114 B).
   */
  grayscale(): PrismBuilderInstance {
    return this.transformForeground((rgb) => {
      const value = Math.round(0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b);
      return { r: value, g: value, b: value };
    });
  }

  /**
   * Shift HSL lightness by delta (0-1 scale), clamped to 0-100%.
   */
  private adjustLightness(delta: number): PrismBuilderInstance {
    if (!Number.isFinite(delta)) {
      return this as unknown as PrismBuilderInstance;
    }
    return this.transformForeground((rgb) => {
      const hsl = rgbToHsl(rgb);
      hsl.l = Math.max(0, Math.min(100, hsl.l + delta * 100));
      return hslToRgb(hsl);
    });
  }

  /**
   * Shift HSL saturation by delta (0-1 scale), clamped to 0-100%.
   */
  private adjustSaturation(delta: number): PrismBuilderInstance {
    if (!Number.isFinite(delta)) {
      return this as unknown as PrismBuilderInstance;
    }
    return this.transformForeground((rgb) => {
      const hsl = rgbToHsl(rgb);
      hsl.s = Math.max(0, Math.min(100, hsl.s + delta * 100));
      return hslToRgb(hsl);
    });
  }

  /**
   * Apply a transform to the tracked foreground color and rebuild the
   * chain with the transformed color in the exact place of the one it
   * derives from (styles applied after it keep overriding it, backgrounds
   * are untouched). The result is clamped and re-encoded for the active
   * color level, following the same truecolor → 256 → 16 downgrade path
   * as any directly set color. No-op when there is nothing to transform.
   */
  private transformForeground(transform: (rgb: RGB) => RGB): PrismBuilderInstance {
    const current = this[FG_COLOR];
    if (current === undefined) {
      return this as unknown as PrismBuilderInstance;
    }

    const next = transform(current.rgb);
    const r = clampChannel(next.r);
    const g = clampChannel(next.g);
    const b = clampChannel(next.b);

    const level = this.level;
    let open: string;
    if (level >= ColorLevel.TrueColor) {
      open = rgbAnsi(r, g, b, false);
    } else if (level >= ColorLevel.Ansi256) {
      open = ansi256(rgbToAnsi256(r, g, b), false);
    } else if (level >= ColorLevel.Basic) {
      open = `\x1b[${rgbToAnsi16(r, g, b)}m`;
    } else {
      return this as unknown as PrismBuilderInstance;
    }

    // Rebuild the styler chain, replacing the tracked foreground styler's
    // open sequence with the transformed color.
    const stack: StyleInfo[] = [];
    for (let styler = this[STYLER]; styler !== undefined; styler = styler.parent) {
      stack.push(styler);
    }
    stack.reverse();

    let rebuilt: StyleInfo | undefined;
    let fgStyler: StyleInfo | undefined;
    for (const styler of stack) {
      if (styler === current.styler) {
        rebuilt = createStyler(open, styler.close, rebuilt);
        fgStyler = rebuilt;
      } else {
        rebuilt = createStyler(styler.open, styler.close, rebuilt);
      }
    }

    if (fgStyler === undefined) {
      // The tracked styler is part of the chain by construction; if it
      // ever is not, degrade to appending rather than dropping the color.
      fgStyler = createStyler(open, '\x1b[39m', rebuilt ?? this[STYLER]);
      rebuilt = fgStyler;
    }

    return new PrismBuilder(this[GENERATOR], rebuilt, this[IS_EMPTY], {
      rgb: { r, g, b },
      styler: fgStyler,
    }) as PrismBuilderInstance;
  }

  /**
   * Visible modifier - only show when colors are enabled
   */
  get visible(): PrismBuilderInstance {
    if (!this.enabled) {
      return new PrismBuilder(
        this[GENERATOR],
        this[STYLER],
        true,
        this[FG_COLOR]
      ) as PrismBuilderInstance;
    }
    return this as unknown as PrismBuilderInstance;
  }
}
