import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { mockProcessStreams } from '../../helpers/mock-tty.js';
import { StreamHandler } from '../../../src/core/stream-handler.js';
import { StreamHandlerFactory } from '../../../src/core/stream-handler-factory.js';
describe('StreamHandler', () => {
    let mockStreams;
    beforeEach(() => {
        mockStreams = mockProcessStreams();
    });
    afterEach(() => {
        mockStreams.restore();
    });
    describe('initialization', () => {
        it('should create with default streams', () => {
            const handler = new StreamHandler();
            expect(handler).toBeInstanceOf(StreamHandler);
        });
        it.skip('should create with custom streams', () => {
        });
        it('should set up raw mode if TTY', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            handler.start();
            expect(mockStreams.stdin.setRawMode).toHaveBeenCalledWith(true);
            expect(mockStreams.stdin.resume).toHaveBeenCalled();
        });
        it('should not set raw mode if not TTY', () => {
            mockStreams.stdin.isTTY = false;
            const handler = new StreamHandler();
            handler.start();
            expect(mockStreams.stdin.setRawMode).not.toHaveBeenCalled();
        });
    });
    describe('event handling', () => {
        it('should emit keypress events', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', 'a');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                char: 'a',
                name: 'a'
            }));
        });
        it('should handle special keys', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\r');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'enter'
            }));
        });
        it('should handle Ctrl+C', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x03');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'c',
                ctrl: true
            }));
        });
        it('should handle Escape', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'escape'
            }));
        });
    });
    describe('writing', () => {
        it('should write to output stream', () => {
            const handler = new StreamHandler();
            handler.write('Hello');
            expect(mockStreams.stdout.write).toHaveBeenCalledWith('Hello');
        });
        it.skip('should support callback', () => {
            const handler = new StreamHandler();
            const callback = vi.fn();
            handler.write('Hello');
            expect(mockStreams.stdout.write).toHaveBeenCalledWith('Hello');
        });
    });
    describe('cleanup', () => {
        it('should restore terminal on stop', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            handler.start();
            handler.stop();
            expect(mockStreams.stdin.setRawMode).toHaveBeenLastCalledWith(false);
            expect(mockStreams.stdin.pause).toHaveBeenCalled();
        });
        it('should remove listeners on stop', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            handler.stop();
            mockStreams.stdin.emit('data', 'a');
            expect(keyHandler).not.toHaveBeenCalled();
        });
        it('should handle stop when not started', () => {
            const handler = new StreamHandler();
            expect(() => {
                handler.stop();
            }).not.toThrow();
        });
        it('should handle multiple start/stop cycles', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            handler.start();
            handler.stop();
            handler.start();
            handler.stop();
            expect(mockStreams.stdin.setRawMode).toHaveBeenCalledTimes(4);
        });
    });
    describe('arrow keys', () => {
        it('should handle arrow up', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b[A');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'up'
            }));
        });
        it('should handle arrow down', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b[B');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'down'
            }));
        });
        it('should handle arrow right', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b[C');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'right'
            }));
        });
        it('should handle arrow left', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b[D');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'left'
            }));
        });
    });
    describe('multi-byte sequences', () => {
        it.skip('should handle partial sequences', () => {
            mockStreams.stdin.isTTY = true;
            mockStreams.stdout.isTTY = true;
            const handler = new StreamHandler({ isTTY: true });
            const keyHandler = vi.fn();
            handler.on('key', keyHandler);
            handler.start();
            mockStreams.stdin.emit('data', '\x1b');
            mockStreams.stdin.emit('data', '[');
            mockStreams.stdin.emit('data', 'A');
            expect(keyHandler).toHaveBeenCalledWith(expect.objectContaining({
                name: 'up'
            }));
        });
    });
    describe('shared mode', () => {
        it('should create shared stream handler', () => {
            const handler = new StreamHandler({ shared: true });
            expect(handler.isSharedMode()).toBe(true);
            expect(handler.getRefCount()).toBe(0);
            expect(handler.isActive()).toBe(false);
        });
        it('should create exclusive stream handler by default', () => {
            const handler = new StreamHandler();
            expect(handler.isSharedMode()).toBe(false);
            expect(handler.getRefCount()).toBe(0);
        });
        it('should handle reference counting', () => {
            const handler = new StreamHandler({ shared: true, isTTY: true });
            handler.acquire();
            expect(handler.getRefCount()).toBe(1);
            expect(handler.isActive()).toBe(true);
            handler.acquire();
            expect(handler.getRefCount()).toBe(2);
            expect(handler.isActive()).toBe(true);
            handler.release();
            expect(handler.getRefCount()).toBe(1);
            expect(handler.isActive()).toBe(true);
            handler.release();
            expect(handler.getRefCount()).toBe(0);
            expect(handler.isActive()).toBe(false);
        });
        it('should not stop shared stream if still referenced', () => {
            const handler = new StreamHandler({ shared: true, isTTY: true });
            handler.acquire();
            handler.acquire();
            handler.stop();
            expect(handler.isActive()).toBe(true);
            handler.release();
            handler.release();
            expect(handler.isActive()).toBe(false);
        });
        it('should check if can start exclusively', () => {
            const handler = new StreamHandler({ shared: true });
            expect(handler.canStartExclusive()).toBe(true);
            handler.acquire();
            expect(handler.canStartExclusive()).toBe(false);
            handler.release();
            expect(handler.canStartExclusive()).toBe(true);
        });
    });
    describe('ownership transfer', () => {
        it('should transfer ownership from shared to exclusive', () => {
            const shared = new StreamHandler({ shared: true, isTTY: true });
            shared.acquire();
            const exclusive = shared.transferOwnership();
            expect(exclusive.isSharedMode()).toBe(false);
            expect(exclusive.isActive()).toBe(true);
            expect(shared.isActive()).toBe(false);
        });
        it('should throw error when transferring non-shared stream', () => {
            const exclusive = new StreamHandler({ shared: false });
            expect(() => exclusive.transferOwnership()).toThrow('Cannot transfer ownership of non-shared stream');
        });
        it('should clone stream handler', () => {
            const original = new StreamHandler({
                shared: true,
                input: process.stdin,
                output: process.stdout,
                isTTY: true
            });
            const cloned = original.clone();
            expect(cloned.isSharedMode()).toBe(true);
            expect(cloned).not.toBe(original);
        });
    });
    describe('stream lifecycle', () => {
        it('should prevent multiple starts', () => {
            const handler = new StreamHandler({ isTTY: true });
            handler.start();
            expect(handler.isActive()).toBe(true);
            handler.start();
            expect(handler.isActive()).toBe(true);
            handler.stop();
            expect(handler.isActive()).toBe(false);
        });
        it('should handle key events in shared mode', async () => {
            const handler = new StreamHandler({ shared: true, isTTY: true });
            const keyPromise = new Promise((resolve) => {
                handler.on('key', (key) => {
                    expect(key.name).toBe('a');
                    handler.release();
                    resolve();
                });
            });
            handler.acquire();
            mockStreams.stdin.emit('data', 'a');
            await keyPromise;
        });
    });
});
describe('StreamHandlerFactory', () => {
    afterEach(() => {
        StreamHandlerFactory.reset();
    });
    it('should create shared instance', () => {
        const handler1 = StreamHandlerFactory.getShared();
        const handler2 = StreamHandlerFactory.getShared();
        expect(handler1).toBe(handler2);
        expect(handler1.isSharedMode()).toBe(true);
    });
    it('should create exclusive instances', () => {
        const handler1 = StreamHandlerFactory.createExclusive();
        const handler2 = StreamHandlerFactory.createExclusive();
        expect(handler1).not.toBe(handler2);
        expect(handler1.isSharedMode()).toBe(false);
        expect(handler2.isSharedMode()).toBe(false);
    });
    it('should create named shared instances', () => {
        const handler1 = StreamHandlerFactory.getNamedShared('test');
        const handler2 = StreamHandlerFactory.getNamedShared('test');
        const handler3 = StreamHandlerFactory.getNamedShared('other');
        expect(handler1).toBe(handler2);
        expect(handler1).not.toBe(handler3);
        expect(handler1.isSharedMode()).toBe(true);
        expect(handler3.isSharedMode()).toBe(true);
    });
    it('should provide statistics', () => {
        const originalIsTTY = process.stdin.isTTY;
        process.stdin.isTTY = true;
        process.stdout.isTTY = true;
        const shared = StreamHandlerFactory.getShared();
        const named1 = StreamHandlerFactory.getNamedShared('test1', { isTTY: true });
        const named2 = StreamHandlerFactory.getNamedShared('test2', { isTTY: true });
        shared.acquire();
        named1.acquire();
        const stats = StreamHandlerFactory.getStats();
        expect(stats.sharedInstance).toBe(true);
        expect(stats.namedInstances).toContain('test1');
        expect(stats.namedInstances).toContain('test2');
        expect(stats.activeCount).toBe(2);
        shared.release();
        named1.release();
        process.stdin.isTTY = originalIsTTY;
        process.stdout.isTTY = originalIsTTY;
    });
    it('should reset all instances', () => {
        const shared = StreamHandlerFactory.getShared();
        const named = StreamHandlerFactory.getNamedShared('test');
        shared.start();
        named.start();
        StreamHandlerFactory.reset();
        expect(shared.isActive()).toBe(false);
        expect(named.isActive()).toBe(false);
        const stats = StreamHandlerFactory.getStats();
        expect(stats.sharedInstance).toBe(false);
        expect(stats.namedInstances).toHaveLength(0);
    });
});
//# sourceMappingURL=stream-handler.test.js.map