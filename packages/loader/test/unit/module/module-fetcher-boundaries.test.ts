import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { it, vi, expect, describe, afterEach, beforeEach } from 'vitest';
import { rm, stat, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';

import { MemoryCache } from '../../../src/module/module-cache.js';
import { ModuleFetcher } from '../../../src/module/module-fetcher.js';
import { IntegrityError, computeIntegrity, computeModuleIdentity, ModuleIntegrityVerifier } from '../../../src/module/module-integrity.js';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'xec-fetch-policy-')); });
afterEach(async () => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); await rm(dir, { recursive: true, force: true }); });
const entry = 'https://esm.sh/entry.js';
const content = 'export const safe = true;';
async function readPins() {
  const directory = join(dir, 'module-lock.json.pins');
  const files = await readdir(directory);
  expect(files.every(file => /^[a-f0-9]{64}\.json$/.test(file))).toBe(true);
  return Object.fromEntries(await Promise.all(files.map(async file => [file.slice(0, -5), JSON.parse(await readFile(join(directory, file), 'utf8'))])));
}
function fixture(mode: 'off' | 'strict' | 'lockfile' = 'off', hosts = ['esm.sh', 'jsr.io']) {
  const cache = new MemoryCache<string>();
  const verifier = new ModuleIntegrityVerifier(dir, { mode, allowedHosts: hosts });
  return { cache, verifier, fetcher: new ModuleFetcher(cache, verifier) };
}

describe('remote module policy before effects', () => {
  it('requires an explicit verifier even through the direct fetcher API', () => {
    expect(() => new ModuleFetcher(new MemoryCache<string>(), undefined as never)).toThrow(/integrity|verifier/i);
  });

  it('off disables digests, never protocol or hostname policy', async () => {
    const { verifier, fetcher } = fixture();
    const network = vi.fn(async () => new Response(content)); vi.stubGlobal('fetch', network);
    expect(() => verifier.assertHostAllowed('http://esm.sh/entry.js')).toThrow(IntegrityError);
    await expect(fetcher.fetch('https://other.invalid/private.js', { retries: 0 })).rejects.toBeInstanceOf(IntegrityError);
    expect(network).not.toHaveBeenCalled();
  });

  it.each(['127.trusted.invalid', '127.0.0.1.attacker.invalid'])('does not mistake %s for an IPv4 loopback literal', host => {
    const verifier = new ModuleIntegrityVerifier(dir, { allowedHosts: [host] });
    expect(() => verifier.assertHostAllowed(`http://${host}/entry.js`)).toThrow(IntegrityError);
  });

  it.each(['ftp://127.0.0.1/entry.js', 'file://localhost/entry.js'])('rejects non-HTTP protocols even on a loopback host', url => {
    const verifier = new ModuleIntegrityVerifier(dir, { allowedHosts: ['localhost', '127.0.0.1'] });
    expect(() => verifier.assertHostAllowed(url)).toThrow(IntegrityError);
  });

  it('refuses unknown strict URLs without a network request', async () => {
    const { fetcher } = fixture('strict');
    const network = vi.fn(async () => new Response(content)); vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { retries: 0 })).rejects.toBeInstanceOf(IntegrityError);
    expect(network).not.toHaveBeenCalled();
  });

  it('rejects URL credentials without exposing them in diagnostic text', async () => {
    const { fetcher } = fixture();
    const network = vi.fn(async () => new Response(content)); vi.stubGlobal('fetch', network);
    const error = await fetcher.fetch('https://operator:synthetic-secret@esm.sh/entry.js', { retries: 0 }).catch(value => value);
    expect(error).toBeInstanceOf(IntegrityError);
    expect(String(error)).not.toContain('synthetic-secret');
    expect(network).not.toHaveBeenCalled();
  });
});

