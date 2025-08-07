// Multi-select component

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface MultiSelectOption<T = string> {
  value: T;
  label?: string;
  hint?: string;
  disabled?: boolean;
  selected?: boolean;
}

export interface MultiSelectOptions<T = string> {
  options: MultiSelectOption<T>[] | T[];
  filter?: boolean;
  limit?: number;
  loop?: boolean;
  required?: boolean;
  min?: number;
  max?: number;
}

export class MultiSelectPrompt<T = string> extends Prompt<T[], MultiSelectOptions<T>> {
  private cursor = 0;
  private options: MultiSelectOption<T>[];
  private selected = new Set<T>();
  private filterValue = '';
  private filteredOptions: MultiSelectOption<T>[] = [];
  private scrollOffset = 0;

  constructor(config: PromptConfig<T[], MultiSelectOptions<T>> & MultiSelectOptions<T>) {
    super(config);
    
    // Normalize options
    this.options = this.normalizeOptions(config.options);
    this.filteredOptions = [...this.options];
    
    // Set initial selections
    this.options.forEach(opt => {
      if (opt.selected) {
        this.selected.add(opt.value);
      }
    });
    
    // Set initial cursor to first non-disabled option
    this.cursor = this.options.findIndex(opt => !opt.disabled);
    if (this.cursor === -1) this.cursor = 0;
  }

  render(): string {
    const ctx = this.getRenderContext();
    const { message, limit = 10 } = this.config;
    const { status, error } = this.state.getState();
    
    let output = '';
    
    // Message
    output += ctx.theme.formatters.highlight(message);
    output += ctx.theme.formatters.muted(` (${this.selected.size} selected)`);
    
    // Filter input
    if (this.config.filter && status === 'active') {
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
      
      visibleOptions.forEach(({ option, index, isCursor }) => {
        const label = option.label || String(option.value);
        const isSelected = this.selected.has(option.value);
        const prefix = isCursor ? ctx.theme.symbols.pointer : '  ';
        const checkbox = isSelected 
          ? ctx.theme.symbols.checkbox.checked 
          : ctx.theme.symbols.checkbox.unchecked;
        
        if (option.disabled) {
          output += ctx.theme.formatters.muted(`${prefix} ${checkbox} ${label}`);
        } else if (isCursor) {
          output += ctx.theme.formatters.highlight(`${prefix} ${checkbox} ${label}`);
        } else {
          output += `${prefix} ${checkbox} ${label}`;
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
      
      // Instructions
      output += '\n' + ctx.theme.formatters.muted('Space to select, Enter to submit');
      
      // Select all option
      if (!this.config.filter || !this.filterValue) {
        output += ctx.theme.formatters.muted(', a to select all');
      }
    } else {
      const selectedOptions = this.options.filter(opt => this.selected.has(opt.value));
      if (selectedOptions.length > 0) {
        output += selectedOptions
          .map(opt => opt.label || String(opt.value))
          .join(', ');
      } else {
        output += ctx.theme.formatters.muted('None selected');
      }
    }
    
    // Error message
    if (error && status === 'active') {
      output += '\n' + ctx.theme.formatters.error(`  ${error}`);
    }
    
    return output.trimEnd();
  }

  async handleInput(key: Key): Promise<void> {
    const { name, ctrl } = key;
    
    // Submit on Enter
    if (name === 'enter') {
      await this.validateAndSubmit();
      return;
    }
    
    // Toggle selection with Space
    if (name === 'space') {
      this.toggleSelection();
      return;
    }
    
    // Select all
    if (name === 'a' && (!this.config.filter || !this.filterValue)) {
      this.selectAll();
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
      
      if (name && name.length === 1 && !ctrl && name !== 'a') {
        this.filterValue += name;
        this.applyFilter();
        return;
      }
    }
  }

  private normalizeOptions(options: MultiSelectOption<T>[] | T[]): MultiSelectOption<T>[] {
    return options.map(opt => {
      if (typeof opt === 'object' && opt !== null && 'value' in opt) {
        return opt as MultiSelectOption<T>;
      }
      return { value: opt as T };
    });
  }

  private toggleSelection(): void {
    const current = this.filteredOptions[this.cursor];
    if (!current || current.disabled) return;
    
    if (this.selected.has(current.value)) {
      this.selected.delete(current.value);
    } else {
      // Check max limit
      if (this.config.max && this.selected.size >= this.config.max) {
        return;
      }
      this.selected.add(current.value);
    }
    
    this.updateState();
  }

  private selectAll(): void {
    const allSelected = this.filteredOptions
      .filter(opt => !opt.disabled)
      .every(opt => this.selected.has(opt.value));
    
    if (allSelected) {
      // Deselect all
      this.filteredOptions.forEach(opt => {
        if (!opt.disabled) {
          this.selected.delete(opt.value);
        }
      });
    } else {
      // Select all (respecting max limit)
      const selectable = this.filteredOptions.filter(opt => !opt.disabled);
      const maxToSelect = this.config.max 
        ? Math.min(selectable.length, this.config.max) 
        : selectable.length;
      
      this.selected.clear();
      selectable.slice(0, maxToSelect).forEach(opt => {
        this.selected.add(opt.value);
      });
    }
    
    this.updateState();
  }

  private async validateAndSubmit(): Promise<void> {
    const selectedArray = Array.from(this.selected);
    
    // Check required
    if (this.config.required && selectedArray.length === 0) {
      this.state.setState((s: any) => ({ ...s, error: 'At least one option must be selected' }));
      return;
    }
    
    // Check min
    if (this.config.min && selectedArray.length < this.config.min) {
      this.state.setState((s: any) => ({ 
        ...s, 
        error: `Select at least ${this.config.min} option${this.config.min && this.config.min > 1 ? 's' : ''}` 
      }));
      return;
    }
    
    // Check max
    if (this.config.max && selectedArray.length > this.config.max) {
      this.state.setState((s: any) => ({ 
        ...s, 
        error: `Select at most ${this.config.max} option${this.config.max && this.config.max > 1 ? 's' : ''}` 
      }));
      return;
    }
    
    await this.submit(selectedArray);
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

  private getVisibleOptions(limit: number): Array<{ option: MultiSelectOption<T>; index: number; isCursor: boolean }> {
    const start = this.scrollOffset;
    const end = Math.min(start + limit, this.filteredOptions.length);
    
    return this.filteredOptions
      .slice(start, end)
      .map((option, i) => ({
        option,
        index: start + i,
        isCursor: start + i === this.cursor
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
    this.state.setState((s: any) => ({ 
      ...s, 
      value: Array.from(this.selected),
      error: undefined 
    }));
  }
}