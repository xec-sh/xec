/**
 * Streaming utilities for table component
 *
 * Supports multiple data sources:
 * - ReadableStream<T>
 * - AsyncIterable<T>
 * - Async generators
 * - Chunked loading with progress
 */

/**
 * Progress callback for streaming operations
 */
export interface StreamProgress {
  /** Number of items loaded so far */
  loaded: number;
  /** Total items (if known) */
  total?: number;
  /** Progress percentage (0-100) */
  percentage?: number;
  /** Estimated time remaining in milliseconds */
  estimatedTimeRemaining?: number;
}

/**
 * Options for streaming data consumption
 */
export interface StreamOptions {
  /** Maximum items to load */
  maxItems?: number;
  /** Batch size for chunked loading */
  batchSize?: number;
  /** Progress callback */
  onProgress?: (progress: StreamProgress) => void;
  /** Signal for cancellation */
  signal?: AbortSignal;
}

/**
 * Convert ReadableStream to array
 *
 * @example
 * ```typescript
 * const stream = fetch('/api/data').then(r => r.body);
 * const data = await streamToArray(stream, {
 *   onProgress: (p) => console.log(`${p.percentage}% loaded`)
 * });
 * ```
 */
export async function streamToArray<T>(
  stream: ReadableStream<T>,
  options: StreamOptions = {}
): Promise<T[]> {
  const { maxItems, onProgress, signal } = options;
  const result: T[] = [];
  const reader = stream.getReader();
  const startTime = Date.now();

  try {
    while (true) {
      // Check for cancellation
      if (signal?.aborted) {
        throw new Error('Stream consumption cancelled');
      }

      const { done, value } = await reader.read();

      if (done) break;

      if (value !== undefined) {
        result.push(value);

        // Report progress
        if (onProgress) {
          const elapsed = Date.now() - startTime;
          const itemsPerMs = result.length / elapsed;
          const estimatedTotal = maxItems ?? result.length;
          const remaining = estimatedTotal - result.length;
          const estimatedTimeRemaining = remaining / itemsPerMs;

          onProgress({
            loaded: result.length,
            total: maxItems,
            percentage: maxItems ? (result.length / maxItems) * 100 : undefined,
            estimatedTimeRemaining: estimatedTimeRemaining || undefined,
          });
        }

        // Check max items limit
        if (maxItems && result.length >= maxItems) {
          break;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return result;
}

/**
 * Convert AsyncIterable to array
 *
 * @example
 * ```typescript
 * async function* generateData() {
 *   for (let i = 0; i < 1000; i++) {
 *     yield { id: i, name: `Item ${i}` };
 *   }
 * }
 *
 * const data = await asyncIterableToArray(generateData());
 * ```
 */
export async function asyncIterableToArray<T>(
  iterable: AsyncIterable<T>,
  options: StreamOptions = {}
): Promise<T[]> {
  const { maxItems, onProgress, signal } = options;
  const result: T[] = [];
  const startTime = Date.now();

  for await (const item of iterable) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Async iteration cancelled');
    }

    result.push(item);

    // Report progress
    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const itemsPerMs = result.length / elapsed;
      const estimatedTotal = maxItems ?? result.length;
      const remaining = estimatedTotal - result.length;
      const estimatedTimeRemaining = remaining / itemsPerMs;

      onProgress({
        loaded: result.length,
        total: maxItems,
        percentage: maxItems ? (result.length / maxItems) * 100 : undefined,
        estimatedTimeRemaining: estimatedTimeRemaining || undefined,
      });
    }

    // Check max items limit
    if (maxItems && result.length >= maxItems) {
      break;
    }
  }

  return result;
}

/**
 * Load data in chunks with progress
 *
 * @example
 * ```typescript
 * const loadChunk = async (offset: number, limit: number) => {
 *   const res = await fetch(`/api/data?offset=${offset}&limit=${limit}`);
 *   return res.json();
 * };
 *
 * const data = await loadChunked(loadChunk, 10000, {
 *   batchSize: 100,
 *   onProgress: (p) => console.log(`${p.loaded}/${p.total} loaded`)
 * });
 * ```
 */
export async function loadChunked<T>(
  loadFn: (offset: number, limit: number) => Promise<T[]>,
  totalItems: number,
  options: StreamOptions = {}
): Promise<T[]> {
  const { batchSize = 100, onProgress, signal } = options;
  const result: T[] = [];
  const startTime = Date.now();

  for (let offset = 0; offset < totalItems; offset += batchSize) {
    // Check for cancellation
    if (signal?.aborted) {
      throw new Error('Chunked loading cancelled');
    }

    const limit = Math.min(batchSize, totalItems - offset);
    const chunk = await loadFn(offset, limit);

    result.push(...chunk);

    // Report progress
    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const itemsPerMs = result.length / elapsed;
      const remaining = totalItems - result.length;
      const estimatedTimeRemaining = remaining / itemsPerMs;

      onProgress({
        loaded: result.length,
        total: totalItems,
        percentage: (result.length / totalItems) * 100,
        estimatedTimeRemaining: estimatedTimeRemaining || undefined,
      });
    }
  }

  return result;
}

