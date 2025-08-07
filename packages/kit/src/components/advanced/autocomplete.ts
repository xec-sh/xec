// Autocomplete component with fuzzy search and async data sources

import { Key } from '../../core/types.js';
import { Prompt } from '../../core/prompt.js';

export interface AutocompleteOption<T = string> {
  value: T;
  label: string;
  hint?: string;
  icon?: string;
}

export interface AutocompleteOptions<T = string> {
  message: string;
  source?: (input: string) => Promise<AutocompleteOption<T>[]> | AutocompleteOption<T>[];
  suggestions?: AutocompleteOption<T>[] | T[];
  fuzzy?: boolean;
  debounce?: number;
  limit?: number;
  emptyMessage?: string;
  placeholder?: string;
  defaultValue?: string;
  validate?: (value: string) => string | undefined | Promise<string | undefined>;
  theme?: any;
}

interface AutocompleteState<T> {
  input: string;
  cursor: number;
  selectedIndex: number;
  suggestions: AutocompleteOption<T>[];
  loading: boolean;
  error?: string;
  value?: T;
  status: string;
}

export class AutocompletePrompt<T = string> extends Prompt<T, AutocompleteOptions<T>> {
  private debounceTimer?: NodeJS.Timeout;
  private lastQuery = '';
  private loadingPromise?: Promise<void>;
  private validate?: (value: string) => string | undefined | Promise<string | undefined>;

  constructor(options: AutocompleteOptions<T>) {
    const { validate, ...restOptions } = options;
    super(restOptions as any);
    this.validate = validate;

    const state: AutocompleteState<T> = {
      input: options.defaultValue || '',
      cursor: options.defaultValue?.length || 0,
      selectedIndex: -1,
      suggestions: [],
      loading: false,
      error: undefined,
      value: undefined,
      status: 'active'
    };

    this.state.setState(state);
    
    // Load initial suggestions
    this.loadSuggestions();
  }

  render(): string {
    const state = this.state.getState() as AutocompleteState<T>;
    const { theme } = this.getRenderContext();
    const lines: string[] = [];

    // Message
    lines.push(theme.formatters.primary(this.config.message));

    // Input line with cursor
    const placeholder = this.config.placeholder || 'Start typing to search...';
    const displayInput = state.input || theme.formatters.muted(placeholder);
    
    let inputLine = '';
    if (state.status === 'active') {
      // Show cursor position
      if (state.input) {
        // If cursor is at the end, add a space for the cursor
        const cursorChar = state.cursor < state.input.length 
          ? state.input[state.cursor] 
          : ' ';
        inputLine = 
          state.input.slice(0, state.cursor) +
          theme.formatters.inverse(cursorChar || ' ') +
          state.input.slice(state.cursor + (state.cursor < state.input.length ? 1 : 0));
      } else {
        inputLine = theme.formatters.muted(placeholder);
      }
    } else {
      inputLine = state.input || theme.formatters.muted(placeholder);
    }
    
    lines.push(theme.formatters.secondary('> ') + inputLine);

    // Loading indicator
    if (state.loading) {
      lines.push('');
      lines.push(theme.formatters.muted('  Loading...'));
    } else if (state.suggestions.length > 0) {
      // Suggestions
      lines.push('');
      const limit = this.config.limit || 10;
      const visibleSuggestions = state.suggestions.slice(0, limit);

      visibleSuggestions.forEach((suggestion, index) => {
        const isSelected = index === state.selectedIndex;
        const prefix = isSelected ? theme.symbols.arrow + ' ' : '  ';
        
        let line = prefix;
        if (suggestion.icon) {
          line += suggestion.icon + ' ';
        }
        
        line += isSelected 
          ? theme.formatters.primary(suggestion.label)
          : suggestion.label;
        
        if (suggestion.hint) {
          line += ' ' + theme.formatters.muted(suggestion.hint);
        }
        
        if (isSelected) {
          line += ' ◀';
        }
        
        lines.push(line);
      });

      if (state.suggestions.length > limit) {
        lines.push(theme.formatters.muted(`  ... and ${state.suggestions.length - limit} more`));
      }
    } else if (!state.loading && state.input && state.suggestions.length === 0) {
      // Empty state
      lines.push('');
      lines.push(theme.formatters.muted('  ' + (this.config.emptyMessage || 'No results found')));
    }

    // Error
    if (state.error) {
      lines.push('');
      lines.push(theme.formatters.error('✗ ' + state.error));
    }

    return lines.join('\n');
  }

