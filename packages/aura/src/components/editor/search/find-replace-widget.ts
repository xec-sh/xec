/**
 * Find/Replace Widget - search and replace functionality for Phase 2
 */

import { signal, computed } from 'vibrancy';
import { Component, type ComponentProps } from '../../../component.js';
import { BoxComponent } from '../../box.js';
import { TextComponent } from '../../text.js';
import { InputComponent } from '../../input.js';
import { RGBA } from '../../../lib/colors.js';
import type { OptimizedBuffer } from '../../../renderer/buffer.js';
import type { DocumentManager } from '../document/document-manager.js';
import type { Position, Range } from '../types.js';
import type { ParsedKey } from '../../../lib/parse.keypress.js';

export interface SearchMatch {
  range: Range;
  text: string;
  lineNumber: number;
  lineText: string;
}

export interface SearchOptions {
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  wrapAround?: boolean;
}

export interface FindReplaceWidgetOptions extends ComponentProps {
  onClose?: () => void;
  onFind?: (matches: SearchMatch[]) => void;
  onReplace?: (match: SearchMatch, replacement: string) => void;
  onReplaceAll?: (matches: SearchMatch[], replacement: string) => void;
}

export class FindReplaceWidget extends Component {
  private document: DocumentManager;
  
  // UI Components
  private container!: BoxComponent;
  private findInput!: InputComponent;
  private replaceInput!: InputComponent;
  private statusText!: TextComponent;
  
  // Search state
  private searchQuery = signal<string>('');
  private replaceText = signal<string>('');
  private matches = signal<SearchMatch[]>([]);
  private currentMatchIndex = signal<number>(-1);
  private searchOptions = signal<SearchOptions>({
    caseSensitive: false,
    wholeWord: false,
    regex: false,
    wrapAround: true
  });
  
  // Computed values
  private currentMatch = computed(() => {
    const index = this.currentMatchIndex();
    const allMatches = this.matches();
    return index >= 0 && index < allMatches.length ? allMatches[index] : null;
  });
  
  private statusMessage = computed(() => {
    const query = this.searchQuery();
    if (!query) return 'Type to search';
    
    const allMatches = this.matches();
    const currentIndex = this.currentMatchIndex();
    
    if (allMatches.length === 0) {
      return 'No results';
    }
    
    return `${currentIndex + 1} of ${allMatches.length}`;
  });
  
  // Callbacks
  private onClose?: () => void;
  private onFind?: (matches: SearchMatch[]) => void;
  private onReplace?: (match: SearchMatch, replacement: string) => void;
  private onReplaceAll?: (matches: SearchMatch[], replacement: string) => void;
  
  constructor(
    id: string,
    document: DocumentManager,
    options: FindReplaceWidgetOptions = {}
  ) {
    super(id, options);
    
    this.document = document;
    this.onClose = options.onClose;
    this.onFind = options.onFind;
    this.onReplace = options.onReplace;
    this.onReplaceAll = options.onReplaceAll;
    
    // Set default dimensions
    this.width = options.width ?? 50;
    this.height = options.height ?? 6;
    this.visible = options.visible ?? false;
    this.zIndex = 1000; // Above editor content
    
    // Create UI
    this.createUI();
  }
  
