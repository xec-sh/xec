/// <reference types="node" />
import { vi } from 'vitest';
import { EventEmitter } from 'events';
import type { Key } from '../../src/core/types.js';
export interface MockTTY extends EventEmitter {
    isTTY: boolean;
    write: ReturnType<typeof vi.fn>;
    cursorTo: ReturnType<typeof vi.fn>;
    clearLine: ReturnType<typeof vi.fn>;
    moveCursor: ReturnType<typeof vi.fn>;
    columns: number;
    rows: number;
    cleanup?: () => void;
    getOutput?: () => string;
}
export interface MockReadStream extends MockTTY {
    setRawMode: ReturnType<typeof vi.fn>;
    resume: ReturnType<typeof vi.fn>;
    pause: ReturnType<typeof vi.fn>;
    setEncoding: ReturnType<typeof vi.fn>;
}
export declare function createMockTTY(isTTY?: boolean): MockTTY;
export declare function createMockReadStream(isTTY?: boolean): MockReadStream;
export declare function mockProcessStreams(options?: {
    isTTY?: boolean;
}): {
    stdin: MockReadStream;
    stdout: MockTTY;
    stderr: MockTTY;
    restore(): void;
    sendKey(key: string | Partial<Key>): void;
};
