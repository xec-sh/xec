// Columns component for split pane layouts

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface ColumnPane {
  content: string | string[] | (() => string | string[]);
  size?: string | number; // percentage (e.g., '30%') or fixed width
  minWidth?: number;
  maxWidth?: number;
  border?: boolean;
  padding?: number;
  title?: string;
  scrollable?: boolean;
}

export interface ColumnsOptions {
  panes: ColumnPane[];
  border?: boolean;
  gap?: number;
  resizable?: boolean;
  focusedPane?: number;
  height?: number;
}

export class ColumnsPrompt extends Prompt<void, ColumnsOptions> {
  private paneSizes: number[] = [];
  private isFocused = false;

  constructor(config: PromptConfig<void, ColumnsOptions> & ColumnsOptions) {
    super(config);
    
    // Initialize state with column-specific properties
    this.state.setState({
      ...this.state.getState(),
      focusedPaneIndex: config.focusedPane || 0,
      scrollOffsets: new Array(config.panes.length).fill(0),
      isResizing: false
    });
    
    this.calculatePaneSizes();
  }

  override render(): string {
    const lines: string[] = [];
    const context = this.getRenderContext();
    const { panes, border = true, gap = 1, height } = this.config;
    const termWidth = context.width;
    const termHeight = height || Math.min(context.height - 4, 20);
    
    // Prepare content for each pane
    const paneContents = panes.map((pane, index) => {
      const content = typeof pane.content === 'function' ? pane.content() : pane.content;
      const paneLines = Array.isArray(content) ? content : content.split('\n');
      
      // Apply scroll offset if scrollable
      const offset = this.state.getState().scrollOffsets[index];
      if (pane.scrollable && offset && offset > 0) {
        return paneLines.slice(offset);
      }
      
      return paneLines;
    });
    
    // Render each row
    for (let row = 0; row < termHeight; row++) {
      const rowParts: string[] = [];
      
      panes.forEach((pane, paneIndex) => {
        const width = this.paneSizes[paneIndex] || 10;
        const padding = pane.padding || 1;
        const paddingStr = ' '.repeat(padding);
        const contentWidth = width - (padding * 2) - (border ? 2 : 0);
        
        // Get content for this row
        const paneContent = paneContents[paneIndex];
        let content = '';
        
        if (row === 0 && pane.title) {
          // Title row
          content = this.centerText(pane.title, contentWidth);
          if (paneIndex === this.state.getState().focusedPaneIndex) {
            content = this.theme.formatters.primary(content);
          } else {
            content = this.theme.formatters.bold(content);
          }
        } else {
          const contentRow = pane.title ? row - 1 : row;
          if (paneContent && paneContent[contentRow]) {
            content = this.truncateText(paneContent[contentRow], contentWidth);
          }
        }
        
        // Build pane row
        let paneRow = paddingStr + content.padEnd(contentWidth) + paddingStr;
        
        if (border) {
          const borderChar = paneIndex === this.state.getState().focusedPaneIndex && this.isFocused ? '┃' : '│';
          paneRow = borderChar + paneRow + borderChar;
        }
        
        rowParts.push(paneRow);
      });
      
      // Join panes with gap
      const gapStr = ' '.repeat(gap);
      lines.push(rowParts.join(gapStr));
    }
    
    // Add borders
    if (border) {
      const borderLine = this.renderBorderLine(this.paneSizes, gap);
      lines.unshift(borderLine.top);
      lines.push(borderLine.bottom);
    }
    
    // Status line
    if (this.config.resizable) {
      lines.push('');
      lines.push(this.renderStatusLine());
    }
    
    return lines.join('\n');
  }