describe('one redirect policy for HTTP and source wrappers', () => {
  it('never forwards caller headers to another origin, including same-host port changes', async () => {
    const { fetcher } = fixture();
    const target = 'https://esm.sh:444/actual.js';
    const network = vi.fn(async (url: string, _request?: RequestInit) => url === entry
      ? new Response(null, { status: 302, headers: { location: target } }) : new Response(content));
    vi.stubGlobal('fetch', network);
    await fetcher.fetch(entry, { retries: 0, headers: { Authorization: 'Bearer synthetic', 'X-Private-Key': 'synthetic' } });
    expect(new Headers(network.mock.calls[0]![1]?.headers).get('authorization')).toBe('Bearer synthetic');
    const forwarded = new Headers(network.mock.calls[1]![1]?.headers);
    expect(forwarded.get('authorization')).toBeNull();
    expect(forwarded.get('x-private-key')).toBeNull();
  });


  it('detects HTTP cycles, cancels unused bodies and does not restore stripped headers', async () => {
    const { fetcher } = fixture();
    const cancelled = vi.fn();
    const network = vi.fn(async (url: string, _request?: RequestInit) => new Response(new ReadableStream({ cancel: cancelled }),
      { status: 307, headers: { location: url === entry ? 'https://jsr.io/redirect' : entry } }));
    vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { retries: 0, headers: { Authorization: 'Bearer synthetic' } })).rejects.toMatchObject({ code: 'MODULE_REDIRECT_LIMIT' });
    expect(network).toHaveBeenCalledTimes(2); expect(cancelled).toHaveBeenCalledTimes(2);
    expect(new Headers(network.mock.calls[1]![1]?.headers).get('authorization')).toBeNull();
  });

  it('preserves caller headers on a same-origin redirect and records both URL pins', async () => {
    const { fetcher } = fixture('lockfile'); const target = 'https://esm.sh/actual.js';
    const network = vi.fn(async (url: string, _request?: RequestInit) => url === entry
      ? new Response(null, { status: 308, headers: { location: '/actual.js' } }) : new Response(content));
    vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(entry, { retries: 0, headers: { Authorization: 'Bearer synthetic' } })).url).toBe(target);
    expect(new Headers(network.mock.calls[1]![1]?.headers).get('authorization')).toBe('Bearer synthetic');
    const lock = { modules: await readPins() };
    expect(lock.modules[computeModuleIdentity(entry)].integrity).toBe(computeIntegrity(content));
    expect(lock.modules[computeModuleIdentity(target)].integrity).toBe(computeIntegrity(content));
  });

  it('does not retain a new alias pin when the target integrity check fails', async () => {
    const { fetcher, verifier } = fixture('lockfile'); const target = 'https://esm.sh/pinned.js';
    await verifier.verify(target, content); await verifier.save();
    const network = vi.fn(async (url: string) => url === entry
      ? new Response(null, { status: 302, headers: { location: target } }) : new Response('different source'));
    vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { retries: 0 })).rejects.toBeInstanceOf(IntegrityError);
    await verifier.verify('https://esm.sh/another.js', content); await verifier.save();
    const lock = { modules: await readPins() };
    expect(lock.modules).not.toHaveProperty(computeModuleIdentity(entry));
    expect(lock.modules[computeModuleIdentity(target)].integrity).toBe(computeIntegrity(content));
  });

  it('returns a source re-export exactly without interpreting it as an HTTP redirect', async () => {
    const { fetcher } = fixture();
    const source = `export * from "${entry}";`;
    let calls = 0;
    const network = vi.fn(async () => {
      if (++calls > 8) throw new IntegrityError('fixture safety guard', entry);
      return new Response(source);
    });
    vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(entry, { retries: 0 })).content).toBe(source);
    expect(network).toHaveBeenCalledOnce();
  });

  it('checks the exact wrapper rather than replacing it with another module', async () => {
    const { fetcher, verifier } = fixture('lockfile');
    await verifier.verify(entry, 'export * from "https://esm.sh/target.js";'); await verifier.save();
    const network = vi.fn(async (url: string) => new Response(url === entry
      ? 'import "node:fs"; export * from "https://esm.sh/target.js";' : content));
    vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { retries: 0 })).rejects.toBeInstanceOf(IntegrityError);
    expect(network).toHaveBeenCalledOnce();
  });
});

