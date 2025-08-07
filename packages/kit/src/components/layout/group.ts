// Group component for managing related prompts

import { Prompt } from '../../core/prompt.js';

import type { PromptConfig } from '../../core/types.js';

export interface GroupOptions {
  title?: string;
  border?: boolean;
  padding?: number;
}

export interface GroupPromptItem {
  name: string;
  prompt: Prompt<any>;
  condition?: (results: Record<string, any>) => boolean;
}

export interface GroupConfig extends GroupOptions {
  prompts: GroupPromptItem[];
}

export class GroupPrompt extends Prompt<Record<string, any>, GroupConfig> {
  private results: Record<string, any> = {};
  private currentIndex = 0;
  private isRunning = false;

  constructor(config: PromptConfig<Record<string, any>, GroupConfig> & GroupConfig) {
    super(config);
  }

  render(): string {
    const lines: string[] = [];
    const { title, border, padding = 1 } = this.config;
    const state = this.state.getState();
    const paddingStr = ' '.repeat(padding);

    // Title
    if (title) {
      lines.push(this.theme.formatters.bold(title));
      lines.push('');
    }

    // Show progress - count only prompts that pass their conditions
    let totalCount = 0;
    for (const p of this.config.prompts) {
      if (this.shouldShowPrompt(p)) {
        totalCount++;
      }
    }
    const completedCount = Object.keys(this.results).length;

    if (totalCount > 0) {
      const progress = `${this.theme.formatters.muted(`[${completedCount}/${totalCount}]`)}`;
      lines.push(progress);
      lines.push('');
    }

    // Show completed prompts and results
    for (const [name, value] of Object.entries(this.results)) {
      const formatted = this.formatResult(name, value);
      lines.push(`${paddingStr}${this.theme.symbols.success} ${name}: ${formatted}`);
    }

    // Show current prompt message
    if (this.isRunning) {
      // Find the current prompt being executed
      let visibleIndex = 0;
      for (const prompt of this.config.prompts) {
        if (!this.shouldShowPrompt(prompt)) continue;
        if (visibleIndex === this.currentIndex && !this.results[prompt.name]) {
          lines.push('');
          lines.push(`${paddingStr}${this.theme.symbols.arrow} ${prompt.name}`);
          break;
        }
        if (this.results[prompt.name] !== undefined) {
          visibleIndex++;
        }
      }
    }

    // Add border
    if (border) {
      const width = lines.length > 0 ? Math.max(...lines.map(l => l.length)) : 0;
      const borderLine = '─'.repeat(width + padding * 2);
      
      // Ensure at least one line for proper border rendering
      const contentLines = lines.length > 0 ? lines : [''];
      
      return [
        `┌${borderLine}┐`,
        ...contentLines.map(line => `│${paddingStr}${line.padEnd(width)}${paddingStr}│`),
        `└${borderLine}┘`
      ].join('\n');
    }

    return lines.join('\n');
  }

  override async handleInput(): Promise<void> {
    // Group doesn't handle direct input - it manages other prompts
    // Input is handled by individual prompts
  }

  override async prompt(): Promise<Record<string, any> | symbol> {
    this.isRunning = true;

    try {
      // Run each prompt in sequence
      for (let i = 0; i < this.config.prompts.length; i++) {
        const promptItem = this.config.prompts[i];
        
        if (!promptItem) {
          continue;
        }

        // Check condition dynamically
        if (!this.shouldShowPrompt(promptItem)) {
          continue;
        }

        this.currentIndex = Object.keys(this.results).length;

        // Render group state
        this.renderer.render(this.render());

        // Run individual prompt
        const result = await promptItem.prompt.prompt();

        // Check if cancelled
        if (typeof result === 'symbol') {
          return result;
        }

        // Store result
        this.results[promptItem.name] = result;
      }

      this.currentIndex = Object.keys(this.results).length;
      this.state.setState((s: any) => ({ ...s, value: this.results }));
      
      return this.results;
    } finally {
      this.isRunning = false;
    }
  }

  private shouldShowPrompt(prompt: GroupPromptItem): boolean {
    if (!prompt.condition) return true;
    return prompt.condition(this.results);
  }

  private formatResult(name: string, value: any): string {
    if (value === true || value === false) {
      return value ? 'Yes' : 'No';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    return String(value);
  }

  protected override renderFinal(): string {
    const { title, border } = this.config;
    const lines: string[] = [];

    if (title) {
      lines.push(`${this.theme.symbols.success} ${title}`);
    }

    const status = this.state.getState().status;
    if (status === 'cancel') {
      return this.theme.formatters.muted('Cancelled');
    }

    // Show summary of results
    Object.entries(this.results).forEach(([name, value]) => {
      const formatted = this.formatResult(name, value);
      lines.push(`  ${this.theme.formatters.muted('·')} ${name}: ${formatted}`);
    });

    return lines.join('\n');
  }
}

// Helper function to create a group
export function group(
  prompts: Record<string, Prompt<any> | ((results: Record<string, any>) => Prompt<any> | false)>,
  options?: GroupOptions
): GroupPrompt {
  const promptItems: GroupPromptItem[] = Object.entries(prompts).map(([name, promptOrFn]) => {
    if (typeof promptOrFn === 'function') {
      return {
        name,
        prompt: null as any, // Will be created dynamically
        condition: (results) => {
          const result = promptOrFn(results);
          if (result === false) return false;
          // Store the prompt for later use
          (promptItems.find(p => p.name === name) as any).prompt = result;
          return true;
        }
      };
    }
    return {
      name,
      prompt: promptOrFn
    };
  });

  return new GroupPrompt({
    message: options?.title || 'Group',
    prompts: promptItems,
    ...options
  });
}