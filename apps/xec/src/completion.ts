import { CommandRegistry } from './command.js';
import { Command, CLIContext, CompletionProvider } from './types.js';

export class CLICompletionProvider implements CompletionProvider {
  constructor(private registry: CommandRegistry) { }

  async getCompletions(partial: string, context: CLIContext): Promise<string[]> {
    const parts = partial.trim().split(/\s+/);

    if (parts.length <= 1) {
      // Complete command names
      return this.getCommandCompletions(parts[0] || '');
    }

    // Find the command
    const commandParts: string[] = [];
    let command: Command | undefined;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (part) {
        commandParts.push(part);
        command = this.registry.find(commandParts);
        if (command) break;
      }
    }

    if (!command) {
      return [];
    }

    const lastPart = parts[parts.length - 1] || '';

    // If last part starts with -, complete options
    if (lastPart.startsWith('-')) {
      return this.getOptionCompletions(command, lastPart);
    }

    // Otherwise, complete subcommands or arguments
    const subcommands = this.getSubcommandCompletions(command, lastPart);
    if (subcommands.length > 0) {
      return subcommands;
    }

    // Complete argument values if applicable
    return this.getArgumentCompletions(command, parts, lastPart);
  }

  private getCommandCompletions(partial: string): string[] {
    const commands = this.registry.getAll();
    return commands
      .filter(cmd => !cmd.hidden && cmd.name.startsWith(partial))
      .map(cmd => cmd.name)
      .sort();
  }

  private getSubcommandCompletions(command: Command, partial: string): string[] {
    if (!command.subcommands) return [];

    return command.subcommands
      .filter(sub => !sub.hidden && sub.name.startsWith(partial))
      .map(sub => sub.name)
      .sort();
  }

  private getOptionCompletions(command: Command, partial: string): string[] {
    if (!command.options) return [];

    const completions: string[] = [];
    const isLongOption = partial.startsWith('--');

    for (const option of command.options) {
      if (isLongOption) {
        const longForm = `--${option.name}`;
        if (longForm.startsWith(partial)) {
          completions.push(longForm);
        }
      } else if (partial.length === 1) {
        // Single dash, show short options
        if (option.short) {
          completions.push(`-${option.short}`);
        }
      }
    }

    return completions.sort();
  }

  private getArgumentCompletions(
    command: Command,
    parts: string[],
    partial: string
  ): string[] {
    if (!command.arguments) return [];

    // Determine which argument position we're at
    const commandParts = parts.slice(0, -1).filter(p => !p.startsWith('-'));
    const argIndex = commandParts.length - 1;

    if (argIndex >= 0 && argIndex < command.arguments.length) {
      const arg = command.arguments[argIndex];

      if (arg && arg.choices) {
        return arg.choices
          .filter(choice => String(choice).startsWith(partial))
          .map(String)
          .sort();
      }
    }

    return [];
  }

  generateScript(shell: 'bash' | 'zsh' | 'fish'): string {
    const programName = 'xec'; // This should be configurable

    switch (shell) {
      case 'bash':
        return this.generateBashCompletion(programName);
      case 'zsh':
        return this.generateZshCompletion(programName);
      case 'fish':
        return this.generateFishCompletion(programName);
      default:
        throw new Error(`Unsupported shell: ${shell}`);
    }
  }

  private generateBashCompletion(programName: string): string {
    return `#!/bin/bash
# ${programName} bash completion script

_${programName}_completions() {
    local cur prev words cword
    _init_completion || return

    local completions
    completions=$(${programName} __complete "\${COMP_LINE}" 2>/dev/null)

    if [[ $? -eq 0 ]]; then
        COMPREPLY=( $(compgen -W "\${completions}" -- "\${cur}") )
    fi
}

complete -F _${programName}_completions ${programName}
`;
  }

  private generateZshCompletion(programName: string): string {
    return `#compdef ${programName}
# ${programName} zsh completion script

_${programName}() {
    local -a completions
    local current_word="\${words[CURRENT]}"
    
    completions=($(${programName} __complete "\${words[@]:1}" 2>/dev/null))
    
    _describe '${programName}' completions
}

_${programName} "$@"
`;
  }

  private generateFishCompletion(programName: string): string {
    return `# ${programName} fish completion script

function __${programName}_complete
    set -l cmd (commandline -opc)
    set -l completions (${programName} __complete $cmd 2>/dev/null)
    
    for completion in $completions
        echo $completion
    end
end

complete -c ${programName} -f -a "(__${programName}_complete)"
`;
  }
}

export function createCompletionCommand(registry: CommandRegistry): Command {
  const provider = new CLICompletionProvider(registry);

  return {
    name: '__complete',
    description: 'Generate shell completions',
    hidden: true,
    handler: async (context) => {
      const partial = context.args.join(' ');
      const completions = await provider.getCompletions(partial, context);

      for (const completion of completions) {
        console.log(completion);
      }
    },
  };
}