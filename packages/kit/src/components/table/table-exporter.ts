/**
 * Table export utilities
 *
 * Export table data to various formats:
 * - CSV (Comma-Separated Values)
 * - JSON (JavaScript Object Notation)
 * - TXT (Plain text table)
 * - TSV (Tab-Separated Values)
 */

import { formatCellValue } from './cell-formatter.js';

import type { TableColumn } from './types.js';

/**
 * Export options
 */
export interface ExportOptions {
  /** Include headers in export */
  includeHeaders?: boolean;

  /** Line ending style */
  lineEnding?: '\n' | '\r\n';

  /** CSV delimiter */
  delimiter?: string;

  /** Quote strings in CSV */
  quoteStrings?: boolean;

  /** Pretty print JSON */
  prettyPrint?: boolean;

  /** JSON indentation */
  indent?: number;

  /** Columns to export (defaults to all) */
  columns?: string[];
}

/**
 * Escape CSV value
 */
function escapeCSV(value: string, quote: boolean = false): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || quote) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Export table data to CSV format
 *
 * @example
 * ```typescript
 * const csv = exportToCSV(data, columns, { includeHeaders: true });
 * fs.writeFileSync('output.csv', csv);
 * ```
 */
export function exportToCSV<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  const {
    includeHeaders = true,
    lineEnding = '\n',
    delimiter = ',',
    quoteStrings = true,
    columns: columnKeys,
  } = options;

  // Filter columns if specified
  const exportColumns = columnKeys
    ? columns.filter((col) => columnKeys.includes(String(col.key)))
    : columns;

  if (exportColumns.length === 0) {
    throw new Error('No columns to export');
  }

  const lines: string[] = [];

  // Add headers
  if (includeHeaders) {
    const headers = exportColumns
      .map((col) => escapeCSV(col.header, quoteStrings))
      .join(delimiter);
    lines.push(headers);
  }

  // Add data rows
  for (const row of data) {
    const values = exportColumns.map((col) => {
      const value = (row as any)[col.key];
      const formatted = formatCellValue(value, row, col);
      return escapeCSV(formatted, quoteStrings);
    });
    lines.push(values.join(delimiter));
  }

  return lines.join(lineEnding);
}

/**
 * Export table data to TSV (Tab-Separated Values) format
 *
 * @example
 * ```typescript
 * const tsv = exportToTSV(data, columns);
 * ```
 */
export function exportToTSV<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  return exportToCSV(data, columns, {
    ...options,
    delimiter: '\t',
    quoteStrings: false,
  });
}

/**
 * Export table data to JSON format
 *
 * @example
 * ```typescript
 * const json = exportToJSON(data, columns, { prettyPrint: true });
 * fs.writeFileSync('output.json', json);
 * ```
 */
export function exportToJSON<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  const { prettyPrint = false, indent = 2, columns: columnKeys } = options;

  // Filter columns if specified
  const exportColumns = columnKeys
    ? columns.filter((col) => columnKeys.includes(String(col.key)))
    : columns;

  if (exportColumns.length === 0) {
    throw new Error('No columns to export');
  }

  // Map data to include only specified columns
  const exportData = data.map((row) => {
    const obj: any = {};
    for (const col of exportColumns) {
      const value = (row as any)[col.key];
      obj[col.key as string] = value;
    }
    return obj;
  });

  return prettyPrint ? JSON.stringify(exportData, null, indent) : JSON.stringify(exportData);
}

/**
 * Export table data to plain text format
 * Creates a formatted text table similar to the rendered output
 *
 * @example
 * ```typescript
 * const txt = exportToText(data, columns, tableOptions);
 * console.log(txt);
 * ```
 */
