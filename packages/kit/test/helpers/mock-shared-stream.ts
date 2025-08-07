import { vi } from 'vitest';
import { EventEmitter } from 'events';

import { StreamHandler } from '../../src/core/stream-handler.js';
import type { Key } from '../../src/core/types.js';

/**
 * Mock shared stream handler for testing multi-prompt scenarios
 */
export class MockSharedStreamHandler extends StreamHandler {
  private mockOutput: string[] = [];
  private eventHandlers = new Map<string, Set<Function>>();
  private _isActive = false;
  private _refCount = 0;

  constructor() {
    super({ shared: true });
    
    // Override the write method to capture output
    this.write = vi.fn((text: string) => {
      this.mockOutput.push(text);
    });
  }

  override start(): void {
    this._isActive = true;
    this._refCount++;
  }

  override stop(): void {
    this._refCount--;
    if (this._refCount === 0) {
      this._isActive = false;
    }
  }

  override acquire(): void {
    this._refCount++;
    if (this._refCount === 1) {
      this.start();
    }
  }

  override release(): void {
    this._refCount--;
    if (this._refCount === 0) {
      this.stop();
    }
  }

  get refCount(): number {
    return this._refCount;
  }

  get isActive(): boolean {
    return this._isActive;
  }

  getOutput(): string {
    return this.mockOutput.join('');
  }

  clearOutput(): void {
    this.mockOutput = [];
  }

  simulateKeyPress(key: Key | string): void {
    if (typeof key === 'string') {
      this.emit('key', { 
        sequence: key, 
        name: key, 
        ctrl: false, 
        meta: false, 
        shift: false 
      });
    } else {
      this.emit('key', key);
    }
  }

  simulateResize(width: number, height: number): void {
    this.emit('resize', { width, height });
  }
}

/**
 * Create a mock shared stream context for testing
 */
export function createSharedStreamContext() {
  const sharedStream = new MockSharedStreamHandler();
  
  return {
    stream: sharedStream,
    
    sendKey(key: string | Key): void {
      sharedStream.simulateKeyPress(key);
    },
    
    getOutput(): string {
      return sharedStream.getOutput();
    },
    
    clearOutput(): void {
      sharedStream.clearOutput();
    },
    
    getRefCount(): number {
      return sharedStream.refCount;
    },
    
    isActive(): boolean {
      return sharedStream.isActive;
    }
  };
}