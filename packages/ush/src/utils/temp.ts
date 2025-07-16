import { tmpdir } from 'node:os';
import { promises as fs } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join, relative, normalize, isAbsolute } from 'node:path';

import { getAuditLogger } from './audit-logger.js';

export interface TempOptions {
  prefix?: string;
  suffix?: string;
  dir?: string;
  keep?: boolean;
  auditLogging?: boolean;
}

export class TempFile {
  private _path: string;
  private _cleaned = false;

  constructor(
    private options: TempOptions = {}
  ) {
    this._path = this.generatePath();
  }

  private generatePath(): string {
    const tempDir = this.options.dir || tmpdir();
    const prefix = this.options.prefix || 'ush-';
    const suffix = this.options.suffix || '.tmp';
    // Use UUID for better entropy (128 bits vs 64 bits)
    const random = randomUUID().replace(/-/g, '');

    return join(tempDir, `${prefix}${random}${suffix}`);
  }

  get path(): string {
    return this._path;
  }

  async create(content?: string): Promise<void> {
    try {
      if (content !== undefined) {
        await fs.writeFile(this._path, content, 'utf8');
      } else {
        // Create empty file
        await fs.writeFile(this._path, '', 'utf8');
      }
      
      // Log file creation
      if (this.options.auditLogging) {
        const auditLogger = getAuditLogger({ enabled: true });
        await auditLogger.logFileOperation('create', this._path, 'success', {
          type: 'temp_file',
          contentLength: content?.length ?? 0
        });
      }
    } catch (error) {
      // Log failed file creation
      if (this.options.auditLogging) {
        const auditLogger = getAuditLogger({ enabled: true });
        await auditLogger.logFileOperation('create', this._path, 'failure', {
          type: 'temp_file',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }

  async write(content: string): Promise<void> {
    try {
      await fs.writeFile(this._path, content, 'utf8');
      
      // Log file write
      if (this.options.auditLogging) {
        const auditLogger = getAuditLogger({ enabled: true });
        await auditLogger.logFileOperation('write', this._path, 'success', {
          type: 'temp_file',
          contentLength: content.length
        });
      }
    } catch (error) {
      // Log failed file write
      if (this.options.auditLogging) {
        const auditLogger = getAuditLogger({ enabled: true });
        await auditLogger.logFileOperation('write', this._path, 'failure', {
          type: 'temp_file',
          error: error instanceof Error ? error.message : String(error)
        });
      }
      throw error;
    }
  }

  async append(content: string): Promise<void> {
    await fs.appendFile(this._path, content, 'utf8');
  }

  async read(): Promise<string> {
    return await fs.readFile(this._path, 'utf8');
  }

  async exists(): Promise<boolean> {
    try {
      await fs.access(this._path);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (!this._cleaned && !this.options.keep) {
      try {
        await fs.unlink(this._path);
        this._cleaned = true;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export class TempDir {
  private _path: string;
  private _cleaned = false;

  constructor(
    private options: TempOptions = {}
  ) {
    this._path = this.generatePath();
  }

  private generatePath(): string {
    const tempDir = this.options.dir || tmpdir();
    const prefix = this.options.prefix || 'ush-';
    // Use UUID for better entropy
    const random = randomUUID().replace(/-/g, '');

    return join(tempDir, `${prefix}${random}`);
  }

  get path(): string {
    return this._path;
  }

  async create(): Promise<void> {
    await fs.mkdir(this._path, { recursive: true });
  }

  async exists(): Promise<boolean> {
    try {
      const stats = await fs.stat(this._path);
      return stats.isDirectory();
    } catch {
      return false;
    }
  }

  file(name: string): string {
    // Prevent path traversal by validating the name
    
    // Check for absolute paths
    if (isAbsolute(name)) {
      throw new Error(`Invalid file name: ${name}`);
    }
    
    const normalizedName = normalize(name);
    const resolved = join(this._path, normalizedName);
    
    // Ensure the resolved path is still within our temp directory
    const relativePath = relative(this._path, resolved);
    if (relativePath.startsWith('..')) {
      throw new Error(`Invalid file name: ${name}`);
    }
    
    return resolved;
  }

  async cleanup(): Promise<void> {
    if (!this._cleaned && !this.options.keep) {
      try {
        await fs.rm(this._path, { recursive: true, force: true });
        this._cleaned = true;
      } catch {
        // Ignore cleanup errors
      }
    }
  }
}

export async function withTempFile<T>(
  fn: (file: TempFile) => T | Promise<T>,
  options?: TempOptions
): Promise<T> {
  const file = new TempFile(options);

  try {
    await file.create();
    return await fn(file);
  } finally {
    await file.cleanup();
  }
}

export async function withTempDir<T>(
  fn: (dir: TempDir) => T | Promise<T>,
  options?: TempOptions
): Promise<T> {
  const dir = new TempDir(options);

  try {
    await dir.create();
    return await fn(dir);
  } finally {
    await dir.cleanup();
  }
}