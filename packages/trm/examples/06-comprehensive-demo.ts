#!/usr/bin/env tsx
/**
 * Example 06: Comprehensive Terminal Application Demo
 * Combines all TRM features into a complete interactive application
 */

import { InputImpl } from '../src/core/input.js';
import { ColorSystem } from '../src/core/color.js';
import { StylesImpl } from '../src/core/styles.js';
import { TerminalImpl } from '../src/core/terminal.js';
import { EventEmitterImpl } from '../src/core/events.js';
import { BufferManagerImpl } from '../src/core/buffer.js';
import { x, y, cols, rows, ColorDepth, MouseButton, MouseAction } from '../src/types.js';

import type {
  Point,
  Style,
  BoxStyle,
  KeyEvent,
  Rectangle,
  MouseEvent,
  TerminalEvents
} from '../src/types.js';

// Application state
interface AppState {
  running: boolean;
  selectedTab: number;
  mouseEnabled: boolean;
  inputBuffer: string;
  messages: string[];
  animationFrame: number;
  cursorPos: Point;
}

class TerminalApp {
  private terminal: TerminalImpl;
  private bufferManager: BufferManagerImpl;
  private input: InputImpl;
  private colors: ColorSystem;
  private styles: StylesImpl;
  private events: EventEmitterImpl<TerminalEvents>;
  private state: AppState;
  private width: number;
  private height: number;

  constructor() {
    this.terminal = new TerminalImpl({
      mode: 'fullscreen',
      alternateBuffer: true,
      rawMode: true,
      keyboard: true,
    });
    this.colors = new ColorSystem(ColorDepth.Extended);
    this.styles = new StylesImpl(this.colors);
    this.events = new EventEmitterImpl<TerminalEvents>();

    this.state = {
      running: true,
      selectedTab: 0,
      mouseEnabled: false,
      inputBuffer: '',
      messages: ['Welcome to TRM Comprehensive Demo!'],
      animationFrame: 0,
      cursorPos: { x: x(0), y: y(0) }
    };

    this.width = 0;
    this.height = 0;
  }

  async init() {
    await this.terminal.init();

    this.width = this.terminal.stream.cols;
    this.height = this.terminal.stream.rows;

    // Create buffer manager with correct stream
    this.bufferManager = new BufferManagerImpl(this.terminal.stream);

    // Get reference to the terminal's input
    this.input = this.terminal.input as InputImpl;

    // Hide cursor
    this.terminal.cursor.hide();

    // Clear screen for fullscreen mode
    this.terminal.screen.clear();
  }

  private handleKeyEvent(event: KeyEvent) {
    // Global shortcuts
    if (event.ctrl && (event.key === 'c' || event.key === 'C')) {
      this.state.running = false;
      return;
    }

    // Also handle 'q' for quit
    if (event.key === 'q' || event.key === 'Q') {
      this.state.running = false;
      return;
    }

    if (event.key === 'Tab') {
      this.state.selectedTab = (this.state.selectedTab + 1) % 4;
      this.render();
      return;
    }

    if (event.key === 'm') {
      this.state.mouseEnabled = !this.state.mouseEnabled;
      if (this.state.mouseEnabled) {
        this.input.enableMouse();
        this.addMessage('Mouse enabled');
      } else {
        this.input.disableMouse();
        this.addMessage('Mouse disabled');
      }
      this.render();
      return;
    }

    // Tab-specific handling
    // eslint-disable-next-line default-case
    switch (this.state.selectedTab) {
      case 0: // Dashboard
        this.handleDashboardKey(event);
        break;
      case 1: // Colors
        this.handleColorsKey(event);
        break;
      case 2: // Animation
        this.handleAnimationKey(event);
        break;
      case 3: // Input
        this.handleInputKey(event);
        break;
    }
  }

  private handleDashboardKey(event: KeyEvent) {
    if (event.key === 'c') {
      this.state.messages = ['Messages cleared'];
      this.render();
    }
  }

