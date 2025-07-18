import { IStorageAdapter } from '../interfaces.js';

export interface RedisStorageOptions {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  ttl?: number;
  connectionTimeout?: number;
  retryStrategy?: (times: number) => number | null;
}

// Mock Redis client interface for now
interface RedisClient {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, options?: { EX?: number }): Promise<string>;
  del(key: string): Promise<number>;
  exists(key: string): Promise<number>;
  keys(pattern: string): Promise<string[]>;
  flushdb(): Promise<string>;
  dbsize(): Promise<number>;
  multi(): any;
  ping(): Promise<string>;
  scan(cursor: string, ...args: any[]): Promise<[string, string[]]>;
}

// Mock implementation for development
class MockRedisClient implements RedisClient {
  private data: Map<string, { value: string; expires?: number }> = new Map();
  private connected: boolean = false;

  async connect(): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async get(key: string): Promise<string | null> {
    const item = this.data.get(key);
    if (!item) return null;

    if (item.expires && Date.now() > item.expires) {
      this.data.delete(key);
      return null;
    }

    return item.value;
  }

  async set(key: string, value: string, options?: { EX?: number }): Promise<string> {
    const expires = options?.EX ? Date.now() + (options.EX * 1000) : undefined;
    this.data.set(key, { value, expires });
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.data.delete(key) ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.data.has(key) ? 1 : 0;
  }

  async keys(pattern: string): Promise<string[]> {
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return Array.from(this.data.keys()).filter(key => regex.test(key));
  }

  async flushdb(): Promise<string> {
    this.data.clear();
    return 'OK';
  }

  async dbsize(): Promise<number> {
    return this.data.size;
  }

  multi(): any {
    // Simplified multi implementation
    const commands: Array<() => Promise<any>> = [];
    const multi = {
      get: (key: string) => {
        commands.push(() => this.get(key));
        return multi;
      },
      set: (key: string, value: string, options?: any) => {
        commands.push(() => this.set(key, value, options));
        return multi;
      },
      del: (key: string) => {
        commands.push(() => this.del(key));
        return multi;
      },
      exec: async () => {
        const results = [];
        for (const cmd of commands) {
          results.push(await cmd());
        }
        return results;
      }
    };
    return multi;
  }

  async ping(): Promise<string> {
    return 'PONG';
  }

  async scan(cursor: string, ...args: any[]): Promise<[string, string[]]> {
    // Parse SCAN arguments
    let match = '*';
    let count = 10;

    for (let i = 0; i < args.length; i += 2) {
      if (args[i] === 'MATCH') {
        match = args[i + 1];
      } else if (args[i] === 'COUNT') {
        count = parseInt(args[i + 1]);
      }
    }

    // Get all keys matching pattern
    const keys = await this.keys(match);
    const startIndex = parseInt(cursor);
    const endIndex = Math.min(startIndex + count, keys.length);

    const resultKeys = keys.slice(startIndex, endIndex);
    const nextCursor = endIndex >= keys.length ? '0' : endIndex.toString();

    return [nextCursor, resultKeys];
  }
}

export class RedisStorageAdapter implements IStorageAdapter {
  private client: RedisClient;
  private options: RedisStorageOptions;
  private keyPrefix: string;
  private connected: boolean = false;

  constructor(options: RedisStorageOptions) {
    this.options = options;
    this.keyPrefix = options.keyPrefix || 'xec:';

    // TODO: Replace with actual Redis client when implementing
    // For now, use mock implementation
    this.client = new MockRedisClient();
  }