  async handleInput(key: Key): Promise<void> {
    const state = this.state.getState() as AutocompleteState<T>;

    // Navigation
    if (key.name === 'up') {
      this.moveSelection(-1);
      return;
    }
    
    if (key.name === 'down') {
      this.moveSelection(1);
      return;
    }

    // Submit
    if (key.name === 'return' || key.name === 'enter') {
      let valueToSubmit: T | undefined;
      
      if (state.selectedIndex >= 0 && state.selectedIndex < state.suggestions.length) {
        const selected = state.suggestions[state.selectedIndex];
        if (selected) {
          valueToSubmit = selected.value;
        }
      } else if (state.input) {
        // For free text input
        valueToSubmit = state.input as any;
      }
      
      if (valueToSubmit !== undefined) {
        // Validate if validator is provided
        if (this.validate) {
          const error = await this.validate(String(valueToSubmit));
          if (error) {
            this.state.setState({ ...state, error });
            return;
          }
        }
        await this.submit(valueToSubmit);
      }
      return;
    }

    // Tab to accept top suggestion
    if ((key.name === 'tab' || key.sequence === '\t') && state.suggestions.length > 0) {
      const index = state.selectedIndex >= 0 ? state.selectedIndex : 0;
      if (index < state.suggestions.length) {
        const suggestion = state.suggestions[index];
        if (suggestion) {
          this.state.setState({
            ...state,
            input: suggestion.label,
            cursor: suggestion.label.length,
            selectedIndex: index
          });
        }
      }
      return;
    }

    // Text input
    if (key.name === 'backspace') {
      if (state.cursor > 0) {
        const newInput = 
          state.input.slice(0, state.cursor - 1) + 
          state.input.slice(state.cursor);
        this.state.setState({
          ...state,
          input: newInput,
          cursor: state.cursor - 1
        });
        this.debouncedLoadSuggestions();
      }
      return;
    }

    if (key.name === 'delete') {
      if (state.cursor < state.input.length) {
        const newInput = 
          state.input.slice(0, state.cursor) + 
          state.input.slice(state.cursor + 1);
        this.state.setState({
          ...state,
          input: newInput
        });
        this.debouncedLoadSuggestions();
      }
      return;
    }

    // Cursor movement
    if (key.name === 'left' && state.cursor > 0) {
      this.state.setState({ ...state, cursor: state.cursor - 1 });
      return;
    }

    if (key.name === 'right' && state.cursor < state.input.length) {
      this.state.setState({ ...state, cursor: state.cursor + 1 });
      return;
    }

    if (key.name === 'home') {
      this.state.setState({ ...state, cursor: 0 });
      return;
    }

    if (key.name === 'end') {
      this.state.setState({ ...state, cursor: state.input.length });
      return;
    }

    // Regular character input
    if ((key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) || key.char) {
      const char = key.char || key.sequence;
      if (char) {
        const newInput = 
          state.input.slice(0, state.cursor) + 
          char + 
          state.input.slice(state.cursor);
        
        this.state.setState({
          ...state,
          input: newInput,
          cursor: state.cursor + 1
        });
        
        this.debouncedLoadSuggestions();
      }
    }
  }

  private moveSelection(direction: number): void {
    const state = this.state.getState() as AutocompleteState<T>;
    let newIndex = state.selectedIndex + direction;
    
    // Ensure we start at 0 if we're at -1 and going down
    if (state.selectedIndex === -1 && direction === 1) {
      newIndex = 0;
    }
    
    // Clamp to valid range
    if (newIndex >= 0 && newIndex < state.suggestions.length) {
      this.state.setState({ ...state, selectedIndex: newIndex });
    }
  }

