/**
 * Table inline editing utilities (Phase 3)
 *
 * Provides functions for managing cell editing state and operations.
 */

import type { TableState, InteractiveTableOptions, TableColumn } from './types.js';

/**
 * Enter edit mode for current cell
 */
export function enterEditMode<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!options.editable) {
    return state;
  }

  if (state.data.length === 0) {
    return state;
  }

  const row = state.data[state.focusedRow];
  if (!row) {
    return state;
  }

  const column = options.columns[state.focusedColumn];
  if (!column) {
    return state;
  }

  // Check if column is editable
  if (options.editableColumns && !options.editableColumns.includes(String(column.key))) {
    return state;
  }

  // Get current value
  const currentValue = (row as any)[column.key];
  const editValue = currentValue != null ? String(currentValue) : '';

  return {
    ...state,
    isEditing: true,
    editValue,
  };
}

/**
 * Exit edit mode without saving
 */
export function exitEditMode<T>(state: TableState<T>): TableState<T> {
  return {
    ...state,
    isEditing: false,
    editValue: '',
  };
}

/**
 * Update edit value while editing
 */
export function updateEditValue<T>(state: TableState<T>, value: string): TableState<T> {
  if (!state.isEditing) {
    return state;
  }

  return {
    ...state,
    editValue: value,
  };
}

/**
 * Save edit and update the row
 */
export function saveEdit<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!state.isEditing) {
    return state;
  }

  const row = state.data[state.focusedRow];
  if (!row) {
    return exitEditMode(state);
  }

  const column = options.columns[state.focusedColumn];
  if (!column) {
    return exitEditMode(state);
  }

  const oldValue = (row as any)[column.key];
  const newValue = parseEditValue(state.editValue, oldValue);

  // Validate edit
  if (options.validateEdit) {
    const error = options.validateEdit(row, String(column.key), newValue);
    if (error) {
      return {
        ...state,
        error,
      };
    }
  }

  // Update row data
  const updatedRow = { ...row, [column.key]: newValue };
  const updatedData = [...state.data];
  updatedData[state.focusedRow] = updatedRow;

  // Update original data as well
  const originalIndex = state.originalData.indexOf(row);
  const updatedOriginalData = [...state.originalData];
  if (originalIndex >= 0) {
    updatedOriginalData[originalIndex] = updatedRow;
  }

  // Call edit callback
  if (options.onEdit) {
    options.onEdit(updatedRow, String(column.key), oldValue, newValue);
  }

  return {
    ...state,
    data: updatedData,
    originalData: updatedOriginalData,
    isEditing: false,
    editValue: '',
    error: undefined,
  };
}

/**
 * Parse edit value based on the type of original value
 */
function parseEditValue(editValue: string, originalValue: any): any {
  // Try to infer type from original value
  if (typeof originalValue === 'number') {
    const num = Number(editValue);
    return isNaN(num) ? originalValue : num;
  }

  if (typeof originalValue === 'boolean') {
    const lower = editValue.toLowerCase();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no') return false;
    return originalValue;
  }

  // Default to string
  return editValue;
}

/**
 * Check if current cell is editable
 */
export function isCellEditable<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): boolean {
  if (!options.editable) {
    return false;
  }

  if (state.data.length === 0) {
    return false;
  }

  const column = options.columns[state.focusedColumn];
  if (!column) {
    return false;
  }

  // Check if column is explicitly editable
  if (options.editableColumns && !options.editableColumns.includes(String(column.key))) {
    return false;
  }

  return true;
}

/**
 * Navigate to next editable column
 */
export function navigateToNextEditableColumn<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!options.editable) {
    return state;
  }

  const totalColumns = options.columns.length;
  let nextColumn = (state.focusedColumn + 1) % totalColumns;
  let attempts = 0;

  // Find next editable column
  while (attempts < totalColumns) {
    const column = options.columns[nextColumn];
    if (column && (!options.editableColumns || options.editableColumns.includes(String(column.key)))) {
      return {
        ...state,
        focusedColumn: nextColumn,
      };
    }
    nextColumn = (nextColumn + 1) % totalColumns;
    attempts++;
  }

  return state;
}

/**
 * Navigate to previous editable column
 */
export function navigateToPreviousEditableColumn<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): TableState<T> {
  if (!options.editable) {
    return state;
  }

  const totalColumns = options.columns.length;
  let prevColumn = (state.focusedColumn - 1 + totalColumns) % totalColumns;
  let attempts = 0;

  // Find previous editable column
  while (attempts < totalColumns) {
    const column = options.columns[prevColumn];
    if (column && (!options.editableColumns || options.editableColumns.includes(String(column.key)))) {
      return {
        ...state,
        focusedColumn: prevColumn,
      };
    }
    prevColumn = (prevColumn - 1 + totalColumns) % totalColumns;
    attempts++;
  }

  return state;
}

/**
 * Get current cell info
 */
export function getCurrentCellInfo<T>(
  state: TableState<T>,
  options: InteractiveTableOptions<T>
): {
  row: T | undefined;
  column: TableColumn<T> | undefined;
  value: any;
  isEditable: boolean;
} {
  const row = state.data[state.focusedRow];
  const column = options.columns[state.focusedColumn];
  const value = row && column ? (row as any)[column.key] : undefined;
  const isEditable = isCellEditable(state, options);

  return { row, column, value, isEditable };
}
