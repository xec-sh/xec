export type Runtime = 'node' | 'bun' | 'deno';

export class RuntimeDetector {
  private static _runtime: Runtime | null = null;
  private static _bunVersion: string | null = null;

  static detect(): Runtime {
    if (this._runtime) {
      return this._runtime;
    }

    // @ts-ignore - Bun global might not exist
    if (typeof Bun !== 'undefined') {
      this._runtime = 'bun';
      // @ts-ignore
      this._bunVersion = Bun.version;
      return 'bun';
    }
    
    // @ts-ignore - Deno global might not exist
    if (typeof Deno !== 'undefined') {
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
    if (runtime === 'bun') {
      // @ts-ignore
      this._bunVersion = Bun.version;
      return this._bunVersion;
    }

    return null;
  }
  
  static hasFeature(feature: 'spawn' | 'serve' | 'sqlite'): boolean {
    const runtime = this.detect();
    
    if (runtime === 'bun') {
      // @ts-ignore - Bun global might not exist
      const bunGlobal = globalThis.Bun;
      if (!bunGlobal) return false;
      
      switch (feature) {
        case 'spawn': 
          return typeof bunGlobal.spawn === 'function';
        case 'serve': 
          return typeof bunGlobal.serve === 'function';
        case 'sqlite': 
          return typeof bunGlobal.SQLite === 'function';
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