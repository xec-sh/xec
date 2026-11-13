/** Bounded data loading and progress reporting for terminal tables. */
import { setTimeout as delay } from 'node:timers/promises';

export interface StreamProgress {
  loaded: number;
  total?: number;
  percentage?: number;
  estimatedTimeRemaining?: number;
}

export interface StreamOptions {
  /** Maximum retained items. Zero consumes no items. */
  maxItems?: number;
  batchSize?: number;
  onProgress?: (progress: StreamProgress) => void;
  signal?: AbortSignal;
}

function validateCount(value: number, name: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new RangeError(`${name} must be an integer greater than or equal to ${minimum}`);
  }
}

function validateOptions(options: StreamOptions): void {
  if (options.maxItems !== undefined) validateCount(options.maxItems, 'maxItems', 0);
  if (options.batchSize !== undefined) validateCount(options.batchSize, 'batchSize', 1);
  options.signal?.throwIfAborted();
}

function reportProgress(
  loaded: number,
  started: number,
  total: number | undefined,
  callback: StreamOptions['onProgress']
): void {
  const remaining = total === undefined ? undefined : Math.max(0, total - loaded);
  callback?.({
    loaded,
    total,
    percentage: total === undefined ? undefined : total === 0 ? 100 : Math.min(100, loaded / total * 100),
    estimatedTimeRemaining: remaining === undefined || loaded === 0
      ? undefined
      : Math.max(0, Date.now() - started) * remaining / loaded,
  });
}

/** Consume a readable stream and cancel its source on early completion or failure. */
export async function streamToArray<T>(
  stream: ReadableStream<T>,
  options: StreamOptions = {}
): Promise<T[]> {
  validateOptions(options);
  const { maxItems, onProgress, signal } = options;
  const result: T[] = [];
  const reader = stream.getReader();
  const started = Date.now();
  let complete = false;
  let failed = false;
  let failure: unknown;
  let cancellation: Promise<{ error?: unknown }> | undefined;
  let cleanup: { error?: unknown } | undefined;
  const cancel = () => {
    cancellation ??= reader.cancel(signal?.reason).then(
      () => ({}),
      error => ({ error }),
    );
  };
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    signal?.throwIfAborted();
    while (maxItems === undefined || result.length < maxItems) {
      const item = await reader.read();
      signal?.throwIfAborted();
      if (item.done) {
        complete = true;
        break;
      }
      result.push(item.value);
      reportProgress(result.length, started, maxItems, onProgress);
    }
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    if (!complete) cancel();
    try {
      cleanup = await cancellation;
    } finally {
      reader.releaseLock();
    }
  }
  if (cleanup && 'error' in cleanup && cleanup.error !== failure) {
    if (failed) throw new AggregateError([failure, cleanup.error], 'Stream consumption and cleanup failed');
    throw cleanup.error;
  }
  if (failed) throw failure;
  return result;
}

/**
 * Consume an iterable up to its limit and close it on exit. Cancellation is
 * observed between yields. A producer waiting for I/O must receive the same
 * signal so that its pending next() and return() can finish.
 */
export async function asyncIterableToArray<T>(
  iterable: AsyncIterable<T>,
  options: StreamOptions = {}
): Promise<T[]> {
  validateOptions(options);
  const { maxItems, onProgress, signal } = options;
  const result: T[] = [];
  if (maxItems === 0) return result;
  const started = Date.now();
  for await (const item of iterable) {
    signal?.throwIfAborted();
    result.push(item);
    reportProgress(result.length, started, maxItems, onProgress);
    if (maxItems !== undefined && result.length >= maxItems) break;
  }
  signal?.throwIfAborted();
  return result;
}

