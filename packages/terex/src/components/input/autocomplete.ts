/**
 * Autocomplete component for Terex
 * Provides text input with fuzzy search, dropdown suggestions, keyboard navigation, and async data loading
 */

import { StyleBuilder } from '../../core/color.js';
import { BaseComponent } from '../../core/component.js';
import { stripAnsi, visualLength } from '../../utils/index.js';

import type { Key, Output } from '../../core/types.js';

// ============================================================================
// Type Definitions
// ============================================================================

export type AutocompleteValue = string | number | object;

export interface AutocompleteSuggestion<T = AutocompleteValue> {
  id: string | number;
  value: T;
  label: string;
  description?: string;
  category?: string;
  icon?: string;
  disabled?: boolean;
  metadata?: Record<string, unknown>;
}

export interface AutocompleteOptions<T = AutocompleteValue> {
  placeholder?: string;
  suggestions?: AutocompleteSuggestion<T>[];
  value?: string;
  maxSuggestions?: number;
  minQueryLength?: number;
  maxDropdownHeight?: number;
  fuzzySearch?: boolean;
  caseSensitive?: boolean;
  highlightMatches?: boolean;
  allowCustom?: boolean;
  selectOnTab?: boolean;
  selectOnEnter?: boolean;
  clearOnSelect?: boolean;
  closeOnBlur?: boolean;
  showCategories?: boolean;
  showDescriptions?: boolean;
  showIcons?: boolean;
  debounceMs?: number;
  loadingText?: string;
  noResultsText?: string;
  categoryHeader?: (category: string) => string;
  suggestionRenderer?: (suggestion: AutocompleteSuggestion<T>, isSelected: boolean, query: string) => string;
  onQueryChange?: (query: string) => void;
  onSuggestionSelect?: (suggestion: AutocompleteSuggestion<T>) => void;
  onLoadSuggestions?: (query: string) => Promise<AutocompleteSuggestion<T>[]>;
  onValidate?: (value: string) => string | null;
  onCustomValue?: (value: string) => AutocompleteSuggestion<T> | null;
}

export interface AutocompleteState<T = AutocompleteValue> {
  query: string;
  value: string;
  suggestions: AutocompleteSuggestion<T>[];
  filteredSuggestions: AutocompleteSuggestion<T>[];
  selectedIndex: number;
  isOpen: boolean;
  isLoading: boolean;
  isFocused: boolean;
  cursorPosition: number;
  error: string | null;
  categories: string[];
  lastQuery: string;
  debounceTimer: NodeJS.Timeout | null;
}

export interface FuzzySearchResult<T = AutocompleteValue> {
  suggestion: AutocompleteSuggestion<T>;
  score: number;
  matches: Array<{ start: number; end: number }>;
}

// ============================================================================
// Fuzzy Search Algorithm
// ============================================================================

class FuzzySearcher<T = AutocompleteValue> {
  private options: {
    caseSensitive: boolean;
    highlightMatches: boolean;
  };

  constructor(options: { caseSensitive: boolean; highlightMatches: boolean }) {
    this.options = options;
  }

  search(query: string, suggestions: AutocompleteSuggestion<T>[]): FuzzySearchResult<T>[] {
    if (!query.trim()) {
      return suggestions.map(suggestion => ({
        suggestion,
        score: 0,
        matches: []
      }));
    }

    const results: FuzzySearchResult<T>[] = [];
    const searchQuery = this.options.caseSensitive ? query : query.toLowerCase();

    for (const suggestion of suggestions) {
      const searchTarget = this.options.caseSensitive ? suggestion.label : suggestion.label.toLowerCase();
      const result = this.fuzzyMatch(searchQuery, searchTarget, suggestion);
      
      if (result.score > 0) {
        results.push(result);
      }
    }

    // Sort by score (higher is better)
    return results.sort((a, b) => b.score - a.score);
  }

