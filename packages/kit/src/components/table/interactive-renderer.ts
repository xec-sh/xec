/**
 * Interactive table rendering
 */

import prism from '../../prism/index.js';
import { isSelected } from './table-selector.js';
import { S_BAR } from '../../utilities/common.js';
import { formatCell, formatHeader } from './cell-formatter.js';
import { getTotalTableWidth, calculateColumnWidths } from './column-width.js';
import { renderRow, getBorderChars, renderHorizontalBorder } from './borders.js';

import type { TableState, TableLayout, InteractiveTableOptions } from './types.js';

/**
 * Calculate layout for interactive table
 */
function calculateInteractiveLayout<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableLayout<T> {
  const borders = getBorderChars(options.borders);
  const hasBorders = options.borders !== 'none';

  const columns = calculateColumnWidths(state.data, options.columns, {
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
 * Render table header with sort indicators
 */
function renderInteractiveHeader<T>(
  layout: TableLayout<T>,
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): string {
  if (options.showHeader === false) {
    return '';
  }

  const { columns, borders, hasBorders } = layout;
  const headerStyle = options.headerStyle ?? prism.bold;

  // Format header cells with sort indicators
  const headerCells = columns.map((columnLayout) => {
    let headerText = columnLayout.column.header;

    // Add sort indicator if this column is sorted
    if (state.sort && state.sort.key === columnLayout.column.key) {
      const indicator = state.sort.direction === 'asc' ? ' ↑' : ' ↓';
      headerText = headerText + indicator;
    }

    // Create modified column with updated header text
    const modifiedColumn = { ...columnLayout.column, header: headerText };
    return formatHeader(modifiedColumn, columnLayout.width, options.alignment, headerStyle);
  });

  const lines: string[] = [];

  // Top border
  if (hasBorders) {
    const topBorder = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.topLeft,
      borders.topJoin,
      borders.topRight,
      borders.top
    );
    if (topBorder) lines.push(topBorder);
  }

  // Header row
  lines.push(renderRow(headerCells, borders));

  // Separator
  if (hasBorders) {
    const separator = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.leftJoin,
      borders.cross,
      borders.rightJoin,
      borders.top
    );
    if (separator) lines.push(separator);
  }

  return lines.join('\n');
}

/**
 * Render visible data rows with focus and selection indicators
 */
function renderInteractiveBody<T>(
  state: TableState<T>,
  layout: TableLayout<T>,
  options: InteractiveTableOptions<T>
): string {
  if (state.data.length === 0) {
    // Create "no data" or "No results" row with proper borders
    const message = state.filterQuery ? 'No results' : '(no data)';

    // Calculate total content width (sum of column widths + separators between columns)
    const separatorWidth = layout.hasBorders && layout.borders.left ? 3 : 1; // ' | ' or ' '
    const totalContentWidth = layout.columns.reduce((sum, col, idx) => {
      return sum + col.width + (idx < layout.columns.length - 1 ? separatorWidth : 0);
    }, 0);

    const padding = Math.max(0, totalContentWidth - message.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    const centeredMessage = ' '.repeat(leftPad) + message + ' '.repeat(rightPad);

    return prism.dim(renderRow([centeredMessage], layout.borders));
  }

  const { columns, borders } = layout;
  const lines: string[] = [];
  const [rangeStart, rangeEnd] = state.visibleRange;

  for (let i = rangeStart; i < rangeEnd && i < state.data.length; i++) {
    const row = state.data[i]!;
    const isFocused = i === state.focusedRow;
    const isRowSelected = isSelected(state, row);

    // Format cells and apply styling to each cell (not to the whole row with borders)
    const cells = columns.map((columnLayout) => {
      const value = (row as any)[columnLayout.column.key];
      let cell = formatCell(
        value,
        row,
        columnLayout.column,
        columnLayout.width,
        options.alignment,
        options.cellStyle
      );

      // Apply focus/selection styling to individual cells
      // This ensures borders remain unstyled while cell content is highlighted
      if (isFocused && options.navigable !== false) {
        cell = prism.inverse(cell);
      } else if (isRowSelected && options.selectable && options.selectable !== 'none') {
        cell = prism.cyan(cell);
      }

      return cell;
    });

    // Render row with borders (borders won't be styled)
    const rowContent = renderRow(cells, borders);

    lines.push(rowContent);
  }

  return lines.join('\n');
}

/**
 * Render status bar
 */
function renderStatusBar<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): string {
  const parts: string[] = [];

  if (options.message) {
    parts.push(prism.cyan(`${S_BAR} `) + options.message);
  }

  // Selection info
  if (options.selectable && options.selectable !== 'none' && state.selected.size > 0) {
    parts.push(prism.green(`${state.selected.size} selected`));
  }

  // Filter info
  if (state.filterQuery) {
    const filterText = `Filter: ${state.filterQuery}`;
    const countText = `${state.data.length}/${state.originalData.length}`;
    parts.push(prism.yellow(filterText) + ' ' + prism.dim(countText));
  }

  // Navigation info
  if (state.data.length > 0) {
    parts.push(prism.dim(`Row ${state.focusedRow + 1}/${state.data.length}`));
  }

  return parts.length > 0 ? parts.join(' • ') : '';
}

/**
 * Render complete interactive table
 */
export function renderInteractiveTable<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): string {
  const layout = calculateInteractiveLayout(state, options);

  const parts: string[] = [];

  // Header
  const header = renderInteractiveHeader(layout, state, options);
  if (header) parts.push(header);

  // Body
  const body = renderInteractiveBody(state, layout, options);
  parts.push(body);

  // Bottom border
  if (layout.hasBorders) {
    const bottomBorder = renderHorizontalBorder(
      layout.columns.map((c) => c.width),
      layout.borders.bottomLeft,
      layout.borders.bottomJoin,
      layout.borders.bottomRight,
      layout.borders.bottom
    );
    if (bottomBorder) parts.push(bottomBorder);
  }

  // Status bar
  const statusBar = renderStatusBar(state, options);
  if (statusBar) parts.push(statusBar);

  // Filter input indicator
  if (state.isFiltering) {
    parts.push(prism.cyan('> ') + (state.filterQuery || ''));
  }

  // Error message
  if (state.error) {
    parts.push(prism.red(`✖ ${state.error}`));
  }

  return parts.join('\n');
}
