
import { Spinner, CLIConfig, OutputFormatter as IOutputFormatter } from './types.js';

export class OutputFormatter implements IOutputFormatter {
  constructor(private config: CLIConfig) { }

  success(message: string): void {
    if (this.config.quiet) return;
    const formatted = this.config.colors ? `\x1b[32m✓ ${message}\x1b[0m` : `✓ ${message}`;
    console.log(formatted);
  }

  error(message: string | Error): void {
    const text = message instanceof Error ? message.message : message;
    const formatted = this.config.colors ? `\x1b[31m✗ ${text}\x1b[0m` : `✗ ${text}`;
    console.error(formatted);
  }

  warn(message: string): void {
    if (this.config.quiet) return;
    const formatted = this.config.colors ? `\x1b[33m⚠ ${message}\x1b[0m` : `⚠ ${message}`;
    console.warn(formatted);
  }

  info(message: string): void {
    if (this.config.quiet) return;
    console.log(message);
  }

  debug(message: string): void {
    if (!this.config.verbose || this.config.quiet) return;
    const formatted = this.config.colors ? `\x1b[90m[DEBUG] ${message}\x1b[0m` : `[DEBUG] ${message}`;
    console.log(formatted);
  }

  table(data: any[], columns?: string[]): void {
    if (this.config.quiet) return;

    if (this.config.format === 'json') {
      this.json(data);
      return;
    }

    if (this.config.format === 'yaml') {
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

  json(data: any): void {
    if (this.config.quiet) return;
    console.log(JSON.stringify(data, null, 2));
  }

  yaml(data: any): void {
    if (this.config.quiet) return;
    // Simple YAML output (would need a proper YAML library for complex cases)
    console.log(this.toSimpleYaml(data));
  }

  progress(message: string, current: number, total: number): void {
    if (this.config.quiet) return;

    const percentage = Math.round((current / total) * 100);
    const barLength = 30;
    const filledLength = Math.round((current / total) * barLength);
    const bar = '█'.repeat(filledLength) + '░'.repeat(barLength - filledLength);

    process.stdout.write(`\r${message} [${bar}] ${percentage}% (${current}/${total})`);

    if (current === total) {
      process.stdout.write('\n');
    }
  }

  spinner(message: string): Spinner {
    return new CLISpinner(message, this.config);
  }

  private toSimpleYaml(obj: any, indent = 0): string {
    const spaces = ' '.repeat(indent);

    if (obj === null || obj === undefined) {
      return 'null';
    }

    if (typeof obj !== 'object') {
      return String(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(item => `${spaces}- ${this.toSimpleYaml(item, indent + 2)}`).join('\n');
    }

    return Object.entries(obj)
      .map(([key, value]) => {
        if (typeof value === 'object' && value !== null) {
          return `${spaces}${key}:\n${this.toSimpleYaml(value, indent + 2)}`;
        }
        return `${spaces}${key}: ${value}`;
      })
      .join('\n');
  }
}

class CLISpinner implements Spinner {
  private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  private currentFrame = 0;
  private interval?: NodeJS.Timeout;
  private isSpinning = false;

  constructor(
    private message: string,
    private config: CLIConfig
  ) { }

  start(): void {
    if (this.config.quiet || this.isSpinning) return;

    this.isSpinning = true;
    this.interval = setInterval(() => {
      const frame = this.frames[this.currentFrame];
      const text = this.config.colors
        ? `\x1b[36m${frame} ${this.message}\x1b[0m`
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
        ? `\x1b[32m✓ ${text}\x1b[0m`
        : `✓ ${text}`;
      console.log(formatted);
    }
  }

  fail(message?: string): void {
    this.stop();
    if (!this.config.quiet) {
      const text = message || this.message;
      const formatted = this.config.colors
        ? `\x1b[31m✗ ${text}\x1b[0m`
        : `✗ ${text}`;
      console.log(formatted);
    }
  }

  update(message: string): void {
    this.message = message;
  }
}