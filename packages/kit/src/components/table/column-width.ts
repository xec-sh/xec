/**
 * Column width calculation utilities
 */

import { getColumns } from '../../core/index.js';
import stringWidth from '../../core/utils/string-width.js';

import type { TableColumn, ColumnLayout, TableOptions } from './types.js';

/**
 * Calculate the visual width of content
 */
function getContentWidth(content: string): number {
  return stringWidth(content);
}

/**
 * Get the maximum content width for a column across all rows
 */
function getColumnContentWidth<T>(
  data: T[],
  column: TableColumn<T>,
  maxSampleSize = 100
): number {
  // Sample data to avoid performance issues with large datasets
  const sample = data.length > maxSampleSize ? data.slice(0, maxSampleSize) : data;

  let maxWidth = getContentWidth(column.header);

  for (const row of sample) {
    const value = (row as any)[column.key];
    let cellContent: string;

    if (column.format) {
      cellContent = column.format(value, row);
    } else {
      cellContent = value != null ? String(value) : '';
    }

    const width = getContentWidth(cellContent);
    if (width > maxWidth) {
      maxWidth = width;
    }
  }

  return maxWidth;
}

/**
 * Calculate column widths based on strategy
 */
export function calculateColumnWidths<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: Pick<TableOptions<T>, 'width' | 'output'>
): ColumnLayout[] {
  const terminalWidth = getColumns(options.output ?? process.stdout);
  const hasBorders = true; // Will be determined by caller

  // Calculate border overhead
  const borderOverhead = hasBorders ? (columns.length + 1) + columns.length * 2 : columns.length - 1; // separators + padding

  // Determine available width
  let availableWidth: number;
  if (options.width === 'full' || options.width === undefined) {
    availableWidth = terminalWidth - borderOverhead;
  } else if (options.width === 'auto') {
    // Auto will be calculated based on content
    availableWidth = Infinity;
  } else {
    // Percentage of terminal width
    const percentage = Math.max(0, Math.min(1, options.width));
    availableWidth = Math.floor(terminalWidth * percentage) - borderOverhead;
  }

  // First pass: calculate fixed and content widths
  const layouts: ColumnLayout[] = [];
  let remainingWidth = availableWidth;
  const autoColumns: ColumnLayout[] = [];

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i]!;
    const layout: ColumnLayout = {
      column,
      index: i,
      width: 0,
    };

    if (typeof column.width === 'number') {
      // Fixed width
      layout.width = column.width;
      remainingWidth -= column.width;
    } else if (column.width === 'content' || options.width === 'auto') {
      // Content-based width
      layout.width = getColumnContentWidth(data, column);
      if (options.width === 'auto') {
        remainingWidth -= layout.width;
      } else {
        autoColumns.push(layout);
      }
    } else {
      // Auto width (distribute remaining space)
      autoColumns.push(layout);
    }

    layouts.push(layout);
  }

  // Second pass: distribute remaining width to auto columns
  if (autoColumns.length > 0 && remainingWidth > 0 && options.width !== 'auto') {
    // For 'content' columns, use actual content width if it fits
    const contentColumns = autoColumns.filter((l) => l.column.width === 'content');
    const trueAutoColumns = autoColumns.filter((l) => l.column.width !== 'content');

    // Allocate to content columns first
    for (const layout of contentColumns) {
      if (remainingWidth >= layout.width) {
        remainingWidth -= layout.width;
      } else {
        // Not enough space, will need to share with auto columns
        trueAutoColumns.push(layout);
        layout.width = 0;
      }
    }

    // Distribute remaining to auto columns
    if (trueAutoColumns.length > 0) {
      const widthPerColumn = Math.floor(remainingWidth / trueAutoColumns.length);
      for (const layout of trueAutoColumns) {
        layout.width = Math.max(3, widthPerColumn); // Minimum width of 3
      }
    }
  }

  // Handle case where total width exceeds available
  if (options.width !== 'auto') {
    const totalWidth = layouts.reduce((sum, l) => sum + l.width, 0);
    if (totalWidth > availableWidth) {
      // Proportionally reduce all columns
      const scale = availableWidth / totalWidth;
      for (const layout of layouts) {
        layout.width = Math.max(3, Math.floor(layout.width * scale));
      }

      // Distribute remaining space to avoid gaps
      // After flooring, we may have unused space that causes misalignment
      const scaledTotal = layouts.reduce((sum, l) => sum + l.width, 0);
      let remainingSpace = availableWidth - scaledTotal;

      // Distribute remaining space one character at a time to the largest columns
      // This ensures we use all available width and borders align properly
      while (remainingSpace > 0) {
        // Find the largest column that can accept more width
        let largestLayout = layouts[0];
        for (const layout of layouts) {
          if (layout.width > (largestLayout?.width ?? 0)) {
            largestLayout = layout;
          }
        }

        if (largestLayout) {
          largestLayout.width++;
          remainingSpace--;
        } else {
          break; // Safety check
        }
      }
    }
  }

  return layouts;
}

/**
 * Get total table width including borders
 */
export function getTotalTableWidth(layouts: ColumnLayout[], hasBorders: boolean): number {
  const contentWidth = layouts.reduce((sum, l) => sum + l.width, 0);
  if (!hasBorders) {
    return contentWidth + (layouts.length - 1); // Just separators
  }
  return contentWidth + (layouts.length + 1) + layouts.length * 2; // borders + padding
}
