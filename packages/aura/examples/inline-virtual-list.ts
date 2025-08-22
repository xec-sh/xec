#!/usr/bin/env npx tsx
/**
 * Virtual List with Inline Mode and Native Scroll Support
 * 
 * This example demonstrates how to render a virtual list that can extend
 * beyond the visible terminal area, tracking scroll position and rendering
 * only the visible portion.
 */

import { signal } from 'vibrancy';

// import { type Console, createConsole } from '../src/renderer/console/console.js';

const ESC = '\x1b[';
const CSI = ESC;

interface ViewportInfo {
  terminalRows: number;      // Total rows in terminal
  terminalCols: number;      // Total columns in terminal
  cursorRow: number;         // Current cursor row (0-based)
  scrollOffset: number;      // How many rows have scrolled out of view
  visibleStartRow: number;   // First visible row in viewport
  visibleEndRow: number;     // Last visible row in viewport
}

interface VirtualListOptions {
  items: string[];
  itemHeight?: number;       // Height of each item in rows (default: 1)
  maxHeight?: number;        // Maximum height of the list in rows
  renderItem?: (item: string, index: number, isSelected: boolean) => string;
}

class InlineVirtualList {
  // private console: Console;
  private startRow: number = 0;
  private startCol: number = 0;
  private viewportInfo: ViewportInfo;
  private selectedIndex = signal(0);
  private scrollTop = signal(0);
  private items: string[];
  private itemHeight: number;
  private maxHeight: number;
  private renderItem: (item: string, index: number, isSelected: boolean) => string;
  private isActive = true;

  constructor(options: VirtualListOptions) {
    // this.console = createConsole();
    this.items = options.items;
    this.itemHeight = options.itemHeight || 1;
    this.maxHeight = options.maxHeight || 10;
    this.renderItem = options.renderItem || this.defaultRenderItem;

    // Get terminal dimensions
    const rows = process.stdout.rows || 54;
    const cols = process.stdout.columns || 80;

    this.viewportInfo = {
      terminalRows: rows,
      terminalCols: cols,
      cursorRow: 0,
      scrollOffset: 0,
      visibleStartRow: 0,
      visibleEndRow: rows - 1
    };
  }

  private defaultRenderItem(item: string, index: number, isSelected: boolean): string {
    const prefix = isSelected ? '> ' : '  ';
    const color = isSelected ? '\x1b[36m' : '\x1b[37m';  // Cyan for selected, white for others
    const reset = '\x1b[0m';

    // Truncate if too long
    const maxWidth = this.viewportInfo.terminalCols - 4;
    const truncated = item.length > maxWidth
      ? item.substring(0, maxWidth - 3) + '...'
      : item.padEnd(maxWidth);

    return `${color}${prefix}${truncated}${reset}`;
  }

  private write(data: string): void {
    process.stdout.write(data);
  }