/**
 * Create a ReadableStream from an array with chunking
 *
 * @example
 * ```typescript
 * const data = [1, 2, 3, 4, 5];
 * const stream = arrayToStream(data, { chunkSize: 2 });
 * // Emits: [1, 2], [3, 4], [5]
 * ```
 */
export function arrayToStream<T>(
  data: T[],
  options: { chunkSize?: number; delay?: number } = {}
): ReadableStream<T[]> {
  const { chunkSize = 10, delay = 0 } = options;
  let index = 0;

  return new ReadableStream({
    async pull(controller) {
      if (index >= data.length) {
        controller.close();
        return;
      }

      const chunk = data.slice(index, index + chunkSize);
      index += chunkSize;

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      controller.enqueue(chunk);
    },
  });
}

/**
 * Create async generator from array with delay (for testing)
 *
 * @example
 * ```typescript
 * const data = [1, 2, 3, 4, 5];
 * for await (const item of arrayToAsyncIterable(data, { delay: 100 })) {
 *   console.log(item); // Logs one item every 100ms
 * }
 * ```
 */
export async function* arrayToAsyncIterable<T>(
  data: T[],
  options: { delay?: number } = {}
): AsyncGenerator<T, void, unknown> {
  const { delay = 0 } = options;

  for (const item of data) {
    if (delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    yield item;
  }
}

/**
 * Batch async operations with concurrency limit
 *
 * @example
 * ```typescript
 * const ids = [1, 2, 3, 4, 5];
 * const items = await batchAsync(
 *   ids,
 *   async (id) => fetch(`/api/items/${id}`).then(r => r.json()),
 *   { concurrency: 2 }
 * );
 * ```
 */
export async function batchAsync<T, R>(
  items: T[],
  fn: (item: T, index: number) => Promise<R>,
  options: { concurrency?: number; onProgress?: (progress: StreamProgress) => void } = {}
): Promise<R[]> {
  const { concurrency = 5, onProgress } = options;
  const results: R[] = new Array(items.length);
  let completed = 0;
  const startTime = Date.now();

  const executeItem = async (index: number) => {
    results[index] = await fn(items[index]!, index);
    completed++;

    if (onProgress) {
      const elapsed = Date.now() - startTime;
      const itemsPerMs = completed / elapsed;
      const remaining = items.length - completed;
      const estimatedTimeRemaining = remaining / itemsPerMs;

      onProgress({
        loaded: completed,
        total: items.length,
        percentage: (completed / items.length) * 100,
        estimatedTimeRemaining,
      });
    }
  };

  // Execute with proper concurrency limit using a worker pool pattern
  let currentIndex = 0;
  const workers: Promise<void>[] = [];

  const worker = async () => {
    while (currentIndex < items.length) {
      const index = currentIndex++;
      await executeItem(index);
    }
  };

  // Create worker pool
  for (let i = 0; i < Math.min(concurrency, items.length); i++) {
    workers.push(worker());
  }

  await Promise.all(workers);
  return results;
}
