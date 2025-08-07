// Panel component for content framing

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface PanelAction {
  label: string;
  value: string;
  primary?: boolean;
  danger?: boolean;
}

export interface PanelOptions {
  title?: string;
  content: string | string[];
  actions?: PanelAction[];
  border?: 'single' | 'double' | 'rounded' | 'bold' | 'none';
  padding?: number;
  align?: 'left' | 'center' | 'right';
  width?: number;
  maxHeight?: number;
}

export class PanelPrompt extends Prompt<string | undefined, PanelOptions> {
  private selectedActionIndex = 0;
  private scrollOffset = 0;

  constructor(config: PromptConfig<string | undefined, PanelOptions> & PanelOptions) {
    super(config);
    // If no actions, this is just a display panel
    if (!config.actions || config.actions.length === 0) {
      this.selectedActionIndex = -1;
    }
  }

  render(): string {
    const lines: string[] = [];
    const { 
      title, 
      content, 
      actions, 
      border = 'single', 
      padding = 1, 
      align = 'left',
      width,
      maxHeight
    } = this.config;
    
    const context = this.getRenderContext();
    const termWidth = context.width;
    const panelWidth = width || Math.min(termWidth - 4, 80);
    const contentWidth = panelWidth - (padding * 2) - 2;
    
    // Prepare content lines
    const contentLines = this.prepareContent(content, contentWidth, align);
    
    // Apply scroll if needed
    let displayLines = contentLines;
    if (maxHeight && contentLines.length > maxHeight) {
      displayLines = contentLines.slice(this.scrollOffset, this.scrollOffset + maxHeight);
    }
    
    // Build panel
    const paddingStr = ' '.repeat(padding);
    const borderChars = this.getBorderChars(border);
    
    // Top border
    if (border !== 'none') {
      if (title) {
        const titleStr = ` ${title} `;
        const remainingWidth = panelWidth - titleStr.length;
        const leftPart = Math.floor(remainingWidth / 2);
        const rightPart = remainingWidth - leftPart;
        
        lines.push(
          borderChars.topLeft +
          borderChars.horizontal.repeat(leftPart) +
          titleStr +
          borderChars.horizontal.repeat(rightPart) +
          borderChars.topRight
        );
      } else {
        lines.push(
          borderChars.topLeft +
          borderChars.horizontal.repeat(panelWidth) +
          borderChars.topRight
        );
      }
    }
    
    // Content lines
    displayLines.forEach(line => {
      const paddedLine = paddingStr + line + paddingStr;
      if (border !== 'none') {
        lines.push(borderChars.vertical + paddedLine + borderChars.vertical);
      } else {
        lines.push(paddedLine);
      }
    });
    
    // Empty padding lines
    for (let i = 0; i < padding; i++) {
      const emptyLine = ' '.repeat(panelWidth);
      if (border !== 'none') {
        lines.push(borderChars.vertical + emptyLine + borderChars.vertical);
      } else {
        lines.push(emptyLine);
      }
    }
    
    // Actions
    if (actions && actions.length > 0) {
      // Separator
      if (border !== 'none') {
        lines.push(
          borderChars.middleLeft +
          borderChars.horizontal.repeat(panelWidth) +
          borderChars.middleRight
        );
      } else {
        lines.push('─'.repeat(panelWidth));
      }
      
      // Action buttons
      const actionLine = this.renderActions(actions, contentWidth);
      const actionPadded = paddingStr + actionLine + paddingStr;
      
      if (border !== 'none') {
        lines.push(borderChars.vertical + actionPadded + borderChars.vertical);
      } else {
        lines.push(actionPadded);
      }
    }
    
    // Bottom border
    if (border !== 'none') {
      lines.push(
        borderChars.bottomLeft +
        borderChars.horizontal.repeat(panelWidth) +
        borderChars.bottomRight
      );
    }
    
    // Scroll indicator
    if (maxHeight && contentLines.length > maxHeight) {
      const scrollInfo = `${this.scrollOffset + 1}-${Math.min(this.scrollOffset + maxHeight, contentLines.length)} of ${contentLines.length}`;
      lines.push(this.theme.formatters.muted(scrollInfo));
    }
    
    return lines.join('\n');
  }

