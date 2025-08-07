import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { Spinner, spinner } from '../../../../src/components/feedback/spinner.js';

// Mock stdout
const mockWrite = vi.fn();
const originalWrite = process.stdout.write;

// Mock timers
vi.useFakeTimers();

describe('Spinner', () => {
  beforeEach(() => {
    process.stdout.write = mockWrite as any;
    mockWrite.mockClear();
  });

  afterEach(() => {
    process.stdout.write = originalWrite;
    vi.clearAllTimers();
  });

  describe('initialization', () => {
    it('should create with default options', () => {
      const s = new Spinner();
      
      expect(s).toBeDefined();
      expect((s as any).text).toBe('');
      expect((s as any).frames).toHaveLength(10);
      expect((s as any).interval).toBe(80);
    });

    it('should create with text', () => {
      const s = new Spinner('Loading...');
      
      expect((s as any).text).toBe('Loading...');
    });

    it('should create with options', () => {
      const s = new Spinner('Loading', {
        frames: ['|', '/', '-', '\\'],
        interval: 100
      });
      
      expect((s as any).frames).toEqual(['|', '/', '-', '\\']);
      expect((s as any).interval).toBe(100);
    });

    it('should accept text in options', () => {
      const s = new Spinner(undefined, {
        text: 'Processing...'
      });
      
      expect((s as any).text).toBe('Processing...');
    });
  });

  describe('start/stop', () => {
    it('should start spinning', () => {
      const s = new Spinner('Loading');
      
      s.start();
      
      expect((s as any).isSpinning).toBe(true);
      expect(mockWrite).toHaveBeenCalled();
      
      // Should render first frame
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Loading');
      expect(output).toContain('⠋'); // First frame
      
      s.stop();
    });

    it('should stop spinning', () => {
      const s = new Spinner('Loading');
      
      s.start();
      mockWrite.mockClear();
      
      s.stop();
      
      expect((s as any).isSpinning).toBe(false);
      
      // Should clear and show cursor
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      // cursor.show is '\x1b[?25h'
      expect(output).toContain('\x1b[?25h');
    });

    it('should update frames on interval', () => {
      const s = new Spinner('Loading', {
        frames: ['1', '2', '3'],
        interval: 100
      });
      
      s.start();
      
      // First frame
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('1'));
      
      mockWrite.mockClear();
      
      // Advance timer
      vi.advanceTimersByTime(100);
      
      // Second frame
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('2'));
      
      mockWrite.mockClear();
      
      // Advance timer
      vi.advanceTimersByTime(100);
      
      // Third frame
      expect(mockWrite).toHaveBeenCalledWith(expect.stringContaining('3'));
      
      s.stop();
    });

    it('should cycle through frames', () => {
      const s = new Spinner('Loading', {
        frames: ['A', 'B'],
        interval: 50
      });
      
      s.start();
      
      // Cycle multiple times
      for (let i = 0; i < 5; i++) {
        vi.advanceTimersByTime(50);
      }
      
      // Should have cycled back to beginning
      expect((s as any).frameIndex).toBeLessThan(2);
      
      s.stop();
    });

    it('should handle multiple start calls', () => {
      const s = new Spinner('Loading');
      
      s.start();
      const firstTimer = (s as any).timer;
      
      s.start(); // Second start should not create new timer
      
      expect((s as any).timer).toBe(firstTimer);
      
      s.stop();
    });

    it('should handle multiple stop calls', () => {
      const s = new Spinner('Loading');
      
      s.start();
      s.stop();
      
      expect(() => {
        s.stop();
      }).not.toThrow();
    });
  });

  describe('text updates', () => {
    it('should update text while spinning', () => {
      const s = new Spinner('Initial');
      
      s.start();
      mockWrite.mockClear();
      
      s.setText('Updated');
      
      // Advance to next frame
      vi.advanceTimersByTime(80);
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Updated');
      
      s.stop();
    });

    it('should accept text in start method', () => {
      const s = new Spinner();
      
      s.start('New text');
      
      expect((s as any).text).toBe('New text');
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('New text');
      
      s.stop();
    });
  });

  describe('completion methods', () => {
    it('should show success', () => {
      const s = new Spinner('Loading');
      
      s.start();
      mockWrite.mockClear();
      
      s.success('Done!');
      
      expect((s as any).isSpinning).toBe(false);
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('✓'); // Success symbol
      expect(output).toContain('Done!');
    });

    it('should show error', () => {
      const s = new Spinner('Loading');
      
      s.start();
      mockWrite.mockClear();
      
      s.error('Failed!');
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('✗'); // Error symbol
      expect(output).toContain('Failed!');
    });

    it('should show warning', () => {
      const s = new Spinner('Loading');
      
      s.start();
      mockWrite.mockClear();
      
      s.warn('Warning!');
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('⚠'); // Warning symbol
      expect(output).toContain('Warning!');
    });

    it('should show info', () => {
      const s = new Spinner('Loading');
      
      s.start();
      mockWrite.mockClear();
      
      s.info('Information');
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('ℹ'); // Info symbol
      expect(output).toContain('Information');
    });

    it('should use original text if not provided', () => {
      const s = new Spinner('Original text');
      
      s.start();
      mockWrite.mockClear();
      
      s.success(); // No text provided
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('Original text');
    });
  });

  describe('configuration', () => {
    it('should update frames', () => {
      const s = new Spinner('Loading');
      
      s.setFrames(['X', 'O']);
      
      expect((s as any).frames).toEqual(['X', 'O']);
      expect((s as any).frameIndex).toBe(0);
    });

    it('should update interval', () => {
      const s = new Spinner('Loading');
      
      s.start();
      s.setInterval(200);
      
      expect((s as any).interval).toBe(200);
      
      s.stop();
    });

    it('should restart timer with new interval', () => {
      const s = new Spinner('Loading');
      
      s.start();
      const oldTimer = (s as any).timer;
      
      s.setInterval(200);
      
      expect((s as any).timer).not.toBe(oldTimer);
      
      s.stop();
    });
  });

  describe('status checks', () => {
    it('should report active status', () => {
      const s = new Spinner('Loading');
      
      expect(s.isActive()).toBe(false);
      
      s.start();
      expect(s.isActive()).toBe(true);
      
      s.stop();
      expect(s.isActive()).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit start event', () => {
      const s = new Spinner('Loading');
      const handler = vi.fn();
      
      s.on('start', handler);
      s.start();
      
      expect(handler).toHaveBeenCalled();
      
      s.stop();
    });

    it('should emit stop event', () => {
      const s = new Spinner('Loading');
      const handler = vi.fn();
      
      s.on('stop', handler);
      s.start();
      s.stop();
      
      expect(handler).toHaveBeenCalled();
    });

    it('should emit success event', () => {
      const s = new Spinner('Loading');
      const handler = vi.fn();
      
      s.on('success', handler);
      s.start();
      s.success('Done');
      
      expect(handler).toHaveBeenCalledWith('Done');
    });

    it('should emit error event', () => {
      const s = new Spinner('Loading');
      const handler = vi.fn();
      
      s.on('error', handler);
      s.start();
      s.error('Failed');
      
      expect(handler).toHaveBeenCalledWith('Failed');
    });

    it('should support removing event listeners', () => {
      const s = new Spinner('Loading');
      const handler = vi.fn();
      
      s.on('start', handler);
      s.off('start', handler);
      s.start();
      
      expect(handler).not.toHaveBeenCalled();
      
      s.stop();
    });
  });

  describe('factory function', () => {
    it('should create and start spinner', () => {
      const s = spinner('Loading');
      
      expect(s).toBeInstanceOf(Spinner);
      expect(s.isActive()).toBe(true);
      
      s.stop();
    });

    it('should accept options', () => {
      const s = spinner('Loading', {
        frames: ['A', 'B'],
        interval: 200
      });
      
      expect((s as any).frames).toEqual(['A', 'B']);
      expect((s as any).interval).toBe(200);
      
      s.stop();
    });
  });

  describe('rendering', () => {
    it('should hide cursor', () => {
      const s = new Spinner('Loading');
      
      s.start();
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      // cursor.hide is '\x1b[?25l'
      expect(output).toContain('\x1b[?25l');
      
      s.stop();
    });

    it('should clear previous lines', () => {
      const s = new Spinner('Line 1\nLine 2');
      
      s.start();
      
      // Advance to trigger update
      vi.advanceTimersByTime(80);
      
      // Should clear 2 lines
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      expect(output).toContain('\x1b[1A'); // cursor.up(1)
      expect(output).toContain('\x1b[2K'); // erase.line
      
      s.stop();
    });

    it.skip('should handle color in frames', () => {
      // Skipped: picocolors may disable colors in test environments
      const s = new Spinner('Loading');
      
      s.start();
      
      const output = mockWrite.mock.calls.map(call => call[0]).join('');
      // Should have cyan color for spinner
      expect(output).toMatch(/\x1b\[\d+m.*⠋/); // ANSI color before frame
      
      s.stop();
    });
  });

  describe('method chaining', () => {
    it('should support method chaining', () => {
      const s = new Spinner();
      
      const result = s
        .setText('Loading')
        .setFrames(['1', '2'])
        .setInterval(100)
        .start();
      
      expect(result).toBe(s);
      
      s.stop();
    });
  });
});