import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';
export class MockProcess extends EventEmitter {
    constructor(options = {}) {
        super();
        this.options = options;
        this.killed = false;
        this.exitCode = null;
        this.signalCode = null;
        this.pid = options.pid ?? Math.floor(Math.random() * 10000);
        this.stdout = new Readable({
            read() {
                if (options.stdout !== undefined) {
                    this.push(options.stdout);
                    this.push(null);
                }
            }
        });
        this.stderr = new Readable({
            read() {
                if (options.stderr !== undefined) {
                    this.push(options.stderr);
                    this.push(null);
                }
            }
        });
        this.stdin = new Writable({
            write(chunk, encoding, callback) {
                callback();
            }
        });
        if (options.delay) {
            setTimeout(() => this.exit(), options.delay);
        }
        else {
            setImmediate(() => this.exit());
        }
    }
    exit() {
        this.exitCode = this.options.exitCode ?? 0;
        this.signalCode = this.options.signal ?? null;
        this.emit('exit', this.exitCode, this.signalCode);
        this.emit('close', this.exitCode, this.signalCode);
    }
    kill(signal) {
        if (this.killed)
            return false;
        this.killed = true;
        this.signalCode = (typeof signal === 'string' ? signal : 'SIGTERM');
        this.exitCode = null;
        this.emit('exit', this.exitCode, this.signalCode);
        this.emit('close', this.exitCode, this.signalCode);
        return true;
    }
    ref() { return this; }
    unref() { return this; }
}
export function createMockProcess(options = {}) {
    return new MockProcess(options);
}
export function mockSpawnImplementation(expectedCommands) {
    return jest.fn((command, args, options) => {
        const fullCommand = args ? `${command} ${args.join(' ')}` : command;
        for (const [pattern, processOptions] of expectedCommands) {
            if (pattern === fullCommand || (pattern.includes('*') && new RegExp(pattern.replace('*', '.*')).test(fullCommand))) {
                return createMockProcess(processOptions);
            }
        }
        return createMockProcess({ stdout: '', stderr: '', exitCode: 0 });
    });
}
export async function setupTestEnvironment() {
    const { mkdtemp, rm } = await import('node:fs/promises');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const tempDir = await mkdtemp(join(tmpdir(), 'xec-test-'));
    return {
        tempDir,
        cleanup: async () => {
            await rm(tempDir, { recursive: true, force: true });
        }
    };
}
export function createStreamPair() {
    const passThrough = new PassThrough();
    return {
        readable: passThrough,
        writable: passThrough
    };
}
export function waitForStream(stream) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
        stream.on('error', reject);
    });
}
export async function withTimeout(promise, ms, message) {
    const timeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms);
    });
    return Promise.race([promise, timeout]);
}
//# sourceMappingURL=test-environment.js.map