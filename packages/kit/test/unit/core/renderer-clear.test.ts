import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Renderer } from '../../../src/core/renderer.js';
import { createDefaultTheme } from '../../../src/themes/default.js';
import { mockProcessStreams } from '../../helpers/mock-tty.js';

describe('Renderer clear() method', () => {
  let streams: ReturnType<typeof mockProcessStreams>;

  beforeEach(() => {
    streams = mockProcessStreams({ isTTY: true });
    vi.useFakeTimers();
  });

  afterEach(() => {
    streams.restore();
    vi.useRealTimers();
  });

  it('should clear all lines and position cursor at the start', () => {
    const renderer = new Renderer({ theme: createDefaultTheme() });
    
    // Render multi-line content
    const content = 'Line 1\nLine 2\nLine 3\nLine 4\nLine 5';
    renderer.render(content);
    vi.runOnlyPendingTimers();
    
    // Clear all mocks to track only clear operations
    streams.stdout.write.mockClear();
    streams.stdout.clearLine.mockClear();
    streams.stdout.cursorTo.mockClear();
    
    // Clear the rendered content
    renderer.clear();
    
    // Check clearLine was called once
    expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1);
    expect(streams.stdout.clearLine).toHaveBeenCalledWith(0);
    
    // Check cursorTo was called once (from clearLine method)
    expect(streams.stdout.cursorTo).toHaveBeenCalledTimes(1);
    expect(streams.stdout.cursorTo).toHaveBeenCalledWith(0);
    
    // Get write calls (should be 4 cursor.up + erase.line)
    const writeCalls = streams.stdout.write.mock.calls.map(call => call[0]);
    expect(writeCalls).toHaveLength(4); // 4 lines to move up and clear
    
    // Each call should be cursor up + erase line
    for (const call of writeCalls) {
      expect(call).toContain('\x1B[1A'); // cursor.up(1)
      expect(call).toContain('\x1B[2K'); // erase.line
    }
  });

  it('should handle single line content', () => {
    const renderer = new Renderer({ theme: createDefaultTheme() });
    
    // Render single line
    renderer.render('Single line');
    vi.runOnlyPendingTimers();
    
    streams.stdout.write.mockClear();
    streams.stdout.clearLine.mockClear();
    streams.stdout.cursorTo.mockClear();
    
    renderer.clear();
    
    // Should clear the line
    expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1);
    expect(streams.stdout.clearLine).toHaveBeenCalledWith(0);
    
    // Should not have any cursor up movements (only one line)
    const writeCalls = streams.stdout.write.mock.calls;
    expect(writeCalls).toHaveLength(0);
  });

  it('should handle empty previous frame', () => {
    const renderer = new Renderer({ theme: createDefaultTheme() });
    
    // Clear without rendering anything
    renderer.clear();
    
    // Should not write anything
    expect(streams.stdout.write).not.toHaveBeenCalled();
  });

  it('should leave cursor at top after clearing multi-line content', () => {
    const renderer = new Renderer({ theme: createDefaultTheme() });
    
    // Render 3 lines
    renderer.render('Line 1\nLine 2\nLine 3');
    vi.runOnlyPendingTimers();
    
    // Clear all mocks
    streams.stdout.write.mockClear();
    streams.stdout.clearLine.mockClear();
    
    // Clear the content
    renderer.clear();
    
    // Verify the clear operations
    expect(streams.stdout.clearLine).toHaveBeenCalledTimes(1); // Clear current line
    
    // Should have 2 cursor up + erase operations (for 2 remaining lines)
    const clearCalls = streams.stdout.write.mock.calls.filter(call => 
      typeof call[0] === 'string' && call[0].includes('\x1B[1A')
    );
    expect(clearCalls).toHaveLength(2);
    
    // Clear mocks again for the new render
    streams.stdout.write.mockClear();
    
    // Render new shorter content
    renderer.render('New line');
    
    // Run pending timers to execute throttled render
    vi.runOnlyPendingTimers();
    
    // The output should only contain the new content
    const renderOutput = streams.stdout.write.mock.calls
      .filter(call => typeof call[0] === 'string' && !call[0].includes('\x1B'))
      .map(call => call[0])
      .join('');
    
    expect(renderOutput).toBe('New line');
  });
});