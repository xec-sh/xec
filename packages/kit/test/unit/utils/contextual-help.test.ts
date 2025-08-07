import { it, vi, expect, describe } from 'vitest';

import { createDefaultTheme } from '../../../src/themes/default.js';
import { 
  withHelp, 
  createHelp, 
  ContextualHelp,
  type HelpContent,
  renderMarkdownHelp 
} from '../../../src/utils/contextual-help.js';

describe('ContextualHelp', () => {
  describe('basic functionality', () => {
    it('should create help instance', () => {
      const help = new ContextualHelp({
        content: 'Test help content',
      });
      
      expect(help).toBeDefined();
      expect(help.isVisible()).toBe(false);
    });

    it('should toggle help visibility', () => {
      const help = new ContextualHelp({
        content: 'Test help',
      });
      
      help.toggle();
      expect(help.isVisible()).toBe(true);
      
      help.toggle();
      expect(help.isVisible()).toBe(false);
    });

    it('should show and hide help', () => {
      const help = new ContextualHelp({
        content: 'Test help',
      });
      
      help.show();
      expect(help.isVisible()).toBe(true);
      
      help.hide();
      expect(help.isVisible()).toBe(false);
    });

    it('should identify help key', () => {
      const help = new ContextualHelp({
        content: 'Test help',
        key: '?',
      });
      
      expect(help.isHelpKey('?')).toBe(true);
      expect(help.isHelpKey('h')).toBe(false);
    });

    it('should use custom help key', () => {
      const help = new ContextualHelp({
        content: 'Test help',
        key: 'h',
      });
      
      expect(help.isHelpKey('h')).toBe(true);
      expect(help.isHelpKey('?')).toBe(false);
    });

    it('should respect enabled flag', () => {
      const help = new ContextualHelp({
        content: 'Test help',
        enabled: false,
      });
      
      expect(help.isHelpKey('?')).toBe(false);
      
      help.show();
      expect(help.isVisible()).toBe(false);
    });
  });

  describe('content resolution', () => {
    it('should handle string content', () => {
      const help = new ContextualHelp({
        content: 'Simple help text',
      });
      
      help.show();
      const output = help.render();
      
      expect(output).toContain('Simple help text');
    });

    it('should handle HelpContent object', () => {
      const content: HelpContent = {
        title: 'Help Title',
        content: 'Help content',
        shortcuts: [
          { key: 'Enter', description: 'Select item' },
          { key: 'Esc', description: 'Cancel' },
        ],
      };
      
      const help = new ContextualHelp({ content });
      help.show();
      const output = help.render();
      
      expect(output).toContain('Help Title');
      expect(output).toContain('Help content');
      expect(output).toContain('Enter');
      expect(output).toContain('Select item');
    });

    it('should handle function content', () => {
      let counter = 0;
      const help = new ContextualHelp({
        content: () => `Dynamic content: ${++counter}`,
      });
      
      help.show();
      expect(help.render()).toContain('Dynamic content: 1');
      expect(help.render()).toContain('Dynamic content: 2');
    });
  });

  describe('rendering', () => {
    it('should render help box', () => {
      const help = new ContextualHelp({
        content: {
          title: 'Test Help',
          content: 'Line 1\nLine 2\nLine 3',
        },
      });
      
      help.show();
      const output = help.render();
      
      expect(output).toContain('┌─ Test Help ─┐');
      expect(output).toContain('│ Line 1');
      expect(output).toContain('│ Line 2');
      expect(output).toContain('│ Line 3');
      expect(output).toContain('└───────────────┘');
    });

    it('should render shortcuts section', () => {
      const help = new ContextualHelp({
        content: {
          content: 'Main content',
          shortcuts: [
            { key: 'Ctrl+C', description: 'Copy' },
            { key: 'Ctrl+V', description: 'Paste' },
          ],
        },
      });
      
      help.show();
      const output = help.render();
      
      expect(output).toContain('├───────────────┤'); // Divider
      expect(output).toContain('Ctrl+C');
      expect(output).toContain('Copy');
      expect(output).toContain('Ctrl+V');
      expect(output).toContain('Paste');
    });

    it('should pad content to consistent width', () => {
      const help = new ContextualHelp({
        content: {
          content: 'Short\nA much longer line that should determine the width',
        },
      });
      
      help.show();
      const output = help.render();
      const lines = output.split('\n');
      
      // Find content lines (those with │)
      const contentLines = lines.filter(l => l.includes('│'));
      const widths = contentLines.map(l => l.length);
      
      // All content lines should have same width
      expect(new Set(widths).size).toBe(1);
    });

    it('should return empty string when not visible', () => {
      const help = new ContextualHelp({
        content: 'Test content',
      });
      
      expect(help.render()).toBe('');
    });

    it('should return empty string when disabled', () => {
      const help = new ContextualHelp({
        content: 'Test content',
        enabled: false,
      });
      
      help.show();
      expect(help.render()).toBe('');
    });

    it('should render inline help hint', () => {
      const help = new ContextualHelp({
        content: 'Test help',
      });
      
      const inline = help.renderInline();
      expect(inline).toContain('Press ? for help');
    });

    it('should use custom key in inline hint', () => {
      const help = new ContextualHelp({
        content: 'Test help',
        key: 'h',
      });
      
      const inline = help.renderInline();
      expect(inline).toContain('Press h for help');
    });

    it('should apply theme colors', () => {
      const theme = createDefaultTheme();
      const help = new ContextualHelp({
        content: {
          title: 'Themed Help',
          content: 'Themed content',
        },
        theme,
      });
      
      help.show();
      const output = help.render();
      
      // Check if theme actually applies colors
      const hasColors = theme.formatters.primary('test') !== 'test';
      
      if (hasColors) {
        // Should contain ANSI color codes
        expect(output).toMatch(/\x1b\[\d+m/);
      } else {
        // Should at least render the content
        expect(output).toContain('Themed Help');
        expect(output).toContain('Themed content');
      }
    });
  });

  describe('events', () => {
    it('should emit toggle event', () => {
      const toggleHandler = vi.fn();
      const help = new ContextualHelp({
        content: 'Test',
      });
      
      help.on('toggle', toggleHandler);
      
      help.toggle();
      expect(toggleHandler).toHaveBeenCalledWith(true);
      
      help.toggle();
      expect(toggleHandler).toHaveBeenCalledWith(false);
    });

    it('should emit show event', () => {
      const showHandler = vi.fn();
      const help = new ContextualHelp({
        content: 'Test',
      });
      
      help.on('show', showHandler);
      
      help.show();
      expect(showHandler).toHaveBeenCalled();
    });

    it('should emit hide event', () => {
      const hideHandler = vi.fn();
      const help = new ContextualHelp({
        content: 'Test',
      });
      
      help.on('hide', hideHandler);
      
      help.show();
      help.hide();
      expect(hideHandler).toHaveBeenCalled();
    });
  });

  describe('createHelp helper', () => {
    it('should create help instance', () => {
      const help = createHelp({
        content: 'Test help',
      });
      
      expect(help).toBeInstanceOf(ContextualHelp);
    });
  });

  describe('renderMarkdownHelp', () => {
    it('should render headers', () => {
      const markdown = '# Title\n## Subtitle';
      const rendered = renderMarkdownHelp(markdown);
      
      expect(rendered).toContain('Title');
      expect(rendered).toContain('Subtitle');
      expect(rendered).not.toContain('#');
    });

    it('should render bold text', () => {
      const markdown = 'This is **bold** text';
      const rendered = renderMarkdownHelp(markdown);
      
      expect(rendered).toContain('bold');
      expect(rendered).not.toContain('**');
    });

    it('should render code', () => {
      const markdown = 'Use `npm install` to install';
      const rendered = renderMarkdownHelp(markdown);
      
      expect(rendered).toContain('npm install');
      expect(rendered).not.toContain('`');
    });

    it('should render lists', () => {
      const markdown = '- Item 1\n* Item 2\n- Item 3';
      const rendered = renderMarkdownHelp(markdown);
      
      expect(rendered).toContain('• Item 1');
      expect(rendered).toContain('• Item 2');
      expect(rendered).toContain('• Item 3');
    });

    it('should render blockquotes', () => {
      const markdown = '> This is a quote';
      const rendered = renderMarkdownHelp(markdown);
      
      expect(rendered).toContain('│ This is a quote');
    });

    it('should apply theme colors', () => {
      const theme = createDefaultTheme();
      const markdown = '# Title\n**Bold** and `code`';
      const rendered = renderMarkdownHelp(markdown, theme);
      
      // Check if theme actually applies colors
      const hasColors = theme.formatters.primary('test') !== 'test';
      
      if (hasColors) {
        // Should contain ANSI codes
        expect(rendered).toMatch(/\x1b\[\d+m/);
      } else {
        // Should at least render the content correctly
        expect(rendered).toContain('Title');
        expect(rendered).toContain('Bold');
        expect(rendered).toContain('code');
      }
    });
  });

  describe('withHelp mixin', () => {
    class TestPrompt {
      theme?: any;
      constructor(public options: any) {}
      render() { return 'test'; }
    }

    it('should add help functionality to class', () => {
      const PromptWithHelp = withHelp(TestPrompt);
      const instance = new PromptWithHelp({
        help: {
          content: 'Test help',
        },
      });
      
      expect(instance.help).toBeDefined();
      expect(instance.handleHelpKey).toBeDefined();
      expect(instance.renderHelp).toBeDefined();
      expect(instance.isHelpVisible).toBeDefined();
    });

    it('should handle help key in mixin', () => {
      const PromptWithHelp = withHelp(TestPrompt);
      const instance = new PromptWithHelp({
        help: {
          content: 'Test help',
        },
      });
      
      expect(instance.handleHelpKey('?')).toBe(true);
      expect(instance.isHelpVisible()).toBe(true);
      
      expect(instance.handleHelpKey('?')).toBe(true);
      expect(instance.isHelpVisible()).toBe(false);
    });

    it('should hide help on other keys', () => {
      const PromptWithHelp = withHelp(TestPrompt);
      const instance = new PromptWithHelp({
        help: {
          content: 'Test help',
        },
      });
      
      instance.handleHelpKey('?');
      expect(instance.isHelpVisible()).toBe(true);
      
      instance.handleHelpKey('a');
      expect(instance.isHelpVisible()).toBe(false);
    });

    it('should render help in mixin', () => {
      const PromptWithHelp = withHelp(TestPrompt);
      const instance = new PromptWithHelp({
        help: {
          content: 'Mixin help content',
        },
      });
      
      // Should show inline hint
      let output = instance.renderHelp();
      expect(output).toContain('Press ? for help');
      
      // Toggle help
      instance.handleHelpKey('?');
      
      // Should show full help
      output = instance.renderHelp();
      expect(output).toContain('Mixin help content');
    });

    it('should work without help options', () => {
      const PromptWithHelp = withHelp(TestPrompt);
      const instance = new PromptWithHelp({});
      
      expect(instance.help).toBeUndefined();
      expect(instance.handleHelpKey('?')).toBe(false);
      expect(instance.renderHelp()).toBe('');
      expect(instance.isHelpVisible()).toBe(false);
    });

    it('should trigger re-render on toggle', () => {
      const renderSpy = vi.fn();
      
      class TestPromptWithRender {
        theme?: any;
        constructor(public options: any) {}
        render = renderSpy;
      }
      
      const PromptWithHelp = withHelp(TestPromptWithRender);
      const instance = new PromptWithHelp({
        help: {
          content: 'Test',
        },
      });
      
      renderSpy.mockClear();
      instance.handleHelpKey('?');
      
      expect(renderSpy).toHaveBeenCalled();
    });
  });

  describe('positions', () => {
    it('should handle different positions', () => {
      const helpInline = new ContextualHelp({
        content: {
          content: 'Inline help',
          position: 'inline',
        },
      });
      
      const helpOverlay = new ContextualHelp({
        content: {
          content: 'Overlay help',
          position: 'overlay',
        },
      });
      
      const helpBottom = new ContextualHelp({
        content: {
          content: 'Bottom help',
          position: 'bottom',
        },
      });
      
      helpInline.show();
      helpOverlay.show();
      helpBottom.show();
      
      const inlineOutput = helpInline.render();
      const overlayOutput = helpOverlay.render();
      const bottomOutput = helpBottom.render();
      
      // Overlay should not have leading newline
      expect(overlayOutput.startsWith('\n')).toBe(false);
      
      // Inline and bottom should have leading newline
      expect(inlineOutput.startsWith('\n')).toBe(true);
      expect(bottomOutput.startsWith('\n')).toBe(true);
    });
  });
});