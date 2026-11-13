/**
 * File watcher with debounce, path filtering, and explicit lifecycle management.
 * Uses native Node.js notifications or bounded filesystem polling.
 *
 * @module @xec-sh/loader/watch/file-watcher
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { EventEmitter } from 'node:events';

/**
 * File change event
 */
export interface FileChangeEvent {
  /** Type of change */
  type: 'add' | 'change' | 'unlink';
  /** Absolute path of the changed file */
  path: string;
  /** Relative path from the watched directory */
  relativePath: string;
  /** Timestamp of the change */
  timestamp: number;
}

/**
 * Watch options
 */
export interface WatchOptions {
  /** Debounce interval in milliseconds (default: 200) */
  debounce?: number;
  /** File extensions to watch; an empty array watches all files (default: ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx']) */
  extensions?: string[];
  /** Path fragments to ignore (default: ['node_modules', '.git', 'dist', 'coverage', '.turbo']) */
  ignore?: string[];
  /** Watch subdirectories recursively (default: true) */
  recursive?: boolean;
  /**
   * Poll the filesystem instead of subscribing to it (default: false).
   *
   * `fs.watch` subscribes to the operating system, and the operating
   * system can stop delivering: a wedged fseventsd on macOS leaves every
   * watcher silent while reporting success, and network filesystems never
   * deliver at all. Polling costs a stat per file per interval and works
   * where subscription does not.
   */
  poll?: boolean;
  /** Interval between polls in milliseconds (default: 1000) */
  pollInterval?: number;
  /** Keep the event loop alive until close() (default: true, matching fs.watch). */
  persistent?: boolean;
}

type WatchEventMap = {
  change: [event: FileChangeEvent];
  error: [error: Error];
  ready: [];
  close: [];
};

/**
 * Efficient file watcher with debounce and filtering.
 *
 * Uses Node.js native `fs.watch` by default. Select `poll: true` when
 * native notifications are unreliable or unavailable. Errors close the watcher
 * and are reported through the error event; ready means every root is watched.
 *
 * @example
 * ```typescript
 * const watcher = new FileWatcher('./src', {
 *   extensions: ['.ts'],
 *   debounce: 300,
 * });
 *
 * watcher.on('change', (event) => {
 *   console.log(`${event.type}: ${event.relativePath}`);
 *   // Re-execute script, reload module, etc.
 * });
 *
 * await watcher.start();
 * // ... later
 * watcher.close();
 * ```
 */
export class FileWatcher extends EventEmitter<WatchEventMap> {
  private watchers: fs.FSWatcher[] = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private pollState = new Map<string, string>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly options: Required<WatchOptions>;
  private closed = false;
  private started = false;

  constructor(
    private readonly directories: string | string[],
    options: WatchOptions = {}
  ) {
    super();
    this.options = {
      debounce: options.debounce ?? 200,
      extensions: options.extensions ?? ['.ts', '.js', '.mjs', '.cjs', '.tsx', '.jsx'],
      ignore: options.ignore ?? ['node_modules', '.git', 'dist', 'coverage', '.turbo'],
      recursive: options.recursive ?? true,
      poll: options.poll ?? false,
      pollInterval: options.pollInterval ?? 1000,
      persistent: options.persistent ?? true,
    };
    if (!Number.isFinite(this.options.pollInterval) || this.options.pollInterval <= 0)
      throw new RangeError('pollInterval must be a positive finite number');
    if (!Number.isFinite(this.options.debounce) || this.options.debounce < 0)
      throw new RangeError('debounce must be a nonnegative finite number');
  }

  /**
   * Start watching directories.
   */
  start(): void {
    if (this.closed) throw new Error('Watcher has been closed');
    if (this.started) return;
    this.started = true;
    const dirs = [...new Set((Array.isArray(this.directories) ? this.directories : [this.directories])
      .map(dir => path.resolve(dir)))];

    try {
      if (!dirs.length) throw new Error('At least one watch directory is required');
      if (this.options.poll) this.startPolling(dirs);
      else {
        for (const absoluteDir of dirs) {
          const watcher = fs.watch(absoluteDir, {
            recursive: this.options.recursive, persistent: this.options.persistent,
          }, (eventType, filename) => {
            if (!filename) {
              this.fail(new Error(`Native watcher did not identify a change in ${absoluteDir}; use polling for this filesystem`));
              return;
            }
            this.handleChange(absoluteDir, String(filename), eventType);
          });
          watcher.on('error', error => this.fail(error));
          this.watchers.push(watcher);
        }
      }
    } catch (error) {
      this.fail(error instanceof Error ? error : new Error(String(error)));
      return;
    }
    this.emit('ready');
  }

