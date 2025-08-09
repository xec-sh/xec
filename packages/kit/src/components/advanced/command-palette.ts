// Command palette with fuzzy search

import { Prompt } from '../../core/prompt.js';
import { Key, Theme } from '../../core/types.js';
import { StateManager } from '../../core/state-manager.js';

export interface Command {
  id: string;
  title: string;
  shortcut?: string;
  icon?: string;
  action: () => void | Promise<void>;
  group?: string;
  keywords?: string[];
}

export interface CommandGroup {
  id: string;
  title: string;
}

export interface CommandPaletteOptions {
  commands: Command[];
  placeholder?: string;
  recent?: string[];
  groups?: CommandGroup[];
  maxResults?: number;
  fuzzyThreshold?: number;
  fuzzySearch?: boolean; // Enable fuzzy search
  showShortcuts?: boolean; // Show keyboard shortcuts
  message?: string;
  theme?: Theme;
}

export interface CommandPaletteState {
  searchTerm: string;
  filteredCommands: Command[];
  selectedIndex: number;
  recentCommands: string[];
  showingAll: boolean;
}

export class CommandPalette extends Prompt<string | null, CommandPaletteOptions> {
  protected override state: StateManager<CommandPaletteState>;
  private commands: Command[];
  private groups: Map<string, CommandGroup>;
  private fuzzyThreshold: number;
  private maxResults: number;
  private placeholder: string;

  constructor(options: CommandPaletteOptions) {
    super({
      ...options,
      message: options.message || 'Command Palette',
    });

    this.commands = options.commands;
    this.groups = new Map((options.groups || []).map(g => [g.id, g]));
    this.fuzzyThreshold = options.fuzzyThreshold ?? 0.3;
    this.maxResults = options.maxResults ?? 10;
    this.placeholder = options.placeholder ?? 'Type a command or search...';

    const recentCommands = options.recent || [];
    const initialFiltered = this.getInitialCommands(recentCommands);

    this.state = new StateManager<CommandPaletteState>({
      searchTerm: '',
      filteredCommands: initialFiltered,
      selectedIndex: 0,
      recentCommands,
      showingAll: false,
    });

    // Re-subscribe for re-rendering after replacing the state
    this.state.subscribe(() => {
      if ((this as any).isActive) {
        this.renderer.render(this.render());
      }
    });

    this.state.subscribe(() => this.emit('update', this.state.getState()));
  }

  private getInitialCommands(recent: string[]): Command[] {
    if (recent.length > 0) {
      const recentCommands = recent
        .map(id => this.commands.find(c => c.id === id))
        .filter((c): c is Command => c !== undefined)
        .slice(0, 5);

      if (recentCommands.length > 0) {
        return recentCommands;
      }
    }

    return this.commands.slice(0, this.maxResults);
  }

  private fuzzyMatch(query: string, target: string): number {
    const q = query.toLowerCase();
    const t = target.toLowerCase();

    // Exact match
    if (t === q) return 1.0;

    // Contains match
    if (t.includes(q)) return 0.8;

    // Fuzzy match
    let score = 0;
    let qIndex = 0;

    for (let i = 0; i < t.length && qIndex < q.length; i++) {
      if (t[i] === q[qIndex]) {
        score++;
        qIndex++;
      }
    }

    return qIndex === q.length ? score / t.length : 0;
  }

  private searchCommands(searchTerm: string): Command[] {
    if (!searchTerm.trim()) {
      return this.state.getState().recentCommands.length > 0
        ? this.getInitialCommands(this.state.getState().recentCommands)
        : this.commands.slice(0, this.maxResults);
    }

    const scored = this.commands.map(command => {
      // Check title
      let score = this.fuzzyMatch(searchTerm, command.title) * 2;

      // Check keywords
      if (command.keywords) {
        const keywordScore = Math.max(
          ...command.keywords.map(k => this.fuzzyMatch(searchTerm, k))
        );
        score = Math.max(score, keywordScore * 1.5);
      }

      // Check ID
      score = Math.max(score, this.fuzzyMatch(searchTerm, command.id));

      // Boost recent commands
      if (this.state.getState().recentCommands.includes(command.id)) {
        score *= 1.2;
      }

      return { command, score };
    });

    return scored
      .filter(({ score }) => score > this.fuzzyThreshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxResults)
      .map(({ command }) => command);
  }

