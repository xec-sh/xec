/**
 * Tests for debug manager
 */

import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { DebugLevel, DebugManager } from '../../../src/dev-tools/debug.js';

describe('DebugManager', () => {
  let debug: DebugManager;
  let consoleErrorSpy: any;

  beforeEach(() => {
    debug = new DebugManager({ enabled: true });
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.KIT_DEBUG;
    delete process.env.KIT_DEBUG_LEVEL;
    delete process.env.KIT_DEBUG_INCLUDE;
    delete process.env.KIT_DEBUG_EXCLUDE;
  });

  describe('initialization', () => {
    it('should respect environment variables', () => {
      process.env.KIT_DEBUG = 'true';
      process.env.KIT_DEBUG_LEVEL = 'TRACE';
      process.env.KIT_DEBUG_INCLUDE = 'render,prompt';
      process.env.KIT_DEBUG_EXCLUDE = 'verbose';

      const envDebug = new DebugManager();
      expect(envDebug.isEnabled).toBe(true);
    });

    it('should default to disabled', () => {
      const defaultDebug = new DebugManager();
      expect(defaultDebug.isEnabled).toBe(false);
    });
  });

  describe('enable/disable', () => {
    it('should enable debug mode', () => {
      const disabledDebug = new DebugManager({ enabled: false });
      expect(disabledDebug.isEnabled).toBe(false);

      disabledDebug.enable();
      expect(disabledDebug.isEnabled).toBe(true);
    });

    it('should disable debug mode', () => {
      debug.disable();
      expect(debug.isEnabled).toBe(false);
    });

    it('should emit events on enable/disable', () => {
      const enableListener = vi.fn();
      const disableListener = vi.fn();

      debug.on('enabled', enableListener);
      debug.on('disabled', disableListener);

      debug.disable();
      expect(disableListener).toHaveBeenCalled();

      debug.enable();
      expect(enableListener).toHaveBeenCalled();
    });
  });

  describe('logging', () => {
    it('should log at different levels', () => {
      debug.setLevel(DebugLevel.TRACE);

      debug.error('test', 'Error message');
      debug.warn('test', 'Warning message');
      debug.info('test', 'Info message');
      debug.debug('test', 'Debug message');
      debug.trace('test', 'Trace message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(5);
    });

    it('should respect log level', () => {
      debug.setLevel(DebugLevel.WARN);

      debug.error('test', 'Error message');
      debug.warn('test', 'Warning message');
      debug.info('test', 'Info message');
      debug.debug('test', 'Debug message');

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('should not log when disabled', () => {
      debug.disable();

      debug.info('test', 'Should not appear');

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should include data in logs', () => {
      debug.info('test', 'Message with data', { foo: 'bar', count: 42 });

      expect(consoleErrorSpy).toHaveBeenCalled();
      const output = consoleErrorSpy.mock.calls[0][0];
      expect(output).toContain('Message with data');
      expect(output).toContain('foo');
      expect(output).toContain('bar');
    });

    it('should capture stack traces for errors', () => {
      debug.error('test', 'Error occurred');

      const logs = debug.getLogs();
      expect(logs[0].stack).toBeDefined();
      expect(logs[0].stack).toContain('at');
    });
  });

  describe('category filtering', () => {
    it('should filter by included categories', () => {
      const filteredDebug = new DebugManager({
        enabled: true,
        include: ['render', 'prompt'],
      });

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      filteredDebug.info('render', 'Should appear');
      filteredDebug.info('prompt.text', 'Should appear');
      filteredDebug.info('other', 'Should not appear');

      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('should filter by excluded categories', () => {
      const filteredDebug = new DebugManager({
        enabled: true,
        exclude: ['verbose', 'trace'],
      });

      const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

      filteredDebug.info('test', 'Should appear');
      filteredDebug.info('verbose', 'Should not appear');
      filteredDebug.info('trace.detail', 'Should not appear');

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });
  });

  describe('performance tracking', () => {
    it('should track performance', () => {
      const perf = debug.startPerformance('render');
      expect(perf.name).toBe('render');
      expect(perf.startTime).toBeGreaterThan(0);

      // Simulate some work
      const start = Date.now();
      while (Date.now() - start < 10) {} // Busy wait

      debug.endPerformance(perf);
      expect(perf.endTime).toBeDefined();
      expect(perf.duration).toBeDefined();
      expect(perf.duration).toBeGreaterThan(0);
    });

    it('should track performance with metadata', () => {
      const perf = debug.startPerformance('database-query', {
        query: 'SELECT * FROM users',
        params: { limit: 10 },
      });

      debug.endPerformance(perf);
      expect(perf.metadata).toEqual({
        query: 'SELECT * FROM users',
        params: { limit: 10 },
      });
    });

    it('should measure async functions', async () => {
      let executed = false;
      const result = await debug.measure('async-operation', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        executed = true;
        return 'success';
      });

      expect(executed).toBe(true);
      expect(result).toBe('success');

      const entries = debug.getPerformanceEntries();
      const entry = entries.find(e => e.name === 'async-operation');
      expect(entry).toBeDefined();
      expect(entry?.duration).toBeGreaterThan(0);
    });

    it('should handle errors in measured functions', async () => {
      const error = new Error('Test error');
      
      await expect(
        debug.measure('failing-operation', async () => {
          throw error;
        })
      ).rejects.toThrow('Test error');

      const entries = debug.getPerformanceEntries();
      const entry = entries.find(e => e.name === 'failing-operation');
      expect(entry?.metadata?.error).toBe('Test error');
    });

    it('should not track when disabled', () => {
      debug.disable();

      const perf = debug.startPerformance('test');
      debug.endPerformance(perf);

      expect(perf.startTime).toBe(0);
      expect(perf.endTime).toBeUndefined();
    });
  });

  describe('log management', () => {
    it('should store logs', () => {
      debug.info('test', 'Message 1');
      debug.warn('test', 'Message 2');
      debug.error('other', 'Message 3');

      const logs = debug.getLogs();
      expect(logs).toHaveLength(3);
      expect(logs[0].message).toBe('Message 1');
      expect(logs[1].message).toBe('Message 2');
      expect(logs[2].message).toBe('Message 3');
    });

    it('should filter logs by category', () => {
      debug.info('render', 'Render message');
      debug.info('prompt', 'Prompt message');
      debug.info('render', 'Another render message');

      const renderLogs = debug.getLogsByCategory('render');
      expect(renderLogs).toHaveLength(2);
      expect(renderLogs.every(log => log.category === 'render')).toBe(true);
    });

    it('should filter logs by level', () => {
      debug.setLevel(DebugLevel.TRACE);
      
      debug.error('test', 'Error');
      debug.warn('test', 'Warning');
      debug.info('test', 'Info');

      const errorLogs = debug.getLogsByLevel(DebugLevel.ERROR);
      expect(errorLogs).toHaveLength(1);
      expect(errorLogs[0].level).toBe(DebugLevel.ERROR);
    });

    it('should clear logs', () => {
      debug.info('test', 'Message');
      expect(debug.getLogs()).toHaveLength(1);

      debug.clearLogs();
      expect(debug.getLogs()).toHaveLength(0);
    });
  });

  describe('performance summary', () => {
    it('should generate performance summary', () => {
      const perf1 = debug.startPerformance('operation1');
      debug.endPerformance(perf1);

      const perf2 = debug.startPerformance('operation2');
      debug.endPerformance(perf2);

      const summary = debug.getPerformanceSummary();
      expect(summary).toHaveProperty('operation1');
      expect(summary).toHaveProperty('operation2');
      expect(typeof summary.operation1).toBe('number');
      expect(typeof summary.operation2).toBe('number');
    });
  });

  describe('category logger', () => {
    it('should create category-specific logger', () => {
      debug.setLevel(DebugLevel.DEBUG); // Enable debug level
      const renderLogger = debug.createLogger('render');
      
      renderLogger.info('Rendering component');
      renderLogger.debug('Render details', { width: 100 });

      const logs = debug.getLogsByCategory('render');
      expect(logs).toHaveLength(2);
      expect(logs[0].message).toBe('Rendering component');
      expect(logs[1].message).toBe('Render details');
    });
  });

  describe('events', () => {
    it('should emit log events', () => {
      const logListener = vi.fn();
      debug.on('log', logListener);

      debug.info('test', 'Test message', { data: 'value' });

      expect(logListener).toHaveBeenCalledWith(
        expect.objectContaining({
          level: DebugLevel.INFO,
          category: 'test',
          message: 'Test message',
          data: { data: 'value' },
        })
      );
    });

    it('should emit performance events', () => {
      const perfListener = vi.fn();
      debug.on('performance', perfListener);

      const perf = debug.startPerformance('test-op');
      debug.endPerformance(perf);

      expect(perfListener).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'test-op',
          startTime: expect.any(Number),
          endTime: expect.any(Number),
          duration: expect.any(Number),
        })
      );
    });
  });
});