  private debouncedLoadSuggestions(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    const debounce = this.config.debounce !== undefined ? this.config.debounce : 0;
    if (debounce === 0) {
      this.loadSuggestions();
    } else {
      this.debounceTimer = setTimeout(() => {
        this.loadSuggestions();
      }, debounce);
    }
  }

  private async loadSuggestions(): Promise<void> {
    const state = this.state.getState() as AutocompleteState<T>;
    const query = state.input;

    this.lastQuery = query;

    // Cancel previous loading
    if (this.loadingPromise) {
      // Simple cancellation - in production would use AbortController
      this.loadingPromise = undefined;
    }

    this.state.setState({ ...state, loading: true, error: undefined });

    this.loadingPromise = (async () => {
      try {
        let suggestions: AutocompleteOption<T>[] = [];

        if (this.config.source) {
          // Load from async source
          suggestions = await this.config.source(query);
        } else if (this.config.suggestions) {
          // Use static suggestions
          const staticSuggestions = this.config.suggestions;
          suggestions = this.normalizeSuggestions(staticSuggestions);
          
          // Apply filtering based on query
          if (query) {
            if (this.config.fuzzy) {
              // Fuzzy search filters and sorts
              suggestions = this.fuzzySort(suggestions, query);
            } else {
              // Regular filtering
              suggestions = this.filterSuggestions(suggestions, query);
            }
          }
        }

        // Only update if this is still the current query
        if (query === this.lastQuery) {
          const currentState = this.state.getState() as AutocompleteState<T>;
          this.state.setState({
            ...currentState,
            suggestions,
            loading: false,
            selectedIndex: currentState.selectedIndex >= 0 && currentState.selectedIndex < suggestions.length 
              ? currentState.selectedIndex 
              : (suggestions.length > 0 ? 0 : -1)
          });
        }
      } catch (error) {
        if (query === this.lastQuery) {
          this.state.setState({
            ...this.state.getState(),
            loading: false,
            error: (error as Error).message
          });
        }
      }
    })();

    await this.loadingPromise;
  }

  private normalizeSuggestions(suggestions: AutocompleteOption<T>[] | T[]): AutocompleteOption<T>[] {
    return suggestions.map(s => {
      if (typeof s === 'object' && s !== null && 'value' in s) {
        return s as AutocompleteOption<T>;
      }
      return {
        value: s as T,
        label: String(s)
      };
    });
  }

  private filterSuggestions(suggestions: AutocompleteOption<T>[], query: string): AutocompleteOption<T>[] {
    const lowerQuery = query.toLowerCase();
    return suggestions.filter(s => 
      s.label.toLowerCase().startsWith(lowerQuery)
    );
  }

  private fuzzySort(suggestions: AutocompleteOption<T>[], query: string): AutocompleteOption<T>[] {
    // Simple fuzzy matching - in production would use a proper fuzzy search library
    const scored = suggestions.map(suggestion => {
      let score = 0;
      const label = suggestion.label.toLowerCase();
      const q = query.toLowerCase();
      
      // Exact match
      if (label === q) score += 1000;
      
      // Starts with query
      if (label.startsWith(q)) score += 100;
      
      // Contains query
      if (label.includes(q)) score += 50;
      
      // Character-by-character fuzzy match
      let queryIndex = 0;
      for (let i = 0; i < label.length && queryIndex < q.length; i++) {
        if (label[i] === q[queryIndex]) {
          score += 10 - (i * 0.1); // Earlier matches score higher
          queryIndex++;
        }
      }
      
      // All characters matched
      if (queryIndex === q.length) score += 20;
      
      // If no characters matched, score is 0
      if (queryIndex === 0) score = 0;
      
      return { suggestion, score };
    });

    return scored
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score)
      .map(item => item.suggestion);
  }

  protected override formatValue(value: T): string {
    const state = this.state.getState() as AutocompleteState<T>;
    const selected = state.suggestions.find(s => s.value === value);
    return selected ? selected.label : String(value);
  }
}