  private fuzzyMatch(query: string, target: string, suggestion: AutocompleteSuggestion<T>): FuzzySearchResult<T> {
    const matches: Array<{ start: number; end: number }> = [];
    let score = 0;
    let queryIndex = 0;
    let targetIndex = 0;

    // Exact match bonus
    if (target.includes(query)) {
      score += 100;
      const startIndex = target.indexOf(query);
      matches.push({ start: startIndex, end: startIndex + query.length });
    }

    // Fuzzy matching
    while (queryIndex < query.length && targetIndex < target.length) {
      if (query[queryIndex] === target[targetIndex]) {
        // Character match
        score += 10;
        
        // Consecutive character bonus
        if (queryIndex > 0 && query[queryIndex - 1] === target[targetIndex - 1]) {
          score += 5;
        }

        // Start of word bonus
        if (targetIndex === 0 || /\s/.test(target[targetIndex - 1] || '')) {
          score += 15;
        }

        queryIndex++;
      }
      targetIndex++;
    }

    // Penalty for incomplete matches
    if (queryIndex < query.length) {
      score = Math.max(0, score - (query.length - queryIndex) * 5);
    }

    // Length penalty (shorter targets are preferred)
    score = Math.max(0, score - (target.length - query.length) * 0.1);

    return { suggestion, score, matches };
  }

  highlightMatches(text: string, matches: Array<{ start: number; end: number }>, style: StyleBuilder): string {
    if (!this.options.highlightMatches || matches.length === 0) {
      return text;
    }

    let result = '';
    let lastIndex = 0;

    for (const match of matches.sort((a, b) => a.start - b.start)) {
      // Add text before match
      result += text.slice(lastIndex, match.start);
      
      // Add highlighted match
      const matchedText = text.slice(match.start, match.end);
      result += style.yellow().bold().text(matchedText);
      
      lastIndex = match.end;
    }

    // Add remaining text
    result += text.slice(lastIndex);

    return result;
  }
}

// ============================================================================
// Autocomplete Component
// ============================================================================

export class Autocomplete<T extends AutocompleteValue = string> extends BaseComponent<AutocompleteState<T>> {
  private options: Required<AutocompleteOptions<T>>;
  private style: StyleBuilder;
  private fuzzySearcher: FuzzySearcher<T>;

  constructor(options: AutocompleteOptions<T> = {}) {
    const initialState: AutocompleteState<T> = {
      query: options.value || '',
      value: options.value || '',
      suggestions: options.suggestions || [],
      filteredSuggestions: [],
      selectedIndex: -1,
      isOpen: false,
      isLoading: false,
      isFocused: false,
      cursorPosition: options.value?.length || 0,
      error: null,
      categories: [],
      lastQuery: '',
      debounceTimer: null
    };

    super({ initialState });

    // Set default options
    this.options = {
      placeholder: options.placeholder || 'Type to search...',
      suggestions: options.suggestions || [],
      value: options.value ?? '',
      maxSuggestions: options.maxSuggestions || 10,
      minQueryLength: options.minQueryLength || 1,
      maxDropdownHeight: options.maxDropdownHeight || 8,
      fuzzySearch: options.fuzzySearch ?? true,
      caseSensitive: options.caseSensitive ?? false,
      highlightMatches: options.highlightMatches ?? true,
      allowCustom: options.allowCustom ?? true,
      selectOnTab: options.selectOnTab ?? true,
      selectOnEnter: options.selectOnEnter ?? true,
      clearOnSelect: options.clearOnSelect ?? false,
      closeOnBlur: options.closeOnBlur ?? true,
      showCategories: options.showCategories ?? true,
      showDescriptions: options.showDescriptions ?? true,
      showIcons: options.showIcons ?? true,
      debounceMs: options.debounceMs || 300,
      loadingText: options.loadingText || 'Loading...',
      noResultsText: options.noResultsText || 'No results found',
      categoryHeader: options.categoryHeader ?? ((cat: string) => `── ${cat} ──`),
      suggestionRenderer: options.suggestionRenderer ?? ((suggestion: AutocompleteSuggestion<T>) => suggestion.label),
      onQueryChange: options.onQueryChange ?? (() => {}),
      onSuggestionSelect: options.onSuggestionSelect ?? (() => {}),
      onLoadSuggestions: options.onLoadSuggestions ?? (() => Promise.resolve([])),
      onValidate: options.onValidate ?? (() => null),
      onCustomValue: options.onCustomValue ?? (() => null)
    };

    this.style = new StyleBuilder();
    this.fuzzySearcher = new FuzzySearcher({
      caseSensitive: this.options.caseSensitive,
      highlightMatches: this.options.highlightMatches
    });

    // Initialize suggestions
    this.updateSuggestions();
  }