  async connect(): Promise<void> {
    try {
      await this.client.connect();

      // Test connection
      await this.client.ping();

      this.connected = true;
    } catch (error: any) {
      throw new Error(`Failed to connect to Redis: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.client.disconnect();
      this.connected = false;
    }
  }

  async get<T = any>(key: string): Promise<T | null> {
    this.ensureConnected();

    const fullKey = this.getFullKey(key);
    const value = await this.client.get(fullKey);

    if (value === null) {
      return null;
    }

    try {
      return JSON.parse(value);
    } catch {
      // Return as string if not valid JSON
      return value as any;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    this.ensureConnected();

    const fullKey = this.getFullKey(key);
    const serialized = JSON.stringify(value);

    const options: { EX?: number } = {};
    if (this.options.ttl) {
      options.EX = this.options.ttl;
    }

    await this.client.set(fullKey, serialized, options);
  }

  async delete(key: string): Promise<void> {
    this.ensureConnected();

    const fullKey = this.getFullKey(key);
    await this.client.del(fullKey);
  }

  async has(key: string): Promise<boolean> {
    this.ensureConnected();

    const fullKey = this.getFullKey(key);
    const result = await this.client.exists(fullKey);

    return result > 0;
  }

  async keys(prefix?: string): Promise<string[]> {
    this.ensureConnected();

    const pattern = prefix
      ? `${this.keyPrefix}${prefix}*`
      : `${this.keyPrefix}*`;

    const fullKeys = await this.client.keys(pattern);

    // Remove key prefix
    return fullKeys.map(key => key.substring(this.keyPrefix.length));
  }

  async clear(): Promise<void> {
    this.ensureConnected();

    if (this.options.db !== undefined) {
      // If using a specific database, we can safely flush it
      await this.client.flushdb();
    } else {
      // Otherwise, delete keys with our prefix
      const keysToDelete = await this.client.keys(`${this.keyPrefix}*`);

      if (keysToDelete.length > 0) {
        const multi = this.client.multi();
        for (const key of keysToDelete) {
          multi.del(key);
        }
        await multi.exec();
      }
    }
  }

  async size(): Promise<number> {
    this.ensureConnected();

    if (this.options.db !== undefined) {
      // If using a specific database, return total size
      return await this.client.dbsize();
    } else {
      // Otherwise, count keys with our prefix
      const keys = await this.client.keys(`${this.keyPrefix}*`);
      return keys.length;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  async batch<T = any>(operations: Array<{
    op: 'get' | 'set' | 'delete';
    key: string;
    value?: T;
  }>): Promise<Array<T | null | boolean>> {
    this.ensureConnected();

    const multi = this.client.multi();
    const getIndices: number[] = [];

    operations.forEach((op, index) => {
      const fullKey = this.getFullKey(op.key);

      switch (op.op) {
        case 'get':
          multi.get(fullKey);
          getIndices.push(index);
          break;
        case 'set': {
          const serialized = JSON.stringify(op.value);
          if (this.options.ttl) {
            multi.set(fullKey, serialized, { EX: this.options.ttl });
          } else {
            multi.set(fullKey, serialized);
          }
          break;
        }
        case 'delete':
          multi.del(fullKey);
          break;
        default:
          throw new Error(`Unknown operation type: ${op.op}`);
      }
    });

    const results = await multi.exec();

    return results.map((result: any, index: number) => {
      const op = operations[index];
      if (!op) return null;

      switch (op.op) {
        case 'get':
          if (result === null) return null;
          try {
            return JSON.parse(result);
          } catch {
            return result;
          }
        case 'set':
          return true;
        case 'delete':
          return true;
        default:
          return null;
      }
    });
  }

  async *scan(prefix: string, options?: any): AsyncIterator<[string, any]> {
    this.ensureConnected();

    const fullPrefix = this.getFullKey(prefix);
    let cursor = '0';
    const count = options?.count || 100;

    do {
      // Use SCAN command with cursor
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        `${fullPrefix}*`,
        'COUNT',
        count
      );

      cursor = nextCursor;

      for (const key of keys) {
        const value = await this.client.get(key);
        if (value) {
          try {
            const parsed = JSON.parse(value);
            // Remove the key prefix to return the original key
            const originalKey = key.slice(this.keyPrefix.length);
            yield [originalKey, parsed];
          } catch {
            // If JSON parsing fails, return raw value
            const originalKey = key.slice(this.keyPrefix.length);
            yield [originalKey, value];
          }
        }
      }
    } while (cursor !== '0');
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Redis storage adapter not connected');
    }
  }

  private getFullKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}