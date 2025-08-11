import { it, vi, expect, describe, beforeEach } from 'vitest';

import { EventEmitter } from '../../src/core/events';

describe('EventEmitter', () => {
  let emitter: EventEmitter<{
    test: { value: number };
    message: string;
    empty: void;
    error: Error;
  }>;

  beforeEach(() => {
    emitter = new EventEmitter();
  });

  describe('Basic Event Handling', () => {
    it('should emit and receive events', () => {
      const handler = vi.fn();
      emitter.on('test', handler);
      
      emitter.emit('test', { value: 42 });
      
      expect(handler).toHaveBeenCalledWith({ value: 42 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple listeners for the same event', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      
      emitter.emit('test', { value: 10 });
      
      expect(handler1).toHaveBeenCalledWith({ value: 10 });
      expect(handler2).toHaveBeenCalledWith({ value: 10 });
    });

    it('should handle events with different data types', () => {
      const stringHandler = vi.fn();
      const errorHandler = vi.fn();
      
      emitter.on('message', stringHandler);
      emitter.on('error', errorHandler);
      
      emitter.emit('message', 'Hello');
      emitter.emit('error', new Error('Test error'));
      
      expect(stringHandler).toHaveBeenCalledWith('Hello');
      expect(errorHandler).toHaveBeenCalledWith(expect.any(Error));
    });

    it('should handle void events', () => {
      const handler = vi.fn();
      emitter.on('empty', handler);
      
      emitter.emit('empty', undefined as any);
      
      expect(handler).toHaveBeenCalledWith(undefined);
    });
  });

  describe('Once Listeners', () => {
    it('should call once listener only once', () => {
      const handler = vi.fn();
      emitter.once('test', handler);
      
      emitter.emit('test', { value: 1 });
      emitter.emit('test', { value: 2 });
      emitter.emit('test', { value: 3 });
      
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ value: 1 });
    });

    it('should remove once listener after first emit', () => {
      const handler = vi.fn();
      emitter.once('test', handler);
      
      emitter.emit('test', { value: 1 });
      
      // Verify listener was removed
      const hasListeners = (emitter as any).listeners.has('test');
      expect(hasListeners).toBe(false);
    });

    it('should handle multiple once listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.once('test', handler1);
      emitter.once('test', handler2);
      
      emitter.emit('test', { value: 42 });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
      
      emitter.emit('test', { value: 100 });
      
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Removing Listeners', () => {
    it('should remove specific listener', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      
      emitter.off('test', handler1);
      
      emitter.emit('test', { value: 42 });
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).toHaveBeenCalledWith({ value: 42 });
    });

    it('should remove all listeners for an event when no handler specified', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      
      emitter.off('test');
      
      emitter.emit('test', { value: 42 });
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should handle removing non-existent listener', () => {
      const handler = vi.fn();
      
      expect(() => emitter.off('test', handler)).not.toThrow();
    });

    it('should remove all listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('message', handler2);
      emitter.on('error', handler3);
      
      emitter.removeAllListeners();
      
      emitter.emit('test', { value: 1 });
      emitter.emit('message', 'hello');
      emitter.emit('error', new Error());
      
      expect(handler1).not.toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      expect(handler3).not.toHaveBeenCalled();
    });

    it('should remove all listeners for specific event', () => {
      const testHandler = vi.fn();
      const messageHandler = vi.fn();
      
      emitter.on('test', testHandler);
      emitter.on('message', messageHandler);
      
      emitter.removeAllListeners('test');
      
      emitter.emit('test', { value: 1 });
      emitter.emit('message', 'hello');
      
      expect(testHandler).not.toHaveBeenCalled();
      expect(messageHandler).toHaveBeenCalledWith('hello');
    });
  });

  describe('Disposable Pattern', () => {
    it('should return disposable from on()', () => {
      const handler = vi.fn();
      const disposable = emitter.on('test', handler);
      
      emitter.emit('test', { value: 1 });
      expect(handler).toHaveBeenCalledTimes(1);
      
      disposable.dispose();
      
      emitter.emit('test', { value: 2 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should return disposable from once()', () => {
      const handler = vi.fn();
      const disposable = emitter.once('test', handler);
      
      disposable.dispose();
      
      emitter.emit('test', { value: 1 });
      expect(handler).not.toHaveBeenCalled();
    });

    it('should track disposed state', () => {
      const handler = vi.fn();
      const disposable = emitter.on('test', handler);
      
      expect(disposable.disposed).toBe(false);
      
      disposable.dispose();
      
      expect(disposable.disposed).toBe(true);
    });

    it('should handle multiple dispose calls safely', () => {
      const handler = vi.fn();
      const disposable = emitter.on('test', handler);
      
      disposable.dispose();
      disposable.dispose(); // Second call should not throw
      
      expect(disposable.disposed).toBe(true);
    });
  });

  describe('Wildcard Events', () => {
    it('should handle wildcard listener', () => {
      const handler = vi.fn();
      emitter.onAny(handler);
      
      emitter.emit('test', { value: 42 });
      emitter.emit('message', 'hello');
      
      expect(handler).toHaveBeenCalledWith('test', { value: 42 });
      expect(handler).toHaveBeenCalledWith('message', 'hello');
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('should return disposable from onAny()', () => {
      const handler = vi.fn();
      const disposable = emitter.onAny(handler);
      
      emitter.emit('test', { value: 1 });
      expect(handler).toHaveBeenCalledTimes(1);
      
      disposable.dispose();
      
      emitter.emit('test', { value: 2 });
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle multiple wildcard listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.onAny(handler1);
      emitter.onAny(handler2);
      
      emitter.emit('test', { value: 42 });
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
    });
  });

  describe('Async Events', () => {
    it('should emit events asynchronously', async () => {
      const handler = vi.fn().mockImplementation(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });
      
      emitter.on('test', handler);
      
      const promise = emitter.emitAsync('test', { value: 42 });
      
      expect(handler).toHaveBeenCalledWith({ value: 42 });
      await expect(promise).resolves.toBeUndefined();
    });

    it('should wait for all async handlers', async () => {
      const order: number[] = [];
      
      emitter.on('test', async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        order.push(1);
      });
      
      emitter.on('test', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        order.push(2);
      });
      
      await emitter.emitAsync('test', { value: 1 });
      
      expect(order).toEqual([2, 1]); // Faster handler completes first
    });

    it('should handle async errors', async () => {
      const handler = vi.fn().mockRejectedValue(new Error('Async error'));
      
      emitter.on('error', handler);
      
      await expect(emitter.emitAsync('error', new Error('Test'))).rejects.toThrow('Async error');
    });
  });

  describe('Event Filtering', () => {
    it('should filter events', () => {
      const handler = vi.fn();
      const filtered = emitter.filter('test', (data) => data.value > 10);
      
      filtered.on('test', handler);
      
      emitter.emit('test', { value: 5 });
      emitter.emit('test', { value: 15 });
      emitter.emit('test', { value: 8 });
      emitter.emit('test', { value: 20 });
      
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenCalledWith({ value: 15 });
      expect(handler).toHaveBeenCalledWith({ value: 20 });
    });

    it('should create independent filtered emitters', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      const filtered1 = emitter.filter('test', (data) => data.value < 10);
      const filtered2 = emitter.filter('test', (data) => data.value >= 10);
      
      filtered1.on('test', handler1);
      filtered2.on('test', handler2);
      
      emitter.emit('test', { value: 5 });
      emitter.emit('test', { value: 15 });
      
      expect(handler1).toHaveBeenCalledWith({ value: 5 });
      expect(handler1).toHaveBeenCalledTimes(1);
      expect(handler2).toHaveBeenCalledWith({ value: 15 });
      expect(handler2).toHaveBeenCalledTimes(1);
    });
  });

  describe('Event Mapping', () => {
    it('should map event data', () => {
      const handler = vi.fn();
      const mapped = emitter.map('test', (data) => data.value * 2);
      
      mapped.on('test', handler);
      
      emitter.emit('test', { value: 21 });
      
      expect(handler).toHaveBeenCalledWith(42);
    });

    it('should handle complex mapping', () => {
      const handler = vi.fn();
      const mapped = emitter.map('message', (msg) => ({ 
        text: msg, 
        length: msg.length,
        uppercase: msg.toUpperCase()
      }));
      
      mapped.on('message', handler);
      
      emitter.emit('message', 'hello');
      
      expect(handler).toHaveBeenCalledWith({
        text: 'hello',
        length: 5,
        uppercase: 'HELLO'
      });
    });
  });

  describe('Error Handling', () => {
    it('should continue emitting to other handlers if one throws', () => {
      const handler1 = vi.fn().mockImplementation(() => {
        throw new Error('Handler 1 error');
      });
      const handler2 = vi.fn();
      const handler3 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.on('test', handler3);
      
      emitter.emit('test', { value: 42 });
      
      expect(handler1).toHaveBeenCalled();
      expect(handler2).toHaveBeenCalled();
      expect(handler3).toHaveBeenCalled();
    });

    it('should handle errors in wildcard listeners', () => {
      const wildcardHandler = vi.fn().mockImplementation(() => {
        throw new Error('Wildcard error');
      });
      const normalHandler = vi.fn();
      
      emitter.onAny(wildcardHandler);
      emitter.on('test', normalHandler);
      
      emitter.emit('test', { value: 42 });
      
      expect(wildcardHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
    });
  });

  describe('Listener Count and Inspection', () => {
    it('should track listener count', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      
      emitter.on('test', handler1);
      emitter.on('test', handler2);
      emitter.on('message', handler1);
      
      // Access private property for testing
      const listeners = (emitter as any).listeners;
      expect(listeners.get('test')?.size).toBe(2);
      expect(listeners.get('message')?.size).toBe(1);
    });

    it('should clean up empty listener sets', () => {
      const handler = vi.fn();
      
      emitter.on('test', handler);
      emitter.off('test', handler);
      
      const listeners = (emitter as any).listeners;
      expect(listeners.has('test')).toBe(false);
    });
  });
});