  // ============================================================================
  // Initialization
  // ============================================================================

  private updateSuggestions(): void {
    const { query } = this.state;

    if (query.length < this.options.minQueryLength) {
      this.setState({
        filteredSuggestions: [],
        categories: [],
        isOpen: false
      });
      return;
    }

    let filtered: AutocompleteSuggestion<T>[];

    if (this.options.fuzzySearch) {
      const results = this.fuzzySearcher.search(query, this.state.suggestions);
      filtered = results
        .slice(0, this.options.maxSuggestions)
        .map(result => result.suggestion);
    } else {
      // Simple substring search
      const searchQuery = this.options.caseSensitive ? query : query.toLowerCase();
      filtered = this.state.suggestions
        .filter(suggestion => {
          const target = this.options.caseSensitive ? suggestion.label : suggestion.label.toLowerCase();
          return target.includes(searchQuery);
        })
        .slice(0, this.options.maxSuggestions);
    }

    // Extract categories
    const categories = [...new Set(filtered.map(s => s.category).filter((c): c is string => Boolean(c)))].sort();

    this.setState({
      filteredSuggestions: filtered,
      categories,
      isOpen: filtered.length > 0 || this.state.isLoading,
      selectedIndex: Math.min(this.state.selectedIndex, filtered.length - 1)
    });
  }

  private async loadSuggestions(query: string): Promise<void> {
    if (!this.options.onLoadSuggestions || query.length < this.options.minQueryLength) {
      return;
    }

    this.setState({ isLoading: true });

    try {
      const suggestions = await this.options.onLoadSuggestions(query);
      
      // Only update if this is still the current query
      if (query === this.state.query) {
        this.setState({ 
          suggestions: [...this.state.suggestions, ...suggestions],
          isLoading: false
        });
        this.updateSuggestions();
      }
    } catch (error) {
      this.setState({ 
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load suggestions'
      });
    }
  }

  private debouncedLoadSuggestions(query: string): void {
    if (this.state.debounceTimer) {
      clearTimeout(this.state.debounceTimer);
    }

    const timer = setTimeout(() => {
      this.loadSuggestions(query);
    }, this.options.debounceMs);

    this.setState({ debounceTimer: timer });
  }

  // ============================================================================
  // Rendering
  // ============================================================================

  render(): Output {
    const lines: string[] = [];

    // Render input field
    lines.push(this.renderInputField());

    // Render dropdown
    if (this.state.isOpen) {
      lines.push(...this.renderDropdown());
    }

    // Render error
    if (this.state.error) {
      lines.push(this.style.red().text(`⚠ ${this.state.error}`));
    }

    return {
      lines,
      cursor: this.getCursorPosition()
    };
  }

  private renderInputField(): string {
    const { query, isFocused, isLoading } = this.state;
    let line = '';

    // Input prefix
    if (isLoading) {
      line += this.style.yellow().text('⏳ ');
    } else {
      line += '🔍 ';
    }

    // Input content
    let input = query || this.options.placeholder;
    
    if (!query && this.options.placeholder) {
      input = this.style.dim().text(this.options.placeholder);
    } else if (isFocused) {
      // Show cursor in input
      const beforeCursor = query.slice(0, this.state.cursorPosition);
      const atCursor = query[this.state.cursorPosition] || ' ';
      const afterCursor = query.slice(this.state.cursorPosition + 1);
      
      input = beforeCursor + 
              this.style.inverse().text(atCursor) + 
              afterCursor;
    }

    line += input;

    // Border
    if (isFocused) {
      line = this.style.cyan().text(line);
    } else if (this.state.error) {
      line = this.style.red().text(line);
    }

    return line;
  }

