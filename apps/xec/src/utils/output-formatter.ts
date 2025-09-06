import jsYaml from 'js-yaml';
import { table } from 'table';
import { prism } from '@xec-sh/kit';

export type OutputFormat = 'text' | 'json' | 'yaml' | 'csv';

export interface TableColumn {
  header: string;
  width?: number;
  align?: 'left' | 'center' | 'right';
  wrap?: boolean;
}

export interface TableData {
  columns: TableColumn[];
  rows: string[][];
}

export interface Spinner {
  start(): void;
  stop(): void;
  succeed(message?: string): void;
  fail(message?: string): void;
  update(message: string): void;
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
      case 'json':
        const jsonData = data.rows.map(row => {
          const obj: any = {};
          data.columns.forEach((col, index) => {
            obj[col.header] = row[index] || '';
          });
          return obj;
        });
        console.log(JSON.stringify(jsonData, null, 2));
        break;
      case 'yaml':
        const yamlData = data.rows.map(row => {
          const obj: any = {};
          data.columns.forEach((col, index) => {
            obj[col.header] = row[index] || '';
          });
          return obj;
        });
        console.log(jsYaml.dump(yamlData, { lineWidth: -1, noRefs: true }));
        break;
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
      case 'csv':
        const csvRows = Object.entries(data).map(([key, value]) => [key, String(value)]);
        this.outputCsv([['Key', 'Value'], ...csvRows]);
        break;
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

  /**
   * Legacy table method for backward compatibility
   */
  simpleTable(data: any[], columns?: string[]): void {
    if (this.quiet) return;

    if (this.format === 'json') {
      this.json(data);
      return;
    }

    if (this.format === 'yaml') {
      this.yaml(data);
      return;
    }

    if (data.length === 0) {
      this.info('No data to display');
      return;
    }

    // Determine columns
    const cols = columns || Object.keys(data[0]);

    // Calculate column widths
    const widths: Record<string, number> = {};
    for (const col of cols) {
      widths[col] = col.length;
      for (const row of data) {
        const value = String(row[col] ?? '');
        widths[col] = Math.max(widths[col], value.length);
      }
    }

    // Print header
    const header = cols.map(col => col.padEnd(widths[col] || 0)).join('  ');
    console.log(header);
    console.log(cols.map(col => '-'.repeat(widths[col] || 0)).join('  '));

    // Print rows
    for (const row of data) {
      const line = cols.map(col => String(row[col] ?? '').padEnd(widths[col] || 0)).join('  ');
      console.log(line);
    }
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

  /**
   * Create spinner
   */
  spinner(message: string): Spinner {
    return new CLISpinner(message, {
      quiet: this.quiet,
      colors: this.colors,
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
    const tableData = [
      data.columns.map(col => prism.bold(col.header)),
      ...data.rows
    ];

    const config = {
      border: {
        topBody: `─`,
        topJoin: `┬`,
        topLeft: `┌`,
        topRight: `┐`,
        bottomBody: `─`,
        bottomJoin: `┴`,
        bottomLeft: `└`,
        bottomRight: `┘`,
        bodyLeft: `│`,
        bodyRight: `│`,
        bodyJoin: `│`,
        joinBody: `─`,
        joinLeft: `├`,
        joinRight: `┤`,
        joinJoin: `┼`
      },
      columnDefault: {
        paddingLeft: 1,
        paddingRight: 1,
      },
      columns: data.columns.map(col => ({
        width: col.width,
        alignment: col.align || 'left',
        wrapWord: col.wrap !== false,
      })),
    };

    console.log(table(tableData, config));
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

/**
 * CLI Spinner implementation
 */
class CLISpinner implements Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval?: NodeJS.Timeout;
  private isSpinning = false;

  constructor(
    private message: string,
    private config: { quiet: boolean; colors: boolean }
  ) { }

  start(): void {
    if (this.config.quiet || this.isSpinning) return;

    this.isSpinning = true;
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      const text = this.config.colors
        ? prism.cyan(`${frame} ${this.message}`)
        : `${frame} ${this.message}`;

      process.stdout.write(`\r${text}`);
      this.currentFrame = (this.currentFrame + 1) % this.frames.length;
    }, 80);
  }

  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
    if (this.isSpinning) {
      process.stdout.write('\r' + ' '.repeat(this.message.length + 3) + '\r');
      this.isSpinning = false;
    }
  }

  succeed(message?: string): void {
    this.stop();
    if (!this.config.quiet) {
      const text = message || this.message;
      const formatted = this.config.colors
        ? prism.green(`✓ ${text}`)
        : `✓ ${text}`;
      console.log(formatted);
    }
  }

  fail(message?: string): void {
    this.stop();
    if (!this.config.quiet) {
      const text = message || this.message;
      const formatted = this.config.colors
        ? prism.red(`✗ ${text}`)
        : `✗ ${text}`;
      console.log(formatted);
    }
  }

  update(message: string): void {
    this.message = message;
  }
}