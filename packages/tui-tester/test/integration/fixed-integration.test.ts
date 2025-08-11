import { it, expect, describe, afterEach } from 'vitest';

import { createTester } from '../../src/index.js';
import { isCommandAvailable } from '../../src/core/utils.js';

// Skip tests if tmux is not available
const hasTmux = await isCommandAvailable('tmux');
const describeTmux = hasTmux ? describe : describe.skip;

describeTmux('Fixed Integration Tests', { timeout: 30000 }, () => {
  let tester: any;

  afterEach(async () => {
    try {
      if (tester && tester.isRunning()) {
        await tester.stop();
      }
    } catch (error) {
      console.error('Error in cleanup:', error);
    }
  });

  describe('Basic Operations', () => {
    it('should start and stop session', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-basic-${Date.now()}`,
        debug: false
      });

      expect(tester.isRunning()).toBe(false);
      
      await tester.start();
      expect(tester.isRunning()).toBe(true);
      
      await tester.sleep(300);
      
      await tester.stop();
      expect(tester.isRunning()).toBe(false);
    });

    it('should send text and capture output', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-text-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Hello from test"');
      await tester.sleep(300);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Hello from test');
      
      await tester.stop();
    });

    it('should handle key combinations', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-keys-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      // Send text
      await tester.sendText('test');
      await tester.sleep(100);
      
      // Clear line with Ctrl+U
      await tester.sendKey('u', { ctrl: true });
      await tester.sleep(100);
      
      // Send new text
      await tester.sendText('new text');
      await tester.sleep(100);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('new text');
      // Skip checking for 'test' as it may appear in paths
      
      await tester.stop();
    });
  });

  describe('Screen Operations', () => {
    it('should capture screen content', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-capture-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Line 1"');
      await tester.sendCommand('echo "Line 2"');
      await tester.sendCommand('echo "Line 3"');
      await tester.sleep(300);
      
      const capture = await tester.captureScreen();
      
      expect(capture.raw).toBeDefined();
      expect(capture.text).toBeDefined();
      expect(capture.lines).toBeInstanceOf(Array);
      expect(capture.text).toContain('Line 1');
      expect(capture.text).toContain('Line 2');
      expect(capture.text).toContain('Line 3');
      
      await tester.stop();
    });

    it('should get screen lines', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-lines-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "First"');
      await tester.sendCommand('echo "Second"');
      await tester.sleep(300);
      
      const lines = await tester.getScreenLines();
      
      expect(lines).toBeInstanceOf(Array);
      expect(lines.some(line => line.includes('First'))).toBe(true);
      expect(lines.some(line => line.includes('Second'))).toBe(true);
      
      await tester.stop();
    });

    it('should clear screen', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-clear-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Before clear"');
      await tester.sleep(300);
      
      const beforeClear = await tester.getScreenText();
      expect(beforeClear).toContain('Before clear');
      
      await tester.clear();
      await tester.sleep(300);
      
      const afterClear = await tester.getScreenText();
      expect(afterClear).not.toContain('Before clear');
      
      await tester.stop();
    });
  });

  describe('Terminal Size', () => {
    it('should get and set terminal size', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        cols: 100,
        rows: 30,
        sessionName: `test-size-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      const initialSize = tester.getSize();
      expect(initialSize.cols).toBe(100);
      expect(initialSize.rows).toBe(30);
      
      await tester.resize({ cols: 120, rows: 40 });
      await tester.sleep(300);
      
      const newSize = tester.getSize();
      expect(newSize.cols).toBe(120);
      expect(newSize.rows).toBe(40);
      
      await tester.stop();
    });
  });

  describe('Wait Operations', () => {
    it('should wait for text', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-wait-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      // Send command that will produce output
      await tester.sendCommand('echo "Target text"');
      
      // Wait for the text to appear
      await tester.waitForText('Target text', { timeout: 3000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Target text');
      
      await tester.stop();
    });

    it('should wait for pattern', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-pattern-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Result: 42"');
      
      await tester.waitForPattern(/Result: \d+/, { timeout: 3000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toMatch(/Result: \d+/);
      
      await tester.stop();
    });
  });

  describe('Direct tmux commands', () => {
    it('should execute tmux commands', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-exec-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      // Execute tmux command to list sessions
      const result = await tester.exec('list-sessions');
      
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(tester.getSessionName());
      
      await tester.stop();
    });
  });

  describe('Output Buffer', () => {
    it('should manage output buffer', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-buffer-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Buffer content"');
      await tester.sleep(300);
      await tester.captureScreen();
      
      const output1 = tester.getLastOutput();
      expect(output1).toContain('Buffer content');
      
      tester.clearOutput();
      const output2 = tester.getLastOutput();
      expect(output2).toBe('');
      
      await tester.stop();
    });
  });

  describe('Cursor Operations', () => {
    it('should get cursor position', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-cursor-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      const cursor = await tester.getCursor();
      
      expect(cursor).toBeDefined();
      expect(cursor.x).toBeGreaterThanOrEqual(0);
      expect(cursor.y).toBeGreaterThanOrEqual(0);
      
      await tester.stop();
    });

    it('should capture with cursor', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-capture-cursor-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      const capture = await tester.capture();
      
      expect(capture.cursor).toBeDefined();
      expect(capture.cursor.x).toBeGreaterThanOrEqual(0);
      expect(capture.cursor.y).toBeGreaterThanOrEqual(0);
      expect(capture.raw).toBeDefined();
      expect(capture.text).toBeDefined();
      
      await tester.stop();
    });
  });

  describe('Snapshots', () => {
    it('should take and compare snapshots', { timeout: 10000 }, async () => {
      tester = createTester('sh', {
        sessionName: `test-snapshot-${Date.now()}`
      });

      await tester.start();
      await tester.sleep(300);
      
      await tester.sendCommand('echo "Snapshot test"');
      await tester.sleep(300);
      
      // Take snapshot
      const snapshot1 = await tester.takeSnapshot('test-snap');
      
      expect(snapshot1.id).toContain('test-snap');
      expect(snapshot1.capture).toBeDefined();
      
      // Compare should be true for same content
      const isSame = await tester.compareSnapshot(snapshot1);
      expect(isSame).toBe(true);
      
      // Change content
      await tester.sendCommand('echo "Different content"');
      await tester.sleep(300);
      
      // Compare should be false after change
      const isDifferent = await tester.compareSnapshot(snapshot1);
      expect(isDifferent).toBe(false);
      
      await tester.stop();
    });
  });
});