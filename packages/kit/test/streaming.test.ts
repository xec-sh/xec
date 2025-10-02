/**
 * Tests for streaming utilities
 */

import { describe, it, expect, vi } from 'vitest';
import {
  streamToArray,
  asyncIterableToArray,
  loadChunked,
  arrayToStream,
  arrayToAsyncIterable,
  batchAsync,
  type StreamProgress,
} from '../src/components/table/streaming.js';

describe('streaming', () => {
  describe('streamToArray', () => {
    it('should convert ReadableStream to array', async () => {
      const data = [1, 2, 3, 4, 5];
      const stream = new ReadableStream({
        start(controller) {
          data.forEach((item) => controller.enqueue(item));
          controller.close();
        },
      });

      const result = await streamToArray(stream);

      expect(result).toEqual(data);
    });

    it('should report progress', async () => {
      const data = [1, 2, 3, 4, 5];
      const stream = new ReadableStream({
        start(controller) {
          data.forEach((item) => controller.enqueue(item));
          controller.close();
        },
      });

      const progressUpdates: StreamProgress[] = [];
      await streamToArray(stream, {
        maxItems: 5,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      expect(progressUpdates.length).toBeGreaterThan(0);
      expect(progressUpdates[progressUpdates.length - 1]!.loaded).toBe(5);
      expect(progressUpdates[progressUpdates.length - 1]!.percentage).toBe(100);
    });

    it('should respect maxItems limit', async () => {
      const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const stream = new ReadableStream({
        start(controller) {
          data.forEach((item) => controller.enqueue(item));
          controller.close();
        },
      });

      const result = await streamToArray(stream, { maxItems: 5 });

      expect(result).toHaveLength(5);
      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle abort signal', async () => {
      const data = Array.from({ length: 100 }, (_, i) => i);
      const controller = new AbortController();

      const stream = new ReadableStream({
        async start(ctrl) {
          for (const item of data) {
            ctrl.enqueue(item);
            await new Promise((resolve) => setTimeout(resolve, 1));
          }
          ctrl.close();
        },
      });

      // Abort after 10ms
      setTimeout(() => controller.abort(), 10);

      await expect(
        streamToArray(stream, { signal: controller.signal })
      ).rejects.toThrow('cancelled');
    });

    it('should handle empty stream', async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      const result = await streamToArray(stream);

      expect(result).toEqual([]);
    });
  });

  describe('asyncIterableToArray', () => {
    async function* generateNumbers(count: number) {
      for (let i = 0; i < count; i++) {
        yield i;
      }
    }

    it('should convert async iterable to array', async () => {
      const result = await asyncIterableToArray(generateNumbers(5));

      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it('should report progress', async () => {
      const progressUpdates: StreamProgress[] = [];

      await asyncIterableToArray(generateNumbers(5), {
        maxItems: 5,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      expect(progressUpdates.length).toBe(5);
      expect(progressUpdates[4]!.loaded).toBe(5);
      expect(progressUpdates[4]!.percentage).toBe(100);
    });

    it('should respect maxItems limit', async () => {
      const result = await asyncIterableToArray(generateNumbers(10), { maxItems: 5 });

      expect(result).toHaveLength(5);
      expect(result).toEqual([0, 1, 2, 3, 4]);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();

      async function* slowGenerator() {
        for (let i = 0; i < 100; i++) {
          await new Promise((resolve) => setTimeout(resolve, 10));
          yield i;
        }
      }

      // Abort after 20ms
      setTimeout(() => controller.abort(), 20);

      await expect(
        asyncIterableToArray(slowGenerator(), { signal: controller.signal })
      ).rejects.toThrow('cancelled');
    });

    it('should handle empty iterable', async () => {
      async function* empty() {
        // Yields nothing
      }

      const result = await asyncIterableToArray(empty());

      expect(result).toEqual([]);
    });
  });

  describe('loadChunked', () => {
    it('should load data in chunks', async () => {
      const mockLoadFn = vi.fn(async (offset: number, limit: number) => {
        return Array.from({ length: limit }, (_, i) => offset + i);
      });

      const result = await loadChunked(mockLoadFn, 10, { batchSize: 3 });

      expect(result).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      expect(mockLoadFn).toHaveBeenCalledTimes(4); // 3 + 3 + 3 + 1
    });

    it('should report progress', async () => {
      const mockLoadFn = async (offset: number, limit: number) => {
        return Array.from({ length: limit }, (_, i) => offset + i);
      };

      const progressUpdates: StreamProgress[] = [];
      await loadChunked(mockLoadFn, 10, {
        batchSize: 2,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      expect(progressUpdates.length).toBe(5); // 10 items / 2 batch size
      expect(progressUpdates[4]!.loaded).toBe(10);
      expect(progressUpdates[4]!.percentage).toBe(100);
    });

    it('should handle abort signal', async () => {
      const controller = new AbortController();
      const mockLoadFn = async (offset: number, limit: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return Array.from({ length: limit }, (_, i) => offset + i);
      };

      // Abort after 20ms
      setTimeout(() => controller.abort(), 20);

      await expect(
        loadChunked(mockLoadFn, 100, {
          batchSize: 10,
          signal: controller.signal,
        })
      ).rejects.toThrow('cancelled');
    });

    it('should handle last partial chunk', async () => {
      const mockLoadFn = vi.fn(async (offset: number, limit: number) => {
        return Array.from({ length: limit }, (_, i) => offset + i);
      });

      await loadChunked(mockLoadFn, 10, { batchSize: 3 });

      // Last call should have limit=1 (10 % 3 = 1)
      const lastCall = mockLoadFn.mock.calls[mockLoadFn.mock.calls.length - 1];
      expect(lastCall![1]).toBe(1);
    });
  });

  describe('arrayToStream', () => {
    it('should convert array to stream', async () => {
      const data = [1, 2, 3, 4, 5];
      const stream = arrayToStream(data, { chunkSize: 2 });

      const chunks: number[][] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
    });

    it('should respect chunk size', async () => {
      const data = Array.from({ length: 10 }, (_, i) => i);
      const stream = arrayToStream(data, { chunkSize: 3 });

      const chunks: number[][] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      expect(chunks).toHaveLength(4); // 3 + 3 + 3 + 1
    });

    it('should handle delay', async () => {
      const data = [1, 2, 3];
      const stream = arrayToStream(data, { chunkSize: 1, delay: 10 });

      const start = Date.now();
      const chunks: number[][] = [];
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }

      const elapsed = Date.now() - start;

      expect(chunks).toHaveLength(3);
      expect(elapsed).toBeGreaterThanOrEqual(20); // At least 2 delays (10ms each)
    });
  });

  describe('arrayToAsyncIterable', () => {
    it('should convert array to async iterable', async () => {
      const data = [1, 2, 3, 4, 5];
      const result: number[] = [];

      for await (const item of arrayToAsyncIterable(data)) {
        result.push(item);
      }

      expect(result).toEqual(data);
    });

    it('should handle delay', async () => {
      const data = [1, 2, 3];
      const start = Date.now();

      const result: number[] = [];
      for await (const item of arrayToAsyncIterable(data, { delay: 10 })) {
        result.push(item);
      }

      const elapsed = Date.now() - start;

      expect(result).toEqual(data);
      expect(elapsed).toBeGreaterThanOrEqual(20); // 3 items * 10ms delay
    });

    it('should handle empty array', async () => {
      const result: number[] = [];

      for await (const item of arrayToAsyncIterable([])) {
        result.push(item);
      }

      expect(result).toEqual([]);
    });
  });

  describe('batchAsync', () => {
    it('should process items in batches with concurrency', async () => {
      const items = [1, 2, 3, 4, 5];
      const processFn = vi.fn(async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        return item * 2;
      });

      const result = await batchAsync(items, processFn, { concurrency: 2 });

      expect(result).toEqual([2, 4, 6, 8, 10]);
      expect(processFn).toHaveBeenCalledTimes(5);
    });

    it('should maintain order', async () => {
      const items = [1, 2, 3, 4, 5];
      const processFn = async (item: number) => {
        // Add random delay
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
        return item;
      };

      const result = await batchAsync(items, processFn, { concurrency: 3 });

      expect(result).toEqual([1, 2, 3, 4, 5]);
    });

    it('should report progress', async () => {
      const items = [1, 2, 3, 4, 5];
      const processFn = async (item: number) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return item;
      };

      const progressUpdates: StreamProgress[] = [];
      await batchAsync(items, processFn, {
        concurrency: 2,
        onProgress: (p) => progressUpdates.push({ ...p }),
      });

      expect(progressUpdates.length).toBe(5);
      expect(progressUpdates[4]!.loaded).toBe(5);
      expect(progressUpdates[4]!.percentage).toBe(100);
    });

    it('should handle errors', async () => {
      const items = [1, 2, 3, 4, 5];
      const processFn = async (item: number) => {
        if (item === 3) throw new Error('Failed at 3');
        return item;
      };

      await expect(batchAsync(items, processFn, { concurrency: 2 })).rejects.toThrow('Failed at 3');
    });

    it('should respect concurrency limit', async () => {
      const items = Array.from({ length: 10 }, (_, i) => i);
      let concurrentCount = 0;
      let maxConcurrent = 0;

      const processFn = async (item: number) => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise((resolve) => setTimeout(resolve, 20));
        concurrentCount--;
        return item;
      };

      await batchAsync(items, processFn, { concurrency: 3 });

      expect(maxConcurrent).toBeLessThanOrEqual(3);
    });

    it('should handle empty array', async () => {
      const processFn = vi.fn(async (item: number) => item);

      const result = await batchAsync([], processFn);

      expect(result).toEqual([]);
      expect(processFn).not.toHaveBeenCalled();
    });
  });

  describe('Integration scenarios', () => {
    it('should handle stream -> array -> stream round-trip', async () => {
      const data = [1, 2, 3, 4, 5];

      // Array to stream
      const stream1 = arrayToStream(data, { chunkSize: 2 });

      // Stream to array (flattened)
      const chunks = await streamToArray(stream1);
      const chunks1: number[] = chunks.flat();

      // Array to stream again
      const stream2 = arrayToStream(chunks1, { chunkSize: 2 });

      // Stream to array again
      const chunks2Array = await streamToArray(stream2);
      const chunks2: number[] = chunks2Array.flat();

      expect(chunks2).toEqual(data);
    });

    it('should handle large dataset streaming', async () => {
      const largeData = Array.from({ length: 10000 }, (_, i) => ({ id: i, value: `Item ${i}` }));

      const stream = arrayToStream(largeData, { chunkSize: 100 });

      let totalItems = 0;
      const reader = stream.getReader();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) totalItems += value.length;
      }

      expect(totalItems).toBe(10000);
    });
  });
});
