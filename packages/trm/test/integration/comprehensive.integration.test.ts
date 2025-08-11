import path from 'path';
import { fileURLToPath } from 'url';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');

describe('TRM Comprehensive Integration Tests', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('Core Terminal Functionality', () => {
    it('should handle complete terminal lifecycle', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-lifecycle-${Date.now()}`,
        cols: 100,
        rows: 30
      });

      // Start and initialize
      await tester.start();
      await tester.waitForText('TRM Test Application', { timeout: 5000 });
      
      // Verify initialization
      const screen = await tester.getScreenText();
      expect(screen).toContain('TRM Test Application');
      
      // Test interaction
      await tester.sendKey('a');
      await tester.sleep(100);
      
      const updatedScreen = await tester.getScreenText();
      expect(updatedScreen).toContain('Key pressed: a');
      
      // Clean shutdown
      await tester.sendKey('q');
      await tester.sleep(200);
      
      const finalScreen = await tester.getScreenText();
      expect(finalScreen.trim()).toBe('');
    });

    it('should handle terminal resize events', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-resize-${Date.now()}`,
        cols: 80,
        rows: 24
      });

      await tester.start();
      await tester.waitForText('TRM Test Application');
      
      // Trigger resize
      await tester.resize({ cols: 120, rows: 40 });
      await tester.sleep(300);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Terminal resized to 120x40');
      
      // Resize again
      await tester.resize({ cols: 60, rows: 20 });
      await tester.sleep(300);
      
      const screen2 = await tester.getScreenText();
      expect(screen2).toContain('Terminal resized to 60x20');
    });
  });

  describe('Buffer Management', () => {
    it('should handle screen buffer operations', async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-app.cjs`, {
        sessionName: `trm-buffer-ops-${Date.now()}`,
        cols: 80,
        rows: 40
      });

      await tester.start();
      await tester.waitForText('=== Buffer Test ===', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      
      // Check buffer content
      expect(screen).toContain('Buffer Content:');
      expect(screen).toContain('#####'); // Filled characters
      expect(screen).toContain('Hello');
      expect(screen).toContain('Buffer');
      
      // Check box drawing
      const lines = screen.split('\n');
      const hasBoxDrawing = lines.some(line => 
        line.includes('┌') || line.includes('│') || line.includes('└')
      );
      expect(hasBoxDrawing).toBe(true);
    });

    it('should handle multiple buffers simultaneously', async () => {
      tester = createTester(`node ${fixturesDir}/test-multi-buffer.cjs`, {
        sessionName: `trm-multi-buf-${Date.now()}`
      });

      await tester.start();
      await tester.waitForText('Multiple Buffers Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Buffer 1');
      expect(screen).toContain('Buffer 2');
    });

    it('should handle buffer patches and updates', async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-patch.cjs`, {
        sessionName: `trm-patch-${Date.now()}`
      });

      await tester.start();
      await tester.waitForText('Buffer Patch Test', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Creating patches');
      expect(screen).toContain('Patch applied');
    });
  });

  describe('ANSI and Color Support', () => {
    it('should handle ANSI escape sequences', async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-app.cjs`, {
        sessionName: `trm-ansi-${Date.now()}`
      });

      await tester.start();
      await tester.waitForText('=== ANSI Test ===', { timeout: 5000 });
      
      const screenWithAnsi = await tester.getScreen();
      const screenText = await tester.getScreenText();
      
      // Check ANSI codes present
      expect(screenWithAnsi).toContain('\x1b[31m'); // Red
      expect(screenWithAnsi).toContain('\x1b[1m');  // Bold
      expect(screenWithAnsi).toContain('\x1b[0m');  // Reset
      
      // Check text content
      expect(screenText).toContain('Red text with ANSI');
      expect(screenText).toContain('Bold');
    });

    it('should support 256 color palette', async () => {
      tester = createTester(`node ${fixturesDir}/test-256-colors.cjs`, {
        sessionName: `trm-256col-${Date.now()}`
      });

      await tester.start();
      await tester.waitForText('256 Color Test', { timeout: 5000 });
      
      const screenWithAnsi = await tester.getScreen();
      
      // Check for 256 color ANSI codes
      expect(screenWithAnsi).toContain('\x1b[38;5;'); // Foreground
      expect(screenWithAnsi).toContain('\x1b[48;5;'); // Background
    });

    it('should support RGB true colors', async () => {
      tester = createTester(`node ${fixturesDir}/test-rgb-colors.cjs`, {
        sessionName: `trm-rgb-${Date.now()}`
      });

      await tester.start();
      await tester.waitForText('RGB Color Test', { timeout: 5000 });
      
      const screenWithAnsi = await tester.getScreen();
      
      // Check for RGB ANSI codes
      expect(screenWithAnsi).toContain('\x1b[38;2;'); // RGB foreground
      expect(screenWithAnsi).toContain('\x1b[48;2;'); // RGB background (if used)
    });
  });

  describe('Input Handling', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-input-${Date.now()}`
      });
      await tester.start();
      await tester.waitForText('TRM Test Application');
    });

    it('should handle regular keyboard input', async () => {
      // Test letters
      await tester.sendKey('h');
      await tester.sleep(100);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: h');
      
      // Test numbers
      await tester.sendKey('5');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: 5');
      
      // Test symbols
      await tester.sendKey('!');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: !');
    });

    it('should handle special keys', async () => {
      // Enter key
      await tester.sendKey('Enter');
      await tester.sleep(100);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: Enter');
      
      // Tab key
      await tester.sendKey('Tab');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: Tab');
      
      // Escape key
      await tester.sendKey('Escape');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: Escape');
    });

    it('should handle arrow keys', async () => {
      const arrows = ['Up', 'Down', 'Left', 'Right'];
      
      for (const arrow of arrows) {
        await tester.sendKey(arrow);
        await tester.sleep(100);
        const screen = await tester.getScreenText();
        expect(screen).toContain(`Moved ${arrow}`);
      }
    });

    it('should handle control key combinations', async () => {
      // Ctrl+A
      await tester.sendKey('a', { ctrl: true });
      await tester.sleep(100);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Ctrl+A');
      
      // Ctrl+C (should quit)
      await tester.sendKey('c', { ctrl: true });
      await tester.sleep(200);
      screen = await tester.getScreenText();
      expect(screen.trim()).toBe('');
    });
  });

  describe('Cursor Management', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-cursor-${Date.now()}`
      });
      await tester.start();
      await tester.waitForText('TRM Test Application');
    });

    it('should track cursor position', async () => {
      const screen = await tester.getScreenText();
      expect(screen).toContain('Cursor Position Test');
    });

    it('should move cursor with arrow keys', async () => {
      // Move cursor around
      await tester.sendKey('Right');
      await tester.sleep(100);
      await tester.sendKey('Right');
      await tester.sleep(100);
      await tester.sendKey('Down');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Moved');
    });

    it('should hide and show cursor', async () => {
      // The app should be able to hide/show cursor
      // This is tested by checking ANSI codes
      const screenWithAnsi = await tester.getScreen();
      
      // Look for cursor hide/show sequences
      // \x1b[?25l = hide cursor
      // \x1b[?25h = show cursor
      expect(screenWithAnsi).toMatch(/\x1b\[\?25[lh]/);
    });
  });

  describe('Mouse Support', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-mouse-${Date.now()}`
      });
      await tester.start();
      await tester.waitForText('TRM Test Application');
      await tester.enableMouse();
    });

    it('should handle mouse clicks', async () => {
      await tester.click(20, 10);
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
      expect(screen).toContain('at (20, 10)');
    });

    it('should handle mouse drag', async () => {
      await tester.drag({ x: 10, y: 5 }, { x: 30, y: 15 });
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
    });

    it('should handle scroll events', async () => {
      await tester.scroll('down', 3);
      await tester.sleep(100);
      
      let screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
      
      await tester.scroll('up', 2);
      await tester.sleep(100);
      
      screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
    });
  });

  describe('Terminal Modes', () => {
    it('should handle raw mode', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-raw-mode-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('TRM Test Application');
      
      // In raw mode, keys are processed immediately without Enter
      await tester.sendText('test');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: t');
    });

    it('should handle alternate buffer', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-altbuf-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('TRM Test Application');
      
      // Content is in alternate buffer
      const screen = await tester.getScreenText();
      expect(screen).toContain('TRM Test Application');
      
      // Exit to return to main buffer
      await tester.sendKey('q');
      await tester.sleep(200);
      
      // Main buffer should be restored (empty)
      const finalScreen = await tester.getScreenText();
      expect(finalScreen.trim()).toBe('');
    });
  });

  describe('Performance and Stress Tests', () => {
    it('should handle rapid input', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-rapid-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('TRM Test Application');
      
      // Send many keys rapidly
      const keys = 'abcdefghijklmnopqrstuvwxyz'.split('');
      for (const key of keys) {
        await tester.sendKey(key);
        await tester.sleep(10); // Minimal delay
      }
      
      await tester.sleep(200);
      const screen = await tester.getScreenText();
      
      // Should have processed at least some keys
      expect(screen).toContain('Key pressed:');
    });

    it('should handle large screen updates', async () => {
      tester = createTester(`node ${fixturesDir}/test-buffer-app.cjs`, {
        sessionName: `trm-large-${Date.now()}`,
        cols: 120,
        rows: 50
      });
      
      await tester.start();
      await tester.waitForText('=== Buffer Test ===', { timeout: 5000 });
      
      const screen = await tester.getScreenText();
      
      // Should handle large buffer size
      expect(screen.length).toBeGreaterThan(0);
      expect(screen).toContain('Buffer Content:');
    });
  });

  describe('Error Recovery', () => {
    it('should handle invalid ANSI sequences gracefully', async () => {
      tester = createTester(`node -e "console.log('\\x1b[999mInvalid\\x1b[0m')"`, {
        sessionName: `trm-invalid-ansi-${Date.now()}`
      });
      
      await tester.start();
      await tester.sleep(500);
      
      const screen = await tester.getScreenText();
      // Should still display some text even with invalid sequences
      expect(screen).toBeDefined();
    });

    it('should recover from terminal state corruption', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-app.cjs`, {
        sessionName: `trm-recovery-${Date.now()}`
      });
      
      await tester.start();
      await tester.waitForText('TRM Test Application');
      
      // Send interrupt signal
      await tester.sendKey('c', { ctrl: true });
      await tester.sleep(200);
      
      // Terminal should be restored
      const screen = await tester.getScreenText();
      expect(screen.trim()).toBe('');
    });
  });
});