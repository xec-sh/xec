// Password input component

import { TextPrompt, TextOptions } from './text.js';

import type { PromptConfig } from '../../core/types.js';

export interface PasswordOptions extends Omit<TextOptions, 'mask'> {
  mask?: string;
  showStrength?: boolean;
}

export class PasswordPrompt extends TextPrompt {
  private showStrength: boolean;

  constructor(config: PromptConfig<string, PasswordOptions> & PasswordOptions) {
    super({
      ...config,
      mask: config.mask || '•'
    });
    this.showStrength = config.showStrength ?? false;
  }

  override render(): string {
    let output = super.render();
    
    // Add password strength indicator if enabled
    if (this.showStrength && this.state.getState().status === 'active') {
      const strength = this.calculateStrength(this.value);
      output += '\n' + this.renderStrength(strength);
    }
    
    return output;
  }

  private calculateStrength(password: string): number {
    if (password.length === 0) return 0;
    
    let strength = 0;
    
    // Length
    if (password.length >= 8) strength++;
    if (password.length >= 12) strength++;
    if (password.length >= 16) strength++;
    
    // Character variety
    if (/[a-z]/.test(password)) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^a-zA-Z0-9]/.test(password)) strength++;
    
    // No common patterns
    if (!/(.)\1{2,}/.test(password)) strength++; // No repeated characters
    if (!/012|123|234|345|456|567|678|789|890/.test(password)) strength++; // No sequences
    
    return Math.min(5, Math.floor(strength / 2));
  }

  private renderStrength(strength: number): string {
    const ctx = this.getRenderContext();
    const levels = ['Very Weak', 'Weak', 'Fair', 'Good', 'Strong'];
    const colors = ['red', 'red', 'yellow', 'yellow', 'green'];
    
    let output = '  Strength: ';
    
    // Progress bar
    const filled = '█'.repeat(strength);
    const empty = '░'.repeat(5 - strength);
    
    const color = colors[strength - 1] || 'red';
    if (color === 'red') {
      output += ctx.theme.formatters.error(filled);
    } else if (color === 'yellow') {
      output += ctx.theme.formatters.warning(filled);
    } else {
      output += ctx.theme.formatters.success(filled);
    }
    output += ctx.theme.formatters.muted(empty);
    
    // Label
    const label = levels[Math.max(0, Math.min(levels.length - 1, strength - 1))] || levels[0] || 'Unknown';
    output += ' ' + ctx.theme.formatters.muted(label);
    
    return output;
  }
}