  /**
   * Create the widget UI
   */
  private createUI(): void {
    // Main container
    this.container = new BoxComponent('find-replace-container', {
      width: this.width,
      height: this.height,
      border: true,
      borderStyle: 'single',
      title: 'Find & Replace',
      borderColor: RGBA.fromValues(0.5, 0.5, 1, 1),
      backgroundColor: RGBA.fromValues(0.1, 0.1, 0.15, 0.95)
    });
    
    // Find input
    this.findInput = new InputComponent('find-input', {
      width: this.width - 10,
      height: 1,
      placeholder: 'Find...',
      value: ''
    });
    
    // Listen for input changes
    this.findInput.on('input', (value: string) => {
      this.searchQuery.set(value);
      this.performSearch();
    });
    
    this.findInput.on('enter', () => {
      this.findNext();
    });
    
    // Replace input
    this.replaceInput = new InputComponent('replace-input', {
      width: this.width - 10,
      height: 1,
      placeholder: 'Replace...',
      value: ''
    });
    
    // Listen for input changes
    this.replaceInput.on('input', (value: string) => {
      this.replaceText.set(value);
    });
    
    this.replaceInput.on('enter', () => {
      this.replaceNext();
    });
    
    // Status text
    this.statusText = new TextComponent('status-text', {
      content: this.statusMessage(),
      fg: RGBA.fromValues(0.7, 0.7, 0.7, 1)
    });
    
    // Labels
    const findLabel = new TextComponent('find-label', {
      content: 'Find:',
      fg: RGBA.fromValues(0.8, 0.8, 0.8, 1)
    });
    
    const replaceLabel = new TextComponent('replace-label', {
      content: 'Repl:',
      fg: RGBA.fromValues(0.8, 0.8, 0.8, 1)
    });
    
    // Options text
    const optionsText = new TextComponent('options-text', {
      content: '[Aa] Case [W] Word [.*] Regex',
      fg: RGBA.fromValues(0.5, 0.5, 0.5, 1)
    });
    
    // Shortcuts text
    const shortcutsText = new TextComponent('shortcuts-text', {
      content: 'F3 Next | Shift+F3 Prev | Esc Close',
      fg: RGBA.fromValues(0.5, 0.5, 0.5, 1)
    });
    
    // Add all components
    this.container.add(findLabel);
    this.container.add(replaceLabel);
    this.container.add(this.findInput);
    this.container.add(this.replaceInput);
    this.container.add(this.statusText);
    this.container.add(optionsText);
    this.container.add(shortcutsText);
    
    this.add(this.container);
    
    // Update status text when it changes
    this.statusMessage.subscribe((message) => {
      this.statusText.content = message;
      this.needsUpdate();
    });
  }
  
  /**
   * Show the widget
   */
  show(initialQuery?: string): void {
    this.visible = true;
    
    if (initialQuery) {
      this.searchQuery.set(initialQuery);
      // Update input value through its signal/prop system
      // TODO: Check if InputComponent has a method to set value
      this.performSearch();
    }
    
    // Focus find input
    this.findInput.focus();
    this.needsUpdate();
  }
  
  /**
   * Hide the widget
   */
  hide(): void {
    this.visible = false;
    this.clearHighlights();
    this.onClose?.();
    this.needsUpdate();
  }
  
  /**
   * Perform search
   */
  private performSearch(): void {
    const query = this.searchQuery();
    if (!query) {
      this.matches.set([]);
      this.currentMatchIndex.set(-1);
      return;
    }
    
    const options = this.searchOptions();
    const matches = this.findMatches(query, options);
    
    this.matches.set(matches);
    
    // Set current match to first one
    if (matches.length > 0) {
      this.currentMatchIndex.set(0);
    } else {
      this.currentMatchIndex.set(-1);
    }
    
    // Notify listeners
    this.onFind?.(matches);
  }
  
  /**
   * Find all matches in document
   */
  private findMatches(query: string, options: SearchOptions): SearchMatch[] {
    const matches: SearchMatch[] = [];
    const lineCount = this.document.getLineCount();
    
    // Create search pattern
    let pattern: RegExp;
    if (options.regex) {
      try {
        pattern = new RegExp(query, options.caseSensitive ? 'g' : 'gi');
      } catch {
        return []; // Invalid regex
      }
    } else {
      // Escape special regex characters
      const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const wordBoundary = options.wholeWord ? '\\b' : '';
      pattern = new RegExp(
        `${wordBoundary}${escaped}${wordBoundary}`,
        options.caseSensitive ? 'g' : 'gi'
      );
    }
    
    // Search each line
    for (let lineNumber = 0; lineNumber < lineCount; lineNumber++) {
      const lineText = this.document.getLine(lineNumber);
      let match: RegExpExecArray | null;
      
      while ((match = pattern.exec(lineText)) !== null) {
        matches.push({
          range: {
            start: { line: lineNumber, column: match.index },
            end: { line: lineNumber, column: match.index + match[0].length }
          },
          text: match[0],
          lineNumber,
          lineText
        });
      }
    }
    
    return matches;
  }
  
  /**
   * Find next match
   */
  findNext(): void {
    const allMatches = this.matches();
    if (allMatches.length === 0) return;
    
    const currentIndex = this.currentMatchIndex();
    const nextIndex = (currentIndex + 1) % allMatches.length;
    
    this.currentMatchIndex.set(nextIndex);
  }
  
