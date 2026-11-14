import * as jsYaml from 'js-yaml';
import { prism, table, spinner, type SpinnerResult, type SpinnerOptions } from '@xec-sh/kit';

export type OutputFormat = 'text' | 'json' | 'yaml' | 'csv';

export interface TableColumn {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
}

export interface TableData {
  columns: TableColumn[];
  rows: unknown[][];
}

export class OutputFormatter {
  private format: OutputFormat = 'text';
  private quiet = false;
  private verbose = false;
  private colors = true;

  setFormat(format: OutputFormat): void {
    this.format = format;
  }

  setQuiet(quiet: boolean): void {
    this.quiet = quiet;
  }

  setVerbose(verbose: boolean): void {
    this.verbose = verbose;
  }

  setColors(colors: boolean): void {
    this.colors = colors;
  }

  /**
   * Output a header section
   */
  header(title: string): void {
    if (this.quiet) return;
    const formatted = this.colors ? prism.bold.underline(title) : title;
    console.log();
    console.log(formatted);
    console.log();
  }

  /**
   * Simple logging methods
   */
  success(message: string): void {
    if (this.quiet) return;
    const formatted = this.colors ? prism.green(`✓ ${message}`) : `✓ ${message}`;
    console.log(formatted);
  }

  error(message: string | Error): void {
    const text = message instanceof Error ? message.message : message;
    const formatted = this.colors ? prism.red(`✗ ${text}`) : `✗ ${text}`;
    console.error(formatted);
  }

  warn(message: string): void {
    if (this.quiet) return;
    const formatted = this.colors ? prism.yellow(`⚠ ${message}`) : `⚠ ${message}`;
    console.warn(formatted);
  }

  info(message: string): void {
    if (this.quiet) return;
    console.log(message);
  }

  debug(message: string): void {
    if (!this.verbose || this.quiet) return;
    const formatted = this.colors ? prism.gray(`[DEBUG] ${message}`) : `[DEBUG] ${message}`;
    console.log(formatted);
  }

  /**
   * Format and output data based on current format
   */
  output(data: any, title?: string): void {
    if (this.quiet) return;

    if (title && this.format === 'text') {
      console.log(prism.bold(title));
      console.log();
    }

    switch (this.format) {
      case 'json':
        console.log(JSON.stringify(data, null, 2));
        break;
      case 'yaml':
        console.log(jsYaml.dump(data, { lineWidth: -1, noRefs: true }));
        break;
      case 'csv':
        this.outputCsv(data);
        break;
      default:
        this.outputText(data);
    }
  }

  /**
   * Output formatted table
   */
  table(data: TableData): void {
    if (this.quiet) return;

    switch (this.format) {
      case 'json': {
        const jsonData = data.rows.map(row => {
          const obj: any = {};
          data.columns.forEach((col, index) => {
            obj[col.header] = row[index] ?? '';
          });
          return obj;
        });
        console.log(JSON.stringify(jsonData, null, 2));
        break;
      }
      case 'yaml': {
        const yamlData = data.rows.map(row => {
          const obj: any = {};
          data.columns.forEach((col, index) => {
            obj[col.header] = row[index] ?? '';
          });
          return obj;
        });
        console.log(jsYaml.dump(yamlData, { lineWidth: -1, noRefs: true }));
        break;
      }
      case 'csv':
        this.outputCsv([data.columns.map(col => col.header), ...data.rows]);
        break;
      default:
        this.outputTable(data);
    }
  }

  /**
   * Output key-value pairs
   */
  keyValue(data: Record<string, any>, title?: string): void {
    if (this.quiet) return;

    if (title && this.format === 'text') {
      console.log(prism.bold(title));
      console.log();
    }

    switch (this.format) {
      case 'json':
        console.log(JSON.stringify(data, null, 2));
        break;
      case 'yaml':
        console.log(jsYaml.dump(data, { lineWidth: -1, noRefs: true }));
        break;
      case 'csv': {
        const csvRows = Object.entries(data).map(([key, value]) => [key, String(value)]);
        this.outputCsv([['Key', 'Value'], ...csvRows]);
        break;
      }
      default:
        this.outputKeyValue(data);
    }
  }

  /**
   * Output list of items
   */
  list(items: string[], title?: string): void {
    if (this.quiet) return;

    if (title && this.format === 'text') {
      console.log(prism.bold(title));
      console.log();
    }

    switch (this.format) {
      case 'json':
        console.log(JSON.stringify(items, null, 2));
        break;
      case 'yaml':
        console.log(jsYaml.dump(items, { lineWidth: -1, noRefs: true }));
        break;
      case 'csv':
        items.forEach(item => console.log(item));
        break;
      default:
        items.forEach(item => console.log(`  ${prism.cyan('•')} ${item}`));
    }
  }

