import path from 'path';
import { fileURLToPath } from 'url';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('Buffer and ANSI Integration Tests', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('Buffer Operations', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-app.cjs`, {
        sessionName: `trm-buffer-${Date.now()}`,
        cols: 80,
        rows: 35
      });
      await tester.start();
      await tester.waitForText('=== Buffer Test ===', { timeout: 5000 });
    });

    it('should create and render buffer', async () => {
      const screen = await tester.getScreenText();
      
      expect(screen).toContain('=== Buffer Test ===');
      expect(screen).toContain('Buffer Content:');
    });

    it('should fill buffer with characters', async () => {
      const screen = await tester.getScreenText();
      
      // Buffer was filled with '#' characters
      expect(screen).toContain('#####');
    });

    it('should write text to buffer', async () => {
      const screen = await tester.getScreenText();
      
      // Check text written to buffer
      expect(screen).toContain('Hello');
      expect(screen).toContain('Buffer');
    });

    it('should draw box in buffer', async () => {
      const screen = await tester.getScreenText();
      
      // Box drawing characters should be present
      // The box is drawn with single-line characters
      const lines = screen.split('\n');
      
      // Find lines that contain box drawing
      const boxLines = lines.filter(line => 
        line.includes('┌') || 
        line.includes('─') || 
        line.includes('┐') ||
        line.includes('│') ||
        line.includes('└') ||
        line.includes('┘')
      );
      
      expect(boxLines.length).toBeGreaterThan(0);
    });

    it('should draw lines in buffer', async () => {
      const screen = await tester.getScreenText();
      
      // Horizontal line drawn with '-'
      expect(screen).toContain('---');
    });
  });

  describe('ANSI Sequences', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-app.cjs`, {
        sessionName: `trm-ansi-${Date.now()}`,
        cols: 80,
        rows: 35
      });
      await tester.start();
      await tester.waitForText('=== ANSI Test ===', { timeout: 5000 });
    });

    it('should move cursor with ANSI sequences', async () => {
      const screen = await tester.getScreenText();
      
      // Text should appear at specific cursor position
      expect(screen).toContain('Cursor moved here');
    });

    it('should apply foreground colors with ANSI', async () => {
      const screenWithAnsi = await tester.getScreen(); // With ANSI codes
      const screenText = await tester.getScreenText(); // Without ANSI codes
      
      // Check for red color code
      expect(screenWithAnsi).toContain('\x1b[31m');
      
      // Check text content
      expect(screenText).toContain('Red text with ANSI');
    });

    it('should apply background colors with ANSI', async () => {
      const screenWithAnsi = await tester.getScreen();
      const screenText = await tester.getScreenText();
      
      // Check for green background code
      expect(screenWithAnsi).toContain('\x1b[42m');
      
      // Check text content
      expect(screenText).toContain('Green background');
    });

    it('should apply text styles with ANSI', async () => {
      const screenWithAnsi = await tester.getScreen();
      const screenText = await tester.getScreenText();
      
      // Check for style codes
      expect(screenWithAnsi).toContain('\x1b[1m'); // Bold
      expect(screenWithAnsi).toContain('\x1b[3m'); // Italic
      expect(screenWithAnsi).toContain('\x1b[4m'); // Underline
      
      // Check text content
      expect(screenText).toContain('Bold');
      expect(screenText).toContain('Italic');
      expect(screenText).toContain('Underline');
    });

    it('should handle scroll regions', async () => {
      const screen = await tester.getScreenText();
      
      // Scroll region content should be present
      expect(screen).toContain('Scroll region line');
    });

    it('should clear lines with ANSI', async () => {
      const screen = await tester.getScreenText();
      
      // Line should be cleared (the text "Clear line test" should be partially cleared)
      const lines = screen.split('\n');
      const clearLine = lines.find(line => line.includes('Clear'));
      
      // The line was cleared from cursor position
      expect(clearLine).toBeDefined();
    });

    it('should save and restore cursor position', async () => {
      const screen = await tester.getScreenText();
      
      // Text should show cursor was saved and restored
      expect(screen).toContain('Save position - back');
    });

    it('should reset ANSI styles', async () => {
      const screenWithAnsi = await tester.getScreen();
      
      // Reset sequence should be present
      expect(screenWithAnsi).toContain('\x1b[0m');
    });
  });

  describe('Complex Buffer Scenarios', () => {
    it('should handle multiple buffers', async () => {
      tester = createTester(`node ${fixturesDir}/test-multi-buffer.cjs`, {
        sessionName: `trm-multi-buffer-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Multiple Buffers Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Buffer 1');
      expect(screen).toContain('Buffer 2');
      expect(screen).toContain('###'); // Buffer content
    });

    it('should handle buffer patches and diffs', async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-patch.cjs`, {
        sessionName: `trm-buffer-patch-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('Buffer Patch Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Creating patches');
      expect(screen).toContain('Patch applied');
    });
  });

  describe('ANSI Color Palette', () => {
    it('should support 256 colors', async () => {
      tester = createTester(`node ${fixturesDir}/test-256-colors.cjs`, {
        sessionName: `trm-256-colors-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('256 Color Test', { timeout: 5000 });
      
      const screenWithAnsi = await tester.getScreen();
      const screenText = await tester.getScreenText();
      
      // Check for 256 color sequences
      expect(screenWithAnsi).toContain('\x1b[38;5;'); // Foreground 256
      expect(screenWithAnsi).toContain('\x1b[48;5;'); // Background 256
      
      expect(screenText).toContain('Color Palette');
    });

    it('should support RGB colors', async () => {
      tester = createTester(`node ${fixturesDir}/test-rgb-colors.cjs`, {
        sessionName: `trm-rgb-colors-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('RGB Color Test', { timeout: 5000 });
      
      const screenWithAnsi = await tester.getScreen();
      const screenText = await tester.getScreenText();
      
      // Check for RGB color sequences
      expect(screenWithAnsi).toContain('\x1b[38;2;'); // RGB foreground
      
      // Check text content
      expect(screenText).toContain('RGB Colors');
    });
  });
});