  private handleColorsKey(event: KeyEvent) {
    // Color cycling with number keys
    if (event.key >= '1' && event.key <= '9') {
      this.addMessage(`Color preset ${event.key} selected`);
      this.render();
    }
  }

  private handleAnimationKey(event: KeyEvent) {
    if (event.key === ' ') {
      this.state.animationFrame = 0;
      this.addMessage('Animation restarted');
      this.render();
    }
  }

  private handleInputKey(event: KeyEvent) {
    if (event.key === 'Enter') {
      if (this.state.inputBuffer.length > 0) {
        this.addMessage(`Input: ${this.state.inputBuffer}`);
        this.state.inputBuffer = '';
      }
    } else if (event.key === 'Backspace') {
      this.state.inputBuffer = this.state.inputBuffer.slice(0, -1);
    } else if (event.key.length === 1 && !event.ctrl && !event.alt) {
      this.state.inputBuffer += event.key;
    }
    this.render();
  }

  private handleMouseEvent(event: MouseEvent) {
    this.state.cursorPos = { x: event.x, y: event.y };

    if (event.action === MouseAction.Press && event.button === MouseButton.Left) {
      // Check if clicking on tabs
      if (event.y === y(2)) {
        const tabWidth = 20;
        const tabIndex = Math.floor(event.x / tabWidth);
        if (tabIndex >= 0 && tabIndex < 4) {
          this.state.selectedTab = tabIndex;
          this.render();
        }
      }
    }

    this.render();
  }

