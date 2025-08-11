#!/usr/bin/env tsx
/**
 * Layout Example 09: Fullscreen Grid Layout Demo
 * Demonstrates a 2x2 grid layout using the full terminal in fullscreen mode
 */

import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { ColorDepth, type Style, type Rectangle, type ScreenBuffer } from '../src/types.js';
import { x, y, cols, rows, createGridLayout, SimpleLayoutItem } from '../src/advanced/layout.js';

class GridDemoApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private colors: ColorSystem;
  private styles: StylesImpl;
  private width: number;
  private height: number;
  private animationFrame = 0;
  private running = true;

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'fullscreen',
      alternateBuffer: true,
      rawMode: true,
      keyboard: true,
      cursorHidden: true
    });
    
    this.colors = new ColorSystem(ColorDepth.TrueColor);
    this.styles = new StylesImpl(this.colors);
    this.width = 0;
    this.height = 0;
  }

  async init() {
    await this.terminal.init();
    
    this.width = this.terminal.stream.cols;
    this.height = this.terminal.stream.rows;
    
    this.bufferManager = new BufferManagerImpl(this.terminal.stream);
    
    // Clear screen
    this.terminal.screen.clear();
    
    // Set up event listeners
    this.terminal.events.on('key', (event) => {
      if (event.key === 'q' || event.key === 'Q' || (event.ctrl && event.key === 'c')) {
        this.running = false;
        this.terminal.events.emit('close');
      }
    });
    
    this.terminal.events.on('resize', (rows, cols) => {
      this.width = cols;
      this.height = rows;
      this.render();
    });
  }

  private drawBorder(buffer: ScreenBuffer, rect: Rectangle, style: Style, title?: string) {
    // Draw corners
    buffer.setCell(rect.x, rect.y, '┌', style);
    buffer.setCell(x(rect.x + rect.width - 1), rect.y, '┐', style);
    buffer.setCell(rect.x, y(rect.y + rect.height - 1), '└', style);
    buffer.setCell(x(rect.x + rect.width - 1), y(rect.y + rect.height - 1), '┘', style);
    
    // Draw horizontal lines
    for (let i = 1; i < rect.width - 1; i++) {
      buffer.setCell(x(rect.x + i), rect.y, '─', style);
      buffer.setCell(x(rect.x + i), y(rect.y + rect.height - 1), '─', style);
    }
    
    // Draw vertical lines
    for (let i = 1; i < rect.height - 1; i++) {
      buffer.setCell(rect.x, y(rect.y + i), '│', style);
      buffer.setCell(x(rect.x + rect.width - 1), y(rect.y + i), '│', style);
    }
    
    // Draw title if provided
    if (title && title.length > 0) {
      const titleStr = ` ${title} `;
      const titleX = rect.x + Math.floor((rect.width - titleStr.length) / 2);
      if (titleX > rect.x) {
        buffer.writeText(x(titleX), rect.y, titleStr, { ...style, bold: true });
      }
    }
  }

  private drawColorDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw border with title
    this.drawBorder(buffer, rect, { fg: this.colors.cyan }, 'Colors & Gradients');
    
    // Draw content inside
    const contentX = rect.x + 2;
    const contentY = rect.y + 2;
    const contentWidth = rect.width - 4;
    const contentHeight = rect.height - 4;
    
    // Basic colors
    buffer.writeText(x(contentX), y(contentY), 'Basic Colors:', { fg: this.colors.white, bold: true });
    
    const basicColors = [
      { name: 'Red', color: this.colors.red },
      { name: 'Green', color: this.colors.green },
      { name: 'Blue', color: this.colors.blue },
      { name: 'Yellow', color: this.colors.yellow },
      { name: 'Magenta', color: this.colors.magenta },
      { name: 'Cyan', color: this.colors.cyan }
    ];
    
    let colorY = contentY + 2;
    for (let i = 0; i < basicColors.length && colorY < contentY + contentHeight - 4; i += 2) {
      // Two colors per line
      const color1 = basicColors[i];
      const color2 = basicColors[i + 1];
      
      buffer.fillRect(x(contentX), y(colorY), cols(10), rows(1), ' ', { bg: color1.color });
      buffer.writeText(x(contentX + 1), y(colorY), color1.name, { 
        fg: this.colors.white, 
        bg: color1.color 
      });
      
      if (color2) {
        buffer.fillRect(x(contentX + 12), y(colorY), cols(10), rows(1), ' ', { bg: color2.color });
        buffer.writeText(x(contentX + 13), y(colorY), color2.name, { 
          fg: this.colors.white, 
          bg: color2.color 
        });
      }
      
      colorY += 2;
    }
    
    // RGB Gradient
    if (this.terminal.stream.colorDepth >= ColorDepth.TrueColor && colorY < contentY + contentHeight - 2) {
      buffer.writeText(x(contentX), y(colorY), 'RGB Gradient:', { fg: this.colors.white, bold: true });
      colorY += 2;
      
      const gradientWidth = Math.min(contentWidth - 2, 40);
      for (let i = 0; i < gradientWidth && colorY < contentY + contentHeight; i++) {
        const hue = ((i * 360) / gradientWidth + this.animationFrame * 2) % 360;
        const color = this.colors.hsl(hue, 100, 50);
        buffer.writeText(x(contentX + i), y(colorY), '█', { fg: color });
      }
    }
  }

  private drawAnimationDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw border with title
    this.drawBorder(buffer, rect, { fg: this.colors.green }, 'Animations');
    
    const contentX = rect.x + 2;
    const contentY = rect.y + 2;
    const contentWidth = rect.width - 4;
    const contentHeight = rect.height - 4;
    
    // Spinning loader
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinnerIndex = Math.floor(this.animationFrame / 2) % spinnerChars.length;
    
    buffer.writeText(x(contentX), y(contentY), `Loading ${spinnerChars[spinnerIndex]}`, {
      fg: this.colors.yellow,
      bold: true
    });
    
    // Progress bar
    if (contentHeight > 4) {
      const progress = (this.animationFrame % 100) / 100;
      const barWidth = Math.min(contentWidth - 10, 30);
      const filledWidth = Math.floor(barWidth * progress);
      
      buffer.writeText(x(contentX), y(contentY + 2), 'Progress:', { fg: this.colors.white });
      
      for (let i = 0; i < barWidth; i++) {
        const char = i < filledWidth ? '█' : '░';
        const color = i < filledWidth ? this.colors.green : this.colors.gray;
        buffer.writeText(x(contentX + i), y(contentY + 3), char, { fg: color });
      }
      
      buffer.writeText(x(contentX + barWidth + 1), y(contentY + 3), `${Math.floor(progress * 100)}%`, {
        fg: this.colors.white
      });
    }
    
    // Wave animation
    if (contentHeight > 7) {
      const waveY = contentY + 6;
      const waveWidth = Math.min(contentWidth, 30);
      
      for (let i = 0; i < waveWidth; i++) {
        const wavePhase = (this.animationFrame * 3 + i * 10) % 360;
        const waveHeight = Math.sin((wavePhase * Math.PI) / 180);
        const waveChar = waveHeight > 0.5 ? '▲' : waveHeight < -0.5 ? '▼' : '─';
        const waveColor = this.colors.hsl(wavePhase, 100, 50);
        
        buffer.writeText(x(contentX + i), y(waveY), waveChar, { fg: waveColor });
      }
    }
  }

  private drawTextStylesDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw border with title
    this.drawBorder(buffer, rect, { fg: this.colors.magenta }, 'Text Styles');
    
    const contentX = rect.x + 2;
    const contentY = rect.y + 2;
    const contentHeight = rect.height - 4;
    
    const styles = [
      { name: 'Bold', style: { fg: this.colors.white, bold: true } },
      { name: 'Italic', style: { fg: this.colors.white, italic: true } },
      { name: 'Underline', style: { fg: this.colors.white, underline: true } },
      { name: 'Strikethrough', style: { fg: this.colors.white, strikethrough: true } },
      { name: 'Dim', style: { fg: this.colors.white, dim: true } },
      { name: 'Inverse', style: { fg: this.colors.white, inverse: true } },
      { name: 'Combined', style: { fg: this.colors.yellow, bold: true, italic: true, underline: true } }
    ];
    
    let styleY = contentY;
    for (const { name, style } of styles) {
      if (styleY >= contentY + contentHeight) break;
      
      buffer.writeText(x(contentX), y(styleY), `${name}: `, { fg: this.colors.gray });
      buffer.writeText(x(contentX + 15), y(styleY), `Sample Text`, style);
      styleY += 2;
    }
  }

  private drawInfoDemo(buffer: ScreenBuffer, rect: Rectangle) {
    // Draw border with title
    this.drawBorder(buffer, rect, { fg: this.colors.yellow }, 'Terminal Info');
    
    const contentX = rect.x + 2;
    const contentY = rect.y + 2;
    
    const info = [
      `Terminal Size: ${this.width}x${this.height}`,
      `Color Depth: ${ColorDepth[this.terminal.stream.colorDepth]}`,
      `Frame: ${this.animationFrame}`,
      `Mode: Fullscreen`,
      '',
      'Press Q to exit'
    ];
    
    let infoY = contentY;
    for (const line of info) {
      if (infoY >= rect.y + rect.height - 2) break;
      
      const style: Style = line.startsWith('Press') 
        ? { fg: this.colors.red, bold: true }
        : { fg: this.colors.white };
      
      buffer.writeText(x(contentX), y(infoY), line, style);
      infoY++;
    }
  }

  render() {
    if (this.width <= 0 || this.height <= 0) return;
    
    // Clear back buffer
    this.bufferManager.backBuffer.clear();
    
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
      gap: 0       // No gap, we'll draw borders
    });
    
    // Create layout items for each cell
    const cellWidth = Math.floor(this.width / 2);
    const cellHeight = Math.floor(this.height / 2);
    
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
      this.drawColorDemo(this.bufferManager.backBuffer, cells[0].item.bounds);
    }
    
    if (cells[1]) {
      this.drawAnimationDemo(this.bufferManager.backBuffer, cells[1].item.bounds);
    }
    
    if (cells[2]) {
      this.drawTextStylesDemo(this.bufferManager.backBuffer, cells[2].item.bounds);
    }
    
    if (cells[3]) {
      this.drawInfoDemo(this.bufferManager.backBuffer, cells[3].item.bounds);
    }
    
    // Draw grid separators
    const midX = Math.floor(this.width / 2);
    const midY = Math.floor(this.height / 2);
    
    // Vertical separator
    for (let yPos = 0; yPos < this.height; yPos++) {
      const char = yPos === midY ? '┼' : '│';
      this.bufferManager.backBuffer.setCell(x(midX), y(yPos), char, { fg: this.colors.gray });
    }
    
    // Horizontal separator
    for (let xPos = 0; xPos < this.width; xPos++) {
      if (xPos !== midX) {
        this.bufferManager.backBuffer.setCell(x(xPos), y(midY), '─', { fg: this.colors.gray });
      }
    }
    
    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }

  async run() {
    // Initial render
    this.render();
    
    // Animation timer
    const animationInterval = setInterval(() => {
      this.animationFrame++;
      if (this.running) {
        this.render();
      }
    }, 100);
    
    // Wait for exit
    await new Promise<void>((resolve) => {
      this.terminal.events.once('close', () => {
        resolve();
      });
    });
    
    clearInterval(animationInterval);
  }

  async cleanup() {
    this.terminal.screen.clear();
    this.terminal.cursor.show();
    this.terminal.cursor.moveTo(x(0), y(0));
    await this.terminal.close();
  }
}

async function main() {
  if (!process.stdin.isTTY) {
    console.error('This application requires an interactive terminal (TTY).');
    process.exit(1);
  }
  
  const app = new GridDemoApp();
  
  try {
    await app.init();
    await app.run();
  } catch (error) {
    await app.cleanup();
    console.error('Application error:', error);
    process.exit(1);
  }
  
  await app.cleanup();
  console.log('\nFullscreen grid demo terminated gracefully');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});