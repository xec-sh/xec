import type { ModuleExports, ModuleExecutionOptions } from '../types/index.js';

import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { open, mkdir, lstat, unlink } from 'node:fs/promises';

interface OwnedModule {
  file: string;
  identity?: { dev: number; ino: number };
  active: boolean;
}

/** Execute an explicitly selected module format once through the native loader. */
export class ModuleExecutor {
  private readonly directory: string;
  private readonly files = new Set<OwnedModule>();

  constructor(directory = tmpdir()) {
    this.directory = resolve(directory);
  }

  execute(options: ModuleExecutionOptions): Promise<ModuleExports> {
    return this.withModule(options, module => module);
  }

  /** Keep the owned source file alive until the caller's module callback settles. */
  async withModule<T>(
    options: ModuleExecutionOptions,
    use: (module: ModuleExports) => Promise<T> | T,
  ): Promise<T> {
    if (typeof options.content !== 'string' || typeof options.specifier !== 'string' || !options.specifier)
      throw new TypeError('Module execution requires source text and an explicit specifier');
    const type = options.type ?? 'esm';
    if (!['esm', 'unknown', 'cjs', 'umd'].includes(type))
      throw new TypeError('Unsupported module format');
    const extension = type === 'cjs' || type === 'umd' ? 'cjs' : 'mjs';
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = join(this.directory, `.xec-module-${randomBytes(16).toString('hex')}.${extension}`);
    const handle = await open(file, 'wx', 0o600);
    const owned: OwnedModule = { file, active: true };
    this.files.add(owned);
    let closed = false;
    let failed = false;
    let failure: unknown;
    let result: T | undefined;
    try {
      const identity = await handle.stat();
      owned.identity = { dev: identity.dev, ino: identity.ino };
      await handle.writeFile(options.content, 'utf8');
      await handle.close();
      closed = true;
      // Never retry executable code in another format after a thrown error.
      const module: ModuleExports = await import(pathToFileURL(file).href);
      result = await use(module);
    } catch (error) {
      failed = true;
      failure = error;
    }
    try {
      if (!closed) await handle.close();
    } catch (error) {
      failure = failed ? new AggregateError([failure, error], 'Module execution and file closure failed') : error;
      failed = true;
    }
    owned.active = false;
    try {
      await this.removeOwned(owned);
    } catch (error) {
      failure = failed ? new AggregateError([failure, error], 'Module execution and cleanup failed') : error;
      failed = true;
    }
    if (failed) throw failure;
    return result as T;
  }

  private async removeOwned(owned: OwnedModule): Promise<void> {
    if (!owned.identity) throw new Error(`Cannot confirm temporary module ownership: ${owned.file}`);
    let current;
    try {
      current = await lstat(owned.file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.files.delete(owned);
      return;
    }
    if (!current.isFile() || current.dev !== owned.identity.dev || current.ino !== owned.identity.ino)
      throw new Error(`Temporary module identity changed; retained: ${owned.file}`);
    await unlink(owned.file);
    this.files.delete(owned);
  }

  /** Retry cleanup of this instance's retained files; never remove the caller's directory. */
  async cleanup(): Promise<void> {
    if ([...this.files].some(file => file.active)) throw new Error('Module execution is still active');
    const failures: unknown[] = [];
    for (const file of this.files) {
      try { await this.removeOwned(file); } catch (error) { failures.push(error); }
    }
    if (failures.length) throw new AggregateError(failures, 'Temporary module cleanup is incomplete');
  }
}
