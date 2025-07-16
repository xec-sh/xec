import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import * as fs from 'fs/promises';

import { IStorageAdapter } from '../interfaces.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

export interface FileStorageOptions {
  basePath: string;
  encoding?: BufferEncoding;
  compression?: boolean;
  fileExtension?: string;
}

export class FileStorageAdapter implements IStorageAdapter {
  private basePath: string;
  private encoding: BufferEncoding;
  private compression: boolean;
  private fileExtension: string;
  private connected: boolean = false;

  constructor(options: FileStorageOptions) {
    this.basePath = options.basePath;
    this.encoding = options.encoding || 'utf8';
    this.compression = options.compression || false;
    this.fileExtension = options.fileExtension || '.json';
  }

  async connect(): Promise<void> {
    try {
      // Create base directory if it doesn't exist
      await fs.mkdir(this.basePath, { recursive: true, mode: 0o700 });
      
      // Test write permissions
      const testFile = path.join(this.basePath, '.test');
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      
      this.connected = true;
    } catch (error: any) {
      throw new Error(`Failed to connect to file storage: ${error.message}`);
    }
  }

  async disconnect(): Promise<void> {
    this.connected = false;
  }

  async get<T = any>(key: string): Promise<T | null> {
    this.ensureConnected();
    
    try {
      const filePath = this.getFilePath(key);
      
      if (this.compression) {
        // Read compressed data as buffer
        const compressedData = await fs.readFile(filePath);
        const decompressedData = await gunzip(compressedData);
        return JSON.parse(decompressedData.toString(this.encoding));
      }
      
      const data = await fs.readFile(filePath, this.encoding);
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      throw error;
    }
  }

