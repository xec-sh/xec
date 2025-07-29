import { jest } from '@jest/globals';
import { EventEmitter } from 'node:events';
import { Readable, Writable, PassThrough } from 'node:stream';

export interface MockProcessOptions {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  signal?: NodeJS.Signals | null;
  delay?: number;
  pid?: number;
}

export class MockProcess extends EventEmitter {
  stdout: Readable;
  stderr: Readable;
  stdin: Writable;
  pid: number;
  killed: boolean = false;
  exitCode: number | null = null;
  signalCode: NodeJS.Signals | null = null;

  constructor(private options: MockProcessOptions = {}) {
    super();

    this.pid = options.pid ?? Math.floor(Math.random() * 10000);

    // Create stdout stream
    this.stdout = new Readable({
      read() {
        if (options.stdout !== undefined) {
          this.push(options.stdout);
          this.push(null);
        }
      }
    });

    // Create stderr stream
    this.stderr = new Readable({
      read() {
        if (options.stderr !== undefined) {
          this.push(options.stderr);
          this.push(null);
        }
      }
    });

    // Create stdin stream
    this.stdin = new Writable({
      write(chunk, encoding, callback) {
        callback();
      }
    });

    // Schedule exit
    if (options.delay) {
      setTimeout(() => this.exit(), options.delay);
    } else {
      setImmediate(() => this.exit());
    }
  }

  exit() {
    this.exitCode = this.options.exitCode ?? 0;
    this.signalCode = this.options.signal ?? null;

    this.emit('exit', this.exitCode, this.signalCode);
    this.emit('close', this.exitCode, this.signalCode);
  }

  kill(signal?: number | NodeJS.Signals): boolean {
    if (this.killed) return false;

    this.killed = true;
    this.signalCode = (typeof signal === 'string' ? signal : 'SIGTERM') as NodeJS.Signals;
    this.exitCode = null;

    this.emit('exit', this.exitCode, this.signalCode);
    this.emit('close', this.exitCode, this.signalCode);

    return true;
  }

  ref(): this { return this; }
  unref(): this { return this; }
}

export function createMockProcess(options: MockProcessOptions = {}): MockProcess {
  return new MockProcess(options);
}

export function mockSpawnImplementation(expectedCommands: Map<string, MockProcessOptions>) {
  return jest.fn((command: string, args?: string[], options?: any) => {
    const fullCommand = args ? `${command} ${args.join(' ')}` : command;

    // Find matching command
    for (const [pattern, processOptions] of expectedCommands) {
      if (pattern === fullCommand || (pattern.includes('*') && new RegExp(pattern.replace('*', '.*')).test(fullCommand))) {
        return createMockProcess(processOptions);
      }
    }

    // Default mock process
    return createMockProcess({ stdout: '', stderr: '', exitCode: 0 });
  });
}

export interface TestEnvironment {
  tempDir: string;
  cleanup: () => Promise<void>;
}

export async function setupTestEnvironment(): Promise<TestEnvironment> {
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

export function createStreamPair(): { readable: Readable; writable: Writable } {
  const passThrough = new PassThrough();
  return {
    readable: passThrough,
    writable: passThrough
  };
}

export function waitForStream(stream: Readable): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString()));
    stream.on('error', reject);
  });
}

export async function withTimeout<T>(promise: Promise<T>, ms: number, message?: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error(message || `Operation timed out after ${ms}ms`)), ms);
  });

  return Promise.race([promise, timeout]);
}