  private fail(error: Error): void {
    if (this.closed) return;
    try { this.emit('error', error); }
    finally { this.close(); }
  }

  /** A complete sweep is committed before comparing changes, so a failed read
   * cannot turn an unreadable tree into false unlink events. */
  private startPolling(roots: string[]): void {
    const sweep = (emit: boolean): void => {
      const next = new Map<string, string>();
      const walk = (dir: string, root: boolean): void => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch (error) {
          // A child removed during this sweep is a real change. The configured
          // root itself disappearing, or a permission/I/O error, ends the watch.
          if (!root && ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) return;
          throw error;
        }
        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (this.options.ignore.some(pattern => full.includes(pattern))) continue;
          if (entry.isDirectory()) {
            if (this.options.recursive) walk(full, false);
            continue;
          }
          if (!entry.isFile()) continue;
          if (this.options.extensions.length && !this.options.extensions.includes(path.extname(entry.name))) continue;
          let stat: fs.Stats;
          try { stat = fs.statSync(full); }
          catch (error) {
            if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) continue;
            throw error;
          }
          // An editor may atomically replace a file while preserving mtime.
          next.set(full, `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}`);
        }
      };
      for (const root of roots) walk(root, true);
      const previous = this.pollState;
      this.pollState = next;
      if (!emit) return;
      const notify = (file: string, type: 'rename' | 'change') => {
        const root = roots.find(candidate => file.startsWith(candidate.endsWith(path.sep) ? candidate : candidate + path.sep))!;
        this.handleChange(root, path.relative(root, file), type);
      };
      for (const [file, identity] of next) {
        const prior = previous.get(file);
        if (prior !== identity) notify(file, prior === undefined ? 'rename' : 'change');
      }
      for (const file of previous.keys()) {
        if (!next.has(file)) notify(file, 'rename');
      }
    };

    sweep(false);
    this.pollTimer = setInterval(() => {
      try { sweep(true); }
      catch (error) { this.fail(error instanceof Error ? error : new Error(String(error))); }
    }, this.options.pollInterval);
    if (!this.options.persistent) this.pollTimer.unref();
  }

  /**
   * Stop watching and clean up all resources.
   */
  close(): void {
    if (this.closed) return;
    this.closed = true;

    // Clear all debounce timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollState.clear();

    // Close all watchers
    for (const watcher of this.watchers) {
      watcher.close();
    }
    this.watchers = [];

    this.emit('close');
    this.removeAllListeners();
  }

  private handleChange(baseDir: string, filename: string, eventType: 'rename' | 'change'): void {
    if (this.closed) return;
    const absolutePath = path.join(baseDir, filename);
    const ext = path.extname(filename);

    // Filter by extension; an empty list means "watch all files"
    if (this.options.extensions.length > 0 && !this.options.extensions.includes(ext)) return;

    // Filter by ignore patterns
    for (const pattern of this.options.ignore) {
      if (filename.includes(pattern) || filename.startsWith(pattern)) return;
    }

    // Debounce: coalesce rapid changes to the same file
    const existing = this.debounceTimers.get(absolutePath);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      this.debounceTimers.delete(absolutePath);

      // Determine change type
      let type: FileChangeEvent['type'];
      try {
        fs.statSync(absolutePath);
        type = eventType === 'rename' ? 'add' : 'change';
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
          this.fail(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        type = 'unlink';
      }

      const event: FileChangeEvent = {
        type,
        path: absolutePath,
        relativePath: path.relative(baseDir, absolutePath),
        timestamp: Date.now(),
      };

      this.emit('change', event);
    }, this.options.debounce);
    if (!this.options.persistent) timer.unref();
    this.debounceTimers.set(absolutePath, timer);
  }
}

/**
 * Watch files and execute a callback on changes.
 * Convenience function wrapping FileWatcher.
 *
 * @example
 * ```typescript
 * const stop = watchFiles('./src', async (event) => {
 *   console.log(`Changed: ${event.relativePath}`);
 *   await executor.executeScript('./main.ts');
 * });
 *
 * // Later:
 * stop();
 * ```
 */
export function watchFiles(
  directories: string | string[],
  onChange: (event: FileChangeEvent) => void | Promise<void>,
  options?: WatchOptions
): () => void {
  const watcher = new FileWatcher(directories, options);

  watcher.on('change', (event) => {
    Promise.resolve().then(() => onChange(event)).catch((error) => {
      console.error('Watch handler error:', error);
    });
  });

  watcher.start();

  return () => watcher.close();
}
