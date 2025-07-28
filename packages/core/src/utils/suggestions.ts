/**
 * Command suggestions system using Levenshtein distance
 */

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  
  // Initialize matrix with proper dimensions
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = new Array(a.length + 1).fill(0);
  }
  
  // Initialize first column
  for (let i = 0; i <= b.length; i++) {
    const row = matrix[i];
    if (row) {
      row[0] = i;
    }
  }
  
  // Initialize first row
  for (let j = 0; j <= a.length; j++) {
    if (matrix[0]) {
      matrix[0][j] = j;
    }
  }
  
  // Fill matrix
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (!matrix[i]) continue;
      
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        const row = matrix[i];
        if (row) {
          row[j] = matrix[i - 1]?.[j - 1] ?? 0;
        }
      } else {
        const substitution = (matrix[i - 1]?.[j - 1] ?? 0) + 1;
        const insertion = (matrix[i]?.[j - 1] ?? 0) + 1;
        const deletion = (matrix[i - 1]?.[j] ?? 0) + 1;
        
        const row = matrix[i];
        if (row) {
          row[j] = Math.min(substitution, insertion, deletion);
        }
      }
    }
  }
  
  return matrix[b.length]?.[a.length] ?? 0;
}

/**
 * Find similar strings based on Levenshtein distance
 */
export function findSimilar(
  input: string,
  candidates: string[],
  options: {
    maxDistance?: number;
    maxSuggestions?: number;
    caseSensitive?: boolean;
  } = {}
): string[] {
  const {
    maxDistance = 3,
    maxSuggestions = 3,
    caseSensitive = false
  } = options;
  
  const normalizedInput = caseSensitive ? input : input.toLowerCase();
  
  // Calculate distances
  const distances = candidates.map(candidate => {
    const normalizedCandidate = caseSensitive ? candidate : candidate.toLowerCase();
    return {
      candidate,
      distance: levenshteinDistance(normalizedInput, normalizedCandidate)
    };
  });
  
  // Filter and sort by distance
  const suggestions = distances
    .filter(({ distance }) => distance <= maxDistance)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, maxSuggestions)
    .map(({ candidate }) => candidate);
  
  return suggestions;
}

/**
 * Command suggestion interface
 */
export interface CommandSuggestion {
  command: string;
  description?: string;
  aliases?: string[];
  usage?: string;
}

/**
 * Command registry for suggestions
 */
export class CommandRegistry {
  private commands: Map<string, CommandSuggestion> = new Map();
  private aliases: Map<string, string> = new Map();
  
  /**
   * Register a command
   */
  register(command: CommandSuggestion): void {
    this.commands.set(command.command, command);
    
    // Register aliases
    if (command.aliases) {
      command.aliases.forEach(alias => {
        this.aliases.set(alias, command.command);
      });
    }
  }
  
  /**
   * Register multiple commands
   */
  registerAll(commands: CommandSuggestion[]): void {
    commands.forEach(cmd => this.register(cmd));
  }
  
  /**
   * Get all registered commands
   */
  getAllCommands(): string[] {
    return Array.from(this.commands.keys());
  }
  
  /**
   * Get command info
   */
  getCommand(name: string): CommandSuggestion | undefined {
    // Check if it's an alias
    const actualCommand = this.aliases.get(name) || name;
    return this.commands.get(actualCommand);
  }
  
  /**
   * Find similar commands
   */
  findSimilarCommands(input: string, maxSuggestions = 3): CommandSuggestion[] {
    const allCommands = [
      ...this.getAllCommands(),
      ...Array.from(this.aliases.keys())
    ];
    
    const similar = findSimilar(input, allCommands, {
      maxSuggestions,
      caseSensitive: false
    });
    
    // Return unique command suggestions
    const seen = new Set<string>();
    const suggestions: CommandSuggestion[] = [];
    
    similar.forEach(name => {
      const command = this.getCommand(name);
      if (command && !seen.has(command.command)) {
        seen.add(command.command);
        suggestions.push(command);
      }
    });
    
    return suggestions;
  }
  
