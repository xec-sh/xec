#!/usr/bin/env tsx
/**
 * Layout Example 10: Inline Grid Layout Demo
 * Demonstrates a 2x2 grid layout in inline mode (no alternate screen)
 */

import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { ColorDepth, type Style, type Rectangle, type ScreenBuffer } from '../src/types.js';
import { x, y, cols, rows, createGridLayout, SimpleLayoutItem } from '../src/advanced/layout.js';

class InlineGridDemoApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private styles: StylesImpl;
  private width: number;
  private height: number;
  private animationFrame = 0;
  private running = true;
  private updateCount = 0;
  private maxUpdates = 50; // Run for 50 frames then stop

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'inline',  // Inline mode - no alternate screen
      rawMode: true,
      keyboard: true,
      cursorHidden: true,
      clearOnExit: false  // Don't clear on exit to keep the output visible
    });
    
    this.colors = new ColorSystem(ColorDepth.TrueColor);
    this.styles = new StylesImpl(this.colors);
    this.width = 0;
    // Use a fixed height for inline mode
    this.height = 20; // 20 rows for the demo
  }

  async init() {
    await this.terminal.init();
    
    this.width = Math.min(this.terminal.stream.cols, 100); // Cap width at 100 for readability
    
    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
    
    // Print header
    console.log('\n' + '═'.repeat(this.width));
    console.log('  TRM Layout System - Inline Grid Demo (2x2)');
    console.log('  Press Ctrl+C to stop');
    console.log('═'.repeat(this.width) + '\n');
    
    // Set up event listeners
    this.terminal.events.on('key', (event) => {
      if ((event.ctrl && event.key === 'c') || event.key === 'q' || event.key === 'Q') {
        this.running = false;
        this.terminal.events.emit('close');
      }
    });
  }

  private drawBorder(buffer: ScreenBuffer, rect: Rectangle, style: Style, title?: string) {
    // Simplified border for smaller inline display
    // Top border
    for (let i = 0; i < rect.width; i++) {
      buffer.setCell(x(rect.x + i), rect.y, '─', style);
    }
    
    // Title if provided
    if (title && title.length > 0 && rect.width > title.length + 4) {
      const titleStr = ` ${title} `;
      const titleX = rect.x + 1;
      buffer.writeText(x(titleX), rect.y, titleStr, { ...style, bold: true });
    }
  }

  private drawColorDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw title
    this.drawBorder(buffer, rect, { fg: this.colors.cyan }, 'Colors');
    
    const contentX = rect.x + 1;
    const contentY = rect.y + 1;
    const contentWidth = rect.width - 2;
    
    // Show a few basic colors
    const colors = [
      { char: '█', color: this.colors.red },
      { char: '█', color: this.colors.green },
      { char: '█', color: this.colors.blue },
      { char: '█', color: this.colors.yellow },
      { char: '█', color: this.colors.magenta },
      { char: '█', color: this.colors.cyan }
    ];
    
    buffer.writeText(x(contentX), y(contentY), 'Basic: ', { fg: this.colors.white });
    for (let i = 0; i < colors.length && i < contentWidth - 7; i++) {
      buffer.writeText(x(contentX + 7 + i * 2), y(contentY), colors[i].char, { fg: colors[i].color });
    }
    
    // Mini gradient
    if (contentY + 2 < rect.y + rect.height) {
      buffer.writeText(x(contentX), y(contentY + 2), 'RGB: ', { fg: this.colors.white });
      const gradientWidth = Math.min(contentWidth - 5, 20);
      for (let i = 0; i < gradientWidth; i++) {
        const hue = ((i * 360) / gradientWidth + this.animationFrame * 5) % 360;
        const color = this.colors.hsl(hue, 100, 50);
        buffer.writeText(x(contentX + 5 + i), y(contentY + 2), '▀', { fg: color });
      }
    }
    
    // Animation indicator
    if (contentY + 4 < rect.y + rect.height) {
      const spinnerChars = ['◐', '◓', '◑', '◒'];
      const spinnerIndex = Math.floor(this.animationFrame / 3) % spinnerChars.length;
      buffer.writeText(x(contentX), y(contentY + 4), `Anim: ${spinnerChars[spinnerIndex]}`, {
        fg: this.colors.yellow
      });
    }
  }

  private drawProgressDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw title
    this.drawBorder(buffer, rect, { fg: this.colors.green }, 'Progress');
    
    const contentX = rect.x + 1;
    const contentY = rect.y + 1;
    const contentWidth = rect.width - 2;
    
    // Progress bar
    const progress = (this.animationFrame % 30) / 30;
    const barWidth = Math.min(contentWidth - 8, 20);
    const filledWidth = Math.floor(barWidth * progress);
    
    buffer.writeText(x(contentX), y(contentY), 'Load: ', { fg: this.colors.white });
    
    for (let i = 0; i < barWidth; i++) {
      const char = i < filledWidth ? '█' : '░';
      const color = i < filledWidth ? this.colors.green : this.colors.gray;
      buffer.writeText(x(contentX + 6 + i), y(contentY), char, { fg: color });
    }
    
    buffer.writeText(x(contentX + 7 + barWidth), y(contentY), `${Math.floor(progress * 100)}%`, {
      fg: this.colors.white
    });
    
    // Counter
    if (contentY + 2 < rect.y + rect.height) {
      buffer.writeText(x(contentX), y(contentY + 2), `Frame: ${this.animationFrame}`, {
        fg: this.colors.cyan
      });
    }
    
    // Wave pattern
    if (contentY + 4 < rect.y + rect.height) {
      const waveWidth = Math.min(contentWidth, 25);
      for (let i = 0; i < waveWidth; i++) {
        const wavePhase = (this.animationFrame * 10 + i * 20) % 360;
        const waveHeight = Math.sin((wavePhase * Math.PI) / 180);
        const waveChar = waveHeight > 0.3 ? '▲' : waveHeight < -0.3 ? '▼' : '─';
        buffer.writeText(x(contentX + i), y(contentY + 4), waveChar, { 
          fg: this.colors.blue 
        });
      }
    }
  }

  private drawStylesDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw title
    this.drawBorder(buffer, rect, { fg: this.colors.magenta }, 'Styles');
    
    const contentX = rect.x + 1;
    const contentY = rect.y + 1;
    
    const styles = [
      { text: 'Bold', style: { fg: this.colors.white, bold: true } },
      { text: 'Italic', style: { fg: this.colors.white, italic: true } },
      { text: 'Under', style: { fg: this.colors.white, underline: true } },
      { text: 'Strike', style: { fg: this.colors.white, strikethrough: true } }
    ];
    
    let styleY = contentY;
    for (const { text, style } of styles) {
      if (styleY >= rect.y + rect.height) break;
      buffer.writeText(x(contentX), y(styleY), text, style);
      styleY++;
    }
    
    // Combined style example
    if (styleY < rect.y + rect.height) {
      buffer.writeText(x(contentX), y(styleY), 'Mixed', { 
        fg: this.colors.yellow, 
        bold: true, 
        underline: true 
      });
    }
  }

  private drawInfoDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw title
    this.drawBorder(buffer, rect, { fg: this.colors.yellow }, 'Info');
    
    const contentX = rect.x + 1;
    const contentY = rect.y + 1;
    
    const info = [
      `Size: ${this.width}x${this.height}`,
      `Mode: Inline`,
      `Update: ${this.updateCount}/${this.maxUpdates}`,
      this.updateCount >= this.maxUpdates ? 'Complete!' : 'Running...'
    ];
    
    let infoY = contentY;
    for (const line of info) {
      if (infoY >= rect.y + rect.height) break;
      
      const style: Style = line.includes('Complete') 
        ? { fg: this.colors.green, bold: true }
        : line.includes('Running')
        ? { fg: this.colors.yellow, bold: true }
        : { fg: this.colors.white };
      
      buffer.writeText(x(contentX), y(infoY), line, style);
      infoY++;
    }
  }

  render() {
    if (this.width <= 0 || this.height <= 0) return;
    
    // Create a buffer for our content
    const buffer = this.bufferManager.create(cols(this.width), rows(this.height));
    
    // Clear the buffer
    buffer.clear();
    
    // Create grid layout for 2x2 grid with fraction-based sizing
    const layout = createGridLayout({
      columns: [
        { type: 'fraction', size: 1 },
        { type: 'fraction', size: 1 }
      ],
      rows: [
        { type: 'fraction', size: 1 },
        { type: 'fraction', size: 1 }
      ],
      gap: 1       // Small gap between cells
    });
    
    // Create layout items for each cell
    const cellWidth = Math.floor((this.width - 1) / 2);
    const cellHeight = Math.floor((this.height - 1) / 2);
    
    for (let i = 0; i < 4; i++) {
      layout.add(new SimpleLayoutItem(cols(cellWidth), rows(cellHeight)));
    }
    
    // Arrange the layout
    layout.arrange({
      x: x(0),
      y: y(0),
      width: cols(this.width),
      height: rows(this.height)
    });
    
    // Draw content in each cell
    const cells = layout.children;
    
    if (cells[0]) {
      this.drawColorDemo(buffer, cells[0].item.bounds);
    }
    
    if (cells[1]) {
      this.drawProgressDemo(buffer, cells[1].item.bounds);
    }
    
    if (cells[2]) {
      this.drawStylesDemo(buffer, cells[2].item.bounds);
    }
    
    if (cells[3]) {
      this.drawInfoDemo(buffer, cells[3].item.bounds);
    }
    
    // Render the buffer
    this.bufferManager.render(buffer, x(0), y(0));
  }

  async run() {
    // Initial render
    this.render();
    
    // Animation timer
    const animationInterval = setInterval(() => {
      this.animationFrame++;
      this.updateCount++;
      
      if (this.updateCount >= this.maxUpdates) {
        this.running = false;
        clearInterval(animationInterval);
        
        // Final render
        this.render();
        
        // Move cursor below the output
        this.terminal.cursor.moveTo(x(0), y(this.height + 1));
        
        // Signal completion
        this.terminal.events.emit('close');
      } else if (this.running) {
        // Update position for inline mode
        this.terminal.cursor.moveTo(x(0), y(0));
        this.render();
      }
    }, 200); // Slower update rate for inline mode
    
    // Wait for exit or completion
    await new Promise<void>((resolve) => {
      this.terminal.events.once('close', () => {
        clearInterval(animationInterval);
        resolve();
      });
    });
  }

  async cleanup() {
    // Move cursor to the end
    this.terminal.cursor.moveTo(x(0), y(this.height + 1));
    this.terminal.cursor.show();
    await this.terminal.close();
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('This application requires an interactive terminal (TTY).');
    process.exit(1);
  }
  
  const app = new InlineGridDemoApp();
  
  try {
    await app.init();
    await app.run();
  } catch (error) {
    await app.cleanup();
    console.error('\nApplication error:', error);
    process.exit(1);
  }
  
  await app.cleanup();
  console.log('\n' + '═'.repeat(Math.min(process.stdout.columns || 80, 100)));
  console.log('Inline grid demo completed successfully!');
  console.log('The output above shows a 2x2 grid layout with:');
  console.log('  - Top-left: Color demonstrations and animations');
  console.log('  - Top-right: Progress bars and counters');
  console.log('  - Bottom-left: Text style examples');
  console.log('  - Bottom-right: Terminal information');
  console.log('═'.repeat(Math.min(process.stdout.columns || 80, 100)));
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});