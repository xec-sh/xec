/**
 * Interactive table rendering
 */

import type { TableState, TableLayout, VirtualTableOptions, InteractiveTableOptions } from './types.js';

import prism from '../../prism/index.js';
import { settings } from '../../core/index.js';
import { isSelected } from './table-selector.js';
import { getTotalTableWidth, calculateColumnWidths } from './column-width.js';
import { renderRow, getBorderChars, renderHorizontalBorder } from './borders.js';
import { S_BAR, unicodeOr, formatInstructionFooter } from '../../utilities/common.js';
import { alignText, formatCell, formatHeader, truncateTextStart } from './cell-formatter.js';
import { ROW_NUMBER_KEY, renderTableFooter, makeRowNumberColumn, formatRowNumberCell } from './table-renderer.js';

/** Caret shown at the end of the inline edit buffer. */
const S_EDIT_CARET = unicodeOr('▌', '|');

/**
 * Calculate layout for interactive table
 */
function calculateInteractiveLayout<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableLayout<T> {
  const borders = getBorderChars(options.borders);
  const hasBorders = options.borders !== 'none';
  const padding = options.compact ? 0 : 1;

  const layoutColumns = options.showRowNumbers
    ? [makeRowNumberColumn(state.data.length), ...options.columns]
    : options.columns;

  const columns = calculateColumnWidths(state.data, layoutColumns, {
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
 * Render table header with sort indicators and the focused-column marker
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
  const padding = options.compact ? 0 : 1;
  const headerStyle = options.headerStyle ?? prism.bold;
  const focusedColumn = options.columns[state.focusedColumn];
  const showColumnFocus = Boolean(options.sortable || options.editable);

  // Format header cells with sort indicators
  const headerCells = columns.map((columnLayout) => {
    let headerText = columnLayout.column.header;

    // Add sort indicator if this column is sorted
    if (state.sort && state.sort.key === columnLayout.column.key) {
      const indicator = state.sort.direction === 'asc' ? ' ↑' : ' ↓';
      headerText = headerText + indicator;
    }

    // The focused column (the one `s` sorts and `e` edits) reads in the
    // accent role, so ←/→ has visible feedback
    const style =
      showColumnFocus && columnLayout.column === focusedColumn
        ? (text: string) => settings.theme.accent(headerStyle(text))
        : headerStyle;

    // Create modified column with updated header text
    const modifiedColumn = { ...columnLayout.column, header: headerText };
    return formatHeader(modifiedColumn, columnLayout.width, options.alignment, style);
  });

  const lines: string[] = [];

  // Top border
  if (hasBorders) {
    const topBorder = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.topLeft,
      borders.topJoin,
      borders.topRight,
      borders.top,
      padding
    );
    if (topBorder) lines.push(topBorder);
  }

  // Header row
  lines.push(renderRow(headerCells, borders, padding));

  // Separator
  if (hasBorders) {
    const separator = renderHorizontalBorder(
      columns.map((c) => c.width),
      borders.leftJoin,
      borders.cross,
      borders.rightJoin,
      borders.top,
      padding
    );
    if (separator) lines.push(separator);
  }

  return lines.join('\n');
}

/**
 * Render the focused cell's inline edit buffer: the tail of the typed value
 * (the caret end must stay visible) plus a caret, in the accent role.
 */
function renderEditingCell(editValue: string, width: number): string {
  const visible = truncateTextStart(editValue, Math.max(1, width - 1));
  const text = alignText(visible + S_EDIT_CARET, width, 'left');
  return settings.theme.accent(text);
}

/**
 * Render visible data rows with focus and selection indicators
 */
function renderInteractiveBody<T>(
  state: TableState<T>,
  layout: TableLayout<T>,
  options: InteractiveTableOptions<T>
): string {
  const padding = options.compact ? 0 : 1;

  if (state.data.length === 0) {
    // Create "no data" or "No results" row with proper borders
    const message = state.filterQuery ? 'No results' : '(no data)';

    // Calculate total content width (sum of column widths + separators between columns)
    const separatorWidth = layout.hasBorders && layout.borders.left ? 1 + padding * 2 : 1;
    const totalContentWidth = layout.columns.reduce((sum, col, idx) => sum + col.width + (idx < layout.columns.length - 1 ? separatorWidth : 0), 0);

    const pad = Math.max(0, totalContentWidth - message.length);
    const leftPad = Math.floor(pad / 2);
    const rightPad = pad - leftPad;
    const centeredMessage = ' '.repeat(leftPad) + message + ' '.repeat(rightPad);

    return prism.dim(renderRow([centeredMessage], layout.borders, padding));
  }

  const { columns, borders } = layout;
  const lines: string[] = [];
  const [rangeStart, rangeEnd] = state.visibleRange;
  const focusedColumn = options.columns[state.focusedColumn];
  const useAlternateColors = options.alternateRows === true;

  for (let i = rangeStart; i < rangeEnd && i < state.data.length; i++) {
    const row = state.data[i]!;
    const isFocused = i === state.focusedRow;
    const isRowSelected = isSelected(state, row);

    // Format cells and apply styling to each cell (not to the whole row with borders)
    const cells = columns.map((columnLayout) => {
      const isFocusedCell = isFocused && columnLayout.column === focusedColumn;

      // Inline edit: the focused cell shows the edit buffer in place
      if (state.isEditing && isFocusedCell) {
        return renderEditingCell(state.editValue, columnLayout.width);
      }

      let cell: string;
      if (columnLayout.column.key === ROW_NUMBER_KEY) {
        cell = formatRowNumberCell(i, columnLayout.width);
      } else {
        const value = (row as any)[columnLayout.column.key];
        cell = formatCell(
          value,
          row,
          columnLayout.column,
          columnLayout.width,
          options.alignment,
          options.cellStyle
        );
      }

      // Apply focus/selection styling to individual cells
      // This ensures borders remain unstyled while cell content is highlighted.
      // With editing enabled focus narrows to a single cell (the edit target);
      // otherwise the whole row highlights as before.
      if (isFocused && options.navigable !== false && !state.isEditing) {
        if (!options.editable) {
          cell = prism.inverse(cell);
        } else if (isFocusedCell) {
          cell = prism.inverse(cell);
        }
      } else if (isRowSelected && options.selectable && options.selectable !== 'none') {
        cell = settings.theme.accent(cell);
      } else if (useAlternateColors && i % 2 === 1) {
        // Stripe rows that carry no other state so wide tables stay scannable
        cell = settings.theme.muted(cell);
      }

      return cell;
    });

    // Render row with borders (borders won't be styled)
    const rowContent = renderRow(cells, borders, padding);

    lines.push(rowContent);
  }

  return lines.join('\n');
}

/**
 * Render status bar
 */
function renderStatusBar<T>(
  state: TableState<T>,
  options: VirtualTableOptions<T>
): string {
  const parts: string[] = [];

  if (options.message) {
    parts.push(settings.theme.accent(`${S_BAR} `) + options.message);
  }

  // Selection info
  if (options.selectable && options.selectable !== 'none' && state.selected.size > 0) {
    parts.push(settings.theme.success(`${state.selected.size} selected`));
  }

  // Filter info
  if (state.filterQuery) {
    const filterText = `Filter: ${state.filterQuery}`;
    const countText = `${state.data.length}/${state.originalData.length}`;
    parts.push(settings.theme.warning(filterText) + ' ' + settings.theme.muted(countText));
  }

  // Navigation info; `+` marks a dataset that can still grow via loadMore
  if (state.data.length > 0) {
    const more = state.hasMore ? '+' : '';
    parts.push(settings.theme.muted(`Row ${state.focusedRow + 1}/${state.data.length}${more}`));
  }

  // In-flight loadMore batch
  if (state.isLoading) {
    const indicator =
      typeof options.loadingIndicator === 'function'
        ? options.loadingIndicator()
        : options.loadingIndicator ?? 'Loading…';
    parts.push(settings.theme.activity(indicator));
  }

  return parts.length > 0 ? parts.join(' • ') : '';
}

/**
 * Key hints for the current mode, in the same register the prompts use.
 */
function buildInstructions<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): string[] {
  if (state.isFiltering) {
    return ['Type to filter', 'Enter: apply', 'Esc: cancel'];
  }
  if (state.isEditing) {
    return ['Type to edit', 'Enter: save', 'Esc: cancel'];
  }

  const instructions: string[] = [];
  if (options.navigable !== false) {
    instructions.push('↑/↓ to navigate');
  }
  if (options.sortable || options.editable) {
    instructions.push('←/→: column');
  }
  if (options.selectable && options.selectable !== 'none') {
    instructions.push('Space: select');
  }
  if (options.sortable) {
    instructions.push('s: sort');
  }
  if (options.filterable) {
    instructions.push('/: filter');
  }
  if (options.editable) {
    instructions.push('e: edit');
  }
  instructions.push('Enter: confirm');
  return instructions;
}

/**
 * Render complete interactive table
 */
export function renderInteractiveTable<T>(
  state: TableState<T>,
  options: VirtualTableOptions<T>
): string {
  const layout = calculateInteractiveLayout(state, options);

  const parts: string[] = [];

  // Header
  const header = renderInteractiveHeader(layout, state, options);
  if (header) parts.push(header);

  // Body
  const body = renderInteractiveBody(state, layout, options);
  parts.push(body);

  // Footer row(s) and bottom border
  const footer = renderTableFooter(state.data, layout, options);
  if (footer) parts.push(footer);

  // Status bar
  const statusBar = renderStatusBar(state, options);
  if (statusBar) parts.push(statusBar);

  // Filter input indicator
  if (state.isFiltering) {
    const placeholder =
      !state.filterQuery && options.filterPlaceholder
        ? settings.theme.muted(options.filterPlaceholder)
        : '';
    parts.push(settings.theme.accent('> ') + (state.filterQuery || placeholder));
  }

  // Error message
  if (state.error) {
    parts.push(settings.theme.error(`✖ ${state.error}`));
  }

  // Key hints
  parts.push(...formatInstructionFooter(buildInstructions(state, options), false));

  return parts.join('\n');
}