  /**
   * Output status information
   */
  status(status: 'success' | 'warning' | 'error' | 'info', message: string): void {
    if (this.quiet) return;

    const symbols = {
      success: prism.green('✓'),
      warning: prism.yellow('⚠'),
      error: prism.red('✗'),
      info: prism.blue('ℹ'),
    };

    const colors = {
      success: prism.green,
      warning: prism.yellow,
      error: prism.red,
      info: prism.blue,
    };

    if (this.format === 'text') {
      console.log(`${symbols[status]} ${colors[status](message)}`);
    } else {
      const data = { status, message };
      this.output(data);
    }
  }

  /**
   * Output progress information
   */
  progress(current: number, total: number, message?: string): void {
    if (this.quiet || this.format !== 'text') return;

    const percentage = Math.round((current / total) * 100);
    const barLength = 20;
    const filledLength = Math.round((percentage / 100) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    const progressText = `${bar} ${percentage}% (${current}/${total})`;
    const fullText = message ? `${message} ${progressText}` : progressText;

    console.log(fullText);
  }

  /**
   * Output diff information
   */
  diff(before: string, after: string, title?: string): void {
    if (this.quiet) return;

    if (title && this.format === 'text') {
      console.log(prism.bold(title));
      console.log();
    }

    if (this.format === 'text') {
      const beforeLines = before.split('\n');
      const afterLines = after.split('\n');

      console.log(prism.red('- Before:'));
      beforeLines.forEach(line => console.log(prism.red(`  ${line}`)));

      console.log(prism.green('+ After:'));
      afterLines.forEach(line => console.log(prism.green(`  ${line}`)));
    } else {
      const data = { before, after };
      this.output(data);
    }
  }

  /** Output records using the shared table and serialization paths. */
  simpleTable(data: Record<string, unknown>[], columns?: string[]): void {
    if (this.quiet) return;
    if (this.format === 'json' || this.format === 'yaml') {
      this.output(data);
      return;
    }
    if (data.length === 0) {
      this.info('No data to display');
      return;
    }
    const keys = columns ?? Object.keys(data[0]!);
    this.table({
      columns: keys.map(header => ({ header })),
      rows: data.map(row => keys.map(key => row[key] ?? '')),
    });
  }

  /**
   * JSON output method
   */
  json(data: any): void {
    if (this.quiet) return;
    console.log(JSON.stringify(data, null, 2));
  }

  /**
   * YAML output method
   */
  yaml(data: any): void {
    if (this.quiet) return;
    console.log(jsYaml.dump(data, { lineWidth: -1, noRefs: true }));
  }

  /** Create a Kit indicator using this formatter's output policy. */
  spinner(options: SpinnerOptions = {}): SpinnerResult {
    return spinner({
      ...options,
      output: options.output ?? process.stderr,
      enabled: !this.quiet && this.format === 'text' && options.enabled !== false,
      accessible: options.accessible ?? (this.colors ? undefined : true),
    });
  }

  /**
   * Private helper methods
   */
  private outputText(data: any): void {
    if (typeof data === 'string') {
      console.log(data);
    } else if (typeof data === 'object' && data !== null) {
      this.outputKeyValue(data);
    } else {
      console.log(String(data));
    }
  }

  private outputKeyValue(data: Record<string, any>): void {
    Object.entries(data).forEach(([key, value]) => {
      const formattedKey = prism.bold(key);
      if (typeof value === 'object' && value !== null) {
        console.log(`${formattedKey}:`);
        if (Array.isArray(value)) {
          value.forEach(item => console.log(`  ${prism.cyan('•')} ${item}`));
        } else {
          Object.entries(value).forEach(([subKey, subValue]) => {
            console.log(`  ${subKey}: ${subValue}`);
          });
        }
      } else {
        console.log(`${formattedKey}: ${value}`);
      }
    });
  }

  private outputTable(data: TableData): void {
    if (data.columns.length === 0) return;
    table({
      data: data.rows.map(row => Object.fromEntries(row.map((value, index) => [String(index), value]))),
      columns: data.columns.map((column, index) => ({
        key: String(index),
        header: column.header,
        width: column.width,
        align: column.align,
      })),
      borders: 'none',
      compact: true,
      wordWrap: data.columns.some(column => column.wrap !== false) ? 'wrap' : 'truncate',
      accessible: !this.colors || undefined,
    });
  }

  private outputCsv(data: any[]): void {
    if (Array.isArray(data) && Array.isArray(data[0])) {
      // Table format
      data.forEach(row => {
        console.log(row.map((cell: any) => `"${String(cell).replace(/"/g, '""')}"`).join(','));
      });
    } else {
      // Convert to CSV format
      console.log(JSON.stringify(data));
    }
  }
}
