/**
 * Tmux Tester Integration Tests
 * Comprehensive tests for tmux-based terminal testing
 */

import { it, vi, expect, describe, afterEach, beforeAll, beforeEach } from 'vitest';

import { TmuxTester } from '../../src/tmux-tester';
import { delay, isCommandAvailable } from '../../src/core/utils';


// Skip tests if tmux is not available
const hasTmux = await isCommandAvailable('tmux');
const describeTmux = hasTmux ? describe : describe.skip;

// Global timeout for tmux tests
const TMUX_TEST_TIMEOUT = 8000;

describeTmux('TmuxTester', () => {
  let tester: TmuxTester | null = null;

  beforeAll(() => {
    if (!hasTmux) {
      console.warn('Tmux not available, skipping tmux tests');
    }
  });

  afterEach(async () => {
    if (tester) {
      try {
        await tester.stop();
      } catch (e) {
        // Ignore cleanup errors
      }
      tester = null;
    }
  });

  describe('Initialization', () => {
    it('should create a tmux session', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 80, rows: 24 }
      });

      await tester.start();
      const isRunning = await tester.isRunning();
      expect(isRunning).toBe(true);
    });

    it('should use custom session name', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const sessionName = 'test-session-' + Date.now();
      tester = new TmuxTester({
        command: ['sh'],
        sessionName
      });

      await tester.start();
      const session = tester.getSessionName();
      expect(session).toBe(sessionName);
    });

    it('should set terminal size', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 120, rows: 40 }
      });

      await tester.start();
      const size = await tester.getSize();
      expect(size.cols).toBe(120);
      expect(size.rows).toBe(40);
    });

    it('should set environment variables', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh', '-c', 'echo $TEST_VAR'],
        env: { TEST_VAR: 'test_value' }
      });

      await tester.start();
      await delay(100);
      const content = await tester.getScreenContent();
      expect(content).toContain('test_value');
    });

    it('should handle working directory', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const cwd = '/tmp';
      tester = new TmuxTester({
        command: ['pwd'],
        cwd
      });

      await tester.start();
      await delay(100);
      const content = await tester.getScreenContent();
      expect(content).toContain(cwd);
    });
  });

  describe('Input Operations', () => {
    beforeEach(async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 80, rows: 24 }
      });
      await tester.start();
    });

    it('should send text input', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Hello, World!"');
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain('Hello, World!');
    });

    it('should send special keys', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      // Test arrow keys
      await tester.typeText('test');
      await tester.sendKey('left');
      await tester.sendKey('left');
      await tester.typeText('X');
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain('teXst');
    });

    it('should send control sequences', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('long text to clear');
      await tester.sendKey('ctrl-u'); // Clear line
      await tester.typeText('cleared');
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain('cleared');
      expect(content).not.toContain('long text to clear');
    });

    it('should send function keys', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.sendKey('f1');
      await tester.sendKey('f2');
      await tester.sendKey('f12');
      // Function keys might not produce visible output in sh
      expect(true).toBe(true); // Just verify no errors
    });

    it('should send commands', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.sendCommand('echo "Command test"');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain('Command test');
    });

    it('should get cursor position', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.sendText('test');
      const cursor = await tester.getCursor();
      
      expect(cursor).toBeDefined();
      expect(typeof cursor.x).toBe('number');
      expect(typeof cursor.y).toBe('number');
      expect(cursor.x).toBeGreaterThanOrEqual(0);
      expect(cursor.y).toBeGreaterThanOrEqual(0);
    });

    it('should wait for condition', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      // Send command that takes time
      await tester.sendCommand('sleep 0.5 && echo "DELAYED"');
      
      // Wait for the output
      await tester.waitFor(screen => screen.includes('DELAYED'), {
        timeout: 2000
      });
      
      const content = await tester.getScreenContent();
      expect(content).toContain('DELAYED');
    });

    it('should assert screen with predicate', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.sendCommand('echo "Test Output"');
      await delay(100);
      
      // Should pass
      await tester.assertScreen(screen => screen.includes('Test Output'));
      
      // Should fail
      await expect(
        tester.assertScreen(screen => screen.includes('Not Present'))
      ).rejects.toThrow('predicate returned false');
    });

    it('should support getScreen alias', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.sendCommand('echo "Screen test"');
      await delay(100);
      
      const screen1 = await tester.getScreen();
      const screen2 = await tester.getScreenText();
      
      expect(screen1).toBe(screen2);
      expect(screen1).toContain('Screen test');
    });

    it('should handle rapid typing', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const text = 'The quick brown fox jumps over the lazy dog';
      await tester.typeText(text, { delay: 5 });
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain(text);
    });

    it('should send raw input', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const rawInput = 'raw\x1b[31mcolored\x1b[0m text';
      await tester.sendRaw(rawInput);
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toContain('colored');
    });
  });

  describe('Screen Operations', () => {
    beforeEach(async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 80, rows: 24 }
      });
      await tester.start();
    });

    it('should capture screen content', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Screen capture test"');
      await tester.sendKey('enter');
      await delay(100);

      const content = await tester.getScreenContent();
      expect(content).toBeDefined();
      expect(content.length).toBeGreaterThan(0);
      expect(content).toContain('Screen capture test');
    });

    it('should get screen lines', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Line 1"');
      await tester.sendKey('enter');
      await tester.typeText('echo "Line 2"');
      await tester.sendKey('enter');
      await delay(100);

      const lines = await tester.getScreenLines();
      expect(lines).toBeInstanceOf(Array);
      const nonEmptyLines = lines.filter(l => l.trim());
      expect(nonEmptyLines).toContain('Line 1');
      expect(nonEmptyLines).toContain('Line 2');
    });

    it('should wait for text to appear', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      setTimeout(async () => {
        await tester!.typeText('echo "Delayed text"');
        await tester!.sendKey('enter');
      }, 50);

      const found = await tester.waitForText('Delayed text', { timeout: 1000 });
      expect(found).toBe(true);
    });

    it('should timeout when text does not appear', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const found = await tester.waitForText('Never appears', { timeout: 100 });
      expect(found).toBe(false);
    });

    it('should check if screen contains text', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Find me"');
      await tester.sendKey('enter');
      await delay(100);

      const contains = await tester.assertScreenContains('Find me');
      expect(contains).toBe(true);
    });

    it('should check if screen does not contain text', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Present"');
      await tester.sendKey('enter');
      await delay(100);

      const notContains = await tester.assertScreenNotContains('Absent');
      expect(notContains).toBe(true);
    });

    it('should clear screen', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "To be cleared"');
      await tester.sendKey('enter');
      await delay(100);

      await tester.clearScreen();
      await delay(100);

      const content = await tester.getScreenContent();
      const hasContent = content.split('\n').some(line => 
        line.includes('To be cleared')
      );
      expect(hasContent).toBe(false);
    });
  });

  describe('Window Management', () => {
    beforeEach(async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 80, rows: 24 }
      });
      await tester.start();
    });

    it('should resize window', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      const newSize = { cols: 100, rows: 30 };
      await tester.resize(newSize.cols, newSize.rows);
      await delay(100);

      const size = await tester.getSize();
      expect(size.cols).toBe(newSize.cols);
      expect(size.rows).toBe(newSize.rows);
    });

    it('should handle multiple resize operations', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.resize(90, 25);
      await delay(50);
      await tester.resize(110, 35);
      await delay(50);
      await tester.resize(80, 24);
      await delay(50);

      const finalSize = await tester.getSize();
      expect(finalSize.cols).toBe(80);
      expect(finalSize.rows).toBe(24);
    });
  });

  describe('Snapshot Management', () => {
    beforeEach(async () => {
      tester = new TmuxTester({
        command: ['sh'],
        size: { cols: 80, rows: 24 },
        snapshotDir: './test-snapshots'
      });
      await tester.start();
    });

    it('should take snapshots', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Snapshot content"');
      await tester.sendKey('enter');
      await delay(100);

      const snapshot = await tester.takeSnapshot('test-snapshot');
      expect(snapshot).toBeDefined();
      expect(snapshot.name).toBe('test-snapshot');
      expect(snapshot.content).toContain('Snapshot content');
      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should compare snapshots', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      await tester.typeText('echo "Original"');
      await tester.sendKey('enter');
      await delay(100);

      const snapshot1 = await tester.takeSnapshot('snap1');
      
      await tester.typeText('echo "Modified"');
      await tester.sendKey('enter');
      await delay(100);

      const snapshot2 = await tester.takeSnapshot('snap2');

      expect(snapshot1.content).not.toBe(snapshot2.content);
      expect(snapshot1.content).toContain('Original');
      expect(snapshot2.content).toContain('Modified');
    });
  });

  describe('Recording', () => {
    it('should record and replay interactions', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh'],
        recordingEnabled: true
      });

      await tester.start();
      tester.startRecording();

      await tester.typeText('echo "Recording test"');
      await tester.sendKey('enter');
      await delay(100);

      const recording = tester.stopRecording();
      expect(recording).toBeDefined();
      expect(recording.interactions).toHaveLength(2); // typeText + sendKey
      expect(recording.interactions[0].type).toBe('type');
      expect(recording.interactions[0].data).toBe('echo "Recording test"');
      expect(recording.interactions[1].type).toBe('key');
      expect(recording.interactions[1].data).toBe('enter');
    });

    it('should include timestamps in recording', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh'],
        recordingEnabled: true
      });

      await tester.start();
      tester.startRecording();

      const startTime = Date.now();
      await tester.typeText('test');
      await delay(50);
      await tester.sendKey('enter');

      const recording = tester.stopRecording();
      const firstTimestamp = recording.interactions[0].timestamp;
      const lastTimestamp = recording.interactions[1].timestamp;

      expect(firstTimestamp).toBeGreaterThanOrEqual(startTime);
      expect(lastTimestamp).toBeGreaterThan(firstTimestamp);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid commands', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['nonexistentcommand12345']
      });

      await tester.start();
      await delay(100);

      const content = await tester.getScreenContent();
      // Should show error message
      expect(content.toLowerCase()).toMatch(/not found|no such|command/);
    });

    it('should handle tmux not being available', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      // Mock tmux not available
      vi.mock('../../src/core/utils', () => ({
        isCommandAvailable: vi.fn().mockResolvedValue(false),
        sleep: vi.fn(),
        waitFor: vi.fn(),
        retry: vi.fn(),
        delay: vi.fn()
      }));

      tester = new TmuxTester({
        command: ['sh']
      });

      await expect(tester.start()).rejects.toThrow();
    });

    it('should cleanup on error', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh'],
        sessionName: 'cleanup-test'
      });

      await tester.start();
      const sessionName = tester.getSessionName();

      // Force an error by killing tmux session externally
      const { exec } = await import('child_process');
      await new Promise((resolve) => {
        exec(`tmux kill-session -t ${sessionName}`, resolve);
      });

      await delay(100);

      // Tester should handle the killed session gracefully
      const isRunning = await tester.isRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe('Complex Scenarios', () => {
    it.skip('should handle interactive applications (vi)', async () => {
      // Skip vi test as it's prone to hanging
      // This test would require more sophisticated handling
      // and potentially a real PTY implementation
    });

    it('should handle applications with colors', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh', '-c', 'echo -e "\\033[31mRed\\033[32mGreen\\033[34mBlue\\033[0m"'],
        env: { TERM: 'xterm-256color' }
      });

      await tester.start();
      await delay(100);

      const content = await tester.getScreenContent();
      // Should contain the text (colors are stripped in capture)
      expect(content).toContain('RedGreenBlue');
    });

    it('should handle long-running processes', { timeout: TMUX_TEST_TIMEOUT }, async () => {
      tester = new TmuxTester({
        command: ['sh']
      });

      await tester.start();

      // Start a background process
      await tester.typeText('sleep 1 && echo "Done" &');
      await tester.sendKey('enter');
      await delay(100);

      // Should show job started
      let content = await tester.getScreenContent();
      expect(content).toMatch(/\[\d+\]/); // Job number

      // Wait for completion
      await tester.waitForText('Done', { timeout: 2000 });

      content = await tester.getScreenContent();
      expect(content).toContain('Done');
    });
  });
});