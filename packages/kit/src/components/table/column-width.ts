/**
 * Column width calculation utilities
 */

import type { TableColumn, ColumnLayout, TableOptions } from './types.js';

import { getColumns } from '../../core/index.js';
import stringWidth from '../../core/utils/string-width.js';
import { truncateText, plainCellText } from './cell-formatter.js';

type WidthOptions<T> = Pick<TableOptions<T>, 'width' | 'output' | 'borders' | 'compact'> & { focusedKey?: keyof T | string };

function tableWidth<T>(options: WidthOptions<T>): number {
  if (options.width === 'auto') return Infinity;
  const terminal = getColumns(options.output ?? process.stdout);
  return typeof options.width === 'number' ? Math.max(1, Math.floor(terminal * options.width)) : terminal;
}

/** Keep all physical lines inside the chosen output width, including status and footers. */
export function fitTableOutput<T>(text: string, options: WidthOptions<T>): string {
  const width = tableWidth(options);
  return text.split('\n').map(line => truncateText(line, width)).join('\n');
}

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

  let maxWidth = getContentWidth(plainCellText(column.header));

  for (const row of sample) {
    const value = (row as any)[column.key];
    let cellContent: string;

    if (column.format) {
      cellContent = column.format(value, row);
    } else {
      cellContent = plainCellText(value != null ? String(value) : '', true);
    }

    const width = Math.max(...cellContent.split('\n').map(getContentWidth));
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
  options: WidthOptions<T>
): ColumnLayout[] {
  const targetWidth = tableWidth(options);
  const originalColumns = columns;
  const cellOverhead = options.borders === 'none' ? 1 : 1 + (options.compact ? 0 : 2);
  const outerOverhead = options.borders === 'none' ? -1 : 1;
  const ranked = columns.map((column, index) => ({ column, index })).sort((a, b) => {
    const focus = Number(b.column.key === options.focusedKey) - Number(a.column.key === options.focusedKey);
    return focus || (b.column.priority ?? 0) - (a.column.priority ?? 0) || a.index - b.index;
  });
  const visible = new Set<number>();
  let occupied = outerOverhead;
  for (const { column, index } of ranked) {
    const minimum = typeof column.width === 'number'
      ? Math.min(column.width, 3)
      : Math.max(3, Math.min(12, stringWidth(plainCellText(column.header))));
    if (visible.size === 0 || occupied + minimum + cellOverhead <= targetWidth) {
      visible.add(index);
      occupied += minimum + cellOverhead;
    }
  }
  columns = columns.filter((_column, index) => visible.has(index));
  const hasBorders = options.borders !== 'none';
  const padding = options.compact ? 0 : 1;

  // Calculate border overhead: separators + per-cell padding
  const borderOverhead = hasBorders
    ? (columns.length + 1) + columns.length * padding * 2
    : columns.length - 1;

  const availableWidth = Math.max(1, targetWidth - borderOverhead);

  // First pass: calculate fixed and content widths
  const layouts: ColumnLayout[] = [];
  let remainingWidth = availableWidth;
  const autoColumns: ColumnLayout[] = [];

  for (let i = 0; i < columns.length; i++) {
    const column = columns[i]!;
    const layout: ColumnLayout = {
      column,
      index: originalColumns.indexOf(column),
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

  // Second pass: distribute remaining width to auto columns.
  // Runs even when no width is left: auto columns must still get the
  // minimum width of 3, otherwise they silently render as empty cells.
  if (autoColumns.length > 0 && options.width !== 'auto') {
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
 * @param padding - Cell padding (0 in compact mode)
 */
export function getTotalTableWidth(
  layouts: ColumnLayout[],
  hasBorders: boolean,
  padding = 1
): number {
  const contentWidth = layouts.reduce((sum, l) => sum + l.width, 0);
  if (!hasBorders) {
    return contentWidth + (layouts.length - 1); // Just separators
  }
  return contentWidth + (layouts.length + 1) + layouts.length * padding * 2; // borders + padding
}
