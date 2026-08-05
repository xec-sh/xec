/**
 * File watcher with debounce, glob patterns, and proper lifecycle management.
 * Uses native Node.js fs.watch (recursive) — zero external dependencies.
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
  /** Glob patterns to ignore (default: ['node_modules', '.git', 'dist', 'coverage']) */
  ignore?: string[];
  /** Watch subdirectories recursively (default: true) */
  recursive?: boolean;
  /** Run handler immediately on start (default: false) */
  runOnStart?: boolean;
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
 * Uses Node.js native `fs.watch` with recursive support (available on
 * macOS, Windows, and Linux 5.1+). Falls back to polling on older Linux.
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
  private pollState = new Map<string, number>();
  private debounceTimers = new Map<string, NodeJS.Timeout>();
  private readonly options: Required<WatchOptions>;
  private closed = false;

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
      runOnStart: options.runOnStart ?? false,
      poll: options.poll ?? false,
      pollInterval: options.pollInterval ?? 1000,
    };
  }

  /**
   * Start watching directories.
   */
  start(): void {
    if (this.closed) throw new Error('Watcher has been closed');

    const dirs = Array.isArray(this.directories) ? this.directories : [this.directories];

    if (this.options.poll) {
      this.startPolling(dirs.map(dir => path.resolve(dir)));
      this.emit('ready');
      return;
    }

    for (const dir of dirs) {
      const absoluteDir = path.resolve(dir);
      try {
        const watcher = fs.watch(absoluteDir, { recursive: this.options.recursive }, (eventType, filename) => {
          if (!filename) return;
          this.handleChange(absoluteDir, filename, eventType as 'rename' | 'change');
        });

        watcher.on('error', (error) => {
          this.emit('error', error);
        });

        this.watchers.push(watcher);
      } catch (error) {
        this.emit('error', error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.emit('ready');
  }

  /**
   * Walk the tree and report files whose modification time moved.
   *
   * The first sweep records the state without emitting: a watcher that
   * announced every existing file as changed the moment it started would
   * trigger the very rebuild the operator was waiting to avoid.
   */
  private startPolling(roots: string[]): void {
    const sweep = (emit: boolean): void => {
      const seen = new Set<string>();

      const walk = (dir: string): void => {
        let entries: fs.Dirent[];
        try {
          entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
          return; // A directory that vanished mid-sweep is not an error.
        }

        for (const entry of entries) {
          const full = path.join(dir, entry.name);
          if (this.options.ignore.some(pattern => full.includes(pattern))) continue;

          if (entry.isDirectory()) {
            if (this.options.recursive) walk(full);
            continue;
          }
          if (!entry.isFile()) continue;

          seen.add(full);
          let mtime: number;
          try {
            mtime = fs.statSync(full).mtimeMs;
          } catch {
            continue;
          }

          const previous = this.pollState.get(full);
          this.pollState.set(full, mtime);
          if (!emit) continue;
          if (previous === undefined) {
            this.handleChange(path.dirname(full), path.basename(full), 'rename');
          } else if (previous !== mtime) {
            this.handleChange(path.dirname(full), path.basename(full), 'change');
          }
        }
      };

      for (const root of roots) walk(root);

      if (emit) {
        for (const known of [...this.pollState.keys()]) {
          if (!seen.has(known)) {
            this.pollState.delete(known);
            this.handleChange(path.dirname(known), path.basename(known), 'rename');
          }
        }
      }
    };

    sweep(false);
    this.pollTimer = setInterval(() => sweep(true), this.options.pollInterval);
    // A poll loop must not be the reason a program stays alive.
    const timer = this.pollTimer as NodeJS.Timeout & { unref?: () => void };
    timer.unref?.();
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

    this.debounceTimers.set(absolutePath, setTimeout(() => {
      this.debounceTimers.delete(absolutePath);

      // Determine change type
      let type: FileChangeEvent['type'];
      try {
        fs.statSync(absolutePath);
        type = eventType === 'rename' ? 'add' : 'change';
      } catch {
        type = 'unlink';
      }

      const event: FileChangeEvent = {
        type,
        path: absolutePath,
        relativePath: path.relative(baseDir, absolutePath),
        timestamp: Date.now(),
      };

      this.emit('change', event);
    }, this.options.debounce));
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
    Promise.resolve(onChange(event)).catch((error) => {
      console.error('Watch handler error:', error);
    });
  });

  watcher.start();

  return () => watcher.close();
}
