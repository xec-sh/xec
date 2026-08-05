/**
 * Border styles and rendering utilities
 */

import type { BorderStyle, BorderChars } from './types.js';

import { unicodeOr } from '../../utilities/common.js';

/**
 * Border character sets for different styles
 */
export const BORDER_STYLES: Record<Exclude<BorderStyle, 'none'>, BorderChars> = {
  single: {
    top: unicodeOr('─', '-'),
    bottom: unicodeOr('─', '-'),
    left: unicodeOr('│', '|'),
    right: unicodeOr('│', '|'),
    topLeft: unicodeOr('┌', '+'),
    topRight: unicodeOr('┐', '+'),
    bottomLeft: unicodeOr('└', '+'),
    bottomRight: unicodeOr('┘', '+'),
    cross: unicodeOr('┼', '+'),
    topJoin: unicodeOr('┬', '+'),
    bottomJoin: unicodeOr('┴', '+'),
    leftJoin: unicodeOr('├', '+'),
    rightJoin: unicodeOr('┤', '+'),
  },

  double: {
    top: unicodeOr('═', '='),
    bottom: unicodeOr('═', '='),
    left: unicodeOr('║', '|'),
    right: unicodeOr('║', '|'),
    topLeft: unicodeOr('╔', '+'),
    topRight: unicodeOr('╗', '+'),
    bottomLeft: unicodeOr('╚', '+'),
    bottomRight: unicodeOr('╝', '+'),
    cross: unicodeOr('╬', '+'),
    topJoin: unicodeOr('╦', '+'),
    bottomJoin: unicodeOr('╩', '+'),
    leftJoin: unicodeOr('╠', '+'),
    rightJoin: unicodeOr('╣', '+'),
  },

  rounded: {
    top: unicodeOr('─', '-'),
    bottom: unicodeOr('─', '-'),
    left: unicodeOr('│', '|'),
    right: unicodeOr('│', '|'),
    topLeft: unicodeOr('╭', '+'),
    topRight: unicodeOr('╮', '+'),
    bottomLeft: unicodeOr('╰', '+'),
    bottomRight: unicodeOr('╯', '+'),
    cross: unicodeOr('┼', '+'),
    topJoin: unicodeOr('┬', '+'),
    bottomJoin: unicodeOr('┴', '+'),
    leftJoin: unicodeOr('├', '+'),
    rightJoin: unicodeOr('┤', '+'),
  },

  ascii: {
    top: '-',
    bottom: '-',
    left: '|',
    right: '|',
    topLeft: '+',
    topRight: '+',
    bottomLeft: '+',
    bottomRight: '+',
    cross: '+',
    topJoin: '+',
    bottomJoin: '+',
    leftJoin: '+',
    rightJoin: '+',
  },
};

/**
 * Empty border set (used when borders='none')
 */
export const EMPTY_BORDERS: BorderChars = {
  top: '',
  bottom: '',
  left: '',
  right: '',
  topLeft: '',
  topRight: '',
  bottomLeft: '',
  bottomRight: '',
  cross: '',
  topJoin: '',
  bottomJoin: '',
  leftJoin: '',
  rightJoin: '',
};

/**
 * Get border character set for the specified style
 */
export function getBorderChars(style: BorderStyle = 'single'): BorderChars {
  if (style === 'none') {
    return EMPTY_BORDERS;
  }
  return BORDER_STYLES[style];
}

/**
 * Render a horizontal border line with joins
 * @param widths - Array of column widths
 * @param left - Left border character
 * @param join - Join character between columns
 * @param right - Right border character
 * @param horizontal - Horizontal line character
 * @param padding - Cell padding the border must span (0 in compact mode)
 */
export function renderHorizontalBorder(
  widths: number[],
  left: string,
  join: string,
  right: string,
  horizontal: string,
  padding = 1
): string {
  if (!left && !join && !right && !horizontal) {
    return '';
  }

  const segments = widths.map((width) => horizontal.repeat(width + padding * 2));
  return left + segments.join(join) + right;
}

/**
 * Render a row with borders
 * @param cells - Array of cell contents (already formatted and padded)
 * @param borders - Border characters
 * @param padding - Spaces inside each bordered cell (0 in compact mode).
 *   Without borders the single-space separator stays — dropping it would
 *   visually merge adjacent columns.
 */
export function renderRow(cells: string[], borders: BorderChars, padding = 1): string {
  if (!borders.left && !borders.right) {
    return cells.join(' ');
  }

  const pad = ' '.repeat(padding);
  return borders.left + pad + cells.join(`${pad}${borders.left}${pad}`) + pad + borders.right;
}
