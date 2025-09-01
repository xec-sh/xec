/**
 * ANSI escape sequence utilities
 */

export const ESC = '\x1b';
export const CSI = `${ESC}[`;

// Reset all
export const RESET = `${CSI}0m`;

/**
 * ANSI modifier codes
 */
export const modifiers = {
  reset: [0, 0],
  bold: [1, 22],
  dim: [2, 22],
  italic: [3, 23],
  underline: [4, 24],
  overline: [53, 55],
  inverse: [7, 27],
  hidden: [8, 28],
  strikethrough: [9, 29],
  // Additional modifiers
  blink: [5, 25],
  rapidBlink: [6, 26],
  fraktur: [20, 23],
  doubleUnderline: [21, 24],
  framed: [51, 54],
  encircled: [52, 54],
};

/**
 * Basic 16 colors (4-bit)
 */
export const colors16 = {
  // Standard colors (30-37)
  black: [30, 39],
  red: [31, 39],
  green: [32, 39],
  yellow: [33, 39],
  blue: [34, 39],
  magenta: [35, 39],
  cyan: [36, 39],
  white: [37, 39],

  // Bright colors (90-97)
  blackBright: [90, 39],
  redBright: [91, 39],
  greenBright: [92, 39],
  yellowBright: [93, 39],
  blueBright: [94, 39],
  magentaBright: [95, 39],
  cyanBright: [96, 39],
  whiteBright: [97, 39],

  // Aliases
  gray: [90, 39],
  grey: [90, 39],
};

/**
 * Background colors (4-bit)
 */
export const bgColors16 = {
  // Standard backgrounds (40-47)
  bgBlack: [40, 49],
  bgRed: [41, 49],
  bgGreen: [42, 49],
  bgYellow: [43, 49],
  bgBlue: [44, 49],
  bgMagenta: [45, 49],
  bgCyan: [46, 49],
  bgWhite: [47, 49],

  // Bright backgrounds (100-107)
  bgBlackBright: [100, 49],
  bgRedBright: [101, 49],
  bgGreenBright: [102, 49],
  bgYellowBright: [103, 49],
  bgBlueBright: [104, 49],
  bgMagentaBright: [105, 49],
  bgCyanBright: [106, 49],
  bgWhiteBright: [107, 49],

  // Aliases
  bgGray: [100, 49],
  bgGrey: [100, 49],
};

/**
 * Create ANSI escape sequence
 */
export function ansi(code: number | number[] | [number, number]): [string, string] {
  if (Array.isArray(code)) {
    return [`${CSI}${code[0]}m`, `${CSI}${code[1]}m`];
  }
  return [`${CSI}${code}m`, RESET];
}

/**
 * 256 color (8-bit) support
 */
export function ansi256(n: number, bg = false): string {
  const type = bg ? 48 : 38;
  return `${CSI}${type};5;${n}m`;
}

/**
 * TrueColor (24-bit) support
 */
export function rgb(r: number, g: number, b: number, bg = false): string {
  const type = bg ? 48 : 38;
  return `${CSI}${type};2;${r};${g};${b}m`;
}

/**
 * Convert RGB to ANSI 256 color
 */
export function rgbToAnsi256(r: number, g: number, b: number): number {
  // Grayscale check
  if (r === g && g === b) {
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  // Color cube (216 colors)
  return (
    16 + 36 * Math.round((r / 255) * 5) + 6 * Math.round((g / 255) * 5) + Math.round((b / 255) * 5)
  );
}

/**
 * Convert RGB to basic 16 color
 */
export function rgbToAnsi16(r: number, g: number, b: number): number {
  const brightness = Math.max(r, g, b) / 255;
  const value = brightness > 0.5 ? 1 : 0;

  // Determine color
  let ansi = 30; // black

  const threshold = brightness > 0.5 ? 127 : 64;

  if (r > threshold && g < threshold && b < threshold)
    ansi = 31; // red
  else if (r < threshold && g > threshold && b < threshold)
    ansi = 32; // green
  else if (r > threshold && g > threshold && b < threshold)
    ansi = 33; // yellow
  else if (r < threshold && g < threshold && b > threshold)
    ansi = 34; // blue
  else if (r > threshold && g < threshold && b > threshold)
    ansi = 35; // magenta
  else if (r < threshold && g > threshold && b > threshold)
    ansi = 36; // cyan
  else if (r > threshold && g > threshold && b > threshold) ansi = 37; // white

  // Add bright offset if needed
  if (value === 1 && ansi >= 30 && ansi <= 37) {
    ansi += 60; // Convert to bright (90-97)
  }

  return ansi;
}

/**
 * Strip ANSI codes from string
 */
export function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

/**
 * Get visible string length (ignoring ANSI codes)
 */
export function stringLength(str: string): number {
  return stripAnsi(str).length;
}

/**
 * Check if string contains ANSI codes
 */
export function hasAnsi(str: string): boolean {
  // eslint-disable-next-line no-control-regex
  return /\x1b\[[0-9;]*m/.test(str);
}

/**
 * Wrap text with ANSI codes
 */
export function wrap(text: string, open: string, close: string): string {
  if (!text) return text;
  return open + text + close;
}

/**
 * Replace close codes with open codes to handle nested styles
 */
export function replaceClose(str: string, close: string, open: string): string {
  const closeRegex = new RegExp(escapeRegex(close), 'g');
  return str.replace(closeRegex, close + open);
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&');
}

/**
 * Handle line breaks in styled text
 */
export function handleLineBreaks(str: string, open: string, close: string): string {
  const lines = str.split('\n');
  if (lines.length === 1) return str;

  return lines
    .map((line, i) => {
      if (i === 0) return line;
      return open + line;
    })
    .join(close + '\n');
}
