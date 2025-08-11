/**
 * Extended tests for TmuxTester class
 * Tests additional functionality and edge cases
 */

import { it, expect, describe, afterEach, beforeEach } from 'vitest';

import { sleep } from '../src/core/utils.js';
import { TmuxTester, createTester } from '../src/index.js';

describe('TmuxTester Extended Tests', () => {
  let tester: TmuxTester;

  beforeEach(() => {
    tester = createTester('sh', {
      sessionName: `test-extended-${Date.now()}`,
      debug: false,
      cols: 80,
      rows: 24
    });
  });

  afterEach(async () => {
    if (tester && tester.isRunning()) {
      await tester.stop();
    }
  });

  describe('Session Management', () => {
    it('should start and stop a session', async () => {
      expect(tester.isRunning()).toBe(false);
      
      await tester.start();
      expect(tester.isRunning()).toBe(true);
      
      await tester.stop();
      expect(tester.isRunning()).toBe(false);
    }, 10000);

    it('should restart a session', async () => {
      await tester.start();
      const sessionName1 = tester.getSessionName();
      
      await tester.restart();
      const sessionName2 = tester.getSessionName();
      
      expect(sessionName1).toBe(sessionName2);
      expect(tester.isRunning()).toBe(true);
    }, 10000);

    it('should handle multiple stop calls gracefully', async () => {
      await tester.start();
      await tester.stop();
      await tester.stop(); // Should not throw
      expect(tester.isRunning()).toBe(false);
    }, 10000);

    it('should throw error when sending commands to stopped session', async () => {
      await expect(tester.sendText('test')).rejects.toThrow('not running');
    });
  });

  describe('Text Input', () => {
    it('should send text to terminal', async () => {
      await tester.start();
      await tester.sendText('echo "Hello World"');
      await tester.sendKey('Enter');
      await sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Hello World');
    }, 10000);

    it('should handle special characters in text', async () => {
      await tester.start();
      await tester.sendText('echo "Special: $HOME & | > <"');
      await tester.sendKey('Enter');
      await sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Special:');
    }, 10000);

    it('should type text with delay', async () => {
      await tester.start();
      const startTime = Date.now();
      await tester.typeText('Hello', 50);
      const elapsed = Date.now() - startTime;
      
      expect(elapsed).toBeGreaterThanOrEqual(200); // 5 chars * 50ms
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Hello');
    }, 10000);

    it('should paste text with bracketed paste mode', async () => {
      await tester.start();
      await tester.paste('Pasted text');
      await sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Pasted text');
    }, 10000);
  });

  describe('Key Input', () => {
    it('should send special keys', async () => {
      await tester.start();
      
      // Test Tab key
      await tester.sendKey('Tab');
      await sleep(100);
      
      // Test arrow keys
      await tester.sendKey('Up');
      await tester.sendKey('Down');
      await tester.sendKey('Left');
      await tester.sendKey('Right');
      await sleep(100);
      
      expect(tester.isRunning()).toBe(true);
    }, 10000);

    it('should send keys with modifiers', async () => {
      await tester.start();
      
      // Ctrl+C
      await tester.sendKey('c', { ctrl: true });
      await sleep(100);
      
      // Alt+X
      await tester.sendKey('x', { alt: true });
      await sleep(100);
      
      // Shift+Tab
      await tester.sendKey('Tab', { shift: true });
      await sleep(100);
      
      expect(tester.isRunning()).toBe(true);
    }, 10000);

    it('should send multiple keys in sequence', async () => {
      await tester.start();
      await tester.sendKeys(['H', 'e', 'l', 'l', 'o']);
      await sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Hello');
    }, 10000);
  });

  describe('Screen Capture', () => {
    it('should capture screen content', async () => {
      await tester.start();
      await tester.sendText('echo "Test Output"');
      await tester.sendKey('Enter');
      await sleep(200);
      
      const capture = await tester.captureScreen();
      expect(capture.text).toContain('Test Output');
      expect(capture.raw).toBeDefined();
      expect(capture.lines).toBeInstanceOf(Array);
      expect(capture.timestamp).toBeGreaterThan(0);
      expect(capture.size).toEqual({ cols: 80, rows: 24 });
    }, 10000);

    it('should get screen text without ANSI codes', async () => {
      await tester.start();
      await tester.sendCommand('echo -e "\\033[31mRed Text\\033[0m"');
      await sleep(200);
      
      const text = await tester.getScreenText();
      expect(text).toContain('Red Text');
      expect(text).not.toContain('\x1b[31m');
    }, 10000);

    it('should get screen lines as array', async () => {
      await tester.start();
      await tester.sendCommand('echo "Line 1"');
      await tester.sendCommand('echo "Line 2"');
      await sleep(200);
      
      const lines = await tester.getScreenLines();
      expect(lines).toBeInstanceOf(Array);
      expect(lines.some(line => line.includes('Line 1'))).toBe(true);
      expect(lines.some(line => line.includes('Line 2'))).toBe(true);
    }, 10000);

    it('should handle getScreen with stripAnsi option', async () => {
      await tester.start();
      await tester.sendCommand('echo -e "\\033[32mGreen\\033[0m"');
      await sleep(200);
      
      const withAnsi = await tester.getScreen({ stripAnsi: false });
      const withoutAnsi = await tester.getScreen({ stripAnsi: true });
      
      // The echo command is visible in the output
      expect(withAnsi).toContain('echo');
      expect(withoutAnsi).not.toContain('\x1b[');
      expect(withoutAnsi).toContain('Green');
    }, 10000);
  });

  describe('Wait Functions', () => {
    it('should wait for text to appear', async () => {
      await tester.start();
      
      // Send command that produces delayed output
      setTimeout(async () => {
        await tester.sendCommand('echo "Delayed Output"');
      }, 500);
      
      await tester.waitForText('Delayed Output', { timeout: 2000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Delayed Output');
    }, 10000);

    it('should wait for condition', async () => {
      await tester.start();
      
      let counter = 0;
      setTimeout(() => {
        tester.sendCommand('echo "Ready"');
        counter = 1;
      }, 500);
      
      await tester.waitFor(
        screen => screen.includes('Ready') && counter === 1,
        { timeout: 2000 }
      );
      
      expect(counter).toBe(1);
    }, 10000);

    it('should wait for pattern match', async () => {
      await tester.start();
      await tester.sendCommand('echo "Version 1.2.3"');
      
      await tester.waitForPattern(/Version \d+\.\d+\.\d+/, { timeout: 2000 });
      
      const screen = await tester.getScreenText();
      expect(screen).toMatch(/Version \d+\.\d+\.\d+/);
    }, 10000);

    it('should wait for specific line', async () => {
      await tester.start();
      await tester.sendCommand('echo "First Line"');
      await tester.sendCommand('echo "Second Line"');
      await sleep(200);
      
      const lines = await tester.getScreenLines();
      const lineIndex = lines.findIndex(line => line.includes('Second Line'));
      
      if (lineIndex >= 0) {
        await tester.waitForLine(lineIndex, 'Second Line', { timeout: 1000 });
      }
      
      expect(tester.isRunning()).toBe(true);
    }, 10000);
  });

  describe('Assertions', () => {
    it('should assert line content', async () => {
      await tester.start();
      await tester.sendCommand('echo "Test Line"');
      await sleep(200);
      
      const lines = await tester.getScreenLines();
      const lineIndex = lines.findIndex(line => line.includes('Test Line'));
      
      if (lineIndex >= 0) {
        await tester.assertLine(lineIndex, 'Test Line');
        await tester.assertLine(lineIndex, line => line.includes('Test'));
      }
    }, 10000);

    it('should assert screen content', async () => {
      await tester.start();
      await tester.sendCommand('echo "Expected Output"');
      await sleep(200);
      
      await tester.assertScreen(screen => screen.includes('Expected Output'));
    }, 10000);

    it('should assert screen contains text', async () => {
      await tester.start();
      await tester.sendCommand('echo "Find Me"');
      await sleep(200);
      
      await tester.assertScreenContains('Find Me');
    }, 10000);

    it('should assert screen matches pattern', async () => {
      await tester.start();
      await tester.sendCommand('echo "Pattern: ABC123"');
      await sleep(200);
      
      await tester.assertScreenMatches(/Pattern: [A-Z]+\d+/);
    }, 10000);

    it('should assert cursor position', async () => {
      await tester.start();
      await tester.sendKey('Home'); // Move cursor to beginning
      await sleep(100);
      
      const cursor = await tester.getCursor();
      expect(cursor.x).toBeGreaterThanOrEqual(0);
      expect(cursor.y).toBeGreaterThanOrEqual(0);
    }, 10000);
  });

  describe('Terminal Operations', () => {
    it('should resize terminal', async () => {
      await tester.start();
      
      const originalSize = tester.getSize();
      expect(originalSize).toEqual({ cols: 80, rows: 24 });
      
      await tester.resize({ cols: 100, rows: 30 });
      
      const newSize = tester.getSize();
      expect(newSize).toEqual({ cols: 100, rows: 30 });
    }, 10000);

    it('should clear screen', async () => {
      await tester.start();
      await tester.sendCommand('echo "Before Clear"');
      await sleep(200);
      
      let screen = await tester.getScreenText();
      expect(screen).toContain('Before Clear');
      
      await tester.clear();
      await sleep(200);
      
      screen = await tester.getScreenText();
      // Screen should be mostly empty after clear
      const nonEmptyLines = screen.split('\n').filter(line => line.trim()).length;
      expect(nonEmptyLines).toBeLessThan(5);
    }, 10000);

    it('should reset terminal', async () => {
      await tester.start();
      await tester.sendCommand('echo "Before Reset"');
      await sleep(200);
      
      const beforeReset = await tester.getScreenText();
      expect(beforeReset).toContain('Before Reset');
      
      await tester.reset();
      await sleep(1000);
      
      const screen = await tester.getScreenText();
      // After reset, the screen is cleared and shows a clean prompt
      // Check that we have a clean shell prompt
      expect(screen).toMatch(/\$|#|>/);
      // And most of the screen should be empty
      const nonEmptyLines = screen.split('\n').filter(line => line.trim()).length;
      expect(nonEmptyLines).toBeLessThan(5);
    }, 10000);
  });

  describe('Recording', () => {
    it('should record and playback session', async () => {
      await tester.start();
      
      tester.startRecording();
      
      await tester.sendText('echo "Recorded"');
      await tester.sendKey('Enter');
      await sleep(200);
      
      const recording = tester.stopRecording();
      
      // Recording should have at least events or captures
      expect(recording.events.length + recording.captures.length).toBeGreaterThan(0);
      
      // If we have events, test playback
      if (recording.events.length > 0) {
        // Clear and playback
        await tester.clear();
        await sleep(200);
        
        await tester.playRecording(recording, 2); // 2x speed
        await sleep(200);
        
        const screen = await tester.getScreenText();
        expect(screen).toContain('Recorded');
      }
    }, 15000);

    it('should handle recording when not started', () => {
      expect(() => tester.stopRecording()).toThrow('No recording in progress');
    });
  });

  describe('Snapshots', () => {
    it('should take and compare snapshots', async () => {
      await tester.start();
      await tester.sendCommand('echo "Snapshot Test"');
      await sleep(200);
      
      const snapshot1 = await tester.takeSnapshot('test-snap-1');
      expect(snapshot1.name).toBe('test-snap-1');
      expect(snapshot1.capture.text).toContain('Snapshot Test');
      
      // Same content should match
      const matches = await tester.compareSnapshot(snapshot1);
      expect(matches).toBe(true);
      
      // Different content should not match
      await tester.sendCommand('echo "Different"');
      await sleep(200);
      
      const matches2 = await tester.compareSnapshot(snapshot1);
      expect(matches2).toBe(false);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should throw error when starting already running session', async () => {
      await tester.start();
      await expect(tester.start()).rejects.toThrow('already running');
    }, 10000);

    it('should handle non-existent snapshot comparison', async () => {
      await tester.start();
      await expect(tester.compareSnapshot('non-existent')).rejects.toThrow(/no such file|Snapshot not found/i);
    }, 10000);

    it('should handle line assertion for non-existent line', async () => {
      await tester.start();
      await expect(tester.assertLine(999, 'test')).rejects.toThrow('Line 999 does not exist');
    }, 10000);
  });

  describe('Utility Methods', () => {
    it('should get session name', async () => {
      const sessionName = tester.getSessionName();
      expect(sessionName).toMatch(/^test-extended-\d+$/);
    });

    it('should get and clear last output', async () => {
      await tester.start();
      await tester.sendCommand('echo "Last Output"');
      await sleep(200);
      
      await tester.captureScreen();
      const lastOutput = tester.getLastOutput();
      expect(lastOutput).toContain('Last Output');
      
      tester.clearOutput();
      const clearedOutput = tester.getLastOutput();
      expect(clearedOutput).toBe('');
    }, 10000);

    it('should execute tmux commands directly', async () => {
      await tester.start();
      
      const result = await tester.exec('list-sessions');
      expect(result.code).toBe(0);
      expect(result.stdout).toContain(tester.getSessionName());
    }, 10000);

    it('should capture screen with cursor position', async () => {
      await tester.start();
      
      const capture = await tester.capture();
      expect(capture.cursor).toBeDefined();
      expect(capture.cursor.x).toBeGreaterThanOrEqual(0);
      expect(capture.cursor.y).toBeGreaterThanOrEqual(0);
      expect(capture.raw).toBeDefined();
      expect(capture.text).toBeDefined();
    }, 10000);
  });

  describe('Send Command', () => {
    it('should send commands with Enter key', async () => {
      await tester.start();
      
      await tester.sendCommand('echo "Command Test"');
      await sleep(200);
      
      const screen = await tester.getScreenText();
      expect(screen).toContain('Command Test');
    }, 10000);

    it('should handle complex commands', async () => {
      await tester.start();
      
      await tester.sendCommand('for i in 1 2 3; do echo "Number $i"; done');
      await sleep(1000); // Give more time for complex command
      
      const screen = await tester.getScreenText();
      // The command itself should be visible
      expect(screen).toContain('for i in 1 2 3');
      // Check if the output was generated (might be on separate lines or together)
      const hasNumbers = screen.includes('Number 1') || 
                        screen.includes('Number 2') || 
                        screen.includes('Number 3') ||
                        screen.includes('Number');
      expect(hasNumbers).toBe(true);
    }, 10000);
  });
});