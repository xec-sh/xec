import { it, vi, expect, describe } from 'vitest';

import { batchAsync, loadChunked, streamToArray, arrayToStream, asyncIterableToArray } from '../src/index.js';

describe('bounded table loading', () => {
  it('aborts a pending read, cancels the source and releases its reader', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream({ cancel });
    const controller = new AbortController();
    const reason = new Error('caller cancelled');
    const result = streamToArray(stream, { signal: controller.signal });
    const rejected = expect(result).rejects.toBe(reason);
    controller.abort(reason);
    await rejected;
    expect(cancel).toHaveBeenCalledWith(reason);
    expect(stream.locked).toBe(false);
  });

  it('cancels a source after reaching the item limit', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<number>({
      pull(controller) { controller.enqueue(1); }, cancel,
    });
    expect(await streamToArray(stream, { maxItems: 2 })).toEqual([1, 1]);
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('preserves undefined stream values', async () => {
    const stream = new ReadableStream<undefined>({ start(controller) {
      controller.enqueue(undefined);
      controller.close();
    } });
    expect(await streamToArray(stream)).toEqual([undefined]);
  });

  it('treats a zero limit as an empty result', async () => {
    const cancel = vi.fn();
    expect(await streamToArray(new ReadableStream({ cancel }), { maxItems: 0 })).toEqual([]);
    expect(cancel).toHaveBeenCalledOnce();
    const next = vi.fn().mockResolvedValue({ done: false, value: 1 });
    const iterable = { [Symbol.asyncIterator]: () => ({ next }) };
    expect(await asyncIterableToArray(iterable, { maxItems: 0 })).toEqual([]);
    expect(next).not.toHaveBeenCalled();
  });

  it('closes the source when a progress observer throws', async () => {
    const cancel = vi.fn();
    const stream = new ReadableStream<number>({ pull(controller) { controller.enqueue(1); }, cancel });
    await expect(streamToArray(stream, { onProgress() { throw new Error('observer failed'); } }))
      .rejects.toThrow('observer failed');
    expect(cancel).toHaveBeenCalledOnce();
    expect(stream.locked).toBe(false);
  });

  it('does not skip rows after a partial page and honors maxItems', async () => {
    const source = [0, 1, 2, 3, 4, 5];
    const loader = vi.fn(async (offset: number, limit: number) => source.slice(offset, offset + Math.min(2, limit)));
    expect(await loadChunked(loader, source.length, { batchSize: 4, maxItems: 5 })).toEqual([0, 1, 2, 3, 4]);
    expect(loader.mock.calls.map(call => call[0])).toEqual([0, 2, 4]);
  });

  it('stops when a loader returns an empty page', async () => {
    const loader = vi.fn().mockResolvedValue([]);
    expect(await loadChunked(loader, 1_000)).toEqual([]);
    expect(loader).toHaveBeenCalledOnce();
  });

  it.each([0, -1, 0.5, NaN, Infinity])('rejects invalid chunk and concurrency sizes %s before work', async size => {
    const loader = vi.fn();
    expect(() => arrayToStream([1], { chunkSize: size })).toThrow(RangeError);
    await expect(loadChunked(loader, 10, { batchSize: size })).rejects.toThrow(RangeError);
    await expect(batchAsync([1], loader, { concurrency: size })).rejects.toThrow(RangeError);
    expect(loader).not.toHaveBeenCalled();
  });

  it('cancels an array stream during its pending delay', async () => {
    const stream = arrayToStream([1, 2], { delay: 60_000 });
    const reader = stream.getReader();
    const reading = reader.read();
    await Promise.resolve();
    await reader.cancel();
    expect(await reading).toEqual({ done: true, value: undefined });
    reader.releaseLock();
  });

  it('joins admitted batch work and stops further dispatch after failure', async () => {
    let rejectFirst!: (error: Error) => void;
    let finishSecond!: (value: number) => void;
    const failure = new Error('first failed');
    const execute = vi.fn((item: number) => new Promise<number>((resolve, reject) => {
      if (item === 0) rejectFirst = reject;
      else finishSecond = resolve;
    }));
    let settled = false;
    const result = batchAsync([0, 1, 2, 3], execute, { concurrency: 2 });
    const outcome = result.then(
      () => { settled = true; return undefined; },
      error => { settled = true; return error; },
    );
    rejectFirst(failure);
    await Promise.resolve();
    await Promise.resolve();
    expect(settled).toBe(false);
    finishSecond(1);
    expect(await outcome).toBe(failure);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
