import { createServer } from 'node:http';

import type { AddressInfo } from 'node:net';
import type { ServerResponse } from 'node:http';

import { ModuleFetcher } from '../src/module/module-fetcher.js';
import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import {
  IntegrityError,
  computeIntegrity,
  ModuleIntegrityVerifier,
} from '../src/module/module-integrity.js';

/**
 * Remote modules are executed with full process privileges on machines that
 * hold production credentials. These tests pin the guarantee that content
 * which changed since it was locked is never executed.
 */
describe('ModuleIntegrityVerifier', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-integrity-'));
  });

  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  const url = 'https://esm.sh/lodash@4.17.21';

  it('records a digest on first use and accepts identical content later', async () => {
    const first = new ModuleIntegrityVerifier(dir);
    await first.verify(url, 'export const a = 1;');
    await first.save();

    const second = new ModuleIntegrityVerifier(dir);
    await expect(second.verify(url, 'export const a = 1;')).resolves.toBeUndefined();
  });

  it('rejects content that changed after being locked', async () => {
    const first = new ModuleIntegrityVerifier(dir);
    await first.verify(url, 'export const a = 1;');
    await first.save();

    // The same URL now serves something else — a compromised CDN, a mutated
    // package, or a poisoned cache.
    const second = new ModuleIntegrityVerifier(dir);
    await expect(second.verify(url, 'export const a = 1; fetch("http://evil");')).rejects.toThrow(
      IntegrityError
    );
  });

  it('names the lockfile in the mismatch error so the fix is obvious', async () => {
    const first = new ModuleIntegrityVerifier(dir);
    await first.verify(url, 'a');
    await first.save();

    const second = new ModuleIntegrityVerifier(dir);
    await expect(second.verify(url, 'b')).rejects.toThrow(/module-lock\.json/);
  });

  it('refuses unknown URLs entirely in strict mode', async () => {
    const strict = new ModuleIntegrityVerifier(dir, { mode: 'strict' });
    await expect(strict.verify(url, 'export const a = 1;')).rejects.toThrow(/strict/);
  });

  it('accepts a previously locked URL in strict mode', async () => {
    const seed = new ModuleIntegrityVerifier(dir);
    await seed.verify(url, 'export const a = 1;');
    await seed.save();

    const strict = new ModuleIntegrityVerifier(dir, { mode: 'strict' });
    await expect(strict.verify(url, 'export const a = 1;')).resolves.toBeUndefined();
  });

  it('performs no verification when disabled', async () => {
    const off = new ModuleIntegrityVerifier(dir, { mode: 'off' });
    await expect(off.verify(url, 'anything')).resolves.toBeUndefined();
    await expect(off.verify(url, 'something else')).resolves.toBeUndefined();
  });

  describe('host allowlist', () => {
    it('permits the known CDN hosts', () => {
      const verifier = new ModuleIntegrityVerifier(dir);
      expect(() => verifier.assertHostAllowed('https://esm.sh/lodash')).not.toThrow();
      expect(() => verifier.assertHostAllowed('https://cdn.jsdelivr.net/npm/x')).not.toThrow();
    });

    it('rejects a host that is not listed', () => {
      const verifier = new ModuleIntegrityVerifier(dir);
      expect(() => verifier.assertHostAllowed('https://evil.example.com/x.js')).toThrow(
        IntegrityError
      );
    });

    it('rejects a look-alike host', () => {
      const verifier = new ModuleIntegrityVerifier(dir);
      expect(() => verifier.assertHostAllowed('https://esm.sh.evil.com/x.js')).toThrow(
        IntegrityError
      );
    });

    it('honours a custom allowlist', () => {
      const verifier = new ModuleIntegrityVerifier(dir, { allowedHosts: ['registry.internal'] });
      expect(() => verifier.assertHostAllowed('https://registry.internal/x.js')).not.toThrow();
      expect(() => verifier.assertHostAllowed('https://esm.sh/lodash')).toThrow(IntegrityError);
    });

    it('rejects a malformed URL', () => {
      const verifier = new ModuleIntegrityVerifier(dir);
      expect(() => verifier.assertHostAllowed('not a url')).toThrow(IntegrityError);
    });
  });

  it('refuses to run against a malformed lockfile rather than skipping checks', async () => {
    await fs.writeFile(path.join(dir, 'module-lock.json'), '{ this is not json');

    const verifier = new ModuleIntegrityVerifier(dir);
    await expect(verifier.verify(url, 'x')).rejects.toThrow(/malformed/);
  });

  it('writes the lockfile with owner-only permissions and stable ordering', async () => {
    const verifier = new ModuleIntegrityVerifier(dir);
    await verifier.verify('https://esm.sh/z', 'z');
    await verifier.verify('https://esm.sh/a', 'a');
    await verifier.save();

    const lockPath = path.join(dir, 'module-lock.json');
    const stat = await fs.stat(lockPath);
    expect(stat.mode & 0o777).toBe(0o600);

    const parsed = JSON.parse(await fs.readFile(lockPath, 'utf8'));
    expect(Object.keys(parsed.modules)).toEqual(['https://esm.sh/a', 'https://esm.sh/z']);
  });

  it('computes a Subresource-Integrity-style digest', () => {
    expect(computeIntegrity('hello')).toMatch(/^sha256-[A-Za-z0-9+/]+=*$/);
    expect(computeIntegrity('hello')).toBe(computeIntegrity('hello'));
    expect(computeIntegrity('hello')).not.toBe(computeIntegrity('hellp'));
  });
});

describe('host allowlist across redirects', () => {
  /** Start a throwaway HTTP server and return its port plus a stop function. */
  async function serve(handler: (req: unknown, res: ServerResponse) => void) {
    const server = createServer(handler as never);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    return { port: (server.address() as AddressInfo).port, stop: () => server.close() };
  }

  it('refuses a redirect that leaves the allowlist', async () => {
    // An allowlisted CDN redirecting elsewhere — an open redirect, or a
    // compromised one — used to deliver code from a forbidden host, because
    // only the first URL was checked. The lockfile then pinned that content
    // under the allowed URL, laundering it.
    const evil = await serve((_req, res) => res.end('export const OWNED = true;'));
    const good = await serve((_req, res) => {
      res.writeHead(302, { location: `http://localhost:${evil.port}/evil.js` });
      res.end();
    });

    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'xec-redirect-'));

    try {
      const verifier = new ModuleIntegrityVerifier(dir, {
        mode: 'lockfile',
        allowedHosts: ['127.0.0.1'],
      });
      const fetcher = new ModuleFetcher(
        { get: async () => undefined, set: async () => {} } as never,
        verifier
      );

      await expect(
        fetcher.fetch(`http://127.0.0.1:${good.port}/mod.js`, { retries: 0 })
      ).rejects.toThrow(/unlisted host: localhost/);
    } finally {
      evil.stop();
      good.stop();
      await fs.rm(dir, { recursive: true, force: true });
    }
  }, 30_000);
});
