import { ArgumentParser } from './parser.js';
import { CommandRegistry } from './command.js';
import { OutputFormatter } from './utils/output-formatter.js';
import { Command, CLIConfig, CLIContext, CLIMiddleware } from './types.js';

export class CLIRunner {
  public registry: CommandRegistry;
  private parser: ArgumentParser;
  private middlewares: CLIMiddleware[] = [];
  private config: CLIConfig = {
    colors: true,
    verbose: false,
    quiet: false,
    format: 'text',
    logLevel: 'info',
  };

  constructor(registry?: CommandRegistry, parser?: ArgumentParser) {
    this.registry = registry || new CommandRegistry();
    this.parser = parser || new ArgumentParser();
  }

  configure(config: Partial<CLIConfig>): void {
    this.config = { ...this.config, ...config };
  }

  use(middleware: CLIMiddleware): void {
    this.middlewares.push(middleware);
  }

  async run(argv: string[]): Promise<void> {
    try {
      // Parse initial command parts
      const initialParsed = this.parser.parse(argv);

      // Find command
      const command = this.findCommand(initialParsed.command);
      if (!command) {
        throw new Error(`Unknown command: ${initialParsed.command.join(' ')}`);
      }

      // Re-parse with command context
      const remainingArgs = argv.slice(initialParsed.command.length);
      const parsed = this.parser.parse(remainingArgs, command);

      // Create context
      const context: CLIContext = {
        cwd: process.cwd(),
        env: process.env as Record<string, string>,
        args: remainingArgs,
        flags: { ...parsed.flags },
        config: this.config,
      };

      // Apply global flags to config
      if (context.flags['verbose'] !== undefined) {
        context.config!.verbose = context.flags['verbose'];
      }
      if (context.flags['quiet'] !== undefined) {
        context.config!.quiet = context.flags['quiet'];
      }
      if (context.flags['format'] !== undefined) {
        context.config!.format = context.flags['format'];
      }

      // Run through middleware chain
      await this.runMiddleware(context, async () => {
        if (command.handler) {
          await command.handler(context);
        } else if (command.subcommands && command.subcommands.length > 0) {
          // No handler but has subcommands - show help
          this.showCommandHelp(command);
        }
      });
    } catch (error) {
      this.handleError(error);
    }
  }

  private findCommand(parts: string[]): Command | undefined {
    if (parts.length === 0) {
      return this.registry.get('help'); // Default to help command
    }

    // Try to find exact match first
    let command = this.registry.find(parts);

    // If not found, try progressively shorter paths
    if (!command) {
      for (let i = parts.length - 1; i > 0; i--) {
        command = this.registry.find(parts.slice(0, i));
        if (command) break;
      }
    }

    return command;
  }

  private async runMiddleware(
    context: CLIContext,
    final: () => Promise<void>
  ): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index >= this.middlewares.length) {
        return final();
      }

      const middleware = this.middlewares[index++];
      if (middleware) {
        return middleware(context, next);
      }
      return next();
    };

    return next();
  }

  private showCommandHelp(command: Command): void {
    const output = new OutputFormatter();
    output.setFormat(this.config.format || 'text');
    output.setQuiet(this.config.quiet || false);
    output.setVerbose(this.config.verbose || false);
    output.setColors(this.config.colors !== false);

    output.info(`\n${command.description}\n`);

    if (command.usage) {
      output.info(`Usage: ${command.usage}\n`);
    } else {
      output.info(`Usage: ${command.name} [options] [command]\n`);
    }

    if (command.subcommands && command.subcommands.length > 0) {
      output.info('Commands:');
      const maxLength = Math.max(...command.subcommands.map(cmd => cmd.name.length));

      for (const sub of command.subcommands) {
        if (!sub.hidden) {
          const name = sub.name.split(':').pop() || sub.name;
          const padding = ' '.repeat(maxLength - name.length + 2);
          output.info(`  ${name}${padding}${sub.description}`);
        }
      }
      output.info('');
    }

    if (command.options && command.options.length > 0) {
      output.info('Options:');

      for (const option of command.options) {
        const short = option.short ? `-${option.short}, ` : '    ';
        const long = `--${option.name}`;
        const type = option.type === 'boolean' ? '' : ` <${option.type}>`;
        output.info(`  ${short}${long}${type}`);
        output.info(`      ${option.description}`);

        if (option.default !== undefined) {
          output.info(`      (default: ${JSON.stringify(option.default)})`);
        }

        if (option.choices) {
          output.info(`      (choices: ${option.choices.join(', ')})`);
        }

        output.info('');
      }
    }

    if (command.examples && command.examples.length > 0) {
      output.info('Examples:');
      for (const example of command.examples) {
        output.info(`  ${example}`);
      }
      output.info('');
    }
  }

  private handleError(error: any): void {
    const output = new OutputFormatter();
    output.setFormat(this.config.format || 'text');
    output.setQuiet(this.config.quiet || false);
    output.setVerbose(this.config.verbose || false);
    output.setColors(this.config.colors !== false);

    if (error instanceof Error) {
      output.error(error.message);

      if (this.config.verbose && error.stack) {
        output.debug(error.stack);
      }
    } else {
      output.error(String(error));
    }

    process.exit(1);
  }
}

// Global runner instance
export const runner = new CLIRunner();