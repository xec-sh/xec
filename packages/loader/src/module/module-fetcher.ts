/** Bounded HTTP module retrieval. Execution and module-graph semantics belong to the executor. */
import type { Cache, ModuleFetchOptions } from '../types/index.js';

import { setTimeout as delay } from 'node:timers/promises';

import { computeModuleIdentity, ModuleIntegrityVerifier } from './module-integrity.js';

const MAX_REDIRECTS = 5;
/** Reserve for confirming owned response cancellation after the fetch deadline. */
const CLEANUP_TIMEOUT_MS = 1000;
const RAW_CACHE_PREFIX = 'xec-module-raw:v2:';
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const TRANSPORT_HEADERS = new Set(['host', 'connection', 'proxy-connection', 'proxy-authorization', 'content-length', 'transfer-encoding', 'upgrade']);

export interface FetchedModule {
  /** Exact verified UTF-8 source, including an initial BOM; never flattened or rewritten. */
  content: string;
  headers: Record<string, string>;
  /** Final HTTP URL; the source itself cannot trigger additional fetches here. */
  url: string;
}

class ModuleFetchError extends Error {
  constructor(message: string, public readonly code: string, options?: ErrorOptions) { super(message, options); this.name = 'ModuleFetchError'; }
}

/** A rejected observer never leaves an unhandled operation, even when its deadline wins. */
function observe<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const aborted = () => { signal.removeEventListener('abort', aborted); reject(signal.reason); };
    signal.addEventListener('abort', aborted, { once: true });
    operation.then(value => { signal.removeEventListener('abort', aborted); resolve(value); },
      error => { signal.removeEventListener('abort', aborted); reject(error); });
    if (signal.aborted) aborted();
  });
}

/** Cancellation still needs a bounded observation after the request's own signal has fired. */
async function cancelResponse(operation: Promise<void>): Promise<void> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new ModuleFetchError('Module response cancellation is unconfirmed', 'MODULE_CLEANUP_UNCONFIRMED')), CLEANUP_TIMEOUT_MS);
  try { await observe(operation, controller.signal); }
  finally { clearTimeout(timer); }
}

export class ModuleFetcher {
  constructor(private readonly cache: Cache<string>, private readonly integrity: ModuleIntegrityVerifier) {
    if (!(integrity instanceof ModuleIntegrityVerifier)) throw new TypeError('ModuleFetcher requires an explicit ModuleIntegrityVerifier');
  }

  async fetch(input: string, options: ModuleFetchOptions = {}): Promise<FetchedModule> {
    const timeout = options.timeout ?? 30000, retries = options.retries ?? 3, maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
    for (const [name, value, minimum, maximum] of [
      ['timeout', timeout, 1, 2_147_483_647], ['retries', retries, 0, 5], ['maxBytes', maxBytes, 0, 64 * 1024 * 1024],
    ] as const) {
      if (!Number.isInteger(value) || value < minimum || value > maximum) throw new RangeError(`Module fetch ${name} must be an integer from ${minimum} to ${maximum}`);
    }
    if (options.headers !== undefined && (!options.headers || typeof options.headers !== 'object' || Array.isArray(options.headers))) {
      throw new TypeError('Module request headers must be a string record');
    }
    // Caller headers may select a private representation. It must never enter the shared URL cache.
    const cacheable = Object.keys(options.headers ?? {}).length === 0;
    let headers = new Headers({ 'User-Agent': 'xec-loader' });
    for (const [name, value] of Object.entries(options.headers ?? {})) {
      if (!/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/u.test(name) || typeof value !== 'string' || /[^\t\u0020-\u007E\u0080-\u00FF]/u.test(value)) throw new TypeError('Module request headers contain an invalid name or value');
      if (TRANSPORT_HEADERS.has(name.toLowerCase())) throw new TypeError('Module request headers cannot override transport authority or framing');
      headers.set(name, value);
    }
    let current = this.integrity.assertHostAllowed(input);
    const controller = new AbortController();
    const cancelled = () => controller.abort(options.signal?.reason ?? new DOMException('Module fetch cancelled', 'AbortError'));
    options.signal?.addEventListener('abort', cancelled, { once: true });
    if (options.signal?.aborted) cancelled();
    const timer = setTimeout(() => controller.abort(new DOMException('Module fetch timed out', 'TimeoutError')), timeout);
    const { signal } = controller;
    const visited = new Set<string>(), aliases: string[] = [];
    try {
      for (let hop = 0; ; hop++) {
        signal.throwIfAborted();
        current = this.integrity.assertHostAllowed(current);
        if (hop > MAX_REDIRECTS || visited.has(current)) throw new ModuleFetchError('Module HTTP redirect cycle or redirect limit exceeded', 'MODULE_REDIRECT_LIMIT');
        visited.add(current);
        await observe(this.integrity.assertFetchAllowed(current), signal);
        const cacheKey = RAW_CACHE_PREFIX + computeModuleIdentity(current);
        const cached = cacheable ? await observe(this.cache.get(cacheKey), signal) : null;
        if (cached !== null && cached !== undefined) {
          if (typeof cached !== 'string' || Buffer.byteLength(cached, 'utf8') > maxBytes) throw new ModuleFetchError('Cached module exceeds the source byte limit', 'MODULE_SOURCE_LIMIT');
          const bytes = Buffer.from(cached, 'utf8');
          if (this.decode(bytes) !== cached) throw new ModuleFetchError('Cached module is not exact UTF-8 source', 'MODULE_SOURCE_ENCODING');
          await this.verify(current, aliases, cached, signal);
          return { content: cached, headers: {}, url: current };
        }
        const response = await this.request(current, headers, retries, signal);
        if (REDIRECT_STATUSES.has(response.status) && response.headers.has('location')) {
          await this.discard(response, signal);
          let location: URL | undefined;
          try { location = new URL(response.headers.get('location')!, current); } catch { /* Do not echo credentials from an invalid peer-controlled Location. */ }
          if (!location) throw new ModuleFetchError('Module redirect URL is invalid', 'MODULE_REDIRECT_INVALID');
          const next = this.integrity.assertHostAllowed(location.href);
          if (new URL(next).origin !== new URL(current).origin) headers = new Headers({ 'User-Agent': 'xec-loader' });
          aliases.push(current); current = next;
          continue;
        }
        if (!response.ok) {
          await this.discard(response, signal);
          throw new ModuleFetchError(`Module request failed with HTTP ${response.status}`, 'MODULE_HTTP_ERROR');
        }
        const content = await this.readSource(response, maxBytes, signal);
        await this.verify(current, aliases, content, signal);
        if (cacheable) await observe(this.cache.set(cacheKey, content), signal);
        signal.throwIfAborted();
        return { content, headers: Object.fromEntries(response.headers), url: current };
      }
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', cancelled);
    }
  }

