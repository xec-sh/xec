import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { createConsoleInterceptor } from '../../src/advanced/console';

describe('Console Interception Module', () => {
  let originalLog: typeof console.log;
  let originalWarn: typeof console.warn;
  let originalError: typeof console.error;
  let originalInfo: typeof console.info;
  let originalDebug: typeof console.debug;

  beforeEach(() => {
    // Save original console methods
    originalLog = console.log;
    originalWarn = console.warn;
    originalError = console.error;
    originalInfo = console.info;
    originalDebug = console.debug;
  });

  afterEach(() => {
    // Restore original console methods
    console.log = originalLog;
    console.warn = originalWarn;
    console.error = originalError;
    console.info = originalInfo;
    console.debug = originalDebug;
  });

  describe('createConsoleInterceptor', () => {
    it('should create console interceptor', () => {
      const interceptor = createConsoleInterceptor();
      
      expect(interceptor).toBeDefined();
      expect(interceptor.patch).toBeTypeOf('function');
      expect(interceptor.isPatched).toBe(false);
    });

    it('should patch console methods', () => {
      const interceptor = createConsoleInterceptor();
      const disposable = interceptor.patch();
      
      expect(interceptor.isPatched).toBe(true);
      expect(console.log).not.toBe(originalLog);
      
      disposable.dispose();
      expect(interceptor.isPatched).toBe(false);
      expect(console.log).toBe(originalLog);
    });

    it('should capture console messages', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      
      const disposable = interceptor.patch();
      
      console.log('test message');
      console.warn('warning message');
      console.error('error message');
      
      expect(messages.length).toBe(3);
      expect(messages[0].level).toBe('log');
      expect(messages[0].args).toEqual(['test message']);
      expect(messages[1].level).toBe('warn');
      expect(messages[1].args).toEqual(['warning message']);
      expect(messages[2].level).toBe('error');
      expect(messages[2].args).toEqual(['error message']);
      
      disposable.dispose();
    });

    it('should preserve original console behavior', () => {
      const interceptor = createConsoleInterceptor();
      
      // Track if original log was called using a spy
      const logSpy = vi.spyOn(originalLog, 'call');
      
      const disposable = interceptor.patch({ preserveOriginal: true });
      
      console.log('test');
      
      // Check that the original method was called
      expect(logSpy).toHaveBeenCalled();
      
      disposable.dispose();
      logSpy.mockRestore();
    });

    it('should support filtering by level', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      interceptor.filter('warn');
      
      const disposable = interceptor.patch();
      
      console.log('info message');
      console.warn('warning message');
      console.error('error message');
      
      // Only warn and above should be captured
      expect(messages.length).toBe(2);
      expect(messages[0].level).toBe('warn');
      expect(messages[1].level).toBe('error');
      
      disposable.dispose();
    });

    it('should support include/exclude patterns', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      interceptor.include(/^test/);
      interceptor.exclude(/ignore/);
      
      const disposable = interceptor.patch();
      
      console.log('test message');
      console.log('other message');
      console.log('test ignore');
      
      expect(messages.length).toBe(1);
      expect(messages[0].args).toEqual(['test message']);
      
      disposable.dispose();
    });

    it('should buffer messages', () => {
      const interceptor = createConsoleInterceptor();
      interceptor.buffer(3);
      
      const disposable = interceptor.patch();
      
      console.log('message 1');
      console.log('message 2');
      console.log('message 3');
      console.log('message 4');
      
      const buffered = interceptor.flush();
      expect(buffered.length).toBe(3);
      expect(buffered[0].args).toEqual(['message 2']);
      expect(buffered[1].args).toEqual(['message 3']);
      expect(buffered[2].args).toEqual(['message 4']);
      
      // After flush, buffer should be empty
      expect(interceptor.flush().length).toBe(0);
      
      disposable.dispose();
    });

    it('should clear buffer', () => {
      const interceptor = createConsoleInterceptor();
      interceptor.buffer(10);
      
      const disposable = interceptor.patch();
      
      console.log('message 1');
      console.log('message 2');
      
      interceptor.clear();
      
      const buffered = interceptor.flush();
      expect(buffered.length).toBe(0);
      
      disposable.dispose();
    });

    it('should capture stack traces', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      
      const disposable = interceptor.patch({ captureStack: true });
      
      console.log('test message');
      
      expect(messages[0].stack).toBeDefined();
      expect(messages[0].stack).toContain('console.test.ts');
      
      disposable.dispose();
    });

    it('should add timestamps', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      
      const now = Date.now();
      const disposable = interceptor.patch({ timestamp: true });
      
      console.log('test message');
      
      expect(messages[0].timestamp).toBeDefined();
      expect(messages[0].timestamp).toBeGreaterThanOrEqual(now);
      expect(messages[0].timestamp).toBeLessThanOrEqual(Date.now());
      
      disposable.dispose();
    });

    it('should format messages to string', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      
      const disposable = interceptor.patch();
      
      console.log('test', 123, { foo: 'bar' });
      
      const str = messages[0].toString();
      expect(str).toContain('test');
      expect(str).toContain('123');
      expect(str).toContain('foo');
      
      disposable.dispose();
    });

    it('should format messages to ANSI', () => {
      const interceptor = createConsoleInterceptor();
      const messages: any[] = [];
      
      interceptor.onMessage(msg => messages.push(msg));
      
      const disposable = interceptor.patch();
      
      console.error('Error message');
      
      const ansi = messages[0].toANSI();
      expect(ansi).toContain('\x1b[31m'); // Red color for error
      expect(ansi).toContain('Error message');
      
      disposable.dispose();
    });

    it('should support async iteration over messages', async () => {
      const interceptor = createConsoleInterceptor();
      const disposable = interceptor.patch();
      
      const messages: any[] = [];
      const iteratorPromise = (async () => {
        for await (const msg of interceptor.messages) {
          messages.push(msg);
          if (messages.length >= 3) break;
        }
      })();
      
      console.log('message 1');
      console.log('message 2');
      console.log('message 3');
      
      await iteratorPromise;
      
      expect(messages.length).toBe(3);
      expect(messages[0].args).toEqual(['message 1']);
      expect(messages[1].args).toEqual(['message 2']);
      expect(messages[2].args).toEqual(['message 3']);
      
      disposable.dispose();
    });
  });
});