  private async getCursorPosition(): Promise<{ row: number; col: number }> {
    return new Promise((resolve) => {
      const handler = (data: Buffer): void => {
        const match = /\[(\d+);(\d+)R/.exec(data.toString());
        if (match && match[1] && match[2]) {
          const row = parseInt(match[1], 10) - 1;  // Convert to 0-based
          const col = parseInt(match[2], 10) - 1;
          process.stdin.off('data', handler);
          resolve({ row, col });
        }
      };

      process.stdin.on('data', handler);
      this.write(`${CSI}6n`);  // Request cursor position

      // Timeout fallback
      setTimeout(() => {
        process.stdin.off('data', handler);
        resolve({ row: 0, col: 0 });
      }, 100);
    });
  }

  private calculateViewport(): void {
    const totalItems = this.items.length;
    const totalHeight = Math.min(totalItems * this.itemHeight, this.maxHeight);
    const currentScroll = this.scrollTop();
    const selected = this.selectedIndex();

    // Calculate which items are visible
    const firstVisibleItem = Math.floor(currentScroll / this.itemHeight);
    const lastVisibleItem = Math.min(
      firstVisibleItem + Math.floor(this.maxHeight / this.itemHeight) - 1,
      totalItems - 1
    );

    // Auto-scroll if selection moves out of view
    if (selected < firstVisibleItem) {
      this.scrollTop.set(selected * this.itemHeight);
    } else if (selected > lastVisibleItem) {
      const newScroll = (selected - Math.floor(this.maxHeight / this.itemHeight) + 1) * this.itemHeight;
      this.scrollTop.set(Math.max(0, newScroll));
    }

    // Check if we're at the bottom of the terminal
    const remainingRows = this.viewportInfo.terminalRows - this.startRow;
    const rowsNeeded = totalHeight;

    if (rowsNeeded > remainingRows) {
      // We'll scroll the terminal
      this.viewportInfo.scrollOffset = rowsNeeded - remainingRows;
    } else {
      this.viewportInfo.scrollOffset = 0;
    }
  }

  private render(): void {
    if (!this.isActive) return;

    this.calculateViewport();

    const currentScroll = this.scrollTop();
    const selected = this.selectedIndex();
    const firstVisibleItem = Math.floor(currentScroll / this.itemHeight);
    const visibleItemCount = Math.floor(this.maxHeight / this.itemHeight);

    // Save cursor position
    this.write(`${CSI}s`);

    // Move to start position
    this.write(`${CSI}${this.startRow + 1};${this.startCol + 1}H`);

    // Clear the area first (optional, helps with clean redraws)
    for (let i = 0; i < this.maxHeight; i++) {
      this.write(`${CSI}2K`);  // Clear entire line
      if (i < this.maxHeight - 1) {
        this.write(`${CSI}1B`);  // Move down
        this.write(`${CSI}${this.startCol + 1}G`);  // Move to column
      }
    }

    // Move back to start
    this.write(`${CSI}${this.startRow + 1};${this.startCol + 1}H`);

    // Render visible items
    for (let i = 0; i < visibleItemCount; i++) {
      const itemIndex = firstVisibleItem + i;

      if (itemIndex < this.items.length) {
        const item = this.items[itemIndex];
        const isSelected = itemIndex === selected;
        const rendered = this.renderItem(item, itemIndex, isSelected);

        this.write(rendered);

        if (i < visibleItemCount - 1 && itemIndex < this.items.length - 1) {
          this.write(`${CSI}1B`);  // Move down
          this.write(`${CSI}${this.startCol + 1}G`);  // Move to column
        }
      } else {
        // Render empty line for unused space
        this.write(`${CSI}2K`);
        if (i < visibleItemCount - 1) {
          this.write(`${CSI}1B`);
          this.write(`${CSI}${this.startCol + 1}G`);
        }
      }
    }

    // Draw scroll indicators
    this.drawScrollBar();

    // Restore cursor position
    this.write(`${CSI}u`);
  }

  private drawScrollBar(): void {
    const totalItems = this.items.length;
    const visibleItems = Math.floor(this.maxHeight / this.itemHeight);

    if (totalItems <= visibleItems) return;  // No need for scrollbar

    const scrollBarCol = this.viewportInfo.terminalCols - 1;
    const scrollBarHeight = this.maxHeight;
    const currentScroll = this.scrollTop();
    const maxScroll = (totalItems - visibleItems) * this.itemHeight;

    const thumbSize = Math.max(1, Math.floor(scrollBarHeight * visibleItems / totalItems));
    const thumbPosition = Math.floor(scrollBarHeight * currentScroll / (maxScroll + this.itemHeight));

    // Save cursor
    this.write(`${CSI}s`);

    for (let i = 0; i < scrollBarHeight; i++) {
      this.write(`${CSI}${this.startRow + i + 1};${scrollBarCol}H`);

      if (i >= thumbPosition && i < thumbPosition + thumbSize) {
        this.write('\x1b[47m \x1b[0m');  // White background for thumb
      } else {
        this.write('\x1b[90m│\x1b[0m');  // Gray line for track
      }
    }

    // Restore cursor
    this.write(`${CSI}u`);
  }

  private moveSelection(delta: number): void {
    const current = this.selectedIndex();
    const newIndex = Math.max(0, Math.min(this.items.length - 1, current + delta));
    this.selectedIndex.set(newIndex);
    this.render();
  }

  private handleInput(key: string): void {
    switch (key) {
      case '\x1b[A':  // Up arrow
        this.moveSelection(-1);
        break;
      case '\x1b[B':  // Down arrow
        this.moveSelection(1);
        break;
      case '\x1b[5~':  // Page Up
        this.moveSelection(-Math.floor(this.maxHeight / this.itemHeight));
        break;
      case '\x1b[6~':  // Page Down
        this.moveSelection(Math.floor(this.maxHeight / this.itemHeight));
        break;
      case '\r':  // Enter
        this.onSelect(this.selectedIndex());
        break;
      case 'q':
      case '\x03':  // Ctrl+C
        this.cleanup();
        process.exit(0);
        break;
      default:
    }
  }

  private onSelect(index: number): void {
    const item = this.items[index];
    // Clear the list area
    this.write(`${CSI}${this.startRow + 1};1H`);
    for (let i = 0; i < this.maxHeight; i++) {
      this.write(`${CSI}2K`);
      if (i < this.maxHeight - 1) this.write(`${CSI}1B`);
    }

    // Move to position after list and print selection
    this.write(`${CSI}${this.startRow + this.maxHeight + 2};1H`);
    this.write(`Selected: ${item}\n`);
    this.isActive = false;
  }

  async initialize(): Promise<void> {
    // Hide cursor
    this.write(`${CSI}?25l`);

    // Get initial cursor position
    const pos = await this.getCursorPosition();
    this.startRow = pos.row;
    this.startCol = pos.col;

    // Update viewport info
    this.viewportInfo.cursorRow = pos.row;

    // Setup input handling
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', (data) => {
      this.handleInput(data.toString());
    });