  /**
   * Format suggestions for display
   */
  formatSuggestions(
    input: string,
    suggestions: CommandSuggestion[],
    options: { color?: boolean } = {}
  ): string {
    if (suggestions.length === 0) {
      return '';
    }
    
    const lines: string[] = [];
    const useColor = options.color ?? true;
    
    // Colors
    const yellow = useColor ? '\x1b[33m' : '';
    const cyan = useColor ? '\x1b[36m' : '';
    const dim = useColor ? '\x1b[2m' : '';
    const reset = useColor ? '\x1b[0m' : '';
    
    lines.push(`${yellow}Did you mean:${reset}`);
    
    suggestions.forEach(suggestion => {
      let line = `  ${cyan}${suggestion.command}${reset}`;
      
      if (suggestion.description) {
        line += ` ${dim}- ${suggestion.description}${reset}`;
      }
      
      lines.push(line);
      
      if (suggestion.usage) {
        lines.push(`    ${dim}Usage: ${suggestion.usage}${reset}`);
      }
    });
    
    return lines.join('\n');
  }
}

/**
 * Default command registry with common commands
 */
export const defaultCommandRegistry = new CommandRegistry();

// Register common xec commands
defaultCommandRegistry.registerAll([
  {
    command: 'exec',
    description: 'Execute a command',
    aliases: ['e', 'run'],
    usage: 'xec exec [options] <command>'
  },
  {
    command: 'ssh',
    description: 'Execute command via SSH',
    usage: 'xec ssh <host> <command>'
  },
  {
    command: 'docker',
    description: 'Execute command in Docker container',
    aliases: ['d'],
    usage: 'xec docker <container> <command>'
  },
  {
    command: 'k8s',
    description: 'Execute command in Kubernetes pod',
    aliases: ['kubernetes', 'kubectl'],
    usage: 'xec k8s <pod> <command>'
  },
  {
    command: 'on',
    description: 'Execute command on SSH host',
    usage: 'xec on <host> <command>'
  },
  {
    command: 'in',
    description: 'Execute command in container/pod',
    usage: 'xec in <container|pod:name> <command>'
  },
  {
    command: 'copy',
    description: 'Copy files between hosts/containers',
    aliases: ['cp'],
    usage: 'xec copy <source> <destination>'
  },
  {
    command: 'forward',
    description: 'Set up port forwarding',
    aliases: ['tunnel', 'port-forward'],
    usage: 'xec forward <source> [to] <destination>'
  },
  {
    command: 'logs',
    description: 'View logs from container/pod/file',
    aliases: ['log', 'tail'],
    usage: 'xec logs <source> [options]'
  },
  {
    command: 'config',
    description: 'Manage configuration',
    aliases: ['cfg'],
    usage: 'xec config [get|set|list] [key] [value]'
  },
  {
    command: 'interactive',
    description: 'Start interactive mode',
    aliases: ['i', 'repl'],
    usage: 'xec interactive'
  }
]);

/**
 * Check if input might be a typo of a command
 */
export function checkForCommandTypo(
  input: string,
  registry: CommandRegistry = defaultCommandRegistry
): string | null {
  const suggestions = registry.findSimilarCommands(input, 1);
  
  if (suggestions.length > 0) {
    return registry.formatSuggestions(input, suggestions);
  }
  
  return null;
}

/**
 * Get suggestions for partial command
 */
export function getCommandCompletions(
  partial: string,
  registry: CommandRegistry = defaultCommandRegistry
): string[] {
  const allCommands: string[] = [
    ...registry.getAllCommands()
    // Note: aliases are internal, we only return main commands
  ];
  
  return allCommands
    .filter((cmd: string) => cmd.toLowerCase().startsWith(partial.toLowerCase()))
    .sort();
}