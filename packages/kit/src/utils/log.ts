// Logging utilities

import { createDefaultTheme } from '../themes/default.js';

export interface LogOptions {
  stdout?: NodeJS.WriteStream;
  stderr?: NodeJS.WriteStream;
}

export class Log {
  public stdout: NodeJS.WriteStream;
  public stderr: NodeJS.WriteStream;
  public theme = createDefaultTheme();

  constructor(options: LogOptions = {}) {
    this.stdout = options.stdout ?? process.stdout;
    this.stderr = options.stderr ?? process.stderr;
  }

  info(message: string): void {
    this.stdout.write(
      `${this.theme.symbols.info} ${message}\n`
    );
  }

  success(message: string): void {
    this.stdout.write(
      `${this.theme.symbols.success} ${this.theme.formatters.success(message)}\n`
    );
  }

  warning(message: string): void {
    this.stderr.write(
      `${this.theme.symbols.warning} ${this.theme.formatters.warning(message)}\n`
    );
  }

  error(message: string): void {
    this.stderr.write(
      `${this.theme.symbols.error} ${this.theme.formatters.error(message)}\n`
    );
  }

  message(message: string): void {
    this.stdout.write(`${message}\n`);
  }

  step(message: string): void {
    this.stdout.write(
      `${this.theme.formatters.muted('◆')} ${message}\n`
    );
  }

  break(): void {
    this.stdout.write('\n');
  }
}

// Export singleton instance
export const log = new Log();