describe('bounded complete response and raw integrity', () => {
  it('does not treat the former transformed cache namespace as raw remote source', async () => {
    const { fetcher, cache } = fixture(); await cache.set(entry, 'legacy transformed content');
    const network = vi.fn(async () => new Response(content)); vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(entry, { retries: 0 })).content).toBe(content);
    expect(network).toHaveBeenCalledOnce();
  });

  it('limits the measured body even when Content-Length claims it is smaller', async () => {
    const { fetcher, cache } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(content, { headers: { 'content-length': '1' } })));
    await expect(fetcher.fetch(entry, { retries: 0, maxBytes: 8 })).rejects.toThrow(/byte|size|limit/i);
    expect((await cache.stats()).memoryEntries).toBe(0);
  });

  it('rejects invalid UTF-8 instead of pinning lossy replacement text', async () => {
    const { fetcher, cache } = fixture('lockfile');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Uint8Array([0xff]))));
    await expect(fetcher.fetch(entry, { retries: 0 })).rejects.toThrow(/UTF-8|encoded|encoding/i);
    expect((await cache.stats()).memoryEntries).toBe(0);
  });

  it('pins the exact raw UTF-8 source, including its BOM, before transformation', async () => {
    const { fetcher } = fixture('lockfile');
    const raw = '\uFEFFimport fs from "/node/fs.mjs"; export { fs };';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new TextEncoder().encode(raw))));
    await fetcher.fetch(entry, { retries: 0 });
    const lock = { modules: await readPins() };
    expect(JSON.parse(await readFile(join(dir, 'module-lock.json'), 'utf8'))).toEqual({ version: 2, storage: 'immutable-pins' });
    expect(lock.modules[computeModuleIdentity(entry)].integrity).toBe(computeIntegrity(raw));
  });

  it.skipIf(process.platform === 'win32')('creates its new lock directory and file with private permissions', async () => {
    const privateDirectory = join(dir, 'new-private-cache');
    const verifier = new ModuleIntegrityVerifier(privateDirectory);
    await verifier.verify(entry, content); await verifier.save();
    expect((await stat(privateDirectory)).mode & 0o777).toBe(0o700);
    expect((await stat(join(privateDirectory, 'module-lock.json'))).mode & 0o777).toBe(0o600);
  });

  it('keeps concurrent in-process first-use pins as independent immutable records', async () => {
    const { verifier } = fixture('lockfile');
    await Promise.all([verifier.verify(entry, content), verifier.verify('https://esm.sh/second.js', content)]);
    await Promise.all([verifier.save(), verifier.verify('https://esm.sh/third.js', content).then(() => verifier.save())]);
    const lock = { modules: await readPins() };
    expect(Object.values(lock.modules).map(value => (value as { url: string }).url).sort()).toEqual([entry, 'https://esm.sh/second.js', 'https://esm.sh/third.js']);
  });

  it('separates query identities without persisting query values or fragments in cache keys, lock metadata or errors', async () => {
    const { fetcher, cache } = fixture('lockfile');
    const first = `${entry}?token=synthetic-alpha`, second = `${entry}?token=synthetic-beta`;
    const get = vi.spyOn(cache, 'get'), set = vi.spyOn(cache, 'set');
    const network = vi.fn(async (url: string) => new Response(url.includes('alpha') ? 'export const value = 1;' : 'export const value = 2;'));
    vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(first + '#synthetic-fragment', { retries: 0 })).content).toContain('= 1');
    expect((await fetcher.fetch(first + '#other-fragment', { retries: 0 })).content).toContain('= 1');
    expect((await fetcher.fetch(second, { retries: 0 })).content).toContain('= 2');
    expect(network).toHaveBeenCalledTimes(2);
    const pins = await readPins();
    const serialized = await readFile(join(dir, 'module-lock.json'), 'utf8') + JSON.stringify(pins);
    expect(serialized).not.toContain('synthetic-');
    const lock = { modules: pins };
    expect(Object.keys(lock.modules).sort()).toEqual([computeModuleIdentity(first), computeModuleIdentity(second)].sort());
    expect(Object.values(lock.modules).map(value => (value as { url: string }).url)).toEqual([entry, entry]);
    expect(JSON.stringify([...get.mock.calls.map(call => call[0]), ...set.mock.calls.map(call => call[0])])).not.toContain('synthetic-');
    await cache.clear(); network.mockImplementation(async () => new Response('changed'));
    const error = await fetcher.fetch(first, { retries: 0 }).catch(value => value);
    expect(error).toBeInstanceOf(IntegrityError);
    expect(String(error) + JSON.stringify(error)).not.toContain('synthetic-alpha');
  });

  it('does not reuse an authorized response for a caller without those headers', async () => {
    const { fetcher, cache } = fixture();
    const network = vi.fn(async (_url: string, request?: RequestInit) => new Response(new Headers(request?.headers).has('authorization') ? 'private source' : 'public source'));
    vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(entry, { headers: { Authorization: 'Bearer synthetic' }, retries: 0 })).content).toBe('private source');
    expect((await cache.stats()).memoryEntries).toBe(0);
    expect((await fetcher.fetch(entry, { retries: 0 })).content).toBe('public source');
    expect((await fetcher.fetch(entry, { headers: { Authorization: 'Bearer synthetic' }, retries: 0 })).content).toBe('private source');
    expect(network).toHaveBeenCalledTimes(3);
  });

  it('refuses the old transformed-byte lock format without silently migrating it', async () => {
    const previous = JSON.stringify({ version: 1, modules: { [entry]: { integrity: computeIntegrity(content), addedAt: new Date().toISOString() } } });
    await writeFile(join(dir, 'module-lock.json'), previous);
    const { fetcher } = fixture('strict');
    const network = vi.fn(async () => new Response(content)); vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { retries: 0 })).rejects.toThrow(/version|format|review/i);
    expect(network).not.toHaveBeenCalled();
    expect(await readFile(join(dir, 'module-lock.json'), 'utf8')).toBe(previous);
  });

  it('keeps the deadline active after headers until the complete native body has arrived', async () => {
    let headersSent = false;
    const server = createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/javascript' }); response.flushHeaders(); headersSent = true;
      response.write('export const ');
      const timer = setTimeout(() => response.end('late = true;'), 500);
      response.once('close', () => clearTimeout(timer));
    });
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Missing test port');
    try {
      const { fetcher } = fixture('off', ['127.0.0.1']);
      await expect(fetcher.fetch(`http://127.0.0.1:${address.port}/entry.js`, { retries: 0, timeout: 100 })).rejects.toThrow(/timed out|timeout|abort/i);
      expect(headersSent).toBe(true);
    } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  });
});


