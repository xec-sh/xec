// Rendering engine with minimal redraws

import { erase, cursor } from 'sisteransi';

import { StreamHandler } from './stream-handler.js';

import type { Theme, Region, RenderNode, Dimensions } from './types.js';

export interface RendererOptions {
  theme: Theme;
  stream?: StreamHandler;
}

export class Renderer {
  private previousFrame = '';
  private theme: Theme;
  private stream: StreamHandler;
  private isRendering = false;
  private frameBuffer = '';
  private lastRenderTime = 0;
  private minRenderInterval = 16; // ~60fps

  constructor(options: RendererOptions) {
    this.theme = options.theme;
    this.stream = options.stream ?? new StreamHandler();
  }

  render(content: string | RenderNode): void {
    if (this.isRendering) return;

    // Throttle rendering
    const now = Date.now();
    if (now - this.lastRenderTime < this.minRenderInterval) {
      setTimeout(() => this.render(content), this.minRenderInterval);
      return;
    }

    this.isRendering = true;
    this.lastRenderTime = now;

    try {
      const output = typeof content === 'string'
        ? content
        : this.renderNode(content);

      if (output !== this.previousFrame) {
        this.clear();
        this.stream.write(output);
        this.previousFrame = output;
      }
    } finally {
      this.isRendering = false;
    }
  }

  clear(): void {
    if (this.previousFrame) {
      const lines = this.previousFrame.split('\n').length;
      // First, clear the current line
      this.stream.clearLine();
      // Then move up and clear each line
      for (let i = 0; i < lines - 1; i++) {
        this.stream.write(cursor.up(1) + erase.line);
      }
      // The cursor is now at the top of where the previous frame started
    }
  }

  clearScreen(): void {
    this.stream.clearScreen();
    // Don't reset previousFrame here as it breaks frame tracking
    // and causes text overlay issues in subsequent renders
    // this.previousFrame = '';
  }

  update(region: Region, content: string): void {
    // Save cursor position
    this.stream.write(cursor.save);

    // Move to region
    this.stream.cursorTo(region.x, region.y);

    // Clear region
    for (let y = 0; y < region.height; y++) {
      this.stream.cursorTo(region.x, region.y + y);
      this.stream.write(' '.repeat(region.width));
    }

    // Write new content
    this.stream.cursorTo(region.x, region.y);
    const lines = content.split('\n');
    lines.forEach((line, i) => {
      if (i < region.height) {
        this.stream.cursorTo(region.x, region.y + i);
        this.stream.write(line.slice(0, region.width));
      }
    });

    // Restore cursor position
    this.stream.write(cursor.restore);
  }

  measureText(text: string): Dimensions {
    const lines = text.split('\n');
    const height = lines.length;
    const width = Math.max(...lines.map(line => this.stripAnsi(line).length));
    return { width, height };
  }

  getTheme(): Theme {
    return this.theme;
  }

  setTheme(theme: Theme): void {
    this.theme = theme;
  }

  private renderNode(node: RenderNode): string {
    switch (node.type) {
      case 'text':
        return this.applyStyle(node.content || '', node.style);

      case 'box':
        return this.renderBox(node);

      case 'line':
        return this.renderLine(node);

      case 'group':
        return (node.children || [])
          .map(child => this.renderNode(child))
          .join('');

      default:
        return '';
    }
  }

  private renderBox(node: RenderNode): string {
    const content = node.content || '';
    const lines = content.split('\n');
    const width = Math.max(...lines.map(line => this.stripAnsi(line).length)) + 4;

    const top = '╭' + '─'.repeat(width - 2) + '╮';
    const bottom = '╰' + '─'.repeat(width - 2) + '╯';
    const middle = lines.map(line => {
      const padding = width - 4 - this.stripAnsi(line).length;
      return '│ ' + line + ' '.repeat(padding) + ' │';
    });

    return [top, ...middle, bottom].join('\n');
  }

  private renderLine(node: RenderNode): string {
    const { width } = this.stream.getSize();
    return '─'.repeat(width);
  }

  private applyStyle(text: string, style?: RenderNode['style']): string {
    if (!style) return text;

    let styled = text;

    if (style.fg) {
      styled = this.colorize(styled, style.fg);
    }

    if (style.bg) {
      styled = this.bgColorize(styled, style.bg);
    }

    if (style.bold) {
      // Note: sisteransi doesn't have bold, italic, etc. These need picocolors
      // styled = ansi.bold(styled);
    }

    if (style.italic) {
      // styled = ansi.italic(styled);
    }

    if (style.underline) {
      // styled = ansi.underline(styled);
    }

    if (style.dim) {
      // styled = ansi.dim(styled);
    }

    return styled;
  }

  private colorize(text: string, color: string): string {
    // Simple color mapping - in real implementation would use picocolors
    const colors: Record<string, string> = {
      black: '\x1B[30m',
      red: '\x1B[31m',
      green: '\x1B[32m',
      yellow: '\x1B[33m',
      blue: '\x1B[34m',
      magenta: '\x1B[35m',
      cyan: '\x1B[36m',
      white: '\x1B[37m',
      reset: '\x1B[39m'
    };

    return (colors[color] || '') + text + colors['reset'];
  }

  private bgColorize(text: string, color: string): string {
    // Simple background color mapping
    const colors: Record<string, string> = {
      black: '\x1B[40m',
      red: '\x1B[41m',
      green: '\x1B[42m',
      yellow: '\x1B[43m',
      blue: '\x1B[44m',
      magenta: '\x1B[45m',
      cyan: '\x1B[46m',
      white: '\x1B[47m',
      reset: '\x1B[49m'
    };

    return (colors[color] || '') + text + colors['reset'];
  }

  private stripAnsi(text: string): string {
    // Remove all ANSI escape codes, not just color codes
    // This regex handles cursor movements, colors, and other escape sequences
    return text.replace(/\x1B\[[0-9;]*[A-Za-z]|\x1B\][^\x07]*\x07|\x1B[PX^_].*?\x1B\\|\x1B\[[^\x40-\x7E]*[\x40-\x7E]/g, '');
  }
}