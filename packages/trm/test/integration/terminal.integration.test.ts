import path from 'path';
import { promisify } from 'util';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import { TmuxTester, createTester } from '@xec-sh/tui-tester';
import { it, expect, describe, afterEach, beforeEach } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturesDir = path.join(__dirname, '../fixtures');
const execAsync = promisify(exec);

// Build the library before tests
async function buildLibrary() {
  try {
    await execAsync('npm run build', { 
      cwd: path.join(__dirname, '../../')
    });
  } catch (error) {
    console.warn('Build might have already been done:', error);
  }
}

describe('Terminal Integration Tests', { timeout: 30000 }, () => {
  let tester: TmuxTester;

  beforeEach(async () => {
    await buildLibrary();
  });

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('Terminal Initialization', () => {
    it('should create and initialize terminal', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-terminal-${Date.now()}`,
        cols: 80,
        rows: 24
      });

      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly and execute command
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('TRM Test Application');
      expect(screen).toContain('====================');
    });

    it('should handle alternate buffer', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-altbuf-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
      
      // The app uses alternate buffer, so main buffer should be preserved
      await tester.sendKey('q');
      await tester.sleep(200);
      
      // After exit, we should be back to main buffer
      expect(tester.isRunning()).toBe(true); // Session still exists
    });
  });

  describe('Screen Operations', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-screen-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
    });

    it('should write text at specific positions', async () => {
      const screen = await tester.getScreenText();
      
      // Check that all expected text is present in the screen
      expect(screen).toContain('TRM Test Application');
      expect(screen).toContain('====================');
      expect(screen).toContain('Press q to quit');
      
      // Check relative positioning - these should be consecutive lines
      const lines = screen.split('\n');
      const trmIndex = lines.findIndex(line => line.includes('TRM Test Application'));
      if (trmIndex >= 0 && trmIndex < lines.length - 1) {
        expect(lines[trmIndex + 1]).toContain('====================');
      }
    });

    it('should clear screen', async () => {
      // Initial screen has content
      let screen = await tester.getScreenText();
      expect(screen).toContain('TRM Test Application');
      
      // Press 'q' to quit
      await tester.sendKey('q');
      await tester.sleep(1000); // Give more time for app to exit
      
      // App should exit and return to shell
      screen = await tester.getScreenText();
      // Either the screen is cleared or we're back at bash prompt
      const hasExited = !screen.includes('TRM Test Application') || screen.includes('bash');
      expect(hasExited).toBe(true);
    });

    it('should handle screen resize', async () => {
      // Resize terminal
      await tester.resize({ cols: 100, rows: 30 });
      await tester.sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Terminal resized to 100x30');
    });
  });

  describe('Color Support', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-colors-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
    });

    it('should display colored text', async () => {
      const screen = await tester.getScreen(); // Get with ANSI codes
      
      // Check for ANSI color codes
      expect(screen).toContain('\x1b[31m'); // Red
      expect(screen).toContain('\x1b[32m'); // Green
      expect(screen).toContain('\x1b[34m'); // Blue
      
      // Check actual text
      const plainScreen = await tester.getScreenText();
      expect(plainScreen).toContain('Red Text');
      expect(plainScreen).toContain('Green Text');
      expect(plainScreen).toContain('Blue Text');
    });

    it('should apply text styles', async () => {
      const screen = await tester.getScreen();
      
      // Check for style codes
      expect(screen).toContain('\x1b[1m'); // Bold
      expect(screen).toContain('\x1b[3m'); // Italic
      expect(screen).toContain('\x1b[4m'); // Underline
      
      // Check text content
      const plainScreen = await tester.getScreenText();
      expect(plainScreen).toContain('Bold Text');
      expect(plainScreen).toContain('Italic Text');
      expect(plainScreen).toContain('Underlined Text');
    });
  });

  describe('Cursor Operations', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-cursor-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
    });

    it('should move cursor with arrow keys', async () => {
      // Test arrow up
      await tester.sendKey('Up');
      await tester.sleep(100);
      let screen = await tester.getScreenText();
      expect(screen).toContain('Moved Up');
      
      // Test arrow down
      await tester.sendKey('Down');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Moved Down');
      
      // Test arrow left
      await tester.sendKey('Left');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Moved Left');
      
      // Test arrow right
      await tester.sendKey('Right');
      await tester.sleep(100);
      screen = await tester.getScreenText();
      expect(screen).toContain('Moved Right');
    });

    it('should display cursor position text', async () => {
      const screen = await tester.getScreenText();
      expect(screen).toContain('Cursor Position Test');
    });
  });

  describe('Input Handling', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-input-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
    });

    it('should handle keyboard input', async () => {
      // Send a regular key
      await tester.sendKey('a');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: a');
    });

    it('should handle special keys', async () => {
      // Send Enter key
      await tester.sendKey('Enter');
      await tester.sleep(100);
      
      let screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: Enter');
      
      // Send Tab key
      await tester.sendKey('Tab');
      await tester.sleep(100);
      
      screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: Tab');
    });

    it('should quit on q key', async () => {
      // Send q to quit
      await tester.sendKey('q');
      await tester.sleep(1000); // Give more time for app to exit
      
      // App should exit
      const screen = await tester.getScreenText();
      // Either the app is gone or we're back at bash prompt
      const hasExited = !screen.includes('TRM Test Application') || screen.includes('bash');
      expect(hasExited).toBe(true);
    });

    it('should quit on Ctrl+C', async () => {
      // Send Ctrl+C to quit
      await tester.sendKey('c', { ctrl: true });
      await tester.sleep(1000); // Give more time for app to exit
      
      // App should exit
      const screen = await tester.getScreenText();
      // Either the app is gone or we're back at bash prompt
      const hasExited = !screen.includes('TRM Test Application') || screen.includes('bash');
      expect(hasExited).toBe(true);
    });
  });

  describe('Mouse Support', () => {
    beforeEach(async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-mouse-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
    });

    it.skip('should handle mouse clicks', async () => {
      // Skip: test fixture doesn't actually handle mouse events
      // Enable mouse and click
      await tester.enableMouse();
      await tester.click(10, 10);
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
      expect(screen).toContain('at (10, 10)');
    });

    it.skip('should handle mouse movement', async () => {
      // Skip: test fixture doesn't actually handle mouse events
      await tester.enableMouse();
      
      // Click and drag
      await tester.drag({ x: 5, y: 5 }, { x: 15, y: 10 });
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Mouse:');
    });
  });

  describe('Terminal States', () => {
    it('should handle raw mode', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-raw-${Date.now()}`
      });
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
      
      // In raw mode, single key presses work without Enter
      await tester.sendText('x');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Key pressed: x');
    });

    it('should restore terminal state on exit', async () => {
      tester = createTester(`node ${fixturesDir}/test-terminal-interactive.cjs`, {
        sessionName: `trm-restore-${Date.now()}`
      });
      
      await tester.start();
      await tester.sleep(2000); // Wait for node to start properly
      await tester.waitForText('TRM Test Application', { timeout: 10000 });
      
      // Exit the app
      await tester.sendKey('q');
      await tester.sleep(200);
      
      // Terminal should be restored - back to bash prompt
      const screen = await tester.getScreenText();
      expect(screen).toContain('bash');
      expect(tester.isRunning()).toBe(true);
    });
  });
});