  private renderDropdown(): string[] {
    const lines: string[] = [];
    const { filteredSuggestions, selectedIndex, categories, isLoading } = this.state;

    // Loading state
    if (isLoading && filteredSuggestions.length === 0) {
      lines.push('┌─────────────────┐');
      lines.push(`│ ${this.options.loadingText.padEnd(15)} │`);
      lines.push('└─────────────────┘');
      return lines;
    }

    // No results
    if (filteredSuggestions.length === 0 && !isLoading) {
      lines.push('┌─────────────────┐');
      lines.push(`│ ${this.options.noResultsText.padEnd(15)} │`);
      lines.push('└─────────────────┘');
      return lines;
    }

    // Dropdown header
    lines.push('┌─────────────────┐');

    let currentIndex = 0;
    let linesRendered = 0;
    const maxLines = this.options.maxDropdownHeight;

    // Render suggestions grouped by category
    if (this.options.showCategories && categories.length > 1) {
      for (const category of categories) {
        // Category header
        if (linesRendered < maxLines) {
          const header = this.options.categoryHeader(category);
          lines.push(`│ ${this.style.bold().text(header.padEnd(15))} │`);
          linesRendered++;
        }

        // Category suggestions
        const categorySuggestions = filteredSuggestions.filter(s => s.category === category);
        for (const suggestion of categorySuggestions) {
          if (linesRendered >= maxLines) break;
          
          const line = this.renderSuggestion(suggestion, currentIndex === selectedIndex);
          if (line) {
            lines.push(line);
          }
          currentIndex++;
          linesRendered++;
        }
      }

      // Uncategorized suggestions
      const uncategorized = filteredSuggestions.filter(s => !s.category);
      for (const suggestion of uncategorized) {
        if (linesRendered >= maxLines) break;
        
        const line = this.renderSuggestion(suggestion, currentIndex === selectedIndex);
        lines.push(line);
        currentIndex++;
        linesRendered++;
      }
    } else {
      // Simple list without categories
      for (let i = 0; i < filteredSuggestions.length && linesRendered < maxLines; i++) {
        const suggestion = filteredSuggestions[i];
        if (!suggestion) continue;
        const line = this.renderSuggestion(suggestion, i === selectedIndex);
        lines.push(line);
        linesRendered++;
      }
    }

    // Show scroll indicator if there are more items
    if (filteredSuggestions.length > maxLines) {
      const remaining = filteredSuggestions.length - maxLines;
      lines.push(`│ ${this.style.dim().text(`... ${remaining} more`.padEnd(15))} │`);
    }

    // Dropdown footer
    lines.push('└─────────────────┘');

    return lines;
  }

  private renderSuggestion(suggestion: AutocompleteSuggestion<T>, isSelected: boolean): string {
    // Use custom renderer if provided
    if (this.options.suggestionRenderer) {
      const rendered = this.options.suggestionRenderer(suggestion, isSelected, this.state.query);
      return `│ ${rendered.padEnd(15)} │`;
    }

    let content = '';

    // Icon
    if (this.options.showIcons && suggestion.icon) {
      content += `${suggestion.icon} `;
    }

    // Label (with highlighting)
    if (this.options.fuzzySearch && this.options.highlightMatches) {
      const results = this.fuzzySearcher.search(this.state.query, [suggestion]);
      const result = results[0];
      if (result && result.matches.length > 0) {
        content += this.fuzzySearcher.highlightMatches(suggestion.label, result.matches, this.style);
      } else {
        content += suggestion.label;
      }
    } else {
      content += suggestion.label;
    }

    // Description
    if (this.options.showDescriptions && suggestion.description) {
      content += this.style.dim().text(` - ${suggestion.description}`);
    }

    // Truncate if too long
    const maxWidth = 15;
    if (visualLength(stripAnsi(content)) > maxWidth) {
      content = content.substring(0, maxWidth - 1) + '…';
    }

    // Apply selection styling
    if (isSelected) {
      content = this.style.cyan().inverse().text(content.padEnd(maxWidth));
    } else if (suggestion.disabled) {
      content = this.style.dim().text(content.padEnd(maxWidth));
    } else {
      content = content.padEnd(maxWidth);
    }

    return `│ ${content} │`;
  }