export function exportToText<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  const { lineEnding = '\n', columns: columnKeys } = options;

  // Filter columns if specified
  const exportColumns = columnKeys
    ? columns.filter((col) => columnKeys.includes(String(col.key)))
    : columns;

  if (exportColumns.length === 0) {
    throw new Error('No columns to export');
  }

  const lines: string[] = [];

  // Calculate column widths
  const widths = exportColumns.map((col) => {
    const headerWidth = col.header.length;
    const maxContentWidth = Math.max(
      ...data.map((row) => {
        const value = (row as any)[col.key];
        return formatCellValue(value, row, col).length;
      }),
      0
    );
    return Math.max(headerWidth, maxContentWidth, typeof col.width === 'number' ? col.width : 10);
  });

  // Helper to pad text
  const pad = (text: string, width: number, align: 'left' | 'right' | 'center' = 'left'): string => {
    if (text.length >= width) return text;
    const padding = width - text.length;

    if (align === 'right') {
      return ' '.repeat(padding) + text;
    } else if (align === 'center') {
      const leftPad = Math.floor(padding / 2);
      const rightPad = padding - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    } else {
      return text + ' '.repeat(padding);
    }
  };

  // Create separator
  const separator = exportColumns.map((_, i) => '─'.repeat(widths[i]!)).join('─┼─');

  // Header
  const header = exportColumns
    .map((col, i) => pad(col.header, widths[i]!, col.align))
    .join(' │ ');
  lines.push(header);
  lines.push(separator);

  // Data rows
  for (const row of data) {
    const rowLine = exportColumns
      .map((col, i) => {
        const value = (row as any)[col.key];
        const formatted = formatCellValue(value, row, col);
        return pad(formatted, widths[i]!, col.align);
      })
      .join(' │ ');
    lines.push(rowLine);
  }

  return lines.join(lineEnding);
}

/**
 * Export table data to Markdown format
 *
 * @example
 * ```typescript
 * const md = exportToMarkdown(data, columns);
 * fs.writeFileSync('table.md', md);
 * ```
 */
export function exportToMarkdown<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  const { lineEnding = '\n', columns: columnKeys } = options;

  // Filter columns if specified
  const exportColumns = columnKeys
    ? columns.filter((col) => columnKeys.includes(String(col.key)))
    : columns;

  if (exportColumns.length === 0) {
    throw new Error('No columns to export');
  }

  const lines: string[] = [];

  // Header
  const header = exportColumns.map((col) => col.header).join(' | ');
  lines.push(`| ${header} |`);

  // Separator with alignment
  const separator = exportColumns
    .map((col) => {
      const align = col.align || 'left';
      if (align === 'center') return ':---:';
      if (align === 'right') return '---:';
      return '---';
    })
    .join(' | ');
  lines.push(`| ${separator} |`);

  // Data rows
  for (const row of data) {
    const values = exportColumns
      .map((col) => {
        const value = (row as any)[col.key];
        const formatted = formatCellValue(value, row, col);
        return formatted.replace(/\|/g, '\\|'); // Escape pipes
      })
      .join(' | ');
    lines.push(`| ${values} |`);
  }

  return lines.join(lineEnding);
}

/**
 * Export table data to HTML format
 *
 * @example
 * ```typescript
 * const html = exportToHTML(data, columns);
 * fs.writeFileSync('table.html', html);
 * ```
 */
export function exportToHTML<T>(
  data: T[],
  columns: TableColumn<T>[],
  options: ExportOptions = {}
): string {
  const { lineEnding = '\n', columns: columnKeys } = options;

  // Filter columns if specified
  const exportColumns = columnKeys
    ? columns.filter((col) => columnKeys.includes(String(col.key)))
    : columns;

  if (exportColumns.length === 0) {
    throw new Error('No columns to export');
  }

  const escapeHTML = (str: string): string => str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  const lines: string[] = [];
  lines.push('<table>');
  lines.push('  <thead>');
  lines.push('    <tr>');

  // Headers
  for (const col of exportColumns) {
    const alignAttr = col.align ? ` style="text-align: ${col.align}"` : '';
    lines.push(`      <th${alignAttr}>${escapeHTML(col.header)}</th>`);
  }

  lines.push('    </tr>');
  lines.push('  </thead>');
  lines.push('  <tbody>');

  // Data rows
  for (const row of data) {
    lines.push('    <tr>');
    for (const col of exportColumns) {
      const value = (row as any)[col.key];
      const formatted = formatCellValue(value, row, col);
      const alignAttr = col.align ? ` style="text-align: ${col.align}"` : '';
      lines.push(`      <td${alignAttr}>${escapeHTML(formatted)}</td>`);
    }
    lines.push('    </tr>');
  }

  lines.push('  </tbody>');
  lines.push('</table>');

  return lines.join(lineEnding);
}
