// Test setup file for all runtimes
import { vi } from 'vitest';

// Store real process.env if it exists
const realProcessEnv = typeof globalThis.process !== 'undefined' ? globalThis.process.env : {};

// Mock process for environments that don't have it
if (typeof globalThis.process === 'undefined') {
  (globalThis as any).process = {
    stdout: {
      write: vi.fn(),
      isTTY: true,
      columns: 80,
      rows: 24,
      getColorDepth: () => 8,
      hasColors: () => true,
      clearLine: vi.fn(),
      clearScreenDown: vi.fn(),
      cursorTo: vi.fn(),
      moveCursor: vi.fn()
    },
    stdin: {
      isTTY: true,
      setRawMode: vi.fn(),
      on: vi.fn(),
      once: vi.fn(),
      removeListener: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      ref: vi.fn(),
      unref: vi.fn()
    },
    stderr: {
      write: vi.fn(),
      isTTY: true
    },
    env: {
      ...realProcessEnv,  // Include the real environment variables
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    },
    platform: 'darwin',
    versions: {
      node: '18.0.0'
    },
    on: vi.fn(),
    removeListener: vi.fn()
  };
}

// Only mock Deno namespace in non-Node environments
// Don't mock it in Node.js tests as it interferes with adapter detection
if (typeof globalThis.Deno === 'undefined' && typeof globalThis.process === 'undefined') {
  (globalThis as any).Deno = {
    stdout: {
      writable: new WritableStream({
        write: vi.fn()
      })
    },
    stdin: {
      readable: new ReadableStream({
        start(controller) {
          // Mock implementation
        }
      })
    },
    stderr: {
      writable: new WritableStream({
        write: vi.fn()
      })
    },
    isatty: vi.fn(() => true),
    consoleSize: vi.fn(() => ({ columns: 80, rows: 24 })),
    env: {
      get: vi.fn((key: string) => {
        const env: Record<string, string> = {
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor'
        };
        return env[key];
      })
    },
    build: {
      os: 'darwin'
    },
    version: {
      deno: '1.36.0'
    }
  };
}

// Only mock Bun namespace in non-Node environments
// Don't mock it in Node.js tests as it interferes with adapter detection
if (typeof globalThis.Bun === 'undefined' && typeof globalThis.process === 'undefined') {
  (globalThis as any).Bun = {
    stdout: {
      writer: () => ({
        write: vi.fn()
      })
    },
    stdin: {
      stream: () => new ReadableStream()
    },
    stderr: {
      writer: () => ({
        write: vi.fn()
      })
    },
    isatty: vi.fn(() => true),
    env: {
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor'
    },
    version: '1.0.0'
  };
}

// Helper to detect current runtime
export function getCurrentRuntime(): 'node' | 'deno' | 'bun' | 'unknown' {
  if (typeof globalThis.Deno !== 'undefined' && globalThis.Deno.version) {
    return 'deno';
  }
  if (typeof globalThis.Bun !== 'undefined' && globalThis.Bun.version) {
    return 'bun';
  }
  if (typeof globalThis.process !== 'undefined' && globalThis.process.versions?.node) {
    return 'node';
  }
  return 'unknown';
}

// Setup cleanup hooks
afterEach(() => {
  vi.clearAllMocks();
});