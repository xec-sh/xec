import { StreamHandler } from '../../src/core/stream-handler.js';
import type { Key } from '../../src/core/types.js';
export declare class MockSharedStreamHandler extends StreamHandler {
    private mockOutput;
    private eventHandlers;
    private _isActive;
    private _refCount;
    constructor();
    override: any;
    start(): void;
    override: any;
    stop(): void;
    override: any;
    acquire(): void;
    override: any;
    release(): void;
    get refCount(): number;
    get isActive(): boolean;
    getOutput(): string;
    clearOutput(): void;
    simulateKeyPress(key: Key | string): void;
    simulateResize(width: number, height: number): void;
}
export declare function createSharedStreamContext(): {
    stream: MockSharedStreamHandler;
    sendKey(key: string | Key): void;
    getOutput(): string;
    clearOutput(): void;
    getRefCount(): number;
    isActive(): boolean;
};
