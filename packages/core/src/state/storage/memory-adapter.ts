import { IStorageAdapter } from '../interfaces';

export class MemoryStorageAdapter implements IStorageAdapter {
  private data: Map<string, any> = new Map();
  private connected: boolean = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async get(key: string): Promise<any> {
    this.ensureConnected();
    const value = this.data.get(key);
    return value !== undefined ? this.deepClone(value) : null;
  }

  async set(key: string, value: any): Promise<void> {
    this.ensureConnected();
    this.data.set(key, this.deepClone(value));
  }

  async delete(key: string): Promise<void> {
    this.ensureConnected();
    this.data.delete(key);
  }

  async *scan(prefix: string, options?: any): AsyncIterator<[string, any]> {
    this.ensureConnected();
    const limit = options?.limit || Infinity;
    let count = 0;

    for (const [key, value] of this.data.entries()) {
      if (key.startsWith(prefix)) {
        yield [key, this.deepClone(value)];
        count++;
        if (count >= limit) break;
      }
    }
  }

  async batch(operations: Array<{ op: 'get' | 'set' | 'delete'; key: string; value?: any }>): Promise<any[]> {
    this.ensureConnected();
    const results: any[] = [];

    for (const operation of operations) {
      switch (operation.op) {
        case 'get':
          results.push(await this.get(operation.key));
          break;
        case 'set':
          await this.set(operation.key, operation.value);
          results.push(true);
          break;
        case 'delete':
          await this.delete(operation.key);
          results.push(true);
          break;
        default:
          throw new Error(`Unknown operation: ${operation.op}`);
      }
    }

    return results;
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  async size(): Promise<number> {
    return this.data.size;
  }

  async keys(prefix?: string): Promise<string[]> {
    const keys: string[] = [];
    
    for (const key of this.data.keys()) {
      if (!prefix || key.startsWith(prefix)) {
        keys.push(key);
      }
    }

    return keys;
  }

  async has(key: string): Promise<boolean> {
    return this.data.has(key);
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Storage adapter is not connected');
    }
  }

  private deepClone(obj: any): any {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    if (obj instanceof Map) return new Map(Array.from(obj.entries()).map(([k, v]) => [k, this.deepClone(v)]));
    if (obj instanceof Set) return new Set(Array.from(obj).map(item => this.deepClone(item)));
    
    const clonedObj: any = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        clonedObj[key] = this.deepClone(obj[key]);
      }
    }
    
    return clonedObj;
  }
}