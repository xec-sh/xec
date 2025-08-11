/// <reference path="../../types/globals.d.ts" />

export type Runtime = 'node' | 'bun' | 'deno';

export class RuntimeDetector {
  private static _runtime: Runtime | null = null;
  private static _bunVersion: string | null = null;

  static detect(): Runtime {
    if (this._runtime) {
      return this._runtime;
    }

    if (typeof globalThis.Bun !== 'undefined' && globalThis.Bun) {
      this._runtime = 'bun';
      this._bunVersion = globalThis.Bun.version;
      return 'bun';
    }

    if (typeof globalThis.Deno !== 'undefined' && globalThis.Deno) {
      this._runtime = 'deno';
      return 'deno';
    }

    this._runtime = 'node';
    return 'node';
  }

  static getBunVersion(): string | null {
    if (this._bunVersion !== null) {
      return this._bunVersion;
    }

    const runtime = this.detect();
    if (runtime === 'bun' && globalThis.Bun) {
      this._bunVersion = globalThis.Bun.version;
      return this._bunVersion;
    }

    return null;
  }

  static hasFeature(feature: 'spawn' | 'serve' | 'sqlite'): boolean {
    const runtime = this.detect();

    if (runtime === 'bun') {
      const bunGlobal = globalThis.Bun;
      if (!bunGlobal) return false;

      // eslint-disable-next-line default-case
      switch (feature) {
        case 'spawn':
          return typeof bunGlobal.spawn === 'function';
        case 'serve':
          return typeof (bunGlobal as any).serve === 'function';
        case 'sqlite':
          return typeof (bunGlobal as any).SQLite === 'function';
      }
    }

    if (runtime === 'node') {
      switch (feature) {
        case 'spawn':
          // Node.js always has spawn through child_process
          return true;
        default:
          return false;
      }
    }

    return false;
  }

  static isNode(): boolean {
    return this.detect() === 'node';
  }

  static isBun(): boolean {
    return this.detect() === 'bun';
  }

  static isDeno(): boolean {
    return this.detect() === 'deno';
  }

  static reset(): void {
    this._runtime = null;
    this._bunVersion = null;
  }
}