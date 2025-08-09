// Select (single choice) component

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface SelectOption<T = string> {
  value: T;
  label?: string;
  hint?: string;
  disabled?: boolean;
}

export interface SelectOptions<T = string> {
  options: SelectOption<T>[] | T[];
  filter?: boolean;
  search?: boolean; // Alias for filter
  limit?: number;
  loop?: boolean;
  default?: T; // Default selected value
  initialValue?: T; // Alias for default
  preview?: (option: SelectOption<T>) => string; // Preview function for options
}

export class SelectPrompt<T = string> extends Prompt<T, SelectOptions<T>> {
  private cursor = 0;
  private options: SelectOption<T>[];
  private filterValue = '';
  private filteredOptions: SelectOption<T>[] = [];
  private scrollOffset = 0;

  constructor(config: PromptConfig<T, SelectOptions<T>> & SelectOptions<T>) {
    super(config);
    
    // Validate options
    if (!config.options || config.options.length === 0) {
      throw new Error('Select prompt requires at least one option');
    }
    
    // Normalize options
    this.options = this.normalizeOptions(config.options);
    this.filteredOptions = [...this.options];
    
    // Set initial cursor based on default/initialValue or first non-disabled option
    const defaultValue = config.default ?? config.initialValue;
    if (defaultValue !== undefined) {
      const defaultIndex = this.options.findIndex(opt => opt.value === defaultValue);
      if (defaultIndex !== -1) {
        this.cursor = defaultIndex;
      } else {
        this.cursor = this.options.findIndex(opt => !opt.disabled);
        if (this.cursor === -1) this.cursor = 0;
      }
    } else {
      this.cursor = this.options.findIndex(opt => !opt.disabled);
      if (this.cursor === -1) this.cursor = 0;
    }
    
    // Initialize state with the selected value
    const selected = this.options[this.cursor];
    if (selected) {
      this.state.setState((s: any) => ({ ...s, value: selected.value }));
    }
  }

  render(): string {
    const ctx = this.getRenderContext();
    const { message, limit = 10 } = this.config;
    const { status } = this.state.getState();
    
    let output = '';
    
    // Message
    output += ctx.theme.formatters.highlight(message);
    
    // Filter input
    if ((this.config.filter || this.config.search) && status === 'active') {
      output += '\n';
      output += ctx.theme.formatters.muted('Filter: ');
      output += this.filterValue;
      if (this.filterValue) {
        output += ctx.theme.formatters.muted(` (${this.filteredOptions.length} results)`);
      }
    }
    
    output += '\n';
    
    // Options
    if (status === 'active') {
      const visibleOptions = this.getVisibleOptions(limit);
      
      visibleOptions.forEach(({ option, index, isSelected }) => {
        const label = option.label || String(option.value);
        const prefix = isSelected ? ctx.theme.symbols.pointer : '  ';
        
        if (option.disabled) {
          output += ctx.theme.formatters.muted(`${prefix} ${label}`);
        } else if (isSelected) {
          output += ctx.theme.formatters.highlight(`${prefix} ${label}`);
        } else {
          output += `${prefix} ${label}`;
        }
        
        if (option.hint) {
          output += ' ' + ctx.theme.formatters.muted(`(${option.hint})`);
        }
        
        output += '\n';
      });
      
      // Scroll indicators
      if (this.scrollOffset > 0) {
        output += ctx.theme.formatters.muted('  ↑ More above\n');
      }
      if (this.scrollOffset + limit < this.filteredOptions.length) {
        output += ctx.theme.formatters.muted('  ↓ More below\n');
      }
    } else {
      const selected = this.filteredOptions[this.cursor];
      if (selected) {
        output += selected.label || String(selected.value);
      }
    }
    
    return output.trimEnd();
  }

  async handleInput(key: Key): Promise<void> {
    const { name, ctrl, char } = key;
    
    // Submit on Enter
    if (name === 'enter' || name === 'return') {
      const selected = this.filteredOptions[this.cursor];
      if (selected && !selected.disabled) {
        await this.submit(selected.value);
      }
      return;
    }
    
    // Navigation
    if (name === 'up') {
      this.moveCursor(-1);
      return;
    }
    
    if (name === 'down') {
      this.moveCursor(1);
      return;
    }
    
    if (name === 'home' || (ctrl && name === 'a')) {
      this.cursor = 0;
      this.scrollOffset = 0;
      this.updateState();
      return;
    }
    
    if (name === 'end' || (ctrl && name === 'e')) {
      this.cursor = this.filteredOptions.length - 1;
      this.updateScrollOffset();
      this.updateState();
      return;
    }
    
    if (name === 'pageup') {
      this.moveCursor(-(this.config.limit || 10));
      return;
    }
    
    if (name === 'pagedown') {
      this.moveCursor(this.config.limit || 10);
      return;
    }
    
    // Filtering
    if (this.config.filter) {
      if (name === 'backspace') {
        this.filterValue = this.filterValue.slice(0, -1);
        this.applyFilter();
        return;
      }
      
      if (ctrl && name === 'u') {
        this.filterValue = '';
        this.applyFilter();
        return;
      }
      
      // Character input - handle both key.char and key.name
      const inputChar = char || (name && name.length === 1 && !ctrl ? name : null);
      if (inputChar) {
        this.filterValue += inputChar;
        this.applyFilter();
        return;
      }
    }
  }

  private normalizeOptions(options: SelectOption<T>[] | T[]): SelectOption<T>[] {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null && 'value' in opt) {
        return opt as SelectOption<T>;
      }
      return { value: opt as T };
    });
  }

  private moveCursor(delta: number): void {
    const newCursor = this.cursor + delta;
    
    if (this.config.loop) {
      if (newCursor < 0) {
        this.cursor = this.filteredOptions.length - 1;
      } else if (newCursor >= this.filteredOptions.length) {
        this.cursor = 0;
      } else {
        this.cursor = newCursor;
      }
    } else {
      this.cursor = Math.max(0, Math.min(this.filteredOptions.length - 1, newCursor));
    }
    
    // Skip disabled options
    const selected = this.filteredOptions[this.cursor];
    if (selected?.disabled) {
      this.moveCursor(delta > 0 ? 1 : -1);
      return;
    }
    
    this.updateScrollOffset();
    this.updateState();
  }

  private applyFilter(): void {
    if (!this.filterValue) {
      this.filteredOptions = [...this.options];
    } else {
      const query = this.filterValue.toLowerCase();
      this.filteredOptions = this.options.filter(opt => {
        const label = opt.label || String(opt.value);
        return label.toLowerCase().includes(query);
      });
    }
    
    this.cursor = 0;
    this.scrollOffset = 0;
    this.updateState();
  }

  private getVisibleOptions(limit: number): Array<{ option: SelectOption<T>; index: number; isSelected: boolean }> {
    const start = this.scrollOffset;
    const end = Math.min(start + limit, this.filteredOptions.length);
    
    return this.filteredOptions
      .slice(start, end)
      .map((option, i) => ({
        option,
        index: start + i,
        isSelected: start + i === this.cursor
      }));
  }

  private updateScrollOffset(): void {
    const limit = this.config.limit || 10;
    
    if (this.cursor < this.scrollOffset) {
      this.scrollOffset = this.cursor;
    } else if (this.cursor >= this.scrollOffset + limit) {
      this.scrollOffset = this.cursor - limit + 1;
    }
  }

  private updateState(): void {
    const selected = this.filteredOptions[this.cursor];
    if (selected) {
      this.state.setState((s: any) => ({ ...s, value: selected.value }));
    }
  }
}