  private getCursorPosition(): { x: number; y: number } | undefined {
    if (!this.state.isFocused) {
      return undefined;
    }

    const x = 2 + this.state.cursorPosition; // Account for search icon
    return { x, y: 0 };
  }

  // ============================================================================
  // Event Handling
  // ============================================================================

  override handleKeypress(key: Key): boolean {
    let handled = false;

    switch (key.name) {
      case 'up':
        if (this.state.isOpen) {
          this.navigateDropdown(-1);
          handled = true;
        }
        break;

      case 'down':
        if (this.state.isOpen) {
          this.navigateDropdown(1);
          handled = true;
        } else {
          this.openDropdown();
          handled = true;
        }
        break;

      case 'tab':
        if (this.options.selectOnTab && this.state.isOpen && this.state.selectedIndex >= 0) {
          this.selectSuggestion();
          handled = true;
        }
        break;

      case 'enter':
      case 'return':
        if (this.options.selectOnEnter && this.state.isOpen && this.state.selectedIndex >= 0) {
          this.selectSuggestion();
          handled = true;
        }
        break;

      case 'escape':
        this.closeDropdown();
        handled = true;
        break;

      case 'left':
        this.moveCursor(-1);
        handled = true;
        break;

      case 'right':
        this.moveCursor(1);
        handled = true;
        break;

      case 'home':
        this.moveCursor(-this.state.cursorPosition);
        handled = true;
        break;

      case 'end':
        this.moveCursor(this.state.query.length - this.state.cursorPosition);
        handled = true;
        break;

      case 'backspace':
        this.handleBackspace();
        handled = true;
        break;

      case 'delete':
        this.handleDelete();
        handled = true;
        break;

      default:
        // Handle text input
        if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          this.handleTextInput(key.sequence);
          handled = true;
        }
    }

    if (!handled) {
      handled = super.handleKeypress(key);
    }

