/**
 * Cell formatting utilities
 */

import type { Alignment, TableColumn } from './types.js';

import { wrapAnsi } from '../../core/utils/wrap-ansi.js';
import stringWidth from '../../core/utils/string-width.js';
import getStringTruncatedWidth from '../../core/utils/string-truncated-width.js';

/**
 * Align text within a given width
 */
export function alignText(text: string, width: number, alignment: Alignment = 'left'): string {
  const textWidth = stringWidth(text);

  if (textWidth >= width) {
    return text;
  }

  const padding = width - textWidth;

  switch (alignment) {
    case 'right':
      return ' '.repeat(padding) + text;

    case 'center': {
      const leftPadding = Math.floor(padding / 2);
      const rightPadding = padding - leftPadding;
      return ' '.repeat(leftPadding) + text + ' '.repeat(rightPadding);
    }

    case 'left':
    default:
      return text + ' '.repeat(padding);
  }
}

/**
 * Close any ANSI styling left open by a truncation cut.
 * Slicing styled text drops the closing codes, so without a reset the
 * style would bleed into the padding, borders and following cells.
 */
function sealAnsi(sliced: string): string {
  return sliced.includes('\x1b[') ? sliced + '\x1b[0m' : sliced;
}

/**
 * Truncate text to fit within width
 */
export function truncateText(text: string, width: number, ellipsis = true): string {
  const textWidth = stringWidth(text);

  if (textWidth <= width) {
    return text;
  }

  if (!ellipsis || width < 3) {
    const result = getStringTruncatedWidth(text, { limit: width });
    return sealAnsi(text.slice(0, result.index));
  }

  // Reserve space for ellipsis
  const result = getStringTruncatedWidth(text, { limit: width - 3 });
  return sealAnsi(text.slice(0, result.index)) + '...';
}

/**
 * Keep the tail of a string within a given visual width.
 *
 * Used for the inline edit buffer: the caret sits at the end, so when the
 * typed value outgrows the cell it is the end that must stay visible, not
 * the start that `truncateText` keeps.
 */
export function truncateTextStart(text: string, width: number): string {
  if (stringWidth(text) <= width) {
    return text;
  }
  // Walk code points from the end until the width budget is spent.
  const chars = Array.from(text);
  let used = 0;
  let start = chars.length;
  while (start > 0 && used + stringWidth(chars[start - 1]!) <= width) {
    used += stringWidth(chars[start - 1]!);
    start--;
  }
  return chars.slice(start).join('');
}

/**
 * Format cell value to string
 */
export function formatCellValue<T>(
  value: any,
  row: T,
  column: TableColumn<T>
): string {
  if (column.format) {
    return column.format(value, row);
  }

  if (value == null) {
    return '';
  }

  return String(value);
}

/**
 * Apply cell styling
 */
export function applyCellStyle<T>(
  text: string,
  value: any,
  row: T,
  column: TableColumn<T>,
  defaultStyle?: (text: string, row: T, column: TableColumn<T>) => string
): string {
  if (column.style) {
    return column.style(text, value, row);
  }

  if (defaultStyle) {
    return defaultStyle(text, row, column);
  }

  return text;
}

/**
 * Format and align a cell
 */
export function formatCell<T>(
  value: any,
  row: T,
  column: TableColumn<T>,
  width: number,
  defaultAlignment: Alignment = 'left',
  defaultStyle?: (text: string, row: T, column: TableColumn<T>) => string
): string {
  // Format the value
  let formatted = formatCellValue(value, row, column);

  // Truncate if needed
  const shouldTruncate = column.ellipsis !== false;
  if (stringWidth(formatted) > width) {
    formatted = truncateText(formatted, width, shouldTruncate);
  }

  // Align the text
  const alignment = column.align ?? defaultAlignment;
  formatted = alignText(formatted, width, alignment);

  // Apply styling
  formatted = applyCellStyle(formatted, value, row, column, defaultStyle);

  return formatted;
}

/**
 * Format a cell into wrapped lines for `wordWrap: 'wrap'`.
 *
 * Instead of truncating, the value is broken at the column width and every
 * physical line is aligned and styled on its own — styling per line keeps
 * ANSI sequences from leaking across the border characters that the row
 * renderer interleaves between cells.
 */
export function formatCellLines<T>(
  value: any,
  row: T,
  column: TableColumn<T>,
  width: number,
  defaultAlignment: Alignment = 'left',
  defaultStyle?: (text: string, row: T, column: TableColumn<T>) => string
): string[] {
  const formatted = formatCellValue(value, row, column);
  const alignment = column.align ?? defaultAlignment;

  const wrapped = stringWidth(formatted) > width
    ? wrapAnsi(formatted, width, { hard: true, trim: false })
    : formatted;

  return wrapped.split('\n').map((line, index) => {
    // The space a line broke at would otherwise lead the continuation line;
    // the first line keeps the value's own leading whitespace.
    const content = index > 0 ? line.replace(/^ +/, '') : line;
    // A word longer than the column wraps hard, but pathological cases
    // (width < 1) still need the truncation guard.
    const fitted = stringWidth(content) > width ? truncateText(content, width, false) : content;
    const aligned = alignText(fitted, width, alignment);
    return applyCellStyle(aligned, value, row, column, defaultStyle);
  });
}

/**
 * Format header cell
 */
export function formatHeader(
  column: TableColumn,
  width: number,
  defaultAlignment: Alignment = 'left',
  style?: (text: string) => string
): string {
  let text = column.header;

  // Truncate if needed
  if (stringWidth(text) > width) {
    text = truncateText(text, width, true);
  }

  // Align
  const alignment = column.align ?? defaultAlignment;
  text = alignText(text, width, alignment);

  // Apply style
  if (style) {
    text = style(text);
  }

  return text;
}