    // Initial render
    this.render();
  }

  cleanup(): void {
    // Show cursor
    this.write(`${CSI}?25h`);

    // Move cursor to safe position
    this.write(`${CSI}${this.startRow + this.maxHeight + 2};1H`);

    // Reset input
    process.stdin.setRawMode(false);
    process.stdin.pause();
  }

  // Public API for external control
  public getViewportInfo(): ViewportInfo {
    return { ...this.viewportInfo };
  }

  public getScrollInfo(): {
    scrollTop: number;
    maxScroll: number;
    visibleItems: number;
    totalItems: number;
  } {
    const visibleItems = Math.floor(this.maxHeight / this.itemHeight);
    const maxScroll = Math.max(0, (this.items.length - visibleItems) * this.itemHeight);

    return {
      scrollTop: this.scrollTop(),
      maxScroll,
      visibleItems,
      totalItems: this.items.length
    };
  }
}

// Example usage
async function main() {
  // Generate sample data
  const items: string[] = [];
  for (let i = 1; i <= 100; i++) {
    items.push(`Item ${i}: This is a longer text to demonstrate truncation and scrolling behavior in the virtual list`);
  }

  console.log('Virtual List Demo - Inline Mode with Native Scroll');
  console.log('------------------------------------------------');
  console.log('Use ↑/↓ arrows to navigate, Enter to select, q to quit');
  console.log('');

  const list = new InlineVirtualList({
    items,
    itemHeight: 1,
    maxHeight: 10,  // Show 10 rows at a time
    renderItem: (item, index, isSelected) => {
      const num = String(index + 1).padStart(3);
      const prefix = isSelected ? '\x1b[36m▶\x1b[0m ' : '  ';
      const text = isSelected ? `\x1b[1;36m${num}. ${item}\x1b[0m` : `\x1b[90m${num}.\x1b[0m ${item}`;

      // Truncate to terminal width
      const maxWidth = process.stdout.columns - 6;
      if (item.length > maxWidth) {
        return prefix + text.substring(0, maxWidth - 3) + '...';
      }
      return prefix + text;
    }
  });

  await list.initialize();

  // Optionally, you can poll for viewport info
  setInterval(() => {
    const scrollInfo = list.getScrollInfo();
    const viewportInfo = list.getViewportInfo();

    // You could send this info elsewhere or use it for debugging
    // console.log('Scroll Info:', scrollInfo);
  }, 1000);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});