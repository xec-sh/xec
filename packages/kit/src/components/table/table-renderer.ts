/**
 * Table rendering logic
 */

import prism from '../../prism/index.js';
import { isCI, isTTY } from '../../utilities/common.js';
import { formatCell, formatHeader } from './cell-formatter.js';
import { getTotalTableWidth, calculateColumnWidths } from './column-width.js';
import { renderRow, getBorderChars, renderHorizontalBorder } from './borders.js';

import type { TableLayout, TableOptions } from './types.js';

/**
 * Calculate table layout
 */
function calculateLayout<T>(data: T[], options: TableOptions<T>): TableLayout<T> {
  const borders = getBorderChars(options.borders);
  const hasBorders = options.borders !== 'none';

  const columns = calculateColumnWidths(data, options.columns, {
    width: options.width,
    output: options.output,
  });

  const totalWidth = getTotalTableWidth(columns, hasBorders);
  const contentWidth = columns.reduce((sum, l) => sum + l.width, 0);

  return {
    columns,
    totalWidth,
    contentWidth,
    borders,
    hasBorders,
  };
}

/**
 * Render table header
 */
function renderHeader<T>(layout: TableLayout<T>, options: TableOptions<T>): string | null {
  if (options.showHeader === false) {
    return null;
  }

  const { columns, borders, hasBorders } = layout;
  const headerStyle = options.headerStyle ?? prism.bold;

  // Format header cells
  const headerCells = columns.map((columnLayout) =>
    formatHeader(
      columnLayout.column,
      columnLayout.width,
      options.alignment,
      headerStyle
    )
  );

  // Render top border
  const lines: string[] = [];
  if (hasBorders) {
    const topBorder = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.topLeft,
      borders.topJoin,
      borders.topRight,
      borders.top
    );
    if (topBorder) {
      lines.push(topBorder);
    }
  }

  // Render header row
  lines.push(renderRow(headerCells, borders));

  // Render separator after header
  if (hasBorders) {
    const separator = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.leftJoin,
      borders.cross,
      borders.rightJoin,
      borders.top
    );
    if (separator) {
      lines.push(separator);
    }
  }

  return lines.join('\n');
}

/**
 * Render table body (data rows)
 */
function renderBody<T>(
  data: T[],
  layout: TableLayout<T>,
  options: TableOptions<T>
): string | null {
  if (data.length === 0) {
    return null;
  }

  const { columns, borders } = layout;
  const lines: string[] = [];

  // Determine if we should use alternating colors
  const useAlternateColors = options.alternateRows && isTTY(options.output ?? process.stdout) && !isCI();

  for (let rowIndex = 0; rowIndex < data.length; rowIndex++) {
    const row = data[rowIndex]!;

    // Format cells for this row
    const cells = columns.map((columnLayout) => {
      const value = (row as any)[columnLayout.column.key];
      return formatCell(
        value,
        row,
        columnLayout.column,
        columnLayout.width,
        options.alignment,
        options.cellStyle
      );
    });

    // Apply row styling
    let rowContent = renderRow(cells, borders);
    if (useAlternateColors && rowIndex % 2 === 1) {
      rowContent = prism.dim(rowContent);
    }

    lines.push(rowContent);
  }

  return lines.join('\n');
}

/**
 * Render table footer
 */
function renderFooter<T>(
  data: T[],
  layout: TableLayout<T>,
  options: TableOptions<T>
): string | null {
  const { borders, hasBorders, columns } = layout;

  const lines: string[] = [];

  // Render bottom border
  if (hasBorders) {
    const bottomBorder = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.bottomLeft,
      borders.bottomJoin,
      borders.bottomRight,
      borders.bottom
    );
    if (bottomBorder) {
      lines.push(bottomBorder);
    }
  }

  // Render custom footer if provided
  if (options.footer) {
    if (typeof options.footer === 'string') {
      lines.push(options.footer);
    } else if (typeof options.footer === 'object' && options.footer.text) {
      const footerText =
        typeof options.footer.text === 'function'
          ? options.footer.text(data)
          : options.footer.text;
      lines.push(footerText);
    }
  }

  return lines.length > 0 ? lines.join('\n') : null;
}

/**
 * Render complete table
 */
export function renderTable<T>(data: T[], options: TableOptions<T>): string {
  // Handle empty data
  if (data.length === 0 && options.showHeader !== false) {
    const layout = calculateLayout([], options);
    const header = renderHeader(layout, options);
    const footer = renderFooter([], layout, options);

    // Create "no data" row with proper borders
    // Calculate total content width (sum of column widths + separators between columns)
    const separatorWidth = layout.hasBorders && layout.borders.left ? 3 : 1; // ' | ' or ' '
    const totalContentWidth = layout.columns.reduce((sum, col, idx) => sum + col.width + (idx < layout.columns.length - 1 ? separatorWidth : 0), 0);

    const message = '(no data)';
    const padding = Math.max(0, totalContentWidth - message.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    const centeredMessage = ' '.repeat(leftPad) + message + ' '.repeat(rightPad);

    const noDataRow = renderRow([centeredMessage], layout.borders);

    const parts = [header, prism.dim(noDataRow), footer].filter((p) => p !== null);
    return parts.join('\n');
  }

  // Calculate layout
  const layout = calculateLayout(data, options);

  // Render all parts
  const header = renderHeader(layout, options);
  const body = renderBody(data, layout, options);
  const footer = renderFooter(data, layout, options);

  // Combine parts
  const parts = [header, body, footer].filter((p) => p !== null);
  return parts.join('\n');
}
