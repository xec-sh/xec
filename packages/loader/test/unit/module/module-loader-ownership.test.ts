import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { rm, mkdtemp, readFile } from 'node:fs/promises';
import { it, vi, expect, afterEach, beforeEach } from 'vitest';

import { ModuleLoader } from '../../../src/module/module-loader.js';

let directory: string;
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'xec-loader-ownership-')); });
afterEach(async () => {
  vi.restoreAllMocks();
  await rm(directory, { recursive: true, force: true });
});

function loader(verbose = false) {
  return new ModuleLoader({ cacheDir: directory, verbose, integrity: { allowedHosts: ['example.com'] } });
}

it('cache clearing retains trust pins for a new loader instance', async () => {
  const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('export const value = 42;'));
  const first = loader();
  expect((await first.import('https://example.com/owned.js')).value).toBe(42);
  const trusted = await readFile(join(directory, 'module-lock.json'), 'utf8');
  await first.clearCache();
  expect(await readFile(join(directory, 'module-lock.json'), 'utf8')).toBe(trusted);
  request.mockResolvedValueOnce(new Response('throw new Error("untrusted module executed");'));
  await expect(loader().import('https://example.com/owned.js')).rejects.toThrow('Integrity mismatch');
  expect(await readFile(join(directory, 'module-lock.json'), 'utf8')).toBe(trusted);
});

it('refuses cleanup while a module is being fetched', async () => {
  let release!: (response: Response) => void;
  let requested!: () => void;
  const started = new Promise<void>(resolve => { requested = resolve; });
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
    requested();
    return new Promise<Response>(resolve => { release = resolve; });
  });
  const subject = loader();
  const pending = subject.import('https://example.com/pending.js');
  await started;
  try {
    await expect(subject.clearCache()).rejects.toThrow('operation is active');
  } finally {
    release(new Response('export const value = 1;'));
    await pending;
  }
  await subject.clearCache();
});

it('keeps query credentials out of verbose diagnostics and trust records', async () => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('export const value = 1;'));
  const output = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  await loader(true).import('https://example.com/private.js?token=private-fixture-secret');
  expect(output).toHaveBeenCalled();
  expect(output.mock.calls.flat().join(' ')).not.toContain('private-fixture-secret');
  expect(await readFile(join(directory, 'module-lock.json'), 'utf8')).not.toContain('private-fixture-secret');
});
