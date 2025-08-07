// Wizard component for multi-step flows

import { Prompt } from '../../core/prompt.js';

import type { Key, PromptConfig } from '../../core/types.js';

export interface WizardPage {
  id: string;
  title?: string;
  render: (context: Record<string, any>) => Prompt<any> | string | Promise<Prompt<any> | string>;
  skip?: (context: Record<string, any>) => boolean;
  validate?: (value: any, context: Record<string, any>) => string | undefined | Promise<string | undefined>;
}

export interface WizardOptions {
  title?: string;
  pages: WizardPage[];
  showProgress?: boolean;
  showNavigation?: boolean;
  allowSkip?: boolean;
  allowBack?: boolean;
  onPageChange?: (from: string, to: string, context: Record<string, any>) => void | Promise<void>;
  onComplete?: (context: Record<string, any>) => void | Promise<void>;
}

export class WizardPrompt extends Prompt<Record<string, any>, WizardOptions> {
  private context: Record<string, any> = {};
  private currentPageIndex = 0;
  private pageHistory: number[] = [];
  private isNavigating = false;

  constructor(config: PromptConfig<Record<string, any>, WizardOptions> & WizardOptions) {
    super({
      ...config,
      showProgress: config.showProgress !== false,
      showNavigation: config.showNavigation !== false,
      allowBack: config.allowBack !== false,
      allowSkip: config.allowSkip !== false
    });
  }

  render(): string {
    const lines: string[] = [];
    const { title, pages, showProgress, showNavigation } = this.config;
    
    // Title
    if (title) {
      lines.push(this.theme.formatters.bold(title));
      lines.push('');
    }
    
    // Progress indicator
    if (showProgress) {
      const visiblePages = this.getVisiblePages();
      const currentVisibleIndex = visiblePages.findIndex(p => p === pages[this.currentPageIndex]);
      const progress = this.renderProgress(currentVisibleIndex + 1, visiblePages.length);
      lines.push(progress);
      lines.push('');
    }
    
    // Current page title
    const currentPage = pages[this.currentPageIndex];
    if (currentPage && currentPage.title) {
      lines.push(this.theme.formatters.primary(currentPage.title));
      lines.push('');
    }
    
    // Navigation help
    if (showNavigation && !this.isNavigating) {
      const navHelp = this.renderNavigationHelp();
      if (navHelp) {
        lines.push('');
        lines.push(navHelp);
      }
    }
    
    return lines.join('\n');
  }

  override async handleInput(key: Key): Promise<void> {
    // Navigation is handled in the prompt method
    // This is a placeholder for the base class requirement
  }

  override async prompt(): Promise<Record<string, any> | symbol> {
    const { pages, onPageChange, onComplete } = this.config;

    try {
      while (this.currentPageIndex < pages.length) {
        const currentPage = pages[this.currentPageIndex];
        
        // Check if page should be skipped
        if (!currentPage || (currentPage.skip && currentPage.skip(this.context))) {
          this.currentPageIndex++;
          continue;
        }
        
        // Render wizard chrome
        this.renderer.render(this.render());
        
        // Render page content
        const pageContent = await currentPage.render(this.context);
        
        // Handle string content (display panel)
        if (typeof pageContent === 'string') {
          const panel = new PanelPrompt({
            message: currentPage.title || 'Wizard Page',
            content: pageContent,
            actions: this.getNavigationActions(),
            border: 'rounded'
          });
          
          const action = await panel.prompt();
          
          if (typeof action === 'symbol') {
            return action;
          }
          
          // Handle navigation
          if (action === 'back') {
            await this.navigateBack();
          } else if (action === 'skip') {
            await this.navigateNext();
          } else {
            await this.navigateNext();
          }
        } else {
          // Handle prompt content
          const result = await pageContent.prompt();
          
          if (typeof result === 'symbol') {
            // Check if it's our navigation symbols
            if (result === Symbol.for('kit.wizard.back')) {
              await this.navigateBack();
              continue;
            } else if (result === Symbol.for('kit.wizard.skip')) {
              await this.navigateNext();
              continue;
            } else {
              // Cancel
              return result;
            }
          }
          
          // Validate result
          if (currentPage.validate) {
            const error = await currentPage.validate(result, this.context);
            if (error) {
              // Show error and retry
              this.state.setState((s: any) => ({ ...s, error }));
              continue;
            }
          }
          
          // Store result and move forward
          this.context[currentPage.id] = result;
          await this.navigateNext();
        }
      }
      
      // Complete
      if (onComplete) {
        await onComplete(this.context);
      }
      
      this.state.setState((s: any) => ({ ...s, value: this.context }));
      return this.context;
      
    } catch (error) {
      this.handleError(error as Error);
      return Symbol.for('kit.cancel');
    }
  }

