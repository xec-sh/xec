/**
 * Cell formatting utilities
 */

import stringWidth from '../../core/utils/string-width.js';
import getStringTruncatedWidth from '../../core/utils/string-truncated-width.js';

import type { Alignment, TableColumn } from './types.js';

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
 * Truncate text to fit within width
 */
export function truncateText(text: string, width: number, ellipsis = true): string {
  const textWidth = stringWidth(text);

  if (textWidth <= width) {
    return text;
  }

  if (!ellipsis || width < 3) {
    const result = getStringTruncatedWidth(text, { limit: width });
    return text.slice(0, result.index);
  }

  // Reserve space for ellipsis
  const result = getStringTruncatedWidth(text, { limit: width - 3 });
  return text.slice(0, result.index) + '...';
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
