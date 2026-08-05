/**
 * Table rendering logic
 */

import type { TableLayout, TableColumn, TableOptions } from './types.js';

import prism from '../../prism/index.js';
import { settings } from '../../core/index.js';
import { isCI, isTTY } from '../../utilities/common.js';
import stringWidth from '../../core/utils/string-width.js';
import { getTotalTableWidth, calculateColumnWidths } from './column-width.js';
import { renderRow, getBorderChars, renderHorizontalBorder } from './borders.js';
import { alignText, formatCell, truncateText, formatHeader, formatCellLines } from './cell-formatter.js';

/**
 * Key marking the synthetic column that `showRowNumbers` prepends.
 *
 * The column carries no data — renderers detect the key and emit the
 * 1-based row index at render time, so user rows are never copied or
 * mutated and row identity survives for selection sets and callbacks.
 */
export const ROW_NUMBER_KEY = '__xecRowNumber__';

/**
 * Build the synthetic `#` column for `showRowNumbers`, sized to the widest
 * index it will have to show.
 */
export function makeRowNumberColumn(totalRows: number): TableColumn {
  return {
    key: ROW_NUMBER_KEY,
    header: '#',
    width: Math.max(1, String(Math.max(totalRows, 1)).length),
    align: 'right',
  };
}

/**
 * Columns to lay out: the user's columns, plus the row-number column when
 * `showRowNumbers` is on.
 */
function effectiveColumns<T>(data: T[], options: TableOptions<T>): TableColumn<T>[] {
  if (!options.showRowNumbers) {
    return options.columns;
  }
  return [makeRowNumberColumn(data.length) as TableColumn<T>, ...options.columns];
}

/**
 * Whether the wrap strategy asks for multi-line cells.
 */
function wantsWrap(options: TableOptions<any>): boolean {
  return options.wordWrap === 'wrap' || options.wordWrap === true;
}

/**
 * Render the muted row-number cell for a data row.
 */
export function formatRowNumberCell(rowIndex: number, width: number): string {
  return settings.theme.muted(alignText(String(rowIndex + 1), width, 'right'));
}

/**
 * Calculate table layout
 */
function calculateLayout<T>(data: T[], options: TableOptions<T>): TableLayout<T> {
  const borders = getBorderChars(options.borders);
  const hasBorders = options.borders !== 'none';
  const padding = options.compact ? 0 : 1;

  const columns = calculateColumnWidths(data, effectiveColumns(data, options), {
    width: options.width,
    output: options.output,
    borders: options.borders,
    compact: options.compact,
  });

  const totalWidth = getTotalTableWidth(columns, hasBorders, padding);
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
 * Content width of a full-width message row (no-data, overflow indicator):
 * the column widths plus the separators between them.
 */
function messageRowWidth<T>(layout: TableLayout<T>, padding: number): number {
  const separatorWidth = layout.hasBorders && layout.borders.left ? 1 + padding * 2 : 1;
  return layout.columns.reduce(
    (sum, col, idx) => sum + col.width + (idx < layout.columns.length - 1 ? separatorWidth : 0),
    0
  );
}

/**
 * Render a centered full-width message as a bordered row.
 */
function renderMessageRow<T>(layout: TableLayout<T>, message: string, padding: number): string {
  const totalContentWidth = messageRowWidth(layout, padding);
  const pad = Math.max(0, totalContentWidth - stringWidth(message));
  const leftPad = Math.floor(pad / 2);
  const rightPad = pad - leftPad;
  const centered = ' '.repeat(leftPad) + message + ' '.repeat(rightPad);
  return renderRow([centered], layout.borders, padding);
}

/**
 * Render table header
 */
function renderHeader<T>(layout: TableLayout<T>, options: TableOptions<T>): string | null {
  if (options.showHeader === false) {
    return null;
  }

  const { columns, borders, hasBorders } = layout;
  const padding = options.compact ? 0 : 1;
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
      borders.top,
      padding
    );
    if (topBorder) {
      lines.push(topBorder);
    }
  }

  // Render header row
  lines.push(renderRow(headerCells, borders, padding));

  // Render separator after header
  if (hasBorders) {
    const separator = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.leftJoin,
      borders.cross,
      borders.rightJoin,
      borders.top,
      padding
    );
    if (separator) {
      lines.push(separator);
    }
  }

  return lines.join('\n');
}

/**
 * Format one data row into its physical lines.
 *
 * With `wordWrap: 'wrap'` a row may span several lines — the row's height is
 * the tallest cell, and shorter cells pad with blanks. Otherwise every row
 * is exactly one line.
 */