  private async navigateNext(): Promise<void> {
    const { pages, onPageChange } = this.config;
    const fromPage = pages[this.currentPageIndex];
    
    this.pageHistory.push(this.currentPageIndex);
    this.currentPageIndex++;
    
    // Skip pages that should be skipped
    while (this.currentPageIndex < pages.length) {
      const page = pages[this.currentPageIndex];
      if (page && (!page.skip || !page.skip(this.context))) {
        break;
      }
      this.currentPageIndex++;
    }
    
    if (this.currentPageIndex < pages.length && onPageChange) {
      const toPage = pages[this.currentPageIndex];
      if (fromPage && toPage) {
        await onPageChange(fromPage.id, toPage.id, this.context);
      }
    }
  }

  private async navigateBack(): Promise<void> {
    if (this.pageHistory.length === 0) return;
    
    const { pages, onPageChange } = this.config;
    const fromPage = pages[this.currentPageIndex];
    
    this.currentPageIndex = this.pageHistory.pop()!;
    
    if (onPageChange) {
      const toPage = pages[this.currentPageIndex];
      if (fromPage && toPage) {
        await onPageChange(fromPage.id, toPage.id, this.context);
      }
    }
  }

  private getVisiblePages(): WizardPage[] {
    return this.config.pages.filter(page => !page.skip || !page.skip(this.context));
  }

  private renderProgress(current: number, total: number): string {
    const filled = '●';
    const empty = '○';
    const dots: string[] = [];
    
    for (let i = 1; i <= total; i++) {
      if (i < current) {
        dots.push(this.theme.formatters.success(filled));
      } else if (i === current) {
        dots.push(this.theme.formatters.primary(filled));
      } else {
        dots.push(this.theme.formatters.muted(empty));
      }
    }
    
    return dots.join(' ') + this.theme.formatters.muted(` (${current}/${total})`);
  }

  private renderNavigationHelp(): string {
    const { allowBack, allowSkip } = this.config;
    const helps: string[] = [];
    
    if (allowBack && this.pageHistory.length > 0) {
      helps.push(`${this.theme.formatters.muted('←')} Back`);
    }
    
    if (allowSkip) {
      helps.push(`${this.theme.formatters.muted('Tab')} Skip`);
    }
    
    helps.push(`${this.theme.formatters.muted('Esc')} Cancel`);
    
    return this.theme.formatters.muted(helps.join('  ·  '));
  }

  private getNavigationActions(): PanelAction[] {
    const { allowBack, allowSkip } = this.config;
    const actions: PanelAction[] = [];
    
    if (allowBack && this.pageHistory.length > 0) {
      actions.push({ label: 'Back', value: 'back' });
    }
    
    actions.push({ label: 'Next', value: 'next', primary: true });
    
    if (allowSkip) {
      actions.push({ label: 'Skip', value: 'skip' });
    }
    
    return actions;
  }

  protected override renderFinal(): string {
    const { title, pages } = this.config;
    const completedPages = pages.filter(p => this.context[p.id] !== undefined);
    
    if (this.state.getState().status === 'cancel') {
      return this.theme.formatters.muted('Wizard cancelled');
    }
    
    const lines: string[] = [];
    lines.push(`${this.theme.symbols.success} ${title || 'Wizard completed'}`);
    
    completedPages.forEach(page => {
      const value = this.context[page.id];
      const formatted = this.formatPageResult(value);
      lines.push(`  ${this.theme.formatters.muted('·')} ${page.title || page.id}: ${formatted}`);
    });
    
    return lines.join('\n');
  }

  private formatPageResult(value: any): string {
    if (value === true || value === false) {
      return value ? 'Yes' : 'No';
    }
    if (Array.isArray(value)) {
      return value.join(', ');
    }
    if (typeof value === 'object' && value !== null) {
      return Object.keys(value).length + ' fields';
    }
    return String(value);
  }
}

// Import PanelPrompt for display pages
import { PanelPrompt, type PanelAction } from './panel.js';

// Helper function to create a wizard
export function wizard(options: WizardOptions): WizardPrompt {
  return new WizardPrompt({
    message: options.title || 'Wizard',
    ...options
  });
}