  private async verify(url: string, aliases: string[], content: string, signal: AbortSignal): Promise<void> {
    signal.throwIfAborted(); await observe(this.integrity.verifyAll([...aliases, url], content), signal);
    signal.throwIfAborted(); await observe(this.integrity.save(), signal); signal.throwIfAborted();
  }

  private async request(url: string, headers: Headers, retries: number, signal: AbortSignal): Promise<Response> {
    for (let attempt = 0; ; attempt++) {
      signal.throwIfAborted();
      let response: Response;
      try { response = await fetch(url, { headers, redirect: 'manual', signal }); }
      catch (cause) {
        signal.throwIfAborted();
        if (attempt >= retries) throw new ModuleFetchError('Module request failed before receiving a response', 'MODULE_FETCH_FAILED', { cause });
        await delay(2 ** attempt * 1000, undefined, { signal }); continue;
      }
      if (response.status < 500 || response.status > 599 || attempt >= retries) return response;
      await this.discard(response, signal);
      await delay(2 ** attempt * 1000, undefined, { signal });
    }
  }

  private async discard(response: Response, signal: AbortSignal): Promise<void> {
    if (response.body) await cancelResponse(response.body.cancel());
    signal.throwIfAborted();
  }

  private decode(bytes: Uint8Array): string {
    try { return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes); }
    catch (cause) { throw new ModuleFetchError('Module source is not valid UTF-8', 'MODULE_SOURCE_ENCODING', { cause }); }
  }

  private async readSource(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
    const advertised = response.headers.get('content-length');
    if (advertised && /^\d+$/u.test(advertised) && Number(advertised) > maxBytes) {
      await this.discard(response, signal);
      throw new ModuleFetchError('Module exceeds the source byte limit', 'MODULE_SOURCE_LIMIT');
    }
    if (!response.body) return '';
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let count = 0;
    try {
      for (;;) {
        signal.throwIfAborted();
        const item = await observe(reader.read(), signal);
        if (item.done) break;
        count += item.value.byteLength;
        if (count > maxBytes) throw new ModuleFetchError('Module exceeds the measured source byte limit', 'MODULE_SOURCE_LIMIT');
        chunks.push(item.value);
      }
      return this.decode(Buffer.concat(chunks, count));
    } catch (error) {
      const failures: unknown[] = [error];
      try { await cancelResponse(reader.cancel(error)); } catch (cleanup) { if (cleanup !== error) failures.push(cleanup); }
      if (failures.length > 1) throw new AggregateError(failures, 'Module response failed and cancellation was unconfirmed', { cause: error });
      throw error;
    } finally { reader.releaseLock(); }
  }
}
