import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { handleError } from './error-handler.js';
import { OutputFormatter } from './output-formatter.js';

export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  output?: 'text' | 'json' | 'yaml' | 'csv';
  config?: string;
  dryRun?: boolean;
}

export interface CommandConfig {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: any;
  }>;
  examples?: Array<{
    command: string;
    description: string;
  }>;
  validateOptions?: (options: any) => void;
}

export abstract class BaseCommand {
  protected formatter: OutputFormatter;
  protected spinner: any;
  protected options: CommandOptions = {
    verbose: false,
    quiet: false,
    output: 'text',
    dryRun: false
  };

  constructor(protected config: CommandConfig) {
    this.formatter = new OutputFormatter();
  }

  /**
   * Create and configure the command
   */
  create(): Command {
    const command = new Command(this.config.name);

    command
      .description(this.config.description)
      // Don't add verbose/quiet options as they conflict with parent program options
      // These are inherited from the parent command
      .option('-o, --output <format>', 'Output format (text|json|yaml|csv)', 'text')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('--dry-run', 'Perform a dry run without making changes');

    // Add arguments
    if (this.config.arguments) {
      command.arguments(this.config.arguments);
    }

    // Add aliases
    if (this.config.aliases) {
      this.config.aliases.forEach(alias => command.alias(alias));
    }

    // Add custom options
    if (this.config.options) {
      this.config.options.forEach(opt => {
        command.option(opt.flags, opt.description, opt.defaultValue);
      });
    }

    // Add examples to help
    if (this.config.examples) {
      const exampleText = this.config.examples
        .map(ex => `  ${chalk.cyan(ex.command)}\n    ${ex.description}`)
        .join('\n\n');
      command.addHelpText('after', `\nExamples:\n\n${exampleText}`);
    }

    // Set up action handler
    command.action(async (...args) => {
      try {
        const options = args[args.length - 1];
        // Get verbose and quiet from parent command
        const parentOptions = options.parent?.opts() || {};
        
        // Extract command-specific options, excluding commander internals
        const commandOptions: any = {};
        for (const key in options) {
          // Skip commander internal properties
          if (!key.startsWith('_') && key !== 'parent' && key !== 'args' && 
              key !== 'commands' && key !== 'options' && typeof options[key] !== 'function') {
            commandOptions[key] = options[key];
          }
        }
        
        // Merge all options together, with defaults
        this.options = {
          ...commandOptions,  // Include all parsed command options
          verbose: parentOptions.verbose || options.verbose || false,
          quiet: parentOptions.quiet || options.quiet || false,
          output: options.output || 'text',
          config: options.config,
          dryRun: options.dryRun || false,
        };

        // Validate options
        if (this.config.validateOptions) {
          this.config.validateOptions(options);
        }

        // Initialize formatter
        this.formatter.setFormat(this.options.output || 'text');
        this.formatter.setQuiet(this.options.quiet || false);
        this.formatter.setVerbose(this.options.verbose || false);

        // Execute command
        await this.execute(args);
      } catch (error) {
        handleError(error, this.options);
      }
    });

    return command;
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract execute(args: any[]): Promise<void>;

  /**
   * Helper methods for common operations
   */
  protected startSpinner(message: string): void {
    if (!this.options.quiet) {
      this.spinner = clack.spinner();
      this.spinner.start(message);
    }
  }

  protected stopSpinner(message?: string, code?: number): void {
    if (this.spinner) {
      this.spinner.stop(message, code);
      this.spinner = null;
    }
  }

  protected log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    if (this.options.quiet) return;

    switch (level) {
      case 'success':
        clack.log.success(message);
        break;
      case 'warn':
        clack.log.warn(message);
        break;
      case 'error':
        clack.log.error(message);
        break;
      default:
        clack.log.info(message);
    }
  }

  protected output(data: any, title?: string): void {
    this.formatter.output(data, title);
  }

  protected table(rows: any[], headers?: string[]): void {
    const tableData = {
      columns: headers ? headers.map(h => ({ header: h })) : Object.keys(rows[0] || {}).map(k => ({ header: k })),
      rows: rows.map(row => {
        if (headers) {
          return headers.map(h => row[h] || '');
        } else {
          return Object.values(row);
        }
      })
    };
    this.formatter.table(tableData);
  }

  protected async confirm(message: string, initial = false): Promise<boolean> {
    if (this.options.quiet) return Promise.resolve(initial);
    const result = await clack.confirm({ message, initialValue: initial });
    if (typeof result === 'symbol') {
      // User cancelled, return initial value
      return initial;
    }
    return result;
  }

  protected async prompt(message: string, initial?: string): Promise<string> {
    if (this.options.quiet) return Promise.resolve(initial || '');
    const result = await clack.text({ message, initialValue: initial });
    if (typeof result === 'symbol') {
      // User cancelled, return initial value or empty string
      return initial || '';
    }
    return result;
  }

  protected async select(message: string, options: Array<{ value: string; label: string; hint?: string }>): Promise<string> {
    if (this.options.quiet) return Promise.resolve(options[0]?.value || '');
    const result = await clack.select({ message, options });
    if (typeof result === 'symbol') {
      // User cancelled, return first option or empty string
      return options[0]?.value || '';
    }
    return result;
  }

  protected async multiselect(message: string, options: Array<{ value: string; label: string; hint?: string }>): Promise<string[]> {
    if (this.options.quiet) return Promise.resolve([]);
    const result = await clack.multiselect({ message, options });
    if (typeof result === 'symbol') {
      // User cancelled, return empty array
      return [];
    }
    return result;
  }

  protected intro(message: string): void {
    if (!this.options.quiet) {
      clack.intro(message);
    }
  }

  protected outro(message: string): void {
    if (!this.options.quiet) {
      clack.outro(message);
    }
  }

  protected isDryRun(): boolean {
    return this.options.dryRun || false;
  }

  protected isVerbose(): boolean {
    return this.options.verbose || false;
  }

  protected isQuiet(): boolean {
    return this.options.quiet || false;
  }
}

export abstract class SubcommandBase extends BaseCommand {
  protected abstract setupSubcommands(command: Command): void;

  override create(): Command {
    const command = super.create();
    this.setupSubcommands(command);
    return command;
  }

  override async execute(args: any[]): Promise<void> {
    // Base subcommand shows help if no subcommand is provided
    const command = args[args.length - 1];
    if (!command.args.length) {
      command.help();
    }
  }
}