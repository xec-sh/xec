import { vi } from 'vitest';
import { StreamHandler } from '../../src/core/stream-handler.js';
export class MockSharedStreamHandler extends StreamHandler {
    constructor() {
        super({ shared: true });
        this.mockOutput = [];
        this.eventHandlers = new Map();
        this._isActive = false;
        this._refCount = 0;
        this.write = vi.fn((text) => {
            this.mockOutput.push(text);
        });
    }
    start() {
        this._isActive = true;
        this._refCount++;
    }
    stop() {
        this._refCount--;
        if (this._refCount === 0) {
            this._isActive = false;
        }
    }
    acquire() {
        this._refCount++;
        if (this._refCount === 1) {
            this.start();
        }
    }
    release() {
        this._refCount--;
        if (this._refCount === 0) {
            this.stop();
        }
    }
    get refCount() {
        return this._refCount;
    }
    get isActive() {
        return this._isActive;
    }
    getOutput() {
        return this.mockOutput.join('');
    }
    clearOutput() {
        this.mockOutput = [];
    }
    simulateKeyPress(key) {
        if (typeof key === 'string') {
            this.emit('key', {
                sequence: key,
                name: key,
                ctrl: false,
                meta: false,
                shift: false
            });
        }
        else {
            this.emit('key', key);
        }
    }
    simulateResize(width, height) {
        this.emit('resize', { width, height });
    }
}
export function createSharedStreamContext() {
    const sharedStream = new MockSharedStreamHandler();
    return {
        stream: sharedStream,
        sendKey(key) {
            sharedStream.simulateKeyPress(key);
        },
        getOutput() {
            return sharedStream.getOutput();
        },
        clearOutput() {
            sharedStream.clearOutput();
        },
        getRefCount() {
            return sharedStream.refCount;
        },
        isActive() {
            return sharedStream.isActive;
        }
    };
}
//# sourceMappingURL=mock-shared-stream.js.map