import { Command, CommandOption, CommandHandler, CommandArgument } from './types.js';

export class CommandBuilder {
  private command: Partial<Command> = {};

  constructor(name: string) {
    this.command.name = name;
    this.command.options = [];
    this.command.arguments = [];
    this.command.subcommands = [];
  }

  description(desc: string): this {
    this.command.description = desc;
    return this;
  }

  alias(...aliases: string[]): this {
    this.command.aliases = aliases;
    return this;
  }

  usage(usage: string): this {
    this.command.usage = usage;
    return this;
  }

  example(example: string): this {
    if (!this.command.examples) {
      this.command.examples = [];
    }
    this.command.examples.push(example);
    return this;
  }

  option(option: CommandOption): this {
    this.command.options!.push(option);
    return this;
  }

  argument(arg: CommandArgument): this {
    this.command.arguments!.push(arg);
    return this;
  }

  subcommand(subcommand: Command): this {
    this.command.subcommands!.push(subcommand);
    return this;
  }

  hidden(): this {
    this.command.hidden = true;
    return this;
  }

  action(handler: CommandHandler): this {
    this.command.handler = handler;
    return this;
  }

  build(): Command {
    if (!this.command.name) {
      throw new Error('Command name is required');
    }
    if (!this.command.description) {
      throw new Error('Command description is required');
    }
    if (!this.command.handler && (!this.command.subcommands || this.command.subcommands.length === 0)) {
      throw new Error('Command must have either a handler or subcommands');
    }

    return this.command as Command;
  }
}

export function command(name: string): CommandBuilder {
  return new CommandBuilder(name);
}

export class CommandRegistry {
  private commands: Map<string, Command> = new Map();
  private aliases: Map<string, string> = new Map();

  register(command: Command): void {
    if (this.commands.has(command.name)) {
      throw new Error(`Command '${command.name}' is already registered`);
    }

    this.commands.set(command.name, command);

    if (command.aliases) {
      for (const alias of command.aliases) {
        if (this.aliases.has(alias)) {
          throw new Error(`Alias '${alias}' is already in use`);
        }
        this.aliases.set(alias, command.name);
      }
    }

    if (command.subcommands) {
      for (const sub of command.subcommands) {
        this.registerSubcommand(command.name, sub);
      }
    }
  }

  private registerSubcommand(parent: string, subcommand: Command): void {
    const fullName = `${parent}:${subcommand.name}`;
    subcommand.name = fullName;
    this.register(subcommand);
  }

  get(name: string): Command | undefined {
    const actualName = this.aliases.get(name) || name;
    return this.commands.get(actualName);
  }

  find(parts: string[]): Command | undefined {
    const fullName = parts.join(':');
    let command = this.get(fullName);

    if (!command && parts.length > 1) {
      // Try to find parent command with subcommands
      for (let i = parts.length - 1; i > 0; i--) {
        const parentName = parts.slice(0, i).join(':');
        const parent = this.get(parentName);

        if (parent && parent.subcommands) {
          const subName = parts[i];
          if (subName) {
            command = parent.subcommands.find(sub =>
              sub.name === subName || sub.aliases?.includes(subName)
            );
            if (command) break;
          }
        }
      }
    }

    return command;
  }

  list(): Command[] {
    return Array.from(this.commands.values()).filter(cmd => !cmd.name.includes(':'));
  }

  getAll(): Command[] {
    return this.list();
  }

  getSubcommands(parent: string): Command[] {
    const prefix = `${parent}:`;
    return Array.from(this.commands.values())
      .filter(cmd => cmd.name.startsWith(prefix) && !cmd.name.slice(prefix.length).includes(':'));
  }
}

// Helper functions for common option types
export const options = {
  verbose: (): CommandOption => ({
    name: 'verbose',
    short: 'v',
    description: 'Enable verbose output',
    type: 'boolean',
    default: false,
  }),

  quiet: (): CommandOption => ({
    name: 'quiet',
    short: 'q',
    description: 'Suppress output',
    type: 'boolean',
    default: false,
  }),

  format: (): CommandOption => ({
    name: 'format',
    short: 'f',
    description: 'Output format',
    type: 'string',
    choices: ['text', 'json', 'yaml'],
    default: 'text',
  }),

  config: (): CommandOption => ({
    name: 'config',
    short: 'c',
    description: 'Path to config file',
    type: 'string',
  }),

  dryRun: (): CommandOption => ({
    name: 'dry-run',
    description: 'Perform a dry run without making changes',
    type: 'boolean',
    default: false,
  }),

  force: (): CommandOption => ({
    name: 'force',
    description: 'Force operation without confirmation',
    type: 'boolean',
    default: false,
  }),

  output: (): CommandOption => ({
    name: 'output',
    short: 'o',
    description: 'Output file path',
    type: 'string',
  }),

  yes: (): CommandOption => ({
    name: 'yes',
    short: 'y',
    description: 'Answer yes to all prompts',
    type: 'boolean',
    default: false,
  }),
};