  async set<T = any>(key: string, value: T): Promise<void> {
    this.ensureConnected();
    
    const filePath = this.getFilePath(key);
    const dir = path.dirname(filePath);
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true, mode: 0o700 });
    
    const data = JSON.stringify(value, null, 2);
    const tempFile = `${filePath}.tmp`;
    
    if (this.compression) {
      // Compress data before writing
      const compressedData = await gzip(Buffer.from(data, this.encoding));
      await fs.writeFile(tempFile, compressedData, { mode: 0o600 });
    } else {
      await fs.writeFile(tempFile, data, { encoding: this.encoding, mode: 0o600 });
    }
    
    // Atomic rename
    await fs.rename(tempFile, filePath);
  }

  async delete(key: string): Promise<void> {
    this.ensureConnected();
    
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      
      // Try to clean up empty directories
      await this.cleanupEmptyDirs(path.dirname(filePath));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Ignore if file doesn't exist
        return;
      }
      throw error;
    }
  }
  
  // Add a new method to check if deletion was successful
  async tryDelete(key: string): Promise<boolean> {
    this.ensureConnected();
    
    try {
      const filePath = this.getFilePath(key);
      await fs.unlink(filePath);
      
      // Try to clean up empty directories
      await this.cleanupEmptyDirs(path.dirname(filePath));
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // File doesn't exist
        return false;
      }
      throw error;
    }
  }

  async has(key: string): Promise<boolean> {
    this.ensureConnected();
    
    try {
      const filePath = this.getFilePath(key);
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async keys(prefix?: string): Promise<string[]> {
    this.ensureConnected();
    
    const keys: string[] = [];
    await this.scanDirectory(this.basePath, '', keys, prefix);
    return keys;
  }

  async clear(): Promise<void> {
    this.ensureConnected();
    
    try {
      const entries = await fs.readdir(this.basePath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue; // Skip hidden files
        
        const fullPath = path.join(this.basePath, entry.name);
        
        if (entry.isDirectory()) {
          await fs.rm(fullPath, { recursive: true, force: true });
        } else if (entry.isFile() && entry.name.endsWith(this.fileExtension)) {
          await fs.unlink(fullPath);
        }
      }
    } catch (error: any) {
      throw new Error(`Failed to clear storage: ${error.message}`);
    }
  }

  async size(): Promise<number> {
    this.ensureConnected();
    
    let totalSize = 0;
    await this.calculateSize(this.basePath, (size) => { totalSize += size; });
    return totalSize;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async batch<T = any>(operations: Array<{
    type?: 'get' | 'set' | 'delete';
    op?: 'get' | 'set' | 'delete';
    key: string;
    value?: T;
  }>): Promise<Array<T | null | boolean>> {
    this.ensureConnected();
    
    const results: Array<T | null | boolean> = [];
    
    for (const operation of operations) {
      const opType = operation.type || operation.op;
      switch (opType) {
        case 'get':
          results.push(await this.get<T>(operation.key));
          break;
        case 'set':
          await this.set(operation.key, operation.value);
          results.push(true);
          break;
        case 'delete': {
          const deleted = await this.tryDelete(operation.key);
          results.push(deleted);
          break;
        }
        default:
          throw new Error(`Unknown operation type: ${opType}`);
      }
    }
    
    return results;
  }

  async *scan(prefix: string, options?: any): AsyncIterator<[string, any]> {
    this.ensureConnected();
    
    // Recursively scan directories for files matching the prefix
    const scanDir = async function* (dir: string, currentPrefix: string): AsyncIterableIterator<string> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (entry.name.startsWith('.')) continue;
          
          const fullPath = path.join(dir, entry.name);
          const key = path.join(currentPrefix, entry.name);
          
          if (entry.isDirectory()) {
            yield* scanDir(fullPath, key);
          } else if (entry.isFile() && entry.name.endsWith('.json')) {
            const keyWithoutExt = key.slice(0, -5); // Remove .json extension
            if (keyWithoutExt.startsWith(prefix)) {
              yield keyWithoutExt;
            }
          }
        }
      } catch (error: any) {
        if (error.code !== 'ENOENT') {
          throw error;
        }
      }
    };
    
    // Scan from base path
    for await (const key of scanDir(this.basePath, '')) {
      const value = await this.get(key);
      if (value !== null) {
        yield [key, value];
      }
    }
  }

  private ensureConnected(): void {
    if (!this.connected) {
      throw new Error('Storage adapter not connected');
    }
  }

  private getFilePath(key: string): string {
    // Check for path traversal attempts first
    if (key.includes('..') || key.includes('~')) {
      throw new Error('Invalid key: path traversal attempt');
    }
    
    // Sanitize key to prevent path traversal and invalid characters
    const sanitizedKey = key.replace(/[^a-zA-Z0-9_\-:]/g, '_');
    const parts = sanitizedKey.split(':');
    
    // Convert key to file path
    const filePath = path.join(this.basePath, ...parts) + this.fileExtension;
    
    // Ensure the path is within basePath
    const normalizedPath = path.normalize(filePath);
    if (!normalizedPath.startsWith(path.normalize(this.basePath))) {
      throw new Error('Invalid key: path traversal attempt');
    }
    
    return normalizedPath;
  }

  private async scanDirectory(
    dir: string,
    prefix: string,
    keys: string[],
    filter?: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry.name);
        const keyPart = prefix ? `${prefix}:${entry.name}` : entry.name;
        
        if (entry.isDirectory()) {
          await this.scanDirectory(fullPath, keyPart, keys, filter);
        } else if (entry.isFile() && entry.name.endsWith(this.fileExtension)) {
          const key = keyPart.replace(this.fileExtension, '');
          
          if (!filter || key.startsWith(filter)) {
            keys.push(key);
          }
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async calculateSize(dir: string, callback: (size: number) => void): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          await this.calculateSize(fullPath, callback);
        } else if (entry.isFile()) {
          const stats = await fs.stat(fullPath);
          callback(stats.size);
        }
      }
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  private async cleanupEmptyDirs(dir: string): Promise<void> {
    if (dir === this.basePath) return;
    
    try {
      const entries = await fs.readdir(dir);
      if (entries.length === 0) {
        await fs.rmdir(dir);
        await this.cleanupEmptyDirs(path.dirname(dir));
      }
    } catch {
      // Ignore errors during cleanup
    }
  }
}