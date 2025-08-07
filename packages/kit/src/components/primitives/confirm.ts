// Confirm (yes/no) component

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface ConfirmOptions {
  defaultValue?: boolean;
  yesLabel?: string;
  noLabel?: string;
}

export class ConfirmPrompt extends Prompt<boolean, ConfirmOptions> {
  private value: boolean;

  constructor(config: PromptConfig<boolean, ConfirmOptions> & ConfirmOptions) {
    super(config);
    this.value = config.defaultValue ?? config.initialValue ?? false;
    // Initialize state with the value
    this.state.setState((s: any) => ({ ...s, value: this.value }));
  }

  render(): string {
    const ctx = this.getRenderContext();
    const { message } = this.config;
    const { status } = this.state.getState();
    
    let output = '';
    
    // Message
    output += ctx.theme.formatters.highlight(message);
    output += ' ';
    
    // Options
    if (status === 'active') {
      const yesText = this.config.yesLabel || 'Yes';
      const noText = this.config.noLabel || 'No';
      
      if (this.value) {
        output += ctx.theme.formatters.highlight(`${ctx.theme.symbols.pointer} ${yesText}`);
        output += '  ';
        output += ctx.theme.formatters.muted(noText);
      } else {
        output += ctx.theme.formatters.muted(yesText);
        output += '  ';
        output += ctx.theme.formatters.highlight(`${ctx.theme.symbols.pointer} ${noText}`);
      }
      
      output += ctx.theme.formatters.muted(' (y/n)');
    } else {
      const yesText = this.config.yesLabel || 'Yes';
      const noText = this.config.noLabel || 'No';
      output += this.value ? yesText : noText;
    }
    
    return output;
  }

  async handleInput(key: Key): Promise<void> {
    const { name, char } = key;
    
    // Submit on Enter
    if (name === 'enter' || name === 'return') {
      await this.submit(this.value);
      return;
    }
    
    // Toggle with arrow keys
    if (name === 'left' || name === 'right') {
      this.value = !this.value;
      this.updateState();
      return;
    }
    
    // Direct selection - handle both char and name
    const inputChar = char || name;
    if (inputChar === 'y' || inputChar === 'Y') {
      this.value = true;
      this.updateState();
      await this.submit(true);
      return;
    }
    
    if (inputChar === 'n' || inputChar === 'N') {
      this.value = false;
      this.updateState();
      await this.submit(false);
      return;
    }
    
    // Toggle with tab/space
    if (name === 'tab' || name === 'space') {
      this.value = !this.value;
      this.updateState();
      return;
    }
  }

  private updateState(): void {
    this.state.setState((s: any) => ({ ...s, value: this.value }));
  }
}