    return handled;
  }

  private navigateDropdown(direction: number): void {
    const { filteredSuggestions, selectedIndex } = this.state;
    
    if (filteredSuggestions.length === 0) return;

    let newIndex = selectedIndex + direction;
    
    // Wrap around
    if (newIndex < 0) {
      newIndex = filteredSuggestions.length - 1;
    } else if (newIndex >= filteredSuggestions.length) {
      newIndex = 0;
    }

    this.setState({ selectedIndex: newIndex });
  }

  private selectSuggestion(): void {
    const { filteredSuggestions, selectedIndex } = this.state;
    const suggestion = filteredSuggestions[selectedIndex];
    
    if (!suggestion || suggestion.disabled) return;

    // Update value
    const newValue = suggestion.label;
    this.setState({
      query: this.options.clearOnSelect ? '' : newValue,
      value: newValue,
      cursorPosition: this.options.clearOnSelect ? 0 : newValue.length,
      isOpen: false,
      selectedIndex: -1,
      error: null
    });

    // Emit selection event
    if (this.options.onSuggestionSelect) {
      this.options.onSuggestionSelect(suggestion);
    }

    // Validate
    this.validateValue(newValue);
  }

  private handleTextInput(char: string): void {
    const { query, cursorPosition } = this.state;
    const newQuery = query.slice(0, cursorPosition) + char + query.slice(cursorPosition);
    
    this.setState({
      query: newQuery,
      cursorPosition: cursorPosition + 1,
      error: null
    });

    this.handleQueryChange(newQuery);
  }

  private handleBackspace(): void {
    const { query, cursorPosition } = this.state;
    
    if (cursorPosition > 0) {
      const newQuery = query.slice(0, cursorPosition - 1) + query.slice(cursorPosition);
      this.setState({
        query: newQuery,
        cursorPosition: cursorPosition - 1,
        error: null
      });

      this.handleQueryChange(newQuery);
    }
  }

  private handleDelete(): void {
    const { query, cursorPosition } = this.state;
    
    if (cursorPosition < query.length) {
      const newQuery = query.slice(0, cursorPosition) + query.slice(cursorPosition + 1);
      this.setState({
        query: newQuery,
        error: null
      });

      this.handleQueryChange(newQuery);
    }
  }

  private moveCursor(delta: number): void {
    const newPosition = Math.max(0, Math.min(this.state.query.length, this.state.cursorPosition + delta));
    this.setState({ cursorPosition: newPosition });
  }

  private handleQueryChange(query: string): void {
    this.updateSuggestions();

    // Emit query change event
    if (this.options.onQueryChange) {
      this.options.onQueryChange(query);
    }

    // Load suggestions if needed
    if (query !== this.state.lastQuery) {
      this.setState({ lastQuery: query });
      this.debouncedLoadSuggestions(query);
    }
  }

  private openDropdown(): void {
    if (!this.state.isOpen) {
      this.setState({ isOpen: true });
      this.updateSuggestions();
    }
  }

  private closeDropdown(): void {
    this.setState({ 
      isOpen: false,
      selectedIndex: -1
    });
  }

  // ============================================================================
  // Focus Management
  // ============================================================================

  override focus(): void {
    this.setState({ isFocused: true });
    this.openDropdown();
  }

  override blur(): void {
    if (this.options.closeOnBlur) {
      this.setState({ 
        isFocused: false,
        isOpen: false,
        selectedIndex: -1
      });
    } else {
      this.setState({ isFocused: false });
    }
  }

  // ============================================================================
  // Validation
  // ============================================================================

  private validateValue(value: string): void {
    const error = this.options.onValidate(value);
    this.setState({ error });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Get current value
   */
  getValue(): string {
    return this.state.value;
  }

  /**
   * Set value
   */
  setValue(value: string): void {
    this.setState({
      query: value,
      value,
      cursorPosition: value.length,
      error: null
    });
    
    this.handleQueryChange(value);
    this.validateValue(value);
  }

  /**
   * Get current query
   */
  getQuery(): string {
    return this.state.query;
  }

  /**
   * Set suggestions
   */
  setSuggestions(suggestions: AutocompleteSuggestion<T>[]): void {
    this.setState({ suggestions: [...suggestions] });
    this.updateSuggestions();
  }

  /**
   * Add suggestions
   */
  addSuggestions(suggestions: AutocompleteSuggestion<T>[]): void {
    this.setState({ 
      suggestions: [...this.state.suggestions, ...suggestions]
    });
    this.updateSuggestions();
  }

  /**
   * Clear suggestions
   */
  clearSuggestions(): void {
    this.setState({ 
      suggestions: [],
      filteredSuggestions: [],
      isOpen: false
    });
  }

  /**
   * Get selected suggestion
   */
  getSelectedSuggestion(): AutocompleteSuggestion<T> | null {
    const { filteredSuggestions, selectedIndex } = this.state;
    return filteredSuggestions[selectedIndex] || null;
  }

  /**
   * Check if dropdown is open
   */
  isOpen(): boolean {
    return this.state.isOpen;
  }

  /**
   * Open dropdown
   */
  open(): void {
    this.openDropdown();
  }

  /**
   * Close dropdown
   */
  close(): void {
    this.closeDropdown();
  }

  /**
   * Clear value and query
   */
  clear(): void {
    this.setState({
      query: '',
      value: '',
      cursorPosition: 0,
      error: null,
      isOpen: false,
      selectedIndex: -1
    });
  }

  /**
   * Validate current value
   */
  validate(): string | null {
    const error = this.options.onValidate(this.state.value);
    this.setState({ error });
    return error;
  }

  // ============================================================================
  // Cleanup
  // ============================================================================

  override async unmount(): Promise<void> {
    if (this.state.debounceTimer) {
      clearTimeout(this.state.debounceTimer);
    }
    
    await super.unmount();
  }
}