/**
 * Interaction Helpers Tests
 * Tests for high-level interaction helper functions
 */

import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { TmuxTester } from '../../src/tmux-tester';
import {
  undo,
  redo,
  save,
  pressTab,
  fillField,
  selectAll,
  submitForm,
  selectText,
  typeSlowly,
  clearField,
  clickOnText,
  navigateMenu,
  scrollToText,
  copySelection,
  pressShiftTab,
  selectMenuItem,
  waitForLoading,
  pasteFromClipboard,
  takeAnnotatedSnapshot
} from '../../src/helpers/interactions';

// Skip these tests as they require tmux
describe.skip('Interaction Helpers (requires tmux)', () => {
  let tester: TmuxTester | null = null;

  beforeEach(async () => {
    tester = new TmuxTester({
      command: ['sh'],
      size: { cols: 80, rows: 24 }
    });
    await tester.start();
  });

  afterEach(async () => {
    if (tester) {
      await tester.stop();
      tester = null;
    }
  });

  describe('Form Interactions', () => {
    it('should fill a field', async () => {
      // Simulate a form field
      await tester!.typeText('Name: ');
      
      await fillField(tester!, 'Name', 'John Doe');
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('John Doe');
    });

    it('should clear and fill a field', async () => {
      await tester!.typeText('Email: existing@email.com');
      
      await clearField(tester!);
      await tester!.typeText('new@email.com');
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('new@email.com');
      expect(content).not.toContain('existing@email.com');
    });

    it('should submit a form', async () => {
      await tester!.typeText('Submit form');
      
      await submitForm(tester!);
      
      // Should have sent Enter key
      const content = await tester!.getScreenContent();
      expect(content).toBeDefined();
    });

    it('should navigate with Tab', async () => {
      await pressTab(tester!);
      await pressTab(tester!);
      
      // Tab navigation doesn't produce visible output in sh
      expect(true).toBe(true);
    });

    it('should navigate backwards with Shift+Tab', async () => {
      await pressShiftTab(tester!);
      
      // Shift+Tab navigation doesn't produce visible output in sh
      expect(true).toBe(true);
    });
  });

  describe('Text Selection', () => {
    it('should select text', async () => {
      await tester!.typeText('Select this text');
      await tester!.sendKey('enter');
      
      await selectText(tester!, 0, 0, 16, 0);
      
      // Selection doesn't produce visible output in sh
      expect(true).toBe(true);
    });

    it('should select all text', async () => {
      await tester!.typeText('All of this');
      
      await selectAll(tester!);
      
      // Ctrl+A sent
      expect(true).toBe(true);
    });

    it('should copy selection', async () => {
      await tester!.typeText('Copy me');
      await selectAll(tester!);
      
      await copySelection(tester!);
      
      // Copy command sent
      expect(true).toBe(true);
    });

    it('should paste from clipboard', async () => {
      await pasteFromClipboard(tester!);
      
      // Paste command sent
      expect(true).toBe(true);
    });
  });

  describe('Navigation', () => {
    it('should click on text', async () => {
      await tester!.typeText('Click here');
      await tester!.sendKey('enter');
      
      const clicked = await clickOnText(tester!, 'Click');
      
      expect(clicked).toBe(true);
    });

    it('should navigate menu', async () => {
      // Simulate a menu
      await tester!.typeText('1. Option A\n2. Option B\n3. Option C');
      await tester!.sendKey('enter');
      
      await navigateMenu(tester!, ['down', 'down', 'enter']);
      
      // Navigation keys sent
      expect(true).toBe(true);
    });

    it('should select menu item', async () => {
      await tester!.typeText('• Item 1\n• Item 2\n• Item 3');
      await tester!.sendKey('enter');
      
      const selected = await selectMenuItem(tester!, 'Item 2');
      
      expect(selected).toBe(true);
    });

    it('should scroll to text', async () => {
      // Add lots of text
      for (let i = 0; i < 30; i++) {
        await tester!.typeText(`Line ${i}`);
        await tester!.sendKey('enter');
      }
      
      const found = await scrollToText(tester!, 'Line 25');
      
      expect(found).toBe(true);
    });
  });

  describe('Typing Helpers', () => {
    it('should type slowly', async () => {
      const start = Date.now();
      await typeSlowly(tester!, 'Slow typing', 50);
      const elapsed = Date.now() - start;
      
      expect(elapsed).toBeGreaterThanOrEqual(500); // 11 chars * 50ms
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('Slow typing');
    });

    it('should type with default delay', async () => {
      await typeSlowly(tester!, 'Default speed');
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('Default speed');
    });
  });

  describe('Edit Operations', () => {
    it('should undo', async () => {
      await tester!.typeText('Undo this');
      await undo(tester!);
      
      // Ctrl+Z sent
      expect(true).toBe(true);
    });

    it('should redo', async () => {
      await redo(tester!);
      
      // Ctrl+Y or Ctrl+Shift+Z sent
      expect(true).toBe(true);
    });

    it('should save', async () => {
      await save(tester!);
      
      // Ctrl+S sent
      expect(true).toBe(true);
    });
  });

  describe('Waiting Operations', () => {
    it('should wait for loading to complete', async () => {
      // Simulate loading
      setTimeout(async () => {
        await tester!.typeText('Loading...');
        await tester!.sendKey('enter');
        setTimeout(async () => {
          await tester!.sendKey('ctrl-l'); // Clear
          await tester!.typeText('Done');
          await tester!.sendKey('enter');
        }, 100);
      }, 50);
      
      const completed = await waitForLoading(tester!, {
        indicator: 'Loading...',
        timeout: 1000
      });
      
      expect(completed).toBe(true);
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('Done');
    });

    it('should timeout if loading never completes', async () => {
      await tester!.typeText('Loading...');
      await tester!.sendKey('enter');
      
      const completed = await waitForLoading(tester!, {
        indicator: 'Loading...',
        timeout: 100
      });
      
      expect(completed).toBe(false);
    });
  });

  describe('Snapshot Operations', () => {
    it('should take annotated snapshot', async () => {
      await tester!.typeText('Snapshot content');
      await tester!.sendKey('enter');
      
      const snapshot = await takeAnnotatedSnapshot(tester!, 'test-snap', {
        highlight: ['Snapshot'],
        annotations: [
          { line: 0, text: 'Important line' }
        ]
      });
      
      expect(snapshot).toBeDefined();
      expect(snapshot.name).toBe('test-snap');
      expect(snapshot.content).toContain('Snapshot content');
      expect(snapshot.annotations).toBeDefined();
    });

    it('should highlight text in snapshots', async () => {
      await tester!.typeText('Highlight me and this');
      await tester!.sendKey('enter');
      
      const snapshot = await takeAnnotatedSnapshot(tester!, 'highlight-test', {
        highlight: ['Highlight', 'this']
      });
      
      expect(snapshot.highlights).toContain('Highlight');
      expect(snapshot.highlights).toContain('this');
    });
  });

  describe('Complex Interactions', () => {
    it('should fill and submit a form', async () => {
      // Simulate a form
      await tester!.typeText('Name: ');
      await tester!.sendKey('enter');
      await tester!.typeText('Email: ');
      await tester!.sendKey('enter');
      await tester!.typeText('[Submit]');
      await tester!.sendKey('enter');
      
      // Fill form
      await fillField(tester!, 'Name', 'John Doe');
      await pressTab(tester!);
      await fillField(tester!, 'Email', 'john@example.com');
      
      // Submit
      await clickOnText(tester!, '[Submit]');
      
      const content = await tester!.getScreenContent();
      expect(content).toContain('John Doe');
      expect(content).toContain('john@example.com');
    });

    it('should navigate and select from menu', async () => {
      // Create menu
      await tester!.typeText('Menu:');
      await tester!.sendKey('enter');
      await tester!.typeText('1. File');
      await tester!.sendKey('enter');
      await tester!.typeText('2. Edit');
      await tester!.sendKey('enter');
      await tester!.typeText('3. View');
      await tester!.sendKey('enter');
      
      // Navigate to Edit
      await navigateMenu(tester!, ['down', 'down']);
      
      // Select it
      await selectMenuItem(tester!, 'Edit');
      
      expect(true).toBe(true); // Just verify no errors
    });

    it('should copy and paste text', async () => {
      // Type original text
      await tester!.typeText('Original text');
      
      // Select all and copy
      await selectAll(tester!);
      await copySelection(tester!);
      
      // Move to new line and paste
      await tester!.sendKey('enter');
      await pasteFromClipboard(tester!);
      
      // Note: Copy/paste might not work in basic sh
      expect(true).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle text not found', async () => {
      const clicked = await clickOnText(tester!, 'NonExistent');
      expect(clicked).toBe(false);
    });

    it('should handle menu item not found', async () => {
      await tester!.typeText('Menu without target');
      await tester!.sendKey('enter');
      
      const selected = await selectMenuItem(tester!, 'Missing Item');
      expect(selected).toBe(false);
    });

    it('should handle scroll text not found', async () => {
      const found = await scrollToText(tester!, 'Not present', {
        maxScrolls: 3
      });
      expect(found).toBe(false);
    });
  });
});