  override async handleInput(key: Key): Promise<void> {
    const { panes, resizable } = this.config;
    
    // Focus navigation
    const state = this.state.getState();
    if (key.name === 'tab' || (key.name === 'right' && !state.isResizing)) {
      this.state.setState({
        ...state,
        focusedPaneIndex: (state.focusedPaneIndex + 1) % panes.length
      });
      return;
    }
    
    if (key.shift && key.name === 'tab' || (key.name === 'left' && !state.isResizing)) {
      this.state.setState({
        ...state,
        focusedPaneIndex: (state.focusedPaneIndex - 1 + panes.length) % panes.length
      });
      return;
    }
    
    // Scrolling in focused pane
    const focusedPane = panes[state.focusedPaneIndex];
    if (focusedPane && focusedPane.scrollable) {
      const content = typeof focusedPane.content === 'function' ? focusedPane.content() : focusedPane.content;
      const contentLines = Array.isArray(content) ? content : content.split('\n');
      const maxScroll = Math.max(0, contentLines.length - 10); // Assuming 10 visible lines
      
      if (key.name === 'up') {
        const currentOffset = state.scrollOffsets[state.focusedPaneIndex] || 0;
        const newScrollOffsets = [...state.scrollOffsets];
        newScrollOffsets[state.focusedPaneIndex] = Math.max(0, currentOffset - 1);
        this.state.setState({ ...state, scrollOffsets: newScrollOffsets });
        return;
      }
      
      if (key.name === 'down') {
        const currentOffset = state.scrollOffsets[state.focusedPaneIndex] || 0;
        const newScrollOffsets = [...state.scrollOffsets];
        newScrollOffsets[state.focusedPaneIndex] = Math.min(maxScroll, currentOffset + 1);
        this.state.setState({ ...state, scrollOffsets: newScrollOffsets });
        return;
      }
      
      if (key.name === 'pageup') {
        const currentOffset = state.scrollOffsets[state.focusedPaneIndex] || 0;
        const newScrollOffsets = [...state.scrollOffsets];
        newScrollOffsets[state.focusedPaneIndex] = Math.max(0, currentOffset - 10);
        this.state.setState({ ...state, scrollOffsets: newScrollOffsets });
        return;
      }
      
      if (key.name === 'pagedown') {
        const currentOffset = state.scrollOffsets[state.focusedPaneIndex] || 0;
        const newScrollOffsets = [...state.scrollOffsets];
        newScrollOffsets[state.focusedPaneIndex] = Math.min(maxScroll, currentOffset + 10);
        this.state.setState({ ...state, scrollOffsets: newScrollOffsets });
        return;
      }
    }
    
    // Resizing
    if (resizable) {
      if (key.ctrl && key.name === 'r') {
        this.state.setState({ ...state, isResizing: !state.isResizing });
        return;
      }
      
      if (state.isResizing) {
        if (key.name === 'left' && state.focusedPaneIndex > 0) {
          this.adjustPaneSize(state.focusedPaneIndex, -2);
          return;
        }
        
        if (key.name === 'right' && state.focusedPaneIndex < panes.length - 1) {
          this.adjustPaneSize(state.focusedPaneIndex, 2);
          return;
        }
      }
    }
    
    // Exit
    if (key.name === 'return' || key.name === 'q') {
      await this.submit();
    }
  }

  private calculatePaneSizes(): void {
    const context = this.getRenderContext();
    const { panes, gap = 1 } = this.config;
    const termWidth = context.width;
    const totalGap = gap * (panes.length - 1);
    const availableWidth = termWidth - totalGap;
    
    // Calculate sizes based on pane configurations
    let remainingWidth = availableWidth;
    let flexPanes = 0;
    
    this.paneSizes = panes.map(pane => {
      if (pane.size) {
        if (typeof pane.size === 'string' && pane.size.endsWith('%')) {
          const percentage = parseInt(pane.size) / 100;
          const width = Math.floor(availableWidth * percentage);
          remainingWidth -= width;
          return width;
        } else if (typeof pane.size === 'number') {
          remainingWidth -= pane.size;
          return pane.size;
        }
      }
      flexPanes++;
      return 0;
    });
    
    // Distribute remaining width to flex panes
    if (flexPanes > 0) {
      const flexWidth = Math.floor(remainingWidth / flexPanes);
      this.paneSizes = this.paneSizes.map((size, index) => {
        if (size === 0) {
          return flexWidth;
        }
        return size;
      });
    }
    
    // Apply min/max constraints
    this.paneSizes = this.paneSizes.map((size, index) => {
      const pane = panes[index];
      if (!pane) return size;
      
      if (pane.minWidth && size < pane.minWidth) {
        return pane.minWidth;
      }
      if (pane.maxWidth && size > pane.maxWidth) {
        return pane.maxWidth;
      }
      return size;
    });
  }