  private handleResize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.addMessage(`Resized to ${width}x${height}`);
    this.render();
  }

  private addMessage(message: string) {
    this.state.messages.push(`[${new Date().toLocaleTimeString()}] ${message}`);
    if (this.state.messages.length > 5) {
      this.state.messages.shift();
    }
  }

  private drawHeader() {
    const buffer = this.bufferManager.backBuffer;

    // Title bar
    buffer.fillRect(x(0), y(0), cols(this.width), rows(1), ' ', {
      bg: this.colors.blue
    });

    const title = '╔═══ TRM Comprehensive Demo ═══╗';
    const titleX = x(Math.floor((this.width - title.length) / 2));
    if (titleX >= 0) {
      buffer.writeText(titleX, y(0), title, {
        fg: this.colors.white,
        bg: this.colors.blue,
        bold: true
      });
    }

    // Help text
    const helpText = 'Tab: Switch | m: Mouse | q: Exit';
    const helpX = this.width - helpText.length - 2;
    if (helpX > 0) {
      buffer.writeText(x(helpX), y(0), helpText, {
        fg: this.colors.gray,
        bg: this.colors.blue
      });
    }
  }

  private drawTabs() {
    const buffer = this.bufferManager.backBuffer;
    const tabs = ['Dashboard', 'Colors', 'Animation', 'Input'];
    const tabWidth = 20;

    for (let i = 0; i < tabs.length; i++) {
      const tabX = x(i * tabWidth);
      const isSelected = i === this.state.selectedTab;

      const style: Style = {
        fg: isSelected ? this.colors.white : this.colors.gray,
        bg: isSelected ? this.colors.green : this.colors.black,
        bold: isSelected
      };

      // Draw tab
      buffer.fillRect(tabX, y(2), cols(tabWidth - 1), rows(1), ' ', style);

      // Center text in tab
      const text = tabs[i];
      const textX = x(i * tabWidth + Math.floor((tabWidth - (text?.length ?? 0)) / 2));
      buffer.writeText(textX, y(2), text ?? '', style);

      // Tab separator
      if (i < tabs.length - 1) {
        buffer.writeText(x((i + 1) * tabWidth - 1), y(2), '│', {
          fg: this.colors.gray
        });
      }
    }
  }

  private drawContent() {
    // eslint-disable-next-line default-case
    switch (this.state.selectedTab) {
      case 0:
        this.drawDashboard();
        break;
      case 1:
        this.drawColors();
        break;
      case 2:
        this.drawAnimation();
        break;
      case 3:
        this.drawInput();
        break;
    }
  }

  private drawDashboard() {
    const buffer = this.bufferManager.backBuffer;

    // System info box
    const infoBox: Rectangle = { x: x(2), y: y(4), width: cols(40), height: rows(8) };
    const infoBoxStyle: BoxStyle = {
      style: { fg: this.colors.cyan },
      type: 'double',
      fill: false
    };
    // Draw box manually (drawBox method doesn't exist)
    // Top-left corner
    buffer.writeText(infoBox.x, infoBox.y, '╔', infoBoxStyle.style);
    // Top line
    for (let i = 1; i < infoBox.width - 1; i++) {
      buffer.writeText(x(infoBox.x + i), infoBox.y, '═', infoBoxStyle.style);
    }
    // Top-right corner
    buffer.writeText(x(infoBox.x + infoBox.width - 1), infoBox.y, '╗', infoBoxStyle.style);
    // Side lines
    for (let i = 1; i < infoBox.height - 1; i++) {
      buffer.writeText(infoBox.x, y(infoBox.y + i), '║', infoBoxStyle.style);
      buffer.writeText(x(infoBox.x + infoBox.width - 1), y(infoBox.y + i), '║', infoBoxStyle.style);
    }
    // Bottom-left corner
    buffer.writeText(infoBox.x, y(infoBox.y + infoBox.height - 1), '╚', infoBoxStyle.style);
    // Bottom line
    for (let i = 1; i < infoBox.width - 1; i++) {
      buffer.writeText(x(infoBox.x + i), y(infoBox.y + infoBox.height - 1), '═', infoBoxStyle.style);
    }
    // Bottom-right corner
    buffer.writeText(x(infoBox.x + infoBox.width - 1), y(infoBox.y + infoBox.height - 1), '╝', infoBoxStyle.style);

    buffer.writeText(x(4), y(5), 'System Information', {
      fg: this.colors.brightCyan,
      bold: true
    });

    buffer.writeText(x(4), y(7), `Terminal: ${this.width}x${this.height}`, {
      fg: this.colors.white
    });

    buffer.writeText(x(4), y(8), `Color Depth: ${ColorDepth[this.terminal.stream.colorDepth]}`, {
      fg: this.colors.white
    });

    buffer.writeText(x(4), y(9), `Mouse: ${this.state.mouseEnabled ? 'Enabled' : 'Disabled'}`, {
      fg: this.colors.white
    });

    buffer.writeText(x(4), y(10), `Cursor: (${this.state.cursorPos.x}, ${this.state.cursorPos.y})`, {
      fg: this.colors.white
    });

    // Messages box
    const msgBoxWidth = Math.min(70, this.width - 47);
    const msgBox: Rectangle = { x: x(45), y: y(4), width: cols(msgBoxWidth), height: rows(8) };
    const msgBoxStyle: BoxStyle = {
      style: { fg: this.colors.yellow },
      type: 'rounded',
      fill: false
    };
    // Draw box manually (drawBox method doesn't exist)
    // Top-left corner
    buffer.writeText(msgBox.x, msgBox.y, '╭', msgBoxStyle.style);
    // Top line
    for (let i = 1; i < msgBox.width - 1; i++) {
      buffer.writeText(x(msgBox.x + i), msgBox.y, '─', msgBoxStyle.style);
    }
    // Top-right corner
    buffer.writeText(x(msgBox.x + msgBox.width - 1), msgBox.y, '╮', msgBoxStyle.style);
    // Side lines
    for (let i = 1; i < msgBox.height - 1; i++) {
      buffer.writeText(msgBox.x, y(msgBox.y + i), '│', msgBoxStyle.style);
      buffer.writeText(x(msgBox.x + msgBox.width - 1), y(msgBox.y + i), '│', msgBoxStyle.style);
    }
    // Bottom-left corner
    buffer.writeText(msgBox.x, y(msgBox.y + msgBox.height - 1), '╰', msgBoxStyle.style);
    // Bottom line
    for (let i = 1; i < msgBox.width - 1; i++) {
      buffer.writeText(x(msgBox.x + i), y(msgBox.y + msgBox.height - 1), '─', msgBoxStyle.style);
    }
    // Bottom-right corner
    buffer.writeText(x(msgBox.x + msgBox.width - 1), y(msgBox.y + msgBox.height - 1), '╯', msgBoxStyle.style);

    buffer.writeText(x(47), y(5), 'Messages (press "c" to clear)', {
      fg: this.colors.brightYellow,
      bold: true
    });

    for (let i = 0; i < this.state.messages.length; i++) {
      buffer.writeText(x(47), y(7 + i), this.state.messages?.[i] ?? '', {
        fg: this.colors.white
      });
    }

    // Status bar
    this.drawStatusBar();
  }

  private drawColors() {
    const buffer = this.bufferManager.backBuffer;

    buffer.writeText(x(2), y(4), 'Color Palette Demo', {
      fg: this.colors.brightWhite,
      bold: true
    });

    // Basic colors
    buffer.writeText(x(2), y(6), 'Basic Colors:', {
      fg: this.colors.white
    });

    const basicColors = [
      { name: 'Black', color: this.colors.black },
      { name: 'Red', color: this.colors.red },
      { name: 'Green', color: this.colors.green },
      { name: 'Yellow', color: this.colors.yellow },
      { name: 'Blue', color: this.colors.blue },
      { name: 'Magenta', color: this.colors.magenta },
      { name: 'Cyan', color: this.colors.cyan },
      { name: 'White', color: this.colors.white }
    ];

    for (let i = 0; i < basicColors.length; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      const colorX = x(2 + col * 20);
      const colorY = y(8 + row * 2);

      buffer.fillRect(colorX, colorY, cols(18), rows(1), ' ', {
        bg: basicColors[i]?.color ?? this.colors.black
      });

      buffer.writeText(x(colorX + 2), colorY, basicColors[i]?.name ?? '', {
        fg: i === 0 ? this.colors.white : this.colors.black
      });
    }

    // RGB gradient
    if (this.terminal.stream.colorDepth >= ColorDepth.TrueColor) {
      buffer.writeText(x(2), y(13), 'RGB Gradient:', {
        fg: this.colors.white
      });

      const gradientWidth = Math.min(60, this.width - 4);
      for (let i = 0; i < gradientWidth; i++) {
        const hue = (i * 360) / gradientWidth;
        const color = this.colors.hsl(hue, 100, 50);
        buffer.fillRect(x(2 + i), y(15), cols(1), rows(2), '█', {
          fg: color
        });
      }
    }

    // 256 color palette
    if (this.terminal.stream.colorDepth >= ColorDepth.Extended) {
      buffer.writeText(x(2), y(18), '256 Color Palette:', {
        fg: this.colors.white
      });

      for (let row = 0; row < 8; row++) {
        for (let col = 0; col < 32; col++) {
          const colorIndex = row * 32 + col;
          if (colorIndex >= 256) break;

          const color = this.colors.ansi256(colorIndex);
          buffer.writeText(x(2 + col * 2), y(20 + row), '██', {
            fg: color
          });
        }
      }
    }
  }

  private drawAnimation() {
    const buffer = this.bufferManager.backBuffer;

    buffer.writeText(x(2), y(4), 'Animation Demo (press SPACE to restart)', {
      fg: this.colors.brightWhite,
      bold: true
    });

    // Spinning loader
    const spinnerChars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    const spinnerIndex = this.state.animationFrame % spinnerChars.length;

    buffer.writeText(x(2), y(6), `Loading ${spinnerChars[spinnerIndex]}`, {
      fg: this.colors.cyan
    });

    // Progress bar
    const progress = (this.state.animationFrame % 100) / 100;
    const barWidth = 40;
    const filledWidth = Math.floor(barWidth * progress);

    buffer.writeText(x(2), y(8), 'Progress:', {
      fg: this.colors.white
    });

    buffer.writeText(x(12), y(8), '[', { fg: this.colors.gray });

    for (let i = 0; i < barWidth; i++) {
      const char = i < filledWidth ? '█' : '░';
      const color = i < filledWidth ? this.colors.green : this.colors.gray;
      buffer.writeText(x(13 + i), y(8), char, { fg: color });
    }

    buffer.writeText(x(13 + barWidth), y(8), ']', { fg: this.colors.gray });
    buffer.writeText(x(15 + barWidth), y(8), `${Math.floor(progress * 100)}%`, {
      fg: this.colors.white
    });

    // Bouncing ball
    const ballRadius = 15;
    const ballAngle = (this.state.animationFrame * 5) % 360;
    const ballRadians = (ballAngle * Math.PI) / 180;
    const ballX = x(30 + Math.floor(ballRadius * Math.cos(ballRadians)));
    const ballY = y(15 + Math.floor(ballRadius * Math.sin(ballRadians) / 2));

    buffer.writeText(ballX, ballY, '⚫', {
      fg: this.colors.hsl(ballAngle, 100, 50)
    });

    // Wave pattern
    const waveY = y(25);
    const waveWidth = 60;

    for (let i = 0; i < waveWidth; i++) {
      const wavePhase = (this.state.animationFrame + i * 5) % 360;
      const waveHeight = Math.sin((wavePhase * Math.PI) / 180);
      const waveChar = waveHeight > 0.5 ? '▲' : waveHeight < -0.5 ? '▼' : '─';
      const waveColor = this.colors.hsl(wavePhase, 100, 50);

      buffer.writeText(x(2 + i), waveY, waveChar, {
        fg: waveColor
      });
    }

    // Increment animation frame
    this.state.animationFrame++;
  }

  private drawInput() {
    const buffer = this.bufferManager.backBuffer;

    buffer.writeText(x(2), y(4), 'Input Demo', {
      fg: this.colors.brightWhite,
      bold: true
    });

    // Input field
    const inputBox: Rectangle = { x: x(2), y: y(6), width: cols(60), height: rows(3) };
    const inputBoxStyle: BoxStyle = {
      style: { fg: this.colors.green },
      type: 'single',
      fill: false
    };
    // Draw box manually (drawBox method doesn't exist)
    // Top-left corner
    buffer.writeText(inputBox.x, inputBox.y, '┌', inputBoxStyle.style);
    // Top line
    for (let i = 1; i < inputBox.width - 1; i++) {
      buffer.writeText(x(inputBox.x + i), inputBox.y, '─', inputBoxStyle.style);
    }
    // Top-right corner
    buffer.writeText(x(inputBox.x + inputBox.width - 1), inputBox.y, '┐', inputBoxStyle.style);
    // Side lines
    for (let i = 1; i < inputBox.height - 1; i++) {
      buffer.writeText(inputBox.x, y(inputBox.y + i), '│', inputBoxStyle.style);
      buffer.writeText(x(inputBox.x + inputBox.width - 1), y(inputBox.y + i), '│', inputBoxStyle.style);
    }
    // Bottom-left corner
    buffer.writeText(inputBox.x, y(inputBox.y + inputBox.height - 1), '└', inputBoxStyle.style);
    // Bottom line
    for (let i = 1; i < inputBox.width - 1; i++) {
      buffer.writeText(x(inputBox.x + i), y(inputBox.y + inputBox.height - 1), '─', inputBoxStyle.style);
    }
    // Bottom-right corner
    buffer.writeText(x(inputBox.x + inputBox.width - 1), y(inputBox.y + inputBox.height - 1), '┘', inputBoxStyle.style);

    buffer.writeText(x(4), y(7), `> ${this.state.inputBuffer}`, {
      fg: this.colors.white
    });

    // Blinking cursor
    if (this.state.animationFrame % 10 < 5) {
      buffer.writeText(x(4 + 2 + this.state.inputBuffer.length), y(7), '▊', {
        fg: this.colors.white
      });
    }

    // Instructions
    buffer.writeText(x(2), y(10), 'Type text and press Enter to submit', {
      fg: this.colors.gray
    });

    buffer.writeText(x(2), y(11), 'Use Backspace to delete', {
      fg: this.colors.gray
    });

    // Key state display
    buffer.writeText(x(2), y(13), 'Buffer content:', {
      fg: this.colors.yellow
    });

    buffer.writeText(x(2), y(14), `"${this.state.inputBuffer}"`, {
      fg: this.colors.cyan
    });

    buffer.writeText(x(2), y(15), `Length: ${this.state.inputBuffer.length} chars`, {
      fg: this.colors.cyan
    });
  }

  private drawStatusBar() {
    const buffer = this.bufferManager.backBuffer;
    const statusY = y(this.height - 2);

    // Background
    buffer.fillRect(x(0), statusY, cols(this.width), rows(1), ' ', {
      bg: this.colors.ansi256(236)
    });

    // Status text
    const statusLeft = ` Tab: ${this.state.selectedTab + 1}/4 `;
    const statusCenter = ` Frame: ${this.state.animationFrame} `;
    const statusRight = ` Press Ctrl+C to exit `;

    buffer.writeText(x(1), statusY, statusLeft, {
      fg: this.colors.white,
      bg: this.colors.ansi256(236)
    });

    const centerX = x(Math.floor((this.width - statusCenter.length) / 2));
    buffer.writeText(centerX, statusY, statusCenter, {
      fg: this.colors.yellow,
      bg: this.colors.ansi256(236)
    });

    buffer.writeText(x(this.width - statusRight.length - 1), statusY, statusRight, {
      fg: this.colors.red,
      bg: this.colors.ansi256(236)
    });
  }

  render() {
    // Ensure we have valid dimensions
    if (this.width <= 0 || this.height <= 0) {
      return;
    }

    // Clear back buffer
    this.bufferManager.backBuffer.clear();

    // Draw UI components
    this.drawHeader();
    this.drawTabs();
    this.drawContent();

    // Flip buffers and render
    this.bufferManager.flip();
    this.bufferManager.render(this.bufferManager.frontBuffer);
  }

  async run() {
    // Initial render
    this.render();

    // Animation timer
    const animationInterval = setInterval(() => {
      if (this.state.selectedTab === 2) { // Animation tab
        this.render();
      }
    }, 100);

    // Main event loop
    try {
      // Add initial message
      this.addMessage('Press Tab to switch tabs, Q to quit, M for mouse');
      this.render();

      // Set up event listeners using the terminal's event emitter
      this.terminal.events.on('key', (event: KeyEvent) => {
        this.handleKeyEvent(event);
        if (!this.state.running) {
          // Signal to exit
          this.terminal.events.emit('close');
        }
      });

      this.terminal.events.on('mouse', (event: MouseEvent) => {
        this.handleMouseEvent(event);
      });

      this.terminal.events.on('resize', (rows: number, cols: number) => {
        this.handleResize(cols, rows);
      });

      // Wait for close signal
      await new Promise<void>((resolve) => {
        this.terminal.events.once('close', () => {
          resolve();
        });
      });
    } catch (error) {
      // Store error for display
      this.addMessage(`Error: ${error}`);
    } finally {
      clearInterval(animationInterval);
    }
  }

  async cleanup() {
    // Disable mouse if enabled
    if (this.state?.mouseEnabled && this.input) {
      this.input.disableMouse();
    }

    // Close input if it exists
    if (this.input) {
      this.input.close();
    }

    // Reset terminal
    this.terminal.stream.setRawMode(false);
    this.terminal.screen.clear();
    this.terminal.cursor.show();
    this.terminal.cursor.moveTo(x(0), y(0));

    await this.terminal.close();
  }
}

// Main function
async function main() {
  // Check if running in TTY
  if (!process.stdin.isTTY) {
    console.error('This application requires an interactive terminal (TTY).');
    console.error('Please run it directly in a terminal, not through pipes.');
    process.exit(1);
  }

  const app = new TerminalApp();

  try {
    await app.init();
    // Don't use console.log in fullscreen mode - it corrupts the display
    await app.run();
  } catch (error) {
    // Clean up before logging error
    await app.cleanup();
    console.error('Application error:', error);
    process.exit(1);
  }

  // Cleanup was successful
  await app.cleanup();
  console.log('\nApplication terminated gracefully');
}

// Run the application
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});