/** Load consecutive pages, advancing by the number of rows actually received. */
export async function loadChunked<T>(
  loadFn: (offset: number, limit: number, signal?: AbortSignal) => Promise<T[]>,
  totalItems: number,
  options: StreamOptions = {}
): Promise<T[]> {
  validateOptions(options);
  validateCount(totalItems, 'totalItems', 0);
  const { batchSize = 100, onProgress, signal } = options;
  const total = Math.min(totalItems, options.maxItems ?? totalItems);
  const result: T[] = [];
  const started = Date.now();

  while (result.length < total) {
    signal?.throwIfAborted();
    const limit = Math.min(batchSize, total - result.length);
    const chunk = await loadFn(result.length, limit, signal);
    signal?.throwIfAborted();
    if (!Array.isArray(chunk) || chunk.length > limit) {
      throw new RangeError('Chunk loader must return an array within the requested limit');
    }
    if (chunk.length === 0) break;
    result.push(...chunk);
    reportProgress(result.length, started, total, onProgress);
  }
  return result;
}

/** Create a chunked stream whose pending delay is cancelled with its reader. */
export function arrayToStream<T>(
  data: T[],
  options: { chunkSize?: number; delay?: number } = {}
): ReadableStream<T[]> {
  const chunkSize = options.chunkSize ?? 10;
  const wait = options.delay ?? 0;
  validateCount(chunkSize, 'chunkSize', 1);
  if (!Number.isFinite(wait) || wait < 0) throw new RangeError('delay must be finite and nonnegative');
  const cancellation = new AbortController();
  let index = 0;

  return new ReadableStream<T[]>({
    async pull(controller) {
      if (index >= data.length) {
        controller.close();
        return;
      }
      if (wait > 0) {
        try { await delay(wait, undefined, { signal: cancellation.signal }); }
        catch (error) {
          if (cancellation.signal.aborted) return;
          throw error;
        }
      }
      if (cancellation.signal.aborted) return;
      controller.enqueue(data.slice(index, index + chunkSize));
      index += chunkSize;
    },
    cancel(reason) { cancellation.abort(reason); },
  });
}

export async function* arrayToAsyncIterable<T>(
  data: T[],
  options: { delay?: number; signal?: AbortSignal } = {}
): AsyncGenerator<T, void, unknown> {
  const wait = options.delay ?? 0;
  if (!Number.isFinite(wait) || wait < 0) throw new RangeError('delay must be finite and nonnegative');
  options.signal?.throwIfAborted();
  for (const item of data) {
    if (wait > 0) await delay(wait, undefined, { signal: options.signal });
    options.signal?.throwIfAborted();
    yield item;
  }
}

/** Run a bounded batch, joining admitted work before reporting any failure. */
export async function batchAsync<T, R>(
  items: T[],
  fn: (item: T, index: number, signal: AbortSignal) => Promise<R>,
  options: { concurrency?: number; onProgress?: (progress: StreamProgress) => void; signal?: AbortSignal } = {}
): Promise<R[]> {
  const concurrency = options.concurrency ?? 5;
  validateCount(concurrency, 'concurrency', 1);
  options.signal?.throwIfAborted();
  const cancellation = new AbortController();
  const abort = () => cancellation.abort(options.signal?.reason);
  options.signal?.addEventListener('abort', abort, { once: true });
  const signal = cancellation.signal;
  const results: R[] = new Array(items.length);
  const failures: unknown[] = [];
  const started = Date.now();
  let next = 0;
  let completed = 0;

  const worker = async () => {
    while (next < items.length && !signal.aborted) {
      const index = next++;
      try {
        results[index] = await fn(items[index]!, index, signal);
        signal.throwIfAborted();
        reportProgress(++completed, started, items.length, options.onProgress);
      } catch (error) {
        if (!signal.aborted || error !== signal.reason) failures.push(error);
        cancellation.abort(error);
      }
    }
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  } finally {
    options.signal?.removeEventListener('abort', abort);
  }
  if (failures.length === 1) throw failures[0];
  if (failures.length > 1) throw new AggregateError(failures, 'Multiple batch operations failed');
  signal.throwIfAborted();
  return results;
}
