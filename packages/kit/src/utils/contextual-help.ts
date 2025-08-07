// Contextual help system for prompts

import { colors } from './colors.js';
import { Theme } from '../core/types.js';
import { EventEmitter } from '../core/event-emitter.js';

export interface HelpContent {
  title?: string;
  content: string;
  format?: 'text' | 'markdown';
  position?: 'inline' | 'overlay' | 'bottom';
  shortcuts?: Array<{
    key: string;
    description: string;
  }>;
}

export interface ContextualHelpOptions {
  key?: string;
  content: HelpContent | string | (() => HelpContent | string);
  theme?: Theme;
  enabled?: boolean;
}

export class ContextualHelp extends EventEmitter {
  private key: string;
  private content: HelpContent | string | (() => HelpContent | string);
  private theme?: Theme;
  private enabled: boolean;
  private isShowing: boolean = false;
  
  constructor(options: ContextualHelpOptions) {
    super();
    
    this.key = options.key ?? '?';
    this.content = options.content;
    this.theme = options.theme;
    this.enabled = options.enabled ?? true;
  }
  
  isHelpKey(key: string): boolean {
    return this.enabled && key === this.key;
  }
  
  toggle(): void {
    this.isShowing = !this.isShowing;
    this.emit('toggle', this.isShowing);
  }
  
  show(): void {
    if (!this.enabled) return;
    
    this.isShowing = true;
    this.emit('show');
  }
  
  hide(): void {
    this.isShowing = false;
    this.emit('hide');
  }
  
  isVisible(): boolean {
    return this.isShowing;
  }
  
  private resolveContent(): HelpContent {
    const raw = typeof this.content === 'function' ? this.content() : this.content;
    
    if (typeof raw === 'string') {
      return {
        content: raw,
        format: 'text',
        position: 'bottom',
      };
    }
    
    return {
      format: 'text',
      position: 'bottom',
      ...raw,
    };
  }
  
  render(): string {
    if (!this.isShowing || !this.enabled) return '';
    
    const help = this.resolveContent();
    const theme = this.theme;
    let output = '';
    
    // Add spacing for inline/bottom positions
    if (help.position !== 'overlay') {
      output += '\n';
    }
    
    // Help box border
    const borderColor = theme?.formatters?.muted || colors.dim;
    const titleColor = theme?.formatters?.primary || colors.cyan;
    const contentColor = theme?.formatters?.primary || ((s: string) => s);
    
    // Title
    if (help.title) {
      output += borderColor('┌─ ') + titleColor(help.title) + borderColor(' ─┐') + '\n';
    } else {
      output += borderColor('┌───────────────┐') + '\n';
    }
    
    // Content
    const lines = help.content.split('\n');
    const maxWidth = Math.max(...lines.map(l => l.length), 40);
    
    lines.forEach(line => {
      output += borderColor('│ ');
      output += contentColor(line.padEnd(maxWidth));
      output += borderColor(' │') + '\n';
    });
    
    // Shortcuts
    if (help.shortcuts && help.shortcuts.length > 0) {
      output += borderColor('├───────────────┤') + '\n';
      
      help.shortcuts.forEach(shortcut => {
        const key = titleColor(shortcut.key.padEnd(10));
        const desc = contentColor(shortcut.description);
        const line = `${key} ${desc}`;
        
        output += borderColor('│ ');
        output += line.padEnd(maxWidth);
        output += borderColor(' │') + '\n';
      });
    }
    
    // Bottom border
    output += borderColor('└───────────────┘') + '\n';
    output += borderColor('Press ' + this.key + ' to close help') + '\n';
    
    return output;
  }
  
  renderInline(): string {
    if (!this.enabled) return '';
    
    const theme = this.theme;
    const dimColor = theme?.formatters?.muted || colors.dim;
    
    return dimColor(`Press ${this.key} for help`);
  }
}

// Helper to create contextual help for a prompt
export function createHelp(options: ContextualHelpOptions): ContextualHelp {
  return new ContextualHelp(options);
}

// Markdown renderer for help content
export function renderMarkdownHelp(markdown: string, theme?: Theme): string {
  const titleColor = theme?.formatters?.primary || colors.cyan;
  const boldColor = theme?.formatters?.secondary || colors.yellow;
  const codeColor = theme?.formatters?.info || colors.blue;
  const dimColor = theme?.formatters?.muted || colors.dim;
  
  let rendered = markdown;
  
  // Headers
  rendered = rendered.replace(/^#{1,6}\s+(.+)$/gm, (_, text) => titleColor(text));
  
  // Bold
  rendered = rendered.replace(/\*\*(.+?)\*\*/g, (_, text) => boldColor(text));
  
  // Code
  rendered = rendered.replace(/`(.+?)`/g, (_, text) => codeColor(text));
  
  // Lists
  rendered = rendered.replace(/^[-*]\s+(.+)$/gm, (_, text) => `• ${text}`);
  
  // Blockquotes
  rendered = rendered.replace(/^>\s+(.+)$/gm, (_, text) => dimColor(`│ ${text}`));
  
  return rendered;
}

// Mixin for adding help to any prompt
export interface WithHelp {
  help?: ContextualHelp;
  
  handleHelpKey(key: string): boolean;
  renderHelp(): string;
  isHelpVisible(): boolean;
}

export function withHelp<T extends new (...args: any[]) => any>(Base: T) {
  return class extends Base implements WithHelp {
    help?: ContextualHelp;
    
    constructor(...args: any[]) {
      super(...args);
      
      const options = args[0];
      if (options?.help) {
        this.help = createHelp({
          key: options.help.key,
          content: options.help.content,
          theme: options['theme'] || this['theme'],
          enabled: options.help.enabled ?? true,
        });
        
        // Listen to help events
        this.help.on('toggle', (isShowing: boolean) => {
          if (this['render']) {
            this['render']();
          }
        });
      }
    }
    
    handleHelpKey(key: string): boolean {
      if (!this.help) return false;
      
      if (this.help.isHelpKey(key)) {
        this.help.toggle();
        return true;
      }
      
      // Hide help on any other key if showing
      if (this.help.isVisible()) {
        this.help.hide();
      }
      
      return false;
    }
    
    renderHelp(): string {
      if (!this.help) return '';
      
      if (this.help.isVisible()) {
        return this.help.render();
      }
      
      return '\n' + this.help.renderInline();
    }
    
    isHelpVisible(): boolean {
      return this.help?.isVisible() ?? false;
    }
  };
}