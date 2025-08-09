import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TerminalManager } from '../../../src/core/terminal-manager.js';
import { MockTerminal } from '../../../src/test/mock-terminal.js';

describe('TerminalManager - Cursor Position Management', () => {
  let mockTerminal: MockTerminal;
  let manager: TerminalManager;
  let stream: any;

  beforeEach(() => {
    mockTerminal = new MockTerminal(80, 24);
    stream = {
      input: process.stdin,
      output: {
        write: vi.fn((data: string) => {
          mockTerminal.write(data);
        }),
        isTTY: true,
        columns: 80,
        rows: 24
      },
      isTTY: true,
      colorMode: 'truecolor' as const
    };
  });

  describe('Log-Update Style Rendering', () => {
    it('should return cursor to original position after clearing rendered content', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true,
        preserveState: true,
        hideCursor: false // Don't hide cursor for testing
      });

      await manager.initialize();

      // Track cursor movement sequences
      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
        mockTerminal.write(data);
      });

      // Render some content
      const lines = ['Line 1', 'Line 2', 'Line 3'];
      await manager.renderAtPosition(lines);

      // Clear write history before endRender
      writeHistory.length = 0;

      // End rendering
      await manager.endRender();

      // Analyze cursor movement in endRender
      const output = writeHistory.join('');
      
      // Should contain clear line sequences (one for each line)
      const clearLineCount = (output.match(/\x1b\[2K/g) || []).length;
      expect(clearLineCount).toBe(3); // 3 lines to clear

      // Should move cursor down to clear each line (2 times for 3 lines)
      const cursorDownCount = (output.match(/\x1b\[1B/g) || []).length;
      expect(cursorDownCount).toBe(2); // Move down to line 2 and 3

      // IMPORTANT: Should move cursor back up after clearing
      const cursorUpCount = (output.match(/\x1b\[2A/g) || []).length;
      expect(cursorUpCount).toBe(1); // Move up 2 lines to get back to start

      // Should NOT contain newline in log-update mode
      expect(output).not.toContain('\n');
    });

    it('should not add extra newline in log-update mode during cleanup', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true,
        preserveState: true
      });

      await manager.initialize();

      // Render some content
      await manager.renderAtPosition(['Test 1', 'Test 2']);

      // Track cleanup output
      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
      });

      // Cleanup
      await manager.cleanup();

      const output = writeHistory.join('');
      
      // Should NOT contain newline in log-update mode
      expect(output).not.toContain('\n');

      // Should move cursor back up after clearing
      expect(output).toContain('\x1b[1A'); // Move up 1 line
    });

    it('should handle single line rendering correctly', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true
      });

      await manager.initialize();

      // Render single line
      await manager.renderAtPosition(['Single line']);

      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
      });

      await manager.endRender();

      const output = writeHistory.join('');
      
      // Should clear the single line
      expect(output).toContain('\x1b[2K');
      
      // Should NOT move cursor up (already at the right position)
      expect(output).not.toContain('\x1b[1A');
      expect(output).not.toContain('\x1b[2A');
      
      // Should NOT add newline
      expect(output).not.toContain('\n');
    });

    it('should handle empty render correctly', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true,
        hideCursor: false // Don't hide cursor for this test
      });

      await manager.initialize();

      // Don't render anything
      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
      });

      await manager.endRender();

      const output = writeHistory.join('');
      
      // Should not produce any output for empty render (except maybe cursor show)
      // The cursor show sequence is acceptable as it's part of cleanup
      expect(output === '' || output === '\x1b[?25h').toBe(true);
    });
  });

  describe('Non-Log-Update Style', () => {
    it('should add newline in non-log-update mode', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: false,
        preserveState: true
      });

      await manager.initialize();

      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
      });

      await manager.endRender();

      const output = writeHistory.join('');
      
      // SHOULD contain newline in non-log-update mode
      expect(output).toContain('\n');
    });
  });

  describe('Cursor Position Tracking', () => {
    it('should properly track render height', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true
      });

      await manager.initialize();

      // Initially no render height
      expect(manager['currentRenderHeight']).toBe(0);

      // Render 5 lines
      await manager.renderAtPosition(['1', '2', '3', '4', '5']);
      expect(manager['currentRenderHeight']).toBe(5);

      // Update with 3 lines
      await manager.renderAtPosition(['A', 'B', 'C']);
      expect(manager['currentRenderHeight']).toBe(3);

      // Clear
      await manager.endRender();
      expect(manager['currentRenderHeight']).toBe(0);
    });

    it('should save and restore cursor position correctly', async () => {
      manager = new TerminalManager(stream, {
        logUpdateStyle: true
      });

      await manager.initialize();

      const writeHistory: string[] = [];
      stream.output.write = vi.fn((data: string) => {
        writeHistory.push(data);
      });

      // First render should save position
      await manager.renderAtPosition(['Test']);

      const output = writeHistory.join('');
      
      // Should contain save cursor position sequence
      const saveCount = (output.match(/\x1b\[s/g) || []).length;
      expect(saveCount).toBeGreaterThan(0);

      // Second render should restore position
      writeHistory.length = 0;
      await manager.renderAtPosition(['Test 2']);

      const output2 = writeHistory.join('');
      
      // Should contain restore cursor position sequence
      expect(output2).toContain('\x1b[u');
    });
  });
});