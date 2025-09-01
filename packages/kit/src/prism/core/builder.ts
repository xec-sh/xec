/**
 * Prism style builder - provides chainable API
 */

import { parseColor } from '../color/parser.js';
import { ColorLevel } from '../utils/supports.js';
import { hslToRgb, hsvToRgb } from '../color/spaces.js';
import {
  ansi,
  ansi256,
  colors16,
  modifiers,
  bgColors16,
  rgbToAnsi16,
  rgbToAnsi256,
  replaceClose,
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

const STYLER = Symbol('STYLER');
const GENERATOR = Symbol('GENERATOR');
const IS_EMPTY = Symbol('IS_EMPTY');

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
  const level = (builder as any)[GENERATOR].level;
  const isEmpty = (builder as any)[IS_EMPTY];

  if (level <= 0 || !text) {
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

  constructor(options: BuilderOptions, styler?: StyleInfo, isEmpty = false) {
    this[GENERATOR] = options;
    this[STYLER] = styler;
    this[IS_EMPTY] = isEmpty;

    // Create callable function
    const callable = function (...args: unknown[]): string {
      const text = args.length === 1 ? String(args[0]) : args.join(' ');
      return applyStyle(callable as any, text);
    } as any;

    // Set prototype
    Object.setPrototypeOf(callable, PrismBuilder.prototype);

    // Copy symbols
    callable[GENERATOR] = options;
    callable[STYLER] = styler;
    callable[IS_EMPTY] = isEmpty;

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
   */
  private chain(open: string, close: string): PrismBuilderInstance {
    const styler = createStyler(open, close, this[STYLER]);
    return new PrismBuilder(this[GENERATOR], styler, this[IS_EMPTY]) as PrismBuilderInstance;
  }

  // Modifiers
  get reset(): PrismBuilderInstance {
    return this.chain(ansi(modifiers.reset)[0], ansi(modifiers.reset)[1]);
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
  get black(): PrismBuilderInstance {
    return this.chain(ansi(colors16.black)[0], ansi(colors16.black)[1]);
  }

  get red(): PrismBuilderInstance {
    return this.chain(ansi(colors16.red)[0], ansi(colors16.red)[1]);
  }

  get green(): PrismBuilderInstance {
    return this.chain(ansi(colors16.green)[0], ansi(colors16.green)[1]);
  }

  get yellow(): PrismBuilderInstance {
    return this.chain(ansi(colors16.yellow)[0], ansi(colors16.yellow)[1]);
  }

  get blue(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blue)[0], ansi(colors16.blue)[1]);
  }

  get magenta(): PrismBuilderInstance {
    return this.chain(ansi(colors16.magenta)[0], ansi(colors16.magenta)[1]);
  }

  get cyan(): PrismBuilderInstance {
    return this.chain(ansi(colors16.cyan)[0], ansi(colors16.cyan)[1]);
  }

  get white(): PrismBuilderInstance {
    return this.chain(ansi(colors16.white)[0], ansi(colors16.white)[1]);
  }

  get gray(): PrismBuilderInstance {
    return this.chain(ansi(colors16.gray)[0], ansi(colors16.gray)[1]);
  }

  get grey(): PrismBuilderInstance {
    return this.chain(ansi(colors16.grey)[0], ansi(colors16.grey)[1]);
  }

  // Bright colors
  get blackBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blackBright)[0], ansi(colors16.blackBright)[1]);
  }

  get redBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.redBright)[0], ansi(colors16.redBright)[1]);
  }

  get greenBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.greenBright)[0], ansi(colors16.greenBright)[1]);
  }

  get yellowBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.yellowBright)[0], ansi(colors16.yellowBright)[1]);
  }

  get blueBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.blueBright)[0], ansi(colors16.blueBright)[1]);
  }

  get magentaBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.magentaBright)[0], ansi(colors16.magentaBright)[1]);
  }

  get cyanBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.cyanBright)[0], ansi(colors16.cyanBright)[1]);
  }

  get whiteBright(): PrismBuilderInstance {
    return this.chain(ansi(colors16.whiteBright)[0], ansi(colors16.whiteBright)[1]);
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

    return this.chain(open, close);
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
    return this.chain(ansi256(code, false), '\x1b[39m');
  }

  /**
   * Background ANSI 256 color
   */
  bgAnsi256(code: number): PrismBuilderInstance {
    if (this.level < ColorLevel.Ansi256) {
      return this as unknown as PrismBuilderInstance;
    }
    return this.chain(ansi256(code, true), '\x1b[49m');
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

  /**
   * Visible modifier - only show when colors are enabled
   */
  get visible(): PrismBuilderInstance {
    if (!this.enabled) {
      return new PrismBuilder(this[GENERATOR], this[STYLER], true) as PrismBuilderInstance;
    }
    return this as unknown as PrismBuilderInstance;
  }
}
