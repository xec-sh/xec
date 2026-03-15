import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, rm, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FileWatcher, watchFiles } from '../../../src/watch/index.js';

describe('FileWatcher', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'xec-watch-test-'));
    await mkdir(join(tempDir, 'src'), { recursive: true });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should detect file changes', async () => {
    const watcher = new FileWatcher(tempDir, {
      extensions: ['.ts'],
      debounce: 50,
    });

    const changes: string[] = [];
    watcher.on('change', (event) => {
      changes.push(event.relativePath);
    });

    watcher.start();

    // Create a file
    await writeFile(join(tempDir, 'test.ts'), 'const x = 1;');
    await new Promise((r) => setTimeout(r, 200));

    watcher.close();

    expect(changes.length).toBeGreaterThanOrEqual(1);
    expect(changes.some(c => c.includes('test.ts'))).toBe(true);
  });

  it('should filter by extension', async () => {
    const watcher = new FileWatcher(tempDir, {
      extensions: ['.ts'],
      debounce: 50,
    });

    const changes: string[] = [];
    watcher.on('change', (event) => {
      changes.push(event.relativePath);
    });

    watcher.start();

    // Create files with different extensions
    await writeFile(join(tempDir, 'test.ts'), 'export {}');
    await writeFile(join(tempDir, 'test.txt'), 'not watched');
    await new Promise((r) => setTimeout(r, 200));

    watcher.close();

    const tsChanges = changes.filter(c => c.endsWith('.ts'));
    const txtChanges = changes.filter(c => c.endsWith('.txt'));
    expect(tsChanges.length).toBeGreaterThanOrEqual(1);
    expect(txtChanges.length).toBe(0);
  });

  it('should ignore specified patterns', async () => {
    await mkdir(join(tempDir, 'node_modules'), { recursive: true });

    const watcher = new FileWatcher(tempDir, {
      extensions: ['.ts'],
      ignore: ['node_modules'],
      debounce: 50,
    });

    const changes: string[] = [];
    watcher.on('change', (event) => {
      changes.push(event.relativePath);
    });

    watcher.start();

    await writeFile(join(tempDir, 'node_modules', 'pkg.ts'), 'ignored');
    await writeFile(join(tempDir, 'src', 'app.ts'), 'watched');
    await new Promise((r) => setTimeout(r, 200));

    watcher.close();

    const nmChanges = changes.filter(c => c.includes('node_modules'));
    expect(nmChanges.length).toBe(0);
  });

  it('should emit ready event on start', () => {
    const watcher = new FileWatcher(tempDir);
    let ready = false;

    watcher.on('ready', () => { ready = true; });
    watcher.start();

    expect(ready).toBe(true);
    watcher.close();
  });

  it('should emit close event', () => {
    const watcher = new FileWatcher(tempDir);
    let closed = false;

    watcher.on('close', () => { closed = true; });
    watcher.start();
    watcher.close();

    expect(closed).toBe(true);
  });

  it('should throw when starting after close', () => {
    const watcher = new FileWatcher(tempDir);
    watcher.start();
    watcher.close();

    expect(() => watcher.start()).toThrow('Watcher has been closed');
  });

  it('should handle double close gracefully', () => {
    const watcher = new FileWatcher(tempDir);
    watcher.start();
    watcher.close();
    watcher.close(); // Should not throw
  });
});

describe('watchFiles', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'xec-watch-fn-'));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it('should return a stop function', async () => {
    const changes: string[] = [];
    const stop = watchFiles(tempDir, (event) => {
      changes.push(event.path);
    }, { extensions: ['.ts'], debounce: 50 });

    await writeFile(join(tempDir, 'test.ts'), 'x');
    await new Promise((r) => setTimeout(r, 200));

    stop();
    expect(typeof stop).toBe('function');
  });
});
