import { Command, ParsedCommand, CommandArgument } from './types.js';

export class ArgumentParser {
  parse(argv: string[], command?: Command): ParsedCommand {
    const result: ParsedCommand = {
      command: [],
      args: {},
      flags: {},
      positional: [],
    };

    let i = 0;
    const positionalArgs: string[] = [];

    while (i < argv.length) {
      const arg = argv[i]!;

      if (arg.startsWith('--')) {
        // Long option
        const { name, value, consumed } = this.parseLongOption(arg!, argv.slice(i + 1));
        result.flags[name] = value;
        i += consumed;
      } else if (arg.startsWith('-') && arg.length > 1 && arg[1] !== '-') {
        // Short option(s)
        const { flags, consumed } = this.parseShortOptions(arg!, argv.slice(i + 1));
        Object.assign(result.flags, flags);
        i += consumed;
      } else if (arg === '--') {
        // End of options
        i++;
        positionalArgs.push(...argv.slice(i));
        break;
      } else {
        // Positional argument or command
        if (!command && result.command.length === 0 && positionalArgs.length === 0) {
          result.command.push(arg!);
        } else {
          positionalArgs.push(arg!);
        }
        i++;
      }
    }

    // Process positional arguments if command is provided
    if (command && command.arguments) {
      this.processPositionalArguments(positionalArgs, command.arguments, result);
    } else {
      result.positional = positionalArgs;
    }

    // Apply defaults and validate if command is provided
    if (command) {
      this.applyDefaults(result, command);
      this.validate(result, command);
    }

    return result;
  }

  private parseLongOption(arg: string, remaining: string[]): { name: string; value: any; consumed: number } {
    let name: string;
    let value: any = true;
    let consumed = 1;

    if (arg.includes('=')) {
      // --option=value
      const [optName, ...valueParts] = arg.slice(2).split('=');
      name = optName || '';
      value = valueParts.join('=');
    } else {
      name = arg.slice(2);

      // Check if next arg is a value (not another option)
      // Special case: negative numbers are values, not options
      if (remaining.length > 0) {
        const nextArg = remaining[0]!;
        if (nextArg && (!nextArg.startsWith('-') || /^-\d/.test(nextArg))) {
          value = nextArg;
          consumed = 2;
        }
      }
    }

    // Handle negation
    if (name.startsWith('no-')) {
      name = name.slice(3);
      value = false;
    }

    return { name: this.camelCase(name), value, consumed };
  }

  private parseShortOptions(arg: string, remaining: string[]): { flags: Record<string, any>; consumed: number } {
    const flags: Record<string, any> = {};
    let consumed = 1;
    const chars = arg.slice(1).split('');

    for (let i = 0; i < chars.length; i++) {
      const char = chars[i];
      let value: any = true;

      // Last char might have a value
      if (i === chars.length - 1 && remaining.length > 0) {
        const nextArg = remaining[0]!;
        if (nextArg && (!nextArg.startsWith('-') || /^-\d/.test(nextArg))) {
          value = nextArg;
          consumed = 2;
        }
      }

      if (char) flags[char] = value;
    }

    return { flags, consumed };
  }

  private processPositionalArguments(
    positional: string[],
    argDefs: CommandArgument[],
    result: ParsedCommand
  ): void {
    let positionalIndex = 0;

    for (const argDef of argDefs) {
      if (argDef.variadic) {
        // Variadic argument consumes all remaining
        result.args[argDef.name] = positional.slice(positionalIndex);
        positionalIndex = positional.length;
      } else if (positionalIndex < positional.length) {
        result.args[argDef.name] = positional[positionalIndex];
        positionalIndex++;
      } else if (argDef.default !== undefined) {
        result.args[argDef.name] = argDef.default;
      } else if (argDef.required) {
        throw new Error(`Missing required argument: ${argDef.name}`);
      }
    }

    // Store any extra positional arguments
    if (positionalIndex < positional.length) {
      result.positional = positional.slice(positionalIndex);
    }
  }

  private applyDefaults(result: ParsedCommand, command: Command): void {
    // Apply option defaults
    if (command.options) {
      for (const option of command.options) {
        const flagName = this.camelCase(option.name);

        // Check both long and short forms
        if (!(flagName in result.flags) && !(option.short && option.short in result.flags)) {
          if (option.default !== undefined) {
            result.flags[flagName] = option.default;
          }
        }

        // Move short form to long form
        if (option.short && option.short in result.flags && !(flagName in result.flags)) {
          result.flags[flagName] = result.flags[option.short];
          delete result.flags[option.short];
        }
      }
    }

    // Apply argument defaults
    if (command.arguments) {
      for (const arg of command.arguments) {
        if (!(arg.name in result.args) && arg.default !== undefined) {
          result.args[arg.name] = arg.default;
        }
      }
    }
  }

  private validate(result: ParsedCommand, command: Command): void {
    // Validate options
    if (command.options) {
      for (const option of command.options) {
        const flagName = this.camelCase(option.name);
        const value = result.flags[flagName];

        if (option.required && value === undefined) {
          throw new Error(`Missing required option: --${option.name}`);
        }

        if (value !== undefined) {
          // Type validation
          const actualType = Array.isArray(value) ? 'array' : typeof value;
          if (option.type === 'number' && actualType === 'string') {
            const num = Number(value);
            if (isNaN(num)) {
              throw new Error(`Option --${option.name} must be a number`);
            }
            result.flags[flagName] = num;
          } else if (option.type === 'boolean' && actualType === 'string') {
            result.flags[flagName] = value === 'true' || value === '1' || value === 'yes';
          }

          // Choices validation
          if (option.choices && !option.choices.includes(result.flags[flagName])) {
            throw new Error(
              `Invalid value for --${option.name}. Must be one of: ${option.choices.join(', ')}`
            );
          }

          // Custom validation
          if (option.validate) {
            const validationResult = option.validate(result.flags[flagName]);
            if (validationResult !== true) {
              throw new Error(
                typeof validationResult === 'string'
                  ? validationResult
                  : `Invalid value for --${option.name}`
              );
            }
          }
        }
      }
    }

    // Validate arguments
    if (command.arguments) {
      for (const arg of command.arguments) {
        const value = result.args[arg.name];

        if (arg.required && value === undefined) {
          throw new Error(`Missing required argument: ${arg.name}`);
        }

        if (value !== undefined) {
          // Choices validation
          if (arg.choices) {
            const values = Array.isArray(value) ? value : [value];
            for (const v of values) {
              if (!arg.choices.includes(v)) {
                throw new Error(
                  `Invalid value for ${arg.name}. Must be one of: ${arg.choices.join(', ')}`
                );
              }
            }
          }

          // Custom validation
          if (arg.validate) {
            const validationResult = arg.validate(value);
            if (validationResult !== true) {
              throw new Error(
                typeof validationResult === 'string'
                  ? validationResult
                  : `Invalid value for ${arg.name}`
              );
            }
          }
        }
      }
    }
  }

  private camelCase(str: string): string {
    return str.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
  }
}

export const parser = new ArgumentParser();