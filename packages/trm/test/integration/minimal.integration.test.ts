/**
 * Minimal Integration Tests
 * Basic tests that verify the library can be imported and used
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { ansi } from '../../src/core/ansi.js';
// Type imports
import { ColorDepth } from '../../src/types.js';
import { ColorSystem } from '../../src/core/color.js';
// Core imports
import { createTerminal } from '../../src/core/terminal.js';
import { ScreenBufferImpl } from '../../src/core/buffer.js';
import { createTerminalStream } from '../../src/core/stream.js';
// Advanced imports
import {
  Easing,
  animate,
  createMemo,
  createSignal,
  createEffect,
  createFlexLayout,
  createRenderEngine,
  createPerformanceMonitor,
  createConsoleInterceptor
} from '../../src/advanced/index.js';

import type { X, Y, Cols, Rows } from '../../src/types.js';

describe('Minimal Integration Tests', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });
  
  describe('Core Module Basics', () => {
    it('should create terminal instance', () => {
      const terminal = createTerminal();
      expect(terminal).toBeDefined();
      expect(terminal.init).toBeDefined();
      expect(terminal.write).toBeDefined();
      expect(terminal.close).toBeDefined();
    });
    
    it('should create terminal stream', () => {
      const stream = createTerminalStream();
      expect(stream).toBeDefined();
      expect(stream.write).toBeDefined();
      expect(stream.rows).toBeDefined();
      expect(stream.cols).toBeDefined();
    });
    
    it('should access ANSI sequences', () => {
      expect(ansi).toBeDefined();
      expect(ansi.reset()).toBe('\x1b[0m');
      expect(ansi.cursorUp()).toBe('\x1b[1A');
      expect(ansi.clearScreen()).toBe('\x1b[2J');
    });
    
    it('should create color system', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      expect(colors).toBeDefined();
      
      const red = colors.rgb(255, 0, 0);
      expect(red.type).toBe('rgb');
      expect(red.r).toBe(255);
      
      const seq = colors.toForeground(red);
      expect(seq).toContain('\x1b[');
    });
    
    it('should create screen buffer', () => {
      const buffer = new ScreenBufferImpl(80 as Cols, 24 as Rows);
      expect(buffer).toBeDefined();
      expect(buffer.width).toBe(80);
      expect(buffer.height).toBe(24);
      
      buffer.writeText(0 as X, 0 as Y, 'Test');
      const cell = buffer.getCell(0 as X, 0 as Y);
      expect(cell?.char).toBe('T');
    });
  });
  
  describe('Advanced Module Basics', () => {
    it('should create reactive signals', () => {
      const [value, setValue] = createSignal(0);
      expect(value()).toBe(0);
      
      setValue(10);
      expect(value()).toBe(10);
    });
    
    it('should create computed values', () => {
      const [a, setA] = createSignal(2);
      const [b, setB] = createSignal(3);
      const sum = createMemo(() => a() + b());
      
      expect(sum()).toBe(5);
      
      setA(10);
      expect(sum()).toBe(13);
    });
    
    it('should create animations', () => {
      const anim = animate({
        from: 0,
        to: 100,
        duration: 1000,
        easing: Easing.linear
      });
      
      expect(anim).toBeDefined();
      expect(anim.value()).toBe(0);
      expect(anim.start).toBeDefined();
    });
    
    it('should create layouts', () => {
      const layout = createFlexLayout({
        direction: 'row',
        gap: 10
      });
      
      expect(layout).toBeDefined();
      expect(layout.direction).toBe('row');
      expect(layout.gap).toBe(10);
    });
    
    it('should create performance monitor', () => {
      const monitor = createPerformanceMonitor();
      expect(monitor).toBeDefined();
      expect(monitor.getMetrics).toBeDefined();
    });
    
    it('should create console interceptor', () => {
      const interceptor = createConsoleInterceptor();
      expect(interceptor).toBeDefined();
      expect(interceptor.patch).toBeDefined();
      expect(interceptor.restore).toBeDefined();
    });
    
    it('should create render engine', () => {
      const engine = createRenderEngine({
        width: 80,
        height: 24
      });
      
      expect(engine).toBeDefined();
      expect(engine.createLayer).toBeDefined();
      expect(engine.removeLayer).toBeDefined();
    });
  });
  
  describe('Basic Integrations', () => {
    it('should combine signals and effects', () => {
      const [count, setCount] = createSignal(0);
      let effectRuns = 0;
      
      createEffect(() => {
        count(); // Access to track
        effectRuns++;
      });
      
      expect(effectRuns).toBe(1); // Initial run
      
      setCount(1);
      expect(effectRuns).toBe(2);
      
      setCount(2);
      expect(effectRuns).toBe(3);
    });
    
    it('should run basic animation', () => {
      const anim = animate({
        from: 0,
        to: 100,
        duration: 1000,
        easing: Easing.linear
      });
      
      anim.start();
      
      // Halfway through
      vi.advanceTimersByTime(500);
      expect(anim.progress()).toBeCloseTo(0.5, 1);
      
      // Complete
      vi.advanceTimersByTime(500);
      expect(anim.progress()).toBeCloseTo(1, 1);
    });
    
    it('should use color system with buffer', () => {
      const colors = new ColorSystem(ColorDepth.TrueColor);
      const buffer = new ScreenBufferImpl(20 as Cols, 10 as Rows);
      
      const style = {
        fg: colors.rgb(255, 255, 255),
        bg: colors.rgb(0, 0, 128)
      };
      
      buffer.writeText(0 as X, 0 as Y, 'Styled', style);
      
      const cell = buffer.getCell(0 as X, 0 as Y);
      expect(cell?.char).toBe('S');
      expect(cell?.style).toEqual(style);
    });
  });
  
  describe('Terminal Operations', () => {
    it('should initialize and close terminal', async () => {
      const terminal = createTerminal({
        colors: ColorDepth.TrueColor,
        rawMode: false
      });
      
      await terminal.init();
      expect(terminal.initialized).toBe(true);
      
      await terminal.close();
      expect(terminal.closed).toBe(true);
    });
    
    it('should handle terminal with mock stdout', async () => {
      const mockStdout = {
        write: vi.fn(() => true),
        isTTY: true,
        columns: 80,
        rows: 24,
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn()
      };
      
      const mockStdin = {
        setRawMode: vi.fn(),
        isTTY: true,
        on: vi.fn(),
        once: vi.fn(),
        removeListener: vi.fn(),
        pause: vi.fn(),
        resume: vi.fn()
      };
      
      const stream = createTerminalStream(mockStdin as any, mockStdout as any);
      const terminal = createTerminal({ stream });
      
      await terminal.init();
      
      terminal.write('Test');
      expect(mockStdout.write).toHaveBeenCalled();
      
      await terminal.close();
    });
  });
  
  describe('Console Interception', () => {
    it('should intercept and restore console', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage((msg) => {
        messages.push(msg);
      });
      
      const restore = interceptor.patch();
      
      // These should be intercepted
      console.log('Test message');
      
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].level).toBe('log');
      
      restore();
      
      // After restore, messages shouldn't be intercepted
      const prevLength = messages.length;
      console.log('Not intercepted');
      expect(messages.length).toBe(prevLength);
    });
  });
  
  describe('Performance Monitoring', () => {
    it('should track basic metrics', () => {
      const monitor = createPerformanceMonitor();
      
      // Start monitoring
      const metrics = monitor.getMetrics();
      expect(metrics).toBeDefined();
      
      // The metrics object should exist even if empty
      expect(metrics.marks).toBeDefined();
      expect(metrics.measures).toBeDefined();
    });
  });
});