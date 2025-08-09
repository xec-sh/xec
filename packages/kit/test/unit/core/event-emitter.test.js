import { it, vi, expect, describe } from 'vitest';
import { EventEmitter } from '../../../src/core/event-emitter.js';
describe('EventEmitter', () => {
    describe('basic functionality', () => {
        it('should emit and listen to events', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            emitter.on('test', handler);
            emitter.emit('test', 'data');
            expect(handler).toHaveBeenCalledWith('data');
        });
        it('should support multiple arguments', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            emitter.on('test', handler);
            emitter.emit('test', 'arg1', 'arg2', 'arg3');
            expect(handler).toHaveBeenCalledWith('arg1', 'arg2', 'arg3');
        });
        it('should support multiple listeners', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            emitter.on('test', handler1);
            emitter.on('test', handler2);
            emitter.emit('test', 'data');
            expect(handler1).toHaveBeenCalledWith('data');
            expect(handler2).toHaveBeenCalledWith('data');
        });
        it('should handle events with no listeners', () => {
            const emitter = new EventEmitter();
            expect(() => {
                emitter.emit('test', 'data');
            }).not.toThrow();
        });
    });
    describe('once', () => {
        it('should only trigger once', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            emitter.once('test', handler);
            emitter.emit('test', 'first');
            emitter.emit('test', 'second');
            expect(handler).toHaveBeenCalledTimes(1);
            expect(handler).toHaveBeenCalledWith('first');
        });
        it('should work with multiple once listeners', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            emitter.once('test', handler1);
            emitter.once('test', handler2);
            emitter.emit('test', 'data');
            expect(handler1).toHaveBeenCalledWith('data');
            expect(handler2).toHaveBeenCalledWith('data');
            emitter.emit('test', 'data2');
            expect(handler1).toHaveBeenCalledTimes(1);
            expect(handler2).toHaveBeenCalledTimes(1);
        });
    });
    describe('off', () => {
        it('should remove specific listener', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            emitter.on('test', handler1);
            emitter.on('test', handler2);
            emitter.off('test', handler1);
            emitter.emit('test', 'data');
            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).toHaveBeenCalledWith('data');
        });
        it('should handle removing non-existent listener', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            expect(() => {
                emitter.off('test', handler);
            }).not.toThrow();
        });
        it('should handle removing from non-existent event', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            emitter.on('test', handler);
            expect(() => {
                emitter.off('other', handler);
            }).not.toThrow();
        });
    });
    describe('removeAllListeners', () => {
        it('should remove all listeners for an event', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            emitter.on('test', handler1);
            emitter.on('test', handler2);
            emitter.removeAllListeners('test');
            emitter.emit('test', 'data');
            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
        it('should remove all listeners for all events when no event specified', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            emitter.on('test1', handler1);
            emitter.on('test2', handler2);
            emitter.removeAllListeners();
            emitter.emit('test1', 'data');
            emitter.emit('test2', 'data');
            expect(handler1).not.toHaveBeenCalled();
            expect(handler2).not.toHaveBeenCalled();
        });
    });
    describe('listenerCount', () => {
        it('should return correct listener count', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn();
            const handler2 = vi.fn();
            expect(emitter.listenerCount('test')).toBe(0);
            emitter.on('test', handler1);
            expect(emitter.listenerCount('test')).toBe(1);
            emitter.on('test', handler2);
            expect(emitter.listenerCount('test')).toBe(2);
            emitter.off('test', handler1);
            expect(emitter.listenerCount('test')).toBe(1);
        });
        it('should count once listeners', () => {
            const emitter = new EventEmitter();
            const handler = vi.fn();
            emitter.once('test', handler);
            expect(emitter.listenerCount('test')).toBe(1);
            emitter.emit('test');
            expect(emitter.listenerCount('test')).toBe(0);
        });
    });
    describe('error handling', () => {
        it('should not stop execution if a listener throws', () => {
            const emitter = new EventEmitter();
            const handler1 = vi.fn(() => {
                throw new Error('Handler error');
            });
            const handler2 = vi.fn();
            emitter.on('test', handler1);
            emitter.on('test', handler2);
            expect(() => {
                emitter.emit('test', 'data');
            }).not.toThrow();
            expect(handler1).toHaveBeenCalled();
            expect(handler2).toHaveBeenCalled();
        });
    });
});
//# sourceMappingURL=event-emitter.test.js.map