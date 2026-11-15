import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { readRegularFile } from '../src/files.js';

vi.mock('node:fs/promises', async importOriginal => ({ ...await importOriginal<typeof import('node:fs/promises')>() }));

describe('bounded SSH regular-file input', () => {
  let directory: string;
  let file: string;
  const handles = new Set<fs.FileHandle>();
  beforeEach(async () => {
    directory = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-ssh-file-'));
    file = path.join(directory, 'synthetic-key');
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    for (const handle of handles) if (handle.fd !== -1) await handle.close();
    handles.clear();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it('preserves exact binary bytes and permits a bounded empty file', async () => {
    const value = Buffer.from([0, 1, 128, 255, 10]);
    await fs.writeFile(file, value);
    expect(await readRegularFile(file, value.length)).toEqual(value);
    await expect(readRegularFile(file, value.length - 1)).rejects.toMatchObject({ code: 'EFBIG' });
    await fs.writeFile(file, '');
    expect(await readRegularFile(file, 0)).toEqual(Buffer.alloc(0));
  });

  it('rejects directories and leaves missing-file policy to its caller', async () => {
    await expect(readRegularFile(directory, 1024)).rejects.toMatchObject({ code: process.platform === 'win32' ? 'EISDIR' : 'EINVAL' });
    await expect(readRegularFile(file, 1024)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('enforces the measured limit when a regular file grows after stat', async () => {
    await fs.writeFile(file, 'ab');
    const originalOpen = fs.open;
    let observedBytes = 0;
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      const stat = handle.stat.bind(handle);
      const read = handle.read.bind(handle);
      vi.spyOn(handle, 'stat').mockImplementation(async () => {
        const metadata = await stat();
        await fs.appendFile(file, 'x'.repeat(4096));
        return metadata;
      });
      vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof read>) => {
        const result = await read(...args);
        observedBytes += result.bytesRead;
        return result;
      });
      return handle;
    });
    await expect(readRegularFile(file, 4)).rejects.toMatchObject({ code: 'EFBIG' });
    expect(observedBytes).toBe(5);
    for (const handle of handles) expect(handle.fd).toBe(-1);
  });

  it('does not open a file when already aborted', async () => {
    const controller = new AbortController();
    const reason = new Error('cancel before opening');
    controller.abort(reason);
    const spy = vi.spyOn(fs, 'open');
    await expect(readRegularFile(file, 1024, { signal: controller.signal })).rejects.toBe(reason);
    expect(spy).not.toHaveBeenCalled();
  });

  it('closes a descriptor if cancellation arrives while opening', async () => {
    await fs.writeFile(file, 'private fixture');
    const originalOpen = fs.open;
    const controller = new AbortController();
    const reason = new Error('cancel during opening');
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      controller.abort(reason);
      return handle;
    });
    await expect(readRegularFile(file, 1024, { signal: controller.signal })).rejects.toBe(reason);
    for (const handle of handles) expect(handle.fd).toBe(-1);
  });

  it('does not return bytes after cancellation during a read', async () => {
    await fs.writeFile(file, 'private fixture');
    const originalOpen = fs.open;
    const controller = new AbortController();
    const reason = new Error('cancel during reading');
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      const read = handle.read.bind(handle);
      vi.spyOn(handle, 'read').mockImplementation(async (...args: Parameters<typeof read>) => {
        const result = await read(...args);
        controller.abort(reason);
        return result;
      });
      return handle;
    });
    await expect(readRegularFile(file, 1024, { signal: controller.signal })).rejects.toBe(reason);
    for (const handle of handles) expect(handle.fd).toBe(-1);
  });

  it('does not return bytes if cancellation arrives before close completes', async () => {
    await fs.writeFile(file, 'private fixture');
    const originalOpen = fs.open;
    const controller = new AbortController();
    const reason = new Error('cancel while closing');
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      const close = handle.close.bind(handle);
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); controller.abort(reason); });
      return handle;
    });
    await expect(readRegularFile(file, 1024, { signal: controller.signal })).rejects.toBe(reason);
    for (const handle of handles) expect(handle.fd).toBe(-1);
  });

  it('preserves both read and close errors while releasing its descriptor', async () => {
    await fs.writeFile(file, 'private fixture');
    const originalOpen = fs.open;
    const primary = new Error('read failure');
    const cleanup = new Error('close failure');
    vi.spyOn(fs, 'open').mockImplementation(async (name, flags, mode) => {
      const handle = await originalOpen(name, flags, mode);
      handles.add(handle);
      const close = handle.close.bind(handle);
      vi.spyOn(handle, 'read').mockRejectedValue(primary);
      vi.spyOn(handle, 'close').mockImplementation(async () => { await close(); throw cleanup; });
      return handle;
    });
    const error = await readRegularFile(file, 1024).catch(error => error);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([primary, cleanup]);
    for (const handle of handles) expect(handle.fd).toBe(-1);
  });

  it('validates the byte limit before opening the path', async () => {
    const spy = vi.spyOn(fs, 'open');
    for (const value of [-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      await expect(readRegularFile(file, value)).rejects.toMatchObject({ code: 'EINVAL' });
    }
    expect(spy).not.toHaveBeenCalled();
  });
});
