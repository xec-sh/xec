import { join } from 'node:path';
import { randomBytes } from 'node:crypto';

import { escapeArg } from './shell-escape.js';

import type { ExecutionEngine } from '../core/execution-engine.js';

export interface TempOptions {
  prefix?: string;
  suffix?: string;
  dir?: string;
  keep?: boolean;
}

export class TempFile {
  private _path: string;
  private _cleaned = false;

  constructor(
    private engine: ExecutionEngine,
    private options: TempOptions = {}
  ) {
    this._path = this.generatePath();
  }

  private generatePath(): string {
    const tmpDir = this.options.dir || '/tmp';
    const prefix = this.options.prefix || 'ush-';
    const suffix = this.options.suffix || '.tmp';
    const random = randomBytes(8).toString('hex');

    return join(tmpDir, `${prefix}${random}${suffix}`);
  }

  get path(): string {
    return this._path;
  }

  async create(content?: string): Promise<void> {
    const escapedPath = escapeArg(this._path);
    if (content !== undefined) {
      const escapedContent = escapeArg(content);
      await this.engine.execute({ command: `echo ${escapedContent} > ${escapedPath}`, shell: true });
    } else {
      await this.engine.execute({ command: `touch ${escapedPath}`, shell: true });
    }
  }


  async write(content: string): Promise<void> {
    const escapedPath = escapeArg(this._path);
    const escapedContent = escapeArg(content);
    await this.engine.execute({ command: `echo ${escapedContent} > ${escapedPath}`, shell: true });
  }

  async append(content: string): Promise<void> {
    const escapedPath = escapeArg(this._path);
    const escapedContent = escapeArg(content);
    await this.engine.execute({ command: `echo ${escapedContent} >> ${escapedPath}`, shell: true });
  }

  async read(): Promise<string> {
    const escapedPath = escapeArg(this._path);
    const result = await this.engine.execute({ command: `cat ${escapedPath}`, shell: true });
    return result.stdout;
  }


  async exists(): Promise<boolean> {
    try {
      const escapedPath = escapeArg(this._path);
      await this.engine.execute({ command: `test -f ${escapedPath}`, shell: true });
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<void> {
    if (!this._cleaned && !this.options.keep) {
      try {
        const escapedPath = escapeArg(this._path);
        await this.engine.execute({ command: `rm -f ${escapedPath}`, shell: true });
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
    private engine: ExecutionEngine,
    private options: TempOptions = {}
  ) {
    this._path = this.generatePath();
  }

  private generatePath(): string {
    const tmpDir = this.options.dir || '/tmp';
    const prefix = this.options.prefix || 'ush-';
    const random = randomBytes(8).toString('hex');

    return join(tmpDir, `${prefix}${random}`);
  }

  get path(): string {
    return this._path;
  }

  async create(): Promise<void> {
    const escapedPath = escapeArg(this._path);
    await this.engine.execute({ command: `mkdir -p ${escapedPath}`, shell: true });
  }


  async exists(): Promise<boolean> {
    try {
      const escapedPath = escapeArg(this._path);
      await this.engine.execute({ command: `test -d ${escapedPath}`, shell: true });
      return true;
    } catch {
      return false;
    }
  }

  file(name: string): string {
    return join(this._path, name);
  }

  async cleanup(): Promise<void> {
    if (!this._cleaned && !this.options.keep) {
      try {
        const escapedPath = escapeArg(this._path);
        await this.engine.execute({ command: `rm -rf ${escapedPath}`, shell: true });
        this._cleaned = true;
      } catch {
        // Ignore cleanup errors
      }
    }
  }

}

export async function withTempFile<T>(
  engine: ExecutionEngine,
  fn: (file: TempFile) => T | Promise<T>,
  options?: TempOptions
): Promise<T> {
  const file = new TempFile(engine, options);

  try {
    await file.create();
    return await fn(file);
  } finally {
    await file.cleanup();
  }
}

export async function withTempDir<T>(
  engine: ExecutionEngine,
  fn: (dir: TempDir) => T | Promise<T>,
  options?: TempOptions
): Promise<T> {
  const dir = new TempDir(engine, options);

  try {
    await dir.create();
    return await fn(dir);
  } finally {
    await dir.cleanup();
  }
}