function formatRowLines<T>(
  row: T,
  rowIndex: number,
  layout: TableLayout<T>,
  options: TableOptions<T>,
  padding: number
): string[] {
  const { columns, borders } = layout;
  const wrap = wantsWrap(options);

  if (!wrap) {
    const cells = columns.map((columnLayout) => {
      if (columnLayout.column.key === ROW_NUMBER_KEY) {
        return formatRowNumberCell(rowIndex, columnLayout.width);
      }
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
    return [renderRow(cells, borders, padding)];
  }

  // Wrap mode: format every cell into lines, then zip them row-height deep.
  const cellLines = columns.map((columnLayout) => {
    if (columnLayout.column.key === ROW_NUMBER_KEY) {
      return [formatRowNumberCell(rowIndex, columnLayout.width)];
    }
    const value = (row as any)[columnLayout.column.key];
    return formatCellLines(
      value,
      row,
      columnLayout.column,
      columnLayout.width,
      options.alignment,
      options.cellStyle
    );
  });

  const rowHeight = Math.max(...cellLines.map((lines) => lines.length));
  const physicalLines: string[] = [];
  for (let line = 0; line < rowHeight; line++) {
    const cells = columns.map((columnLayout, columnIndex) => {
      const text = cellLines[columnIndex]![line];
      return text ?? ' '.repeat(columnLayout.width);
    });
    physicalLines.push(renderRow(cells, borders, padding));
  }
  return physicalLines;
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

  const padding = options.compact ? 0 : 1;
  const lines: string[] = [];

  // Determine if we should use alternating colors
  const useAlternateColors = options.alternateRows && isTTY(options.output ?? process.stdout) && !isCI();

  // maxHeight caps the body: when rows overflow, the last visible line
  // becomes an explicit overflow indicator instead of silently cutting.
  let visibleRows = data.length;
  let hiddenRows = 0;
  if (options.maxHeight !== undefined && options.maxHeight > 0 && data.length > options.maxHeight) {
    visibleRows = options.maxHeight - 1;
    hiddenRows = data.length - visibleRows;
  }

  for (let rowIndex = 0; rowIndex < visibleRows; rowIndex++) {
    const row = data[rowIndex]!;
    let rowLines = formatRowLines(row, rowIndex, layout, options, padding);

    // Apply row striping per physical line so ANSI stays balanced
    if (useAlternateColors && rowIndex % 2 === 1) {
      rowLines = rowLines.map((line) => settings.theme.muted(line));
    }

    lines.push(...rowLines);
  }

  if (hiddenRows > 0) {
    const noun = hiddenRows === 1 ? 'row' : 'rows';
    lines.push(settings.theme.muted(renderMessageRow(layout, `… ${hiddenRows} more ${noun}`, padding)));
  }

  return lines.join('\n');
}

/**
 * Render table footer: the optional per-column footer row (inside the
 * frame, above the bottom border), the bottom border itself, and the
 * optional footer text below the frame.
 *
 * Exported for the interactive renderer, which shares the layout shape.
 */
export function renderTableFooter<T>(
  data: T[],
  layout: TableLayout<T>,
  options: TableOptions<T>
): string | null {
  const { borders, hasBorders, columns } = layout;
  const padding = options.compact ? 0 : 1;

  const lines: string[] = [];
  const footerObject =
    typeof options.footer === 'object' && options.footer !== null ? options.footer : undefined;

  // Per-column footers form a real table row (e.g. totals), separated from
  // the body the same way the header is.
  if (footerObject?.columns) {
    if (hasBorders) {
      const separator = renderHorizontalBorder(
        columns.map((c) => c.width),
        borders.leftJoin,
        borders.cross,
        borders.rightJoin,
        borders.top,
        padding
      );
      if (separator) {
        lines.push(separator);
      }
    }

    const cells = columns.map((columnLayout) => {
      const raw = footerObject.columns![String(columnLayout.column.key)];
      const text = raw === undefined ? '' : typeof raw === 'function' ? raw(data) : raw;
      const fitted =
        stringWidth(text) > columnLayout.width
          ? truncateText(text, columnLayout.width, true)
          : text;
      return alignText(fitted, columnLayout.width, columnLayout.column.align ?? options.alignment);
    });
    lines.push(renderRow(cells, borders, padding));
  }

  // Render bottom border
  if (hasBorders) {
    const bottomBorder = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.bottomLeft,
      borders.bottomJoin,
      borders.bottomRight,
      borders.bottom,
      padding
    );
    if (bottomBorder) {
      lines.push(bottomBorder);
    }
  }

  // Render footer text below the frame
  const footerText =
    typeof options.footer === 'string'
      ? options.footer
      : footerObject?.text !== undefined
        ? typeof footerObject.text === 'function'
          ? footerObject.text(data)
          : footerObject.text
        : undefined;
  if (footerText) {
    lines.push(settings.theme.muted(footerText));
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
    const padding = options.compact ? 0 : 1;
    const header = renderHeader(layout, options);
    const footer = renderTableFooter([], layout, options);
    const noDataRow = renderMessageRow(layout, '(no data)', padding);

    const parts = [header, prism.dim(noDataRow), footer].filter((p) => p !== null);
    return parts.join('\n');
  }

  // Calculate layout
  const layout = calculateLayout(data, options);

  // Render all parts
  const header = renderHeader(layout, options);
  const body = renderBody(data, layout, options);
  const footer = renderTableFooter(data, layout, options);

  // Combine parts
  const parts = [header, body, footer].filter((p) => p !== null);
  return parts.join('\n');
}
