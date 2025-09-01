/**
 * Color string parser
 * Supports various color formats: hex, rgb(), hsl(), etc.
 */

import { RGB, HSL, hexToRgb, hslToRgb } from './spaces.js';

// CSS color names
const cssColors: Record<string, string> = {
  // Basic colors
  black: '#000000',
  white: '#ffffff',
  red: '#ff0000',
  green: '#008000',
  blue: '#0000ff',
  yellow: '#ffff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',

  // Extended colors
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  blanchedalmond: '#ffebcd',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgrey: '#a9a9a9',
  darkgreen: '#006400',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  grey: '#808080',
  greenyellow: '#adff2f',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgrey: '#d3d3d3',
  lightgreen: '#90ee90',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  whitesmoke: '#f5f5f5',
  yellowgreen: '#9acd32',

  // Transparent
  transparent: 'transparent',
};

/**
 * Parse a color string into RGB
 */
export function parseColor(color: string): RGB | null {
  if (!color || typeof color !== 'string') {
    return null;
  }

  color = color.trim().toLowerCase();

  // Check CSS color names
  if (cssColors[color]) {
    if (color === 'transparent') {
      return { r: 0, g: 0, b: 0 };
    }
    return hexToRgb(cssColors[color] || '#000000');
  }

  // Hex color
  if (color.startsWith('#')) {
    return hexToRgb(color);
  }

  // Hex without #
  if (/^[0-9a-f]{3}$|^[0-9a-f]{6}$|^[0-9a-f]{8}$/i.test(color)) {
    return hexToRgb(color);
  }

  // rgb() or rgba()
  const rgbMatch = color.match(
    /^rgba?\s*\(\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)\s*,\s*(\d+(?:\.\d+)?%?)(?:\s*,\s*[\d.]+)?\s*\)$/
  );
  if (rgbMatch) {
    return {
      r: parseColorValue(rgbMatch[1] || '', 255),
      g: parseColorValue(rgbMatch[2] || '', 255),
      b: parseColorValue(rgbMatch[3] || '', 255),
    };
  }

  // hsl() or hsla()
  const hslMatch = color.match(
    /^hsla?\s*\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%(?:\s*,\s*[\d.]+)?\s*\)$/
  );
  if (hslMatch) {
    const hsl: HSL = {
      h: parseInt(hslMatch[1] || '0', 10) % 360,
      s: parseFloat(hslMatch[2] || '0'),
      l: parseFloat(hslMatch[3] || '0'),
    };
    return hslToRgb(hsl);
  }

  return null;
}

/**
 * Parse color value (handles percentages)
 */
function parseColorValue(value: string, max: number): number {
  if (value.endsWith('%')) {
    return Math.round((parseFloat(value) / 100) * max);
  }
  return parseInt(value, 10);
}

/**
 * Validate if a string is a valid color
 */
export function isValidColor(color: string): boolean {
  return parseColor(color) !== null;
}

/**
 * Get CSS color by name
 */
export function getCssColor(name: string): string | undefined {
  return cssColors[name.toLowerCase()];
}

/**
 * Get all CSS color names
 */
export function getCssColorNames(): string[] {
  return Object.keys(cssColors);
}

/**
 * Format RGB as CSS string
 */
export function formatRgb(rgb: RGB, alpha?: number): string {
  if (alpha !== undefined && alpha < 1) {
    return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
  }
  return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
}

/**
 * Format HSL as CSS string
 */
export function formatHsl(hsl: HSL, alpha?: number): string {
  if (alpha !== undefined && alpha < 1) {
    return `hsla(${hsl.h}, ${hsl.s}%, ${hsl.l}%, ${alpha})`;
  }
  return `hsl(${hsl.h}, ${hsl.s}%, ${hsl.l}%)`;
}