  private updateSearch(searchTerm: string) {
    const filteredCommands = this.searchCommands(searchTerm);

    // Debug: log state updates
    if (process.env['NODE_ENV'] === 'test') {
      console.log('updateSearch called with:', searchTerm);
      console.log('filtered commands:', filteredCommands.map(c => c.title));
    }

    this.state.setState((prev) => {
      const newState = {
        ...prev,
        searchTerm,
        filteredCommands,
        selectedIndex: 0,
        showingAll: false,
      };

      // Debug: log state changes
      if (process.env['NODE_ENV'] === 'test') {
        console.log('setState called, prev:', prev, 'new:', newState);
      }

      return newState;
    });
  }

  render(): string {
    const state = this.state.getState();
    const theme = this.theme;

    // Debug: log render calls
    if (process.env['NODE_ENV'] === 'test') {
      console.log('render() called with state:', {
        searchTerm: state.searchTerm,
        filteredCommandTitles: state.filteredCommands.map(c => c.title)
      });
    }

    let output = '';

    // Header
    output += theme.formatters.primary(this.config.message || 'Command Palette') + '\n';

    // Search input
    output += theme.formatters.muted('> ');
    if (state.searchTerm) {
      output += state.searchTerm;
      output += theme.formatters.muted('|'); // Cursor
    } else {
      output += theme.formatters.muted(this.placeholder);
    }
    output += '\n\n';

    // Results
    if (state.filteredCommands.length === 0) {
      output += theme.formatters.muted('No commands found\n');
    } else {
      // Group commands
      const grouped = new Map<string | undefined, Command[]>();

      state.filteredCommands.forEach(command => {
        const group = command.group;
        if (!grouped.has(group)) {
          grouped.set(group, []);
        }
        grouped.get(group)!.push(command);
      });

      let index = 0;
      grouped.forEach((commands, groupId) => {
        // Group header
        if (groupId && this.groups.has(groupId)) {
          output += theme.formatters.muted(this.groups.get(groupId)!.title) + '\n';
        }

        // Commands in group
        commands.forEach(command => {
          const isSelected = index === state.selectedIndex;

          // Selection indicator
          output += isSelected ? theme.formatters.primary('❯ ') : '  ';

          // Icon
          if (command.icon) {
            output += command.icon + ' ';
          }

          // Title
          output += isSelected
            ? theme.formatters.primary(command.title)
            : command.title;

          // Shortcut
          if (command.shortcut) {
            output += '  ' + theme.formatters.muted(command.shortcut);
          }

          output += '\n';
          index++;
        });

        if (groupId) {
          output += '\n';
        }
      });
    }

    // Footer
    output += '\n';
    output += theme.formatters.muted('↑↓ Navigate  Enter Select  Esc Cancel');

    return output;
  }

  async handleInput(key: Key): Promise<void> {
    const state = this.state.getState();
    // Debug: log key events
    if (process.env['NODE_ENV'] === 'test') {
      console.log('CommandPalette received key:', key);
    }

    switch (key.name) {
      case 'up':
        if (state.selectedIndex > 0) {
          this.state.setState((prev) => ({ ...prev, selectedIndex: state.selectedIndex - 1 }));
        }
        break;

      case 'down':
        if (state.selectedIndex < state.filteredCommands.length - 1) {
          this.state.setState((prev) => ({ ...prev, selectedIndex: state.selectedIndex + 1 }));
        }
        break;

      case 'return':
      case 'enter':
        if (state.filteredCommands.length > 0) {
          const selected = state.filteredCommands[state.selectedIndex];
          if (selected) {
            // Add to recent
            const recent = [
              selected.id,
              ...state.recentCommands.filter(id => id !== selected.id)
            ].slice(0, 10);

            this.state.setState((prev) => ({ ...prev, recentCommands: recent }));

            // Execute command action
            await selected.action();

            this.submit(selected.id);
          }
        }
        break;

      case 'escape':
        this.submit(null);
        this.cancel();
        break;

      case 'backspace':
      case 'delete':
        if (state.searchTerm.length > 0) {
          this.updateSearch(state.searchTerm.slice(0, -1));
        }
        break;

      default: {
        // Handle character input
        const char = key.char || key.name;
        if (char && char.length === 1 && char >= ' ' && char <= '~') {
          this.updateSearch(state.searchTerm + char);
        }
        break;
      }
    }
  }

  override getValue(): string | null {
    const state = this.state.getState();
    const selected = state.filteredCommands[state.selectedIndex];
    return selected?.id || null;
  }
}

export async function commandPalette(options: CommandPaletteOptions): Promise<Command | null> {
  const prompt = new CommandPalette(options);
  const result = await prompt.prompt();

  // Handle cancel symbol
  if (typeof result === 'symbol') {
    return null;
  }

  // Find the command by ID and return the command object
  const command = options.commands.find(cmd => cmd.id === result);
  return command || null;
}