  private adjustPaneSize(paneIndex: number, delta: number): void {
    const { panes } = this.config;
    
    // Adjust current pane
    const currentPane = panes[paneIndex];
    if (!currentPane) return;
    
    const currentSize = this.paneSizes[paneIndex] || 0;
    const newSize = currentSize + delta;
    
    // Check constraints
    if (currentPane.minWidth && newSize < currentPane.minWidth) return;
    if (currentPane.maxWidth && newSize > currentPane.maxWidth) return;
    
    // Adjust next pane
    if (paneIndex < panes.length - 1) {
      const nextPane = panes[paneIndex + 1];
      if (!nextPane) return;
      
      const nextCurrentSize = this.paneSizes[paneIndex + 1] || 0;
      const nextNewSize = nextCurrentSize - delta;
      
      if (nextPane.minWidth && nextNewSize < nextPane.minWidth) return;
      if (nextPane.maxWidth && nextNewSize > nextPane.maxWidth) return;
      
      this.paneSizes[paneIndex] = newSize;
      this.paneSizes[paneIndex + 1] = nextNewSize;
      
      // Trigger re-render by updating state
      this.state.setState({ ...this.state.getState() });
    }
  }

  private centerText(text: string, width: number): string {
    const padding = Math.max(0, width - text.length);
    const leftPad = Math.floor(padding / 2);
    const rightPad = padding - leftPad;
    return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
  }

  private truncateText(text: string, width: number): string {
    if (text.length <= width) return text;
    return text.substring(0, width - 3) + '...';
  }

  private renderBorderLine(sizes: number[], gap: number): { top: string; bottom: string } {
    if (sizes.length === 1) {
      // Single pane
      const width = (sizes[0] || 0) + 2;
      return {
        top: '┌' + '─'.repeat(width) + '┐',
        bottom: '└' + '─'.repeat(width) + '┘'
      };
    }
    
    // Multiple panes
    const parts = sizes.map(size => '─'.repeat(size + 2)); // +2 for borders
    const gapStr = ' '.repeat(gap);
    
    return {
      top: '┌' + parts.join(gapStr + '┬' + gapStr) + '┐',
      bottom: '└' + parts.join(gapStr + '┴' + gapStr) + '┘'
    };
  }

  private renderStatusLine(): string {
    const helps: string[] = [];
    const state = this.state.getState();
    
    helps.push(`${this.theme.formatters.muted('Tab')} Switch pane`);
    
    if (this.config.resizable) {
      if (state.isResizing) {
        helps.push(this.theme.formatters.warning('Resizing mode') + ' - ' + this.theme.formatters.muted('←/→') + ' Resize');
        helps.push(`${this.theme.formatters.muted('Ctrl+R')} Exit resize`);
      } else {
        helps.push(`${this.theme.formatters.muted('Ctrl+R')} Resize`);
      }
    }
    
    helps.push(`${this.theme.formatters.muted('Q')} Exit`);
    
    return this.theme.formatters.muted(helps.join('  ·  '));
  }

  protected override renderFinal(): string {
    return ''; // Columns don't show a final message
  }
}

// Helper function to create columns
export function columns(options: ColumnsOptions): ColumnsPrompt {
  return new ColumnsPrompt({
    message: 'Columns',
    ...options
  });
}