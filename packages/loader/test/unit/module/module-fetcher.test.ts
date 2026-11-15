import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';

import { MemoryCache } from '../../../src/module/module-cache.js';
import { ModuleFetcher } from '../../../src/module/module-fetcher.js';
import { ModuleIntegrityVerifier } from '../../../src/module/module-integrity.js';

describe('ModuleFetcher', () => {
  let fetcher: ModuleFetcher;
  let network: ReturnType<typeof vi.fn<typeof fetch>>;
  beforeEach(() => {
    fetcher = new ModuleFetcher(new MemoryCache<string>({ maxSize: 10 }),
      new ModuleIntegrityVerifier('/unused-off-mode-cache', { mode: 'off', allowedHosts: ['example.com', 'esm.sh'] }));
    network = vi.fn<typeof fetch>(); vi.stubGlobal('fetch', network);
  });
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('fetches and caches the exact response text', async () => {
    const content = 'export const test = "value";';
    network.mockResolvedValue(new Response(content, { headers: { 'content-type': 'application/javascript' } }));
    const result = await fetcher.fetch('https://example.com/module.js');
    expect(result.content).toBe(content); expect(result.url).toBe('https://example.com/module.js');
    expect((await fetcher.fetch(result.url)).content).toBe(content);
    expect(network).toHaveBeenCalledOnce();
  });

  it.each([
    'import fs from "/node/fs@latest"; export { fs };',
    'import "/v135/react.js";',
    'export * from "https://esm.sh/target.js";',
  ])('preserves module semantics instead of rewriting %s', async content => {
    network.mockResolvedValue(new Response(content));
    expect((await fetcher.fetch('https://esm.sh/package')).content).toBe(content);
    expect(network).toHaveBeenCalledOnce();
  });

  it('retries a transient connection failure under the same deadline', async () => {
    network.mockRejectedValueOnce(new Error('Network error')).mockResolvedValueOnce(new Response('export const test = 1;'));
    const result = fetcher.fetch('https://example.com/module.js', { retries: 2 });
    await expect(result).resolves.toHaveProperty('content', 'export const test = 1;');
    expect(network).toHaveBeenCalledTimes(2);
  });

  it('stops after the explicit connection retry limit and retains the cause', async () => {
    const cause = new Error('Network error'); network.mockRejectedValue(cause);
    await expect(fetcher.fetch('https://example.com/module.js', { retries: 2 })).rejects.toMatchObject({ code: 'MODULE_FETCH_FAILED', cause });
    expect(network).toHaveBeenCalledTimes(3);
  });

  it('cancels a pending native fetch without retries', async () => {
    vi.useFakeTimers();
    network.mockImplementation((_url, request) => new Promise((_resolve, reject) => {
      request!.signal!.addEventListener('abort', () => reject(request!.signal!.reason), { once: true });
    }));
    const assertion = expect(fetcher.fetch('https://example.com/module.js', { timeout: 20, retries: 3 })).rejects.toMatchObject({ name: 'TimeoutError' });
    await vi.advanceTimersByTimeAsync(20); await assertion;
    expect(network).toHaveBeenCalledOnce();
  });

  it('does not retry a completed client error', async () => {
    network.mockResolvedValue(new Response(null, { status: 404 }));
    await expect(fetcher.fetch('https://example.com/module.js', { retries: 3 })).rejects.toThrow('HTTP 404');
    expect(network).toHaveBeenCalledOnce();
  });

  it('snapshots valid caller headers before asynchronous work', async () => {
    network.mockResolvedValue(new Response(''));
    const headers = { 'X-Custom-Header': 'original' };
    const result = fetcher.fetch('https://example.com/module.js', { headers }); headers['X-Custom-Header'] = 'changed';
    await result;
    expect(new Headers(network.mock.calls[0]![1]?.headers).get('x-custom-header')).toBe('original');
  });

  it('preserves response metadata without using it to rewrite source', async () => {
    network.mockResolvedValue(new Response('export const test = true;', { headers: { 'content-type': 'application/javascript', 'cache-control': 'max-age=3600' } }));
    const result = await fetcher.fetch('https://example.com/module.js');
    expect(result.headers).toMatchObject({ 'content-type': 'application/javascript', 'cache-control': 'max-age=3600' });
  });
});
