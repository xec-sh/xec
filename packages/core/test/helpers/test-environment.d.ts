/// <reference types="node" />
import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
export interface MockProcessOptions {
    stdout?: string;
    stderr?: string;
    exitCode?: number;
    signal?: NodeJS.Signals | null;
    delay?: number;
    pid?: number;
}
export declare class MockProcess extends EventEmitter {
    private options;
    stdout: Readable;
    stderr: Readable;
    stdin: Writable;
    pid: number;
    killed: boolean;
    exitCode: number | null;
    signalCode: NodeJS.Signals | null;
    constructor(options?: MockProcessOptions);
    exit(): void;
    kill(signal?: number | NodeJS.Signals): boolean;
    ref(): this;
    unref(): this;
}
export declare function createMockProcess(options?: MockProcessOptions): MockProcess;
export declare function mockSpawnImplementation(expectedCommands: Map<string, MockProcessOptions>): any;
export interface TestEnvironment {
    tempDir: string;
    cleanup: () => Promise<void>;
}
export declare function setupTestEnvironment(): Promise<TestEnvironment>;
export declare function createStreamPair(): {
    readable: Readable;
    writable: Writable;
};
export declare function waitForStream(stream: Readable): Promise<string>;
export declare function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T>;