  /**
   * Find previous match
   */
  findPrevious(): void {
    const allMatches = this.matches();
    if (allMatches.length === 0) return;
    
    const currentIndex = this.currentMatchIndex();
    const prevIndex = currentIndex <= 0 ? allMatches.length - 1 : currentIndex - 1;
    
    this.currentMatchIndex.set(prevIndex);
  }
  
  /**
   * Replace current match
   */
  replaceNext(): void {
    const match = this.currentMatch();
    if (!match) return;
    
    const replacement = this.replaceText();
    this.onReplace?.(match, replacement);
    
    // Re-search after replacement
    this.performSearch();
  }
  
  /**
   * Replace all matches
   */
  replaceAll(): void {
    const allMatches = this.matches();
    if (allMatches.length === 0) return;
    
    const replacement = this.replaceText();
    this.onReplaceAll?.(allMatches, replacement);
    
    // Re-search after replacement
    this.performSearch();
  }
  
  /**
   * Toggle search option
   */
  toggleOption(option: keyof SearchOptions): void {
    const options = this.searchOptions();
    options[option] = !options[option];
    this.searchOptions.set({ ...options });
    
    // Re-search with new options
    this.performSearch();
  }
  
  /**
   * Clear search highlights
   */
  private clearHighlights(): void {
    // This would clear any visual highlights in the editor
    // Implementation depends on how highlights are rendered
  }
  
  /**
   * Handle keyboard input
   */
  override handleKeyPress(keyOrParsed: string | ParsedKey): boolean {
    // Handle ParsedKey format
    let key: string;
    let modifiers: { ctrl?: boolean; shift?: boolean; alt?: boolean };
    
    if (typeof keyOrParsed === 'string') {
      key = keyOrParsed;
      modifiers = {};
    } else {
      key = keyOrParsed.name || keyOrParsed.sequence || '';
      modifiers = {
        ctrl: keyOrParsed.ctrl,
        shift: keyOrParsed.shift,
        alt: keyOrParsed.option
      };
    }
    // Escape closes the widget
    if (key === 'Escape') {
      this.hide();
      return true;
    }
    
    // F3 or Enter for next match
    if (key === 'F3' || (key === 'Enter' && !modifiers.shift)) {
      if (modifiers.shift) {
        this.findPrevious();
      } else {
        this.findNext();
      }
      return true;
    }
    
    // Ctrl+H toggles replace mode
    if (modifiers.ctrl && key === 'h') {
      // Toggle focus between find and replace
      if (this.findInput.focused) {
        this.replaceInput.focus();
      } else {
        this.findInput.focus();
      }
      return true;
    }
    
    // Ctrl+Alt+Enter for replace all
    if (modifiers.ctrl && modifiers.alt && key === 'Enter') {
      this.replaceAll();
      return true;
    }
    
    // Ctrl+Shift+L to toggle case sensitivity
    if (modifiers.ctrl && modifiers.shift && key === 'l') {
      this.toggleOption('caseSensitive');
      return true;
    }
    
    // Ctrl+Shift+W to toggle whole word
    if (modifiers.ctrl && modifiers.shift && key === 'w') {
      this.toggleOption('wholeWord');
      return true;
    }
    
    // Ctrl+Shift+R to toggle regex
    if (modifiers.ctrl && modifiers.shift && key === 'r') {
      this.toggleOption('regex');
      return true;
    }
    
    return false;
  }
  
  /**
   * Get current match for highlighting
   */
  getCurrentMatch(): SearchMatch | null {
    return this.currentMatch();
  }
  
  /**
   * Get all matches for highlighting
   */
  getAllMatches(): SearchMatch[] {
    return this.matches();
  }
  
  protected override renderSelf(buffer: OptimizedBuffer, deltaTime: number): void {
    // The container handles rendering
    // We just need to ensure visibility
    if (!this.visible) return;
    
    super.renderSelf(buffer, deltaTime);
  }
  
  /**
   * Get current search query (getter for private field)
   */
  getSearchQuery(): string {
    return this.searchQuery();
  }
  
  /**
   * Toggle widget visibility
   */
  toggle(): void {
    if (this.visible) {
      this.hide();
    } else {
      this.show();
    }
  }
}