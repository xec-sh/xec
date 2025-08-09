/**
 * Select component for Terex
 * Provides single-choice selection with keyboard navigation and search
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent, type ComponentEventMap } from '../../core/component.js';

import type { Key, Output } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export interface SelectOption<T = unknown> {
  value: T;
  label: string;
  disabled?: boolean;
  hint?: string;
  group?: string;
}

export interface SelectOptions<T = unknown> {
  options: SelectOption<T>[] | T[];
  defaultValue?: T;
  placeholder?: string;
  filter?: boolean;
  filterPlaceholder?: string;
  loop?: boolean;
  limit?: number;
  renderOption?: (option: SelectOption<T>, isSelected: boolean, isFocused: boolean) => string;
  compareOptions?: (a: T, b: T) => boolean;
  disabled?: boolean;
  readOnly?: boolean;
  clearable?: boolean;
  groups?: boolean;
}

export interface SelectState<T = unknown> {
  value: T | null;
  focusedIndex: number;
  filterQuery: string;
  filteredOptions: SelectOption<T>[];
  isOpen: boolean;
  isFocused: boolean;
  error?: string;
}

// ============================================================================
// Select Component
// ============================================================================

export class Select<T = unknown> extends BaseComponent<SelectState<T>> {
  private options: Required<SelectOptions<T>>;
  private normalizedOptions: SelectOption<T>[];
  private style: StyleBuilder;
  
  constructor(options: SelectOptions<T>) {
    // Normalize options
    const normalizedOptions = Select.normalizeOptions(options.options);
    
    const initialState: SelectState<T> = {
      value: options.defaultValue ?? null,
      focusedIndex: 0,
      filterQuery: '',
      filteredOptions: normalizedOptions,
      isOpen: false,
      isFocused: false,
      error: undefined
    };
    
    super({ initialState });
    
    // Set default options
    this.options = {
      options: options.options,
      defaultValue: options.defaultValue ?? null,
      placeholder: options.placeholder ?? 'Select an option',
      filter: options.filter ?? false,
      filterPlaceholder: options.filterPlaceholder ?? 'Type to filter...',
      loop: options.loop ?? true,
      limit: options.limit ?? 10,
      renderOption: options.renderOption ?? this.defaultRenderOption.bind(this),
      compareOptions: options.compareOptions ?? ((a, b) => a === b),
      disabled: options.disabled ?? false,
      readOnly: options.readOnly ?? false,
      clearable: options.clearable ?? false,
      groups: options.groups ?? false
    } as Required<SelectOptions<T>>;
    
    this.normalizedOptions = normalizedOptions;
    this.style = new StyleBuilder();
    
    // Set initial focused index based on default value
    if (options.defaultValue !== null && options.defaultValue !== undefined) {
      const index = this.normalizedOptions.findIndex(
        opt => this.options.compareOptions(opt.value, options.defaultValue!)
      );
      if (index !== -1) {
        this.state.focusedIndex = index;
      }
    }
  }
  
  // ============================================================================
  // Option Normalization
  // ============================================================================
  
  private static normalizeOptions<T>(options: SelectOption<T>[] | T[]): SelectOption<T>[] {
    // Handle invalid options gracefully
    if (!options || !Array.isArray(options)) {
      return [];
    }

    return options.map(option => {
      if (typeof option === 'object' && option !== null && 'value' in option) {
        return option as SelectOption<T>;
      }
      return {
        value: option,
        label: String(option)
      };
    });
  }
  
  // ============================================================================
  // Rendering
  // ============================================================================
  
  render(): Output {
    const { value, isOpen, filteredOptions, focusedIndex, filterQuery, isFocused, error } = this.state;
    const { placeholder, disabled, readOnly, filter, filterPlaceholder, limit } = this.options;
    
    const lines: string[] = [];
    
    // Render selected value or placeholder
    const selectedOption = value !== null 
      ? this.normalizedOptions.find(opt => this.options.compareOptions(opt.value, value))
      : null;
    
    let displayValue = selectedOption ? selectedOption.label : placeholder;
    
    // Apply styling to display value
    if (disabled || readOnly) {
      displayValue = this.style.dim().text(displayValue);
    } else if (!selectedOption) {
      displayValue = this.style.dim().text(displayValue);
    }
    
    // Add dropdown indicator
    const indicator = isOpen ? '▲' : '▼';
    const indicatorStyled = isFocused 
      ? this.style.cyan().text(indicator)
      : this.style.dim().text(indicator);
    
    lines.push(`${displayValue} ${indicatorStyled}`);
    
    // Render dropdown if open
    if (isOpen) {
      lines.push(this.style.dim().text('─'.repeat(this.getMaxOptionWidth() + 2)));
      
      // Render filter input if enabled
      if (filter) {
        const filterLine = filterQuery 
          ? `🔍 ${filterQuery}${isFocused ? this.style.inverse().text(' ') : ''}`
          : this.style.dim().text(`🔍 ${filterPlaceholder}`);
        lines.push(filterLine);
        lines.push(this.style.dim().text('─'.repeat(this.getMaxOptionWidth() + 2)));
      }
      
      // Render options
      const visibleOptions = filteredOptions.slice(0, limit);
      let currentGroup: string | undefined;
      
      visibleOptions.forEach((option, index) => {
        // Render group header if needed
        if (this.options.groups && option.group && option.group !== currentGroup) {
          currentGroup = option.group;
          lines.push('');
          lines.push(this.style.bold().dim().text(currentGroup));
        }
        
        const isSelected = value !== null && this.options.compareOptions(option.value, value);
        const isFocusedOption = index === focusedIndex;
        
        const rendered = this.options.renderOption(option, isSelected, isFocusedOption);
        lines.push(rendered);
      });
      
      // Show more indicator if there are more options
      if (filteredOptions.length > limit) {
        lines.push(this.style.dim().text(`... and ${filteredOptions.length - limit} more`));
      }
      
      // Show no results message
      if (filteredOptions.length === 0) {
        lines.push(this.style.dim().text('No matching options'));
      }
    }
    
    // Add error message if present
    if (error) {
      lines.push(this.style.red().text(`⚠ ${error}`));
    }
    
    return {
      lines,
      cursor: this.state.isFocused ? { x: 0, y: 0 } : undefined
    };
  }
  
  private defaultRenderOption(option: SelectOption<T>, isSelected: boolean, isFocused: boolean): string {
    let line = '';
    
    // Add selection indicator
    if (isSelected) {
      line += this.style.green().text('✓ ');
    } else {
      line += '  ';
    }
    
    // Add label
    let label = option.label;
    
    if (option.disabled) {
      label = this.style.dim().strikethrough().text(label);
    } else if (isFocused) {
      label = this.style.inverse().text(label);
    } else if (isSelected) {
      label = this.style.green().text(label);
    }
    
    line += label;
    
    // Add hint if present
    if (option.hint) {
      line += ' ' + this.style.dim().text(`(${option.hint})`);
    }
    
    return line;
  }
  
  private getMaxOptionWidth(): number {
    return Math.max(
      ...this.normalizedOptions.map(opt => opt.label.length + (opt.hint ? opt.hint.length + 3 : 0))
    );
  }
  
  // ============================================================================
  // Input Handling
  // ============================================================================
  
  override handleKeypress(key: Key): boolean {
    // Call async handleInput and return true to indicate we handled it
    this.handleInput(key).catch(err => {
      this.emit('error', err);
    });
    return true;
  }
  
  async handleInput(key: Key): Promise<void> {
    if (this.options.disabled || this.options.readOnly) {
      return;
    }
    
    const { isOpen, filterQuery } = this.state;
    
    // Handle filter input when filtering is enabled
    if (isOpen && this.options.filter && key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
      await this.handleFilterInput(key.sequence);
      return;
    }
    
    switch (key.name) {
      case 'return':
      case 'enter':
        if (isOpen) {
          await this.selectFocused();
        } else {
          this.open();
        }
        break;
        
      case 'space':
        if (!isOpen) {
          this.open();
        } else if (this.options.filter) {
          await this.handleFilterInput(' ');
        } else {
          await this.selectFocused();
        }
        break;
        
      case 'escape':
        if (isOpen) {
          this.close();
        } else {
          this.emit('cancel');
        }
        break;
        
      case 'up':
        if (isOpen) {
          this.moveFocus(-1);
        } else {
          this.open();
        }
        break;
        
      case 'down':
        if (isOpen) {
          this.moveFocus(1);
        } else {
          this.open();
        }
        break;
        
      case 'home':
        if (isOpen) {
          this.moveFocusToFirst();
        }
        break;
        
      case 'end':
        if (isOpen) {
          this.moveFocusToLast();
        }
        break;
        
      case 'pageup':
        if (isOpen) {
          this.moveFocus(-this.options.limit);
        }
        break;
        
      case 'pagedown':
        if (isOpen) {
          this.moveFocus(this.options.limit);
        }
        break;
        
      case 'backspace':
        if (isOpen && this.options.filter && filterQuery.length > 0) {
          await this.handleFilterBackspace();
        } else if (this.options.clearable && !isOpen) {
          this.clear();
        }
        break;
        
      case 'delete':
        if (this.options.clearable && !isOpen) {
          this.clear();
        }
        break;
        
      case 'tab':
        if (isOpen) {
          await this.selectFocused();
        }
        this.emit('tab', key.shift);
        break;
    }
    
    // Handle letter key navigation (jump to option)
    if (!isOpen && key.sequence && key.sequence.length === 1 && /[a-z]/i.test(key.sequence)) {
      this.jumpToOption(key.sequence);
    }
    
    this.invalidate();
  }
  
  // ============================================================================
  // Filter Management
  // ============================================================================
  
  private async handleFilterInput(char: string): Promise<void> {
    const newQuery = this.state.filterQuery + char;
    this.setState({ filterQuery: newQuery });
    this.applyFilter(newQuery);
  }
  
  private async handleFilterBackspace(): Promise<void> {
    const newQuery = this.state.filterQuery.slice(0, -1);
    this.setState({ filterQuery: newQuery });
    this.applyFilter(newQuery);
  }
  
  private applyFilter(query: string): void {
    if (!query) {
      this.setState({
        filteredOptions: this.normalizedOptions,
        focusedIndex: 0
      });
      return;
    }
    
    const lowerQuery = query.toLowerCase();
    const filtered = this.normalizedOptions.filter(option => 
      option.label.toLowerCase().includes(lowerQuery) ||
      (option.hint && option.hint.toLowerCase().includes(lowerQuery))
    );
    
    this.setState({
      filteredOptions: filtered,
      focusedIndex: 0
    });
  }
  
  // ============================================================================
  // Focus Management
  // ============================================================================
  
  private moveFocus(delta: number): void {
    const { focusedIndex, filteredOptions } = this.state;
    const count = filteredOptions.length;
    
    if (count === 0) return;
    
    let newIndex = focusedIndex + delta;
    
    if (this.options.loop) {
      newIndex = ((newIndex % count) + count) % count;
    } else {
      newIndex = Math.max(0, Math.min(count - 1, newIndex));
    }
    
    // Skip disabled options
    while (filteredOptions[newIndex]?.disabled && newIndex !== focusedIndex) {
      newIndex += delta > 0 ? 1 : -1;
      
      if (this.options.loop) {
        newIndex = ((newIndex % count) + count) % count;
      } else {
        newIndex = Math.max(0, Math.min(count - 1, newIndex));
      }
    }
    
    this.setState({ focusedIndex: newIndex });
  }
  
  private moveFocusToFirst(): void {
    this.setState({ focusedIndex: 0 });
    
    // Skip disabled options
    if (this.state.filteredOptions[0]?.disabled) {
      this.moveFocus(1);
    }
  }
  
  private moveFocusToLast(): void {
    const lastIndex = this.state.filteredOptions.length - 1;
    this.setState({ focusedIndex: lastIndex });
    
    // Skip disabled options
    if (this.state.filteredOptions[lastIndex]?.disabled) {
      this.moveFocus(-1);
    }
  }
  
  private jumpToOption(letter: string): void {
    const lower = letter.toLowerCase();
    const currentIndex = this.state.focusedIndex;
    const options = this.state.filteredOptions;
    
    // Find next option starting with the letter
    let foundIndex = -1;
    
    // Search from current position to end
    for (let i = currentIndex + 1; i < options.length; i++) {
      if (options[i]?.label.toLowerCase().startsWith(lower) && !options[i]?.disabled) {
        foundIndex = i;
        break;
      }
    }
    
    // If not found, search from beginning to current position
    if (foundIndex === -1) {
      for (let i = 0; i <= currentIndex; i++) {
        if (options[i]?.label.toLowerCase().startsWith(lower) && !options[i]?.disabled) {
          foundIndex = i;
          break;
        }
      }
    }
    
    if (foundIndex !== -1) {
      this.setState({ focusedIndex: foundIndex });
      
      // Auto-select if dropdown is closed
      if (!this.state.isOpen) {
        const option = options[foundIndex];
        if (option) {
          this.setValue(option.value);
        }
      }
    }
  }
  
  // ============================================================================
  // Selection Management
  // ============================================================================
  
  private async selectFocused(): Promise<void> {
    const { focusedIndex, filteredOptions } = this.state;
    const option = filteredOptions[focusedIndex];
    
    if (!option || option.disabled) {
      return;
    }
    
    await this.selectOption(option);
  }
  
  private async selectOption(option: SelectOption<T>): Promise<void> {
    this.setValue(option.value);
    this.close();
    this.emit('select', option.value);
    this.emit('submit', option.value);
  }
  
  private setValue(value: T): void {
    this.setState({
      value,
      error: undefined
    });
    
    this.emit('change', value);
  }
  
  private clear(): void {
    this.setState({
      value: null,
      focusedIndex: 0,
      error: undefined
    });
    
    this.emit('change', null);
  }
  
  // ============================================================================
  // Dropdown Management
  // ============================================================================
  
  private open(): void {
    if (this.state.isOpen) return;
    
    // Reset filter and set initial focus
    const currentIndex = this.state.value !== null
      ? this.normalizedOptions.findIndex(opt => 
          this.options.compareOptions(opt.value, this.state.value!)
        )
      : 0;
    
    this.setState({
      isOpen: true,
      filterQuery: '',
      filteredOptions: this.normalizedOptions,
      focusedIndex: Math.max(0, currentIndex)
    });
    
    this.emit('open');
  }
  
  private close(): void {
    if (!this.state.isOpen) return;
    
    this.setState({
      isOpen: false,
      filterQuery: '',
      filteredOptions: this.normalizedOptions
    });
    
    this.emit('close');
  }
  
  private toggle(): void {
    if (this.state.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }
  
  // ============================================================================
  // Focus Management
  // ============================================================================
  
  override focus(): void {
    this.setState({ isFocused: true });
    super.focus();
  }
  
  override blur(): void {
    this.setState({ isFocused: false });
    this.close();
    super.blur();
  }
  
  // ============================================================================
  // Public API
  // ============================================================================
  
  getValue(): T | null {
    return this.state.value;
  }
  
  setValuePublic(value: T): void {
    this.setValue(value);
  }
  
  getSelectedOption(): SelectOption<T> | null {
    const { value } = this.state;
    
    if (value === null) return null;
    
    return this.normalizedOptions.find(opt => 
      this.options.compareOptions(opt.value, value)
    ) ?? null;
  }
  
  setOptions(options: SelectOption<T>[] | T[]): void {
    this.normalizedOptions = Select.normalizeOptions(options);
    this.setState({
      filteredOptions: this.normalizedOptions,
      focusedIndex: 0
    });
  }
  
  isOpen(): boolean {
    return this.state.isOpen;
  }
  
  setError(error: string): void {
    this.setState({ error });
  }
  
  clearError(): void {
    this.setState({ error: undefined });
  }
  
  // ============================================================================
  // Utilities
  // ============================================================================
  

  // Helper method for event emission
  public override emit<K extends keyof ComponentEventMap>(
    event: K, 
    ...args: ComponentEventMap[K]
  ): void {
    this.events.emit(event, ...args);
  }
}