describe('cancellation, input bounds and response ownership', () => {
  it('refuses invalid timers, retries, byte limits and authority headers before contacting a host', async () => {
    const { fetcher } = fixture(); const network = vi.fn(); vi.stubGlobal('fetch', network);
    for (const options of [{ timeout: 2_147_483_648 }, { timeout: 0.5 }, { retries: 6 }, { retries: -1 }, { maxBytes: 64 * 1024 * 1024 + 1 }, { headers: { Host: 'other.invalid' } }]) {
      await expect(fetcher.fetch(entry, options)).rejects.toThrow();
    }
    expect(network).not.toHaveBeenCalled();
  });

  it('does not echo credentials when header values or redirect URLs are malformed', async () => {
    const { fetcher } = fixture(); const network = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://operator:synthetic-secret@[' } }));
    vi.stubGlobal('fetch', network);
    for (const suffix of ['\n', '\u0001', '\u007f']) {
      const headerError = await fetcher.fetch(entry, { headers: { Authorization: `synthetic-secret${suffix}` } }).catch(error => error);
      expect(headerError).toBeInstanceOf(TypeError); expect(String(headerError)).not.toContain('synthetic-secret');
    }
    expect(network).not.toHaveBeenCalled();
    const redirectError = await fetcher.fetch(entry, { retries: 0 }).catch(error => error);
    expect(redirectError).toMatchObject({ code: 'MODULE_REDIRECT_INVALID' }); expect(String(redirectError)).not.toContain('synthetic-secret');
  });

  it('stops a backoff on caller cancellation without issuing the next request', async () => {
    const { fetcher } = fixture(); const cause = new Error('caller stopped'); const controller = new AbortController();
    const network = vi.fn(async () => { queueMicrotask(() => controller.abort(cause)); throw new Error('network unavailable'); });
    vi.stubGlobal('fetch', network);
    await expect(fetcher.fetch(entry, { signal: controller.signal })).rejects.toBe(cause);
    expect(network).toHaveBeenCalledOnce();
  });

  it('preserves the previous source and reports both body-limit and cleanup failures', async () => {
    const { fetcher, cache } = fixture(); const cleanup = new Error('cancel failed');
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(content)); }, cancel() { throw cleanup; },
    }))));
    const error = await fetcher.fetch(entry, { retries: 0, maxBytes: 4 }).catch(value => value);
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([expect.objectContaining({ code: 'MODULE_SOURCE_LIMIT' }), cleanup]);
    expect((await cache.stats()).memoryEntries).toBe(0);
  });

  it('reports a bounded unconfirmed cleanup instead of waiting on a stalled response cancellation', async () => {
    vi.useFakeTimers();
    const { fetcher } = fixture();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode(content)); },
      cancel() { return new Promise<void>(() => {}); },
    }))));
    const outcome = fetcher.fetch(entry, { retries: 0, maxBytes: 4 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(1001);
    const error = await outcome;
    expect(error).toBeInstanceOf(AggregateError);
    expect(error.errors).toEqual([expect.objectContaining({ code: 'MODULE_SOURCE_LIMIT' }), expect.objectContaining({ code: 'MODULE_CLEANUP_UNCONFIRMED' })]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('accepts and caches an empty raw source under a zero-byte budget', async () => {
    const { fetcher } = fixture(); const network = vi.fn(async () => new Response('')); vi.stubGlobal('fetch', network);
    expect((await fetcher.fetch(entry, { maxBytes: 0 })).content).toBe('');
    expect((await fetcher.fetch(entry, { maxBytes: 0 })).content).toBe('');
    expect(network).toHaveBeenCalledOnce();
  });
});
