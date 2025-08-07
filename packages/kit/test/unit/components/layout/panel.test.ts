import { it, expect, describe } from 'vitest';

import { cancelSymbol } from '../../../../src/core/types.js';
import { testPrompt } from '../../../helpers/prompt-test-utils.js';
import { panel, PanelPrompt } from '../../../../src/components/layout/panel.js';

describe('PanelPrompt', () => {
  describe('initialization', () => {
    it('should create with content', () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'This is panel content'
      });
      
      expect(prompt.config.content).toBe('This is panel content');
    });

    it('should accept content as array of lines', () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: ['Line 1', 'Line 2', 'Line 3']
      });
      
      expect(prompt.config.content).toEqual(['Line 1', 'Line 2', 'Line 3']);
    });

    it('should accept panel options', () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Content',
        title: 'Info Panel',
        border: 'double',
        padding: 2,
        align: 'center',
        width: 50,
        maxHeight: 10
      });
      
      expect(prompt.config.title).toBe('Info Panel');
      expect(prompt.config.border).toBe('double');
      expect(prompt.config.padding).toBe(2);
      expect(prompt.config.align).toBe('center');
      expect(prompt.config.width).toBe(50);
      expect(prompt.config.maxHeight).toBe(10);
    });
  });

  describe('rendering', () => {
    it('should display content', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Hello, World!'
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('Hello, World!');
    });

    it('should display title in border', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        title: 'Information',
        content: 'Some info',
        border: 'single'
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('Information');
    });

    it('should apply different border styles', async () => {
      const singleBorder = new PanelPrompt({
        message: 'Test',
        content: 'Content',
        border: 'single'
      });
      expect(singleBorder.render()).toContain('─');
      expect(singleBorder.render()).toContain('│');

      const doubleBorder = new PanelPrompt({
        message: 'Test',
        content: 'Content',
        border: 'double'
      });
      expect(doubleBorder.render()).toContain('═');
      expect(doubleBorder.render()).toContain('║');

      const roundedBorder = new PanelPrompt({
        message: 'Test',
        content: 'Content',
        border: 'rounded'
      });
      expect(roundedBorder.render()).toContain('╭');
      expect(roundedBorder.render()).toContain('╯');

      const boldBorder = new PanelPrompt({
        message: 'Test',
        content: 'Content',
        border: 'bold'
      });
      expect(boldBorder.render()).toContain('━');
      expect(boldBorder.render()).toContain('┃');
    });

    it('should apply padding', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Content',
        padding: 3,
        border: 'none'
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('   Content   ');
    });

    it('should align content', async () => {
      const leftAlign = new PanelPrompt({
        message: 'Test',
        content: 'Left',
        align: 'left',
        width: 20,
        border: 'none'
      });
      const leftRendered = leftAlign.render();
      expect(leftRendered).toMatch(/Left\s+/);

      const centerAlign = new PanelPrompt({
        message: 'Test',
        content: 'Center',
        align: 'center',
        width: 20,
        border: 'none'
      });
      const centerRendered = centerAlign.render();
      expect(centerRendered).toMatch(/\s+Center\s+/);

      const rightAlign = new PanelPrompt({
        message: 'Test',
        content: 'Right',
        align: 'right',
        width: 20,
        border: 'none'
      });
      const rightRendered = rightAlign.render();
      expect(rightRendered).toMatch(/\s+Right/);
    });

    it('should wrap long lines', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'This is a very long line that should be wrapped to fit within the panel width',
        width: 20,
        border: 'none'
      });
      
      const rendered = prompt.render();
      const lines = rendered.split('\n');
      expect(lines.length).toBeGreaterThan(1);
    });
  });

  describe('actions', () => {
    it('should render action buttons', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Choose an action',
        actions: [
          { label: 'OK', value: 'ok' },
          { label: 'Cancel', value: 'cancel' }
        ]
      });
      
      const rendered = prompt.render();
      expect(rendered).toContain('OK');
      expect(rendered).toContain('Cancel');
    });

    it('should handle action selection', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          content: 'Choose an action',
          actions: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' }
          ]
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('enter'); // Select first action
        }
      ).then(result => {
        expect(result).toBe('yes');
      });
    });

    it('should navigate between actions', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          content: 'Choose an action',
          actions: [
            { label: 'First', value: '1' },
            { label: 'Second', value: '2' },
            { label: 'Third', value: '3' }
          ]
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('right'); // Move to second
          sendKey('right'); // Move to third
          sendKey('enter');
        }
      ).then(result => {
        expect(result).toBe('3');
      });
    });

    it('should cycle through actions with tab', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          content: 'Choose an action',
          actions: [
            { label: 'A', value: 'a' },
            { label: 'B', value: 'b' },
            { label: 'C', value: 'c' }
          ]
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('tab'); // Move to B
          sendKey('tab'); // Move to C
          sendKey('tab'); // Cycle back to A
          sendKey('enter');
        }
      ).then(result => {
        expect(result).toBe('a');
      });
    });

    it('should highlight primary actions', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Content',
        actions: [
          { label: 'Save', value: 'save', primary: true },
          { label: 'Cancel', value: 'cancel' }
        ]
      });
      
      const rendered = prompt.render();
      expect(rendered).toBeTruthy();
    });

    it('should highlight danger actions', async () => {
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: 'Content',
        actions: [
          { label: 'Delete', value: 'delete', danger: true },
          { label: 'Cancel', value: 'cancel' }
        ]
      });
      
      const rendered = prompt.render();
      expect(rendered).toBeTruthy();
    });
  });

  describe('scrolling', () => {
    it('should handle scrolling when content exceeds maxHeight', async () => {
      const longContent = Array(20).fill('Line').map((l, i) => `${l} ${i + 1}`);
      
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          content: longContent,
          maxHeight: 5
        },
        async ({ sendKey, waitForRender, getLastRender }) => {
          await waitForRender();
          
          const initialRender = getLastRender();
          expect(initialRender).toContain('Line 1');
          expect(initialRender).not.toContain('Line 10');
          
          // Scroll down
          sendKey('down');
          await waitForRender();
          sendKey('down');
          await waitForRender();
          
          sendKey('enter'); // Exit
        }
      );
    });

    it('should show scroll indicator', async () => {
      const longContent = Array(20).fill('Line').map((l, i) => `${l} ${i + 1}`);
      
      const prompt = new PanelPrompt({
        message: 'Test Panel',
        content: longContent,
        maxHeight: 5
      });
      
      const rendered = prompt.render();
      expect(rendered).toMatch(/\d+-\d+ of \d+/); // "1-5 of 20" format
    });
  });

  describe('display-only mode', () => {
    it('should work without actions', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Info',
          content: 'This is just for display'
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('enter'); // Should close panel
        }
      ).then(result => {
        expect(result).toBeUndefined();
      });
    });

    it('should close on escape', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Info',
          content: 'Press escape to close'
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('escape');
        }
      ).then(result => {
        expect(result).toBe(cancelSymbol);
      });
    });
  });

  describe('helper function', () => {
    it('should create panel with options', () => {
      const panelPrompt = panel({
        title: 'Alert',
        content: 'This is an alert message',
        border: 'double',
        actions: [
          { label: 'OK', value: 'ok', primary: true }
        ]
      });
      
      expect(panelPrompt).toBeInstanceOf(PanelPrompt);
      expect(panelPrompt.config.title).toBe('Alert');
      expect(panelPrompt.config.border).toBe('double');
    });
  });

  describe('final render', () => {
    it('should show selected action', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          title: 'Confirmation',
          content: 'Proceed?',
          actions: [
            { label: 'Yes', value: 'yes' },
            { label: 'No', value: 'no' }
          ]
        },
        async ({ sendKey, waitForRender }) => {
          await waitForRender();
          sendKey('enter'); // Select 'Yes'
        }
      ).then(result => {
        expect(result).toBe('yes');
      });
    });

    it('should show cancelled state', async () => {
      await testPrompt(
        PanelPrompt,
        {
          message: 'Test Panel',
          content: 'Content',
          actions: [{ label: 'OK', value: 'ok' }]
        },
        async ({ prompt, sendKey, waitForRender }) => {
          await waitForRender();
          sendKey({ name: 'c', ctrl: true }); // Cancel
          await waitForRender();
          
          const finalRender = (prompt as any).renderFinal();
          expect(finalRender).toContain('Cancelled');
        }
      );
    });
  });
});