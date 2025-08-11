/**
 * Layout Visualization Renderer
 * Provides utilities to visually render layout items to terminal
 */

import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { createTerminalStream } from '../src/core/stream.js';
import { 
  x,
  y,
  cols,
  rows,
  type Style,
  type Color, ColorDepth, type Rectangle, type LayoutItem
} from '../src/types.js';

export interface RenderOptions {
  showBorders?: boolean;
  showLabels?: boolean;
  colors?: Color[];
  borderStyle?: 'single' | 'double' | 'rounded' | 'heavy';
}

export class LayoutRenderer {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private styles: StylesImpl;
  private colorIndex = 0;
  private defaultColors: Color[];

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'inline',
      colors: true,
      rawMode: false
    });
    
    const stream = createTerminalStream();
    this.bufferManager = new BufferManagerImpl(stream);
    this.colors = new ColorSystem(ColorDepth.TrueColor);
    this.styles = new StylesImpl(this.colors);
    
    // Default color palette for items
    this.defaultColors = [
      this.colors.red,
      this.colors.green,
      this.colors.blue,
      this.colors.yellow,
      this.colors.magenta,
      this.colors.cyan,
      this.colors.brightRed,
      this.colors.brightGreen,
      this.colors.brightBlue,
      this.colors.brightYellow,
      this.colors.brightMagenta,
      this.colors.brightCyan
    ];
  }

  async init() {
    await this.terminal.init();
  }

  /**
   * Render a layout item with visual representation
   */
  renderItem(
    item: LayoutItem,
    label?: string,
    options: RenderOptions = {}
  ): void {
    const { showBorders = true, borderStyle = 'single' } = options;
    const bounds = item.bounds;
    
    if (!bounds || bounds.width === 0 || bounds.height === 0) {
      return;
    }

    // Get color for this item
    const itemColors = options.colors || this.defaultColors;
    const color = itemColors[this.colorIndex % itemColors.length];
    this.colorIndex++;

    // Get border characters based on style
    const borders = this.getBorderChars(borderStyle);
    
    // Create a buffer for this item
    const buffer = this.bufferManager.create(
      this.terminal.stream.cols,
      this.terminal.stream.rows
    );

    if (showBorders) {
      // Draw borders
      this.drawBorder(buffer, bounds, color, borders);
    } else {
      // Fill area with background color
      this.fillArea(buffer, bounds, color);
    }

    // Add label if provided
    if (label && bounds.height > 0) {
      const labelX = Math.max(bounds.x + 1, bounds.x);
      const labelY = Math.max(bounds.y, 0);
      const maxWidth = Math.max(bounds.width - 2, 1);
      const truncatedLabel = label.substring(0, maxWidth);
      
      buffer.writeText(
        x(labelX),
        y(labelY),
        truncatedLabel,
        { fg: this.colors.white, bg: color, bold: true }
      );
    }

    // Render the buffer
    this.bufferManager.render(buffer);
  }

  /**
   * Render multiple layout items
   */
  renderItems(
    items: Array<{ item: LayoutItem; label?: string }>,
    options: RenderOptions = {}
  ): void {
    // Reset color index for consistent coloring
    this.colorIndex = 0;
    
    // Clear screen first
    this.terminal.screen.clear();
    
    // Render each item
    for (const { item, label } of items) {
      this.renderItem(item, label, options);
    }
  }

  /**
   * Render a layout container outline
   */
  renderContainer(
    bounds: Rectangle,
    label?: string,
    style?: Style
  ): void {
    const buffer = this.bufferManager.create(
      this.terminal.stream.cols,
      this.terminal.stream.rows
    );

    const borders = this.getBorderChars('double');
    this.drawBorder(buffer, bounds, this.colors.gray, borders);

    // Add label if provided
    if (label) {
      buffer.writeText(
        x(bounds.x + 2),
        y(bounds.y),
        ` ${label} `,
        style || { fg: this.colors.white, bold: true }
      );
    }

    this.bufferManager.render(buffer);
  }

  private drawBorder(
    buffer: any,
    bounds: Rectangle,
    color: Color,
    borders: any
  ): void {
    const style: Style = { fg: color };
    
    // Top-left corner
    buffer.writeText(x(bounds.x), y(bounds.y), borders.topLeft, style);
    
    // Top border
    for (let i = 1; i < bounds.width - 1; i++) {
      buffer.writeText(x(bounds.x + i), y(bounds.y), borders.horizontal, style);
    }
    
    // Top-right corner
    if (bounds.width > 1) {
      buffer.writeText(x(bounds.x + bounds.width - 1), y(bounds.y), borders.topRight, style);
    }
    
    // Side borders
    for (let i = 1; i < bounds.height - 1; i++) {
      buffer.writeText(x(bounds.x), y(bounds.y + i), borders.vertical, style);
      if (bounds.width > 1) {
        buffer.writeText(x(bounds.x + bounds.width - 1), y(bounds.y + i), borders.vertical, style);
      }
    }
    
    // Bottom border (if height > 1)
    if (bounds.height > 1) {
      // Bottom-left corner
      buffer.writeText(x(bounds.x), y(bounds.y + bounds.height - 1), borders.bottomLeft, style);
      
      // Bottom border
      for (let i = 1; i < bounds.width - 1; i++) {
        buffer.writeText(x(bounds.x + i), y(bounds.y + bounds.height - 1), borders.horizontal, style);
      }
      
      // Bottom-right corner
      if (bounds.width > 1) {
        buffer.writeText(x(bounds.x + bounds.width - 1), y(bounds.y + bounds.height - 1), borders.bottomRight, style);
      }
    }
  }

  private fillArea(
    buffer: any,
    bounds: Rectangle,
    color: Color
  ): void {
    buffer.fillRect(
      x(bounds.x),
      y(bounds.y),
      cols(bounds.width),
      rows(bounds.height),
      ' ',
      { bg: color }
    );
  }

  private getBorderChars(style: string) {
    switch (style) {
      case 'double':
        return {
          horizontal: '═',
          vertical: '║',
          topLeft: '╔',
          topRight: '╗',
          bottomLeft: '╚',
          bottomRight: '╝'
        };
      case 'rounded':
        return {
          horizontal: '─',
          vertical: '│',
          topLeft: '╭',
          topRight: '╮',
          bottomLeft: '╰',
          bottomRight: '╯'
        };
      case 'heavy':
        return {
          horizontal: '━',
          vertical: '┃',
          topLeft: '┏',
          topRight: '┓',
          bottomLeft: '┗',
          bottomRight: '┛'
        };
      case 'single':
      default:
        return {
          horizontal: '─',
          vertical: '│',
          topLeft: '┌',
          topRight: '┐',
          bottomLeft: '└',
          bottomRight: '┘'
        };
    }
  }

  /**
   * Print layout info below the visual
   */
  printInfo(message: string): void {
    console.log(message);
  }

  /**
   * Move cursor to a safe position for text output
   */
  moveCursorBelow(offset: number = 0): void {
    const y = this.terminal.stream.rows - 5 - offset;
    this.terminal.cursor.moveTo(x(0), y as any);
  }

  async cleanup() {
    await this.terminal.close();
  }
}

/**
 * Helper function to create and initialize a renderer
 */
export async function createLayoutRenderer(): Promise<LayoutRenderer> {
  const renderer = new LayoutRenderer();
  await renderer.init();
  return renderer;
}