  override async handleInput(key: Key): Promise<void> {
    const { actions, maxHeight } = this.config;
    const contentLines = this.prepareContent(this.config.content, 80, this.config.align || 'left');
    
    // Handle scrolling
    if (maxHeight && contentLines.length > maxHeight) {
      if (key.name === 'up') {
        this.scrollOffset = Math.max(0, this.scrollOffset - 1);
        return;
      }
      
      if (key.name === 'down') {
        this.scrollOffset = Math.min(contentLines.length - maxHeight, this.scrollOffset + 1);
        return;
      }
      
      if (key.name === 'pageup') {
        this.scrollOffset = Math.max(0, this.scrollOffset - maxHeight);
        return;
      }
      
      if (key.name === 'pagedown') {
        this.scrollOffset = Math.min(contentLines.length - maxHeight, this.scrollOffset + maxHeight);
        return;
      }
    }
    
    // If no actions, just handle escape/enter to close
    if (!actions || actions.length === 0) {
      if (key.name === 'enter' || key.name === 'escape') {
        await this.submit(undefined);
      }
      return;
    }
    
    // Handle action selection
    if (key.name === 'left') {
      this.selectedActionIndex = Math.max(0, this.selectedActionIndex - 1);
    } else if (key.name === 'right') {
      this.selectedActionIndex = Math.min(actions.length - 1, this.selectedActionIndex + 1);
    } else if (key.name === 'tab') {
      this.selectedActionIndex = (this.selectedActionIndex + 1) % actions.length;
    } else if (key.name === 'enter') {
      const selectedAction = actions[this.selectedActionIndex];
      if (selectedAction) {
        await this.submit(selectedAction.value);
      }
    }
  }

  private prepareContent(content: string | string[], width: number, align: 'left' | 'center' | 'right'): string[] {
    const lines: string[] = Array.isArray(content) ? content : content.split('\n');
    const prepared: string[] = [];
    
    for (const line of lines) {
      // Word wrap long lines
      if (line.length > width) {
        const wrapped = this.wordWrap(line, width);
        prepared.push(...wrapped);
      } else {
        prepared.push(line);
      }
    }
    
    // Apply alignment
    return prepared.map(line => {
      const stripped = this.stripAnsi(line);
      const padding = width - stripped.length;
      
      if (padding <= 0) return line;
      
      switch (align) {
        case 'center':
          const leftPad = Math.floor(padding / 2);
          const rightPad = padding - leftPad;
          return ' '.repeat(leftPad) + line + ' '.repeat(rightPad);
        
        case 'right':
          return ' '.repeat(padding) + line;
        
        default: // left
          return line + ' '.repeat(padding);
      }
    });
  }

  private wordWrap(text: string, width: number): string[] {
    const words = text.split(' ');
    const lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      if (currentLine.length + word.length + 1 > width) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          // Word is longer than width, break it
          lines.push(word.substring(0, width));
          currentLine = word.substring(width);
        }
      } else {
        currentLine = currentLine ? currentLine + ' ' + word : word;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
    
    return lines;
  }

  private renderActions(actions: PanelAction[], width: number): string {
    const buttons = actions.map((action, index) => {
      const isSelected = index === this.selectedActionIndex;
      let button = ` ${action.label} `;
      
      if (isSelected) {
        if (action.primary) {
          button = this.theme.formatters.primary(button);
        } else if (action.danger) {
          button = this.theme.formatters.error(button);
        } else {
          button = this.theme.formatters.highlight(button);
        }
        button = `[${button}]`;
      } else {
        button = this.theme.formatters.muted(`[${button}]`);
      }
      
      return button;
    });
    
    const buttonLine = buttons.join('  ');
    const stripped = this.stripAnsi(buttonLine);
    const padding = Math.max(0, width - stripped.length);
    const leftPad = Math.floor(padding / 2);
    
    return ' '.repeat(leftPad) + buttonLine;
  }

  private getBorderChars(style: 'single' | 'double' | 'rounded' | 'bold' | 'none') {
    switch (style) {
      case 'double':
        return {
          topLeft: '╔', topRight: '╗',
          bottomLeft: '╚', bottomRight: '╝',
          horizontal: '═', vertical: '║',
          middleLeft: '╟', middleRight: '╢'
        };
      
      case 'rounded':
        return {
          topLeft: '╭', topRight: '╮',
          bottomLeft: '╰', bottomRight: '╯',
          horizontal: '─', vertical: '│',
          middleLeft: '├', middleRight: '┤'
        };
      
      case 'bold':
        return {
          topLeft: '┏', topRight: '┓',
          bottomLeft: '┗', bottomRight: '┛',
          horizontal: '━', vertical: '┃',
          middleLeft: '┣', middleRight: '┫'
        };
      
      default: // single
        return {
          topLeft: '┌', topRight: '┐',
          bottomLeft: '└', bottomRight: '┘',
          horizontal: '─', vertical: '│',
          middleLeft: '├', middleRight: '┤'
        };
    }
  }

  private stripAnsi(str: string): string {
    // Remove ANSI escape codes
    return str.replace(/\u001b\[[0-9;]*m/g, '');
  }

  protected override renderFinal(): string {
    const { title, actions } = this.config;
    const value = this.state.getState().value;
    
    if (this.state.getState().status === 'cancel') {
      return this.theme.formatters.muted('Cancelled');
    }
    
    if (value && actions) {
      const action = actions.find(a => a.value === value);
      const actionLabel = action?.label || value;
      return `${this.theme.symbols.success} ${title || 'Panel'} ${this.theme.formatters.muted('·')} ${actionLabel}`;
    }
    
    return '';
  }
}

// Helper function to create a panel
export function panel(options: PanelOptions): PanelPrompt {
  return new PanelPrompt({
    message: options.title || 'Panel',
    ...options
  });
}