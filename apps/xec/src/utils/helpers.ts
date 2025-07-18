import pc from 'picocolors';
import { $ } from '@xec-js/ush';
import { spinner } from '@clack/prompts';
import {
  toPlatform,
  type Logger,
  createLogger,
  toArchitecture,
  type TaskContext,
  type StandardLibrary,
  createStandardLibrary
} from '@xec-js/core';

// Default context for CLI commands
export function createDefaultContext(): Partial<TaskContext> {
  const logger = createLogger({ name: 'xec-cli' });

  // Create partial context with required properties for stdlib
  return {
    $,
    env: {
      type: 'local' as const,
      capabilities: {
        shell: true,
        sudo: true,
        docker: false,
        systemd: false
      },
      platform: {
        os: toPlatform(process.platform),
        arch: toArchitecture(process.arch),
        distro: 'unknown',
        version: 'unknown'
      }
    },
    logger
  };
}

// Get standard library with default context
export async function getStdlib(commandName?: string): Promise<StandardLibrary> {
  const context = createDefaultContext();
  if (commandName) {
    context.logger = createLogger({ name: commandName });
  }
  return createStandardLibrary(context as Partial<TaskContext>);
}

// Standard error handler
export function handleError(error: unknown, message?: string): never {
  const s = spinner();
  s.stop(message || 'Operation failed');

  if (error instanceof Error) {
    console.error(pc.red('Error:'), error.message);
    if (process.env['DEBUG']) {
      console.error(pc.gray(error.stack));
    }
  } else {
    console.error(pc.red('Error:'), error);
  }

  process.exit(1);
}

// Try-catch wrapper with standard error handling
export async function tryWithSpinner<T>(
  action: () => Promise<T>,
  options: {
    start: string;
    success?: string;
    error?: string;
  }
): Promise<T> {
  const s = spinner();
  s.start(options.start);

  try {
    const result = await action();
    s.stop(options.success || 'Done');
    return result;
  } catch (error) {
    s.stop(options.error || 'Failed');
    throw error;
  }
}

// Format output based on options
export function formatOutput(
  data: any,
  format: 'json' | 'yaml' | 'table' = 'json'
): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'yaml':
      // TODO: Use yaml library
      return JSON.stringify(data, null, 2);
    case 'table':
      // TODO: Use table library
      return JSON.stringify(data, null, 2);
    default:
      return JSON.stringify(data, null, 2);
  }
}

// Save output to file or print to console
export async function outputResult(
  data: any,
  options: {
    format?: 'json' | 'yaml' | 'table';
    output?: string;
    silent?: boolean;
  } = {}
): Promise<void> {
  const formatted = formatOutput(data, options.format || 'json');

  if (options.output) {
    const lib = await getStdlib();
    await lib.fs.write(options.output, formatted);
    if (!options.silent) {
      console.log(pc.green(`✓ Output saved to ${options.output}`));
    }
  } else if (!options.silent) {
    console.log(formatted);
  }
}

// Create a logger with consistent formatting
export function createCommandLogger(command: string): Logger {
  return createLogger({
    name: command,
    level: process.env['DEBUG'] ? 'debug' : 'info',
    json: false,
    colorize: true,
    timestamps: false
  });
}

// Parse key=value pairs
export function parseKeyValue(pairs: string[]): Record<string, string> {
  const result: Record<string, string> = {};

  for (const pair of pairs) {
    const [key, ...valueParts] = pair.split('=');
    if (key) {
      result[key] = valueParts.join('=');
    }
  }

  return result;
}

// Display success message
export function success(message: string): void {
  console.log(pc.green('✓'), message);
}

// Display warning message
export function warning(message: string): void {
  console.log(pc.yellow('⚠'), message);
}

// Display info message
export function info(message: string): void {
  console.log(pc.blue('ℹ'), message);
}

// Display error message (without exiting)
export function error(message: string): void {
  console.log(pc.red('✗'), message);
}