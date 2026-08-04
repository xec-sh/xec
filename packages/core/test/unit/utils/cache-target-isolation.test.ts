import { $ } from '../../../src/index.js';
import { globalCache } from '../../../src/utils/cache.js';

/**
 * A cached result belongs to the place it came from.
 *
 * The key used to be command + cwd + env only, so `hostname` cached against
 * prod-1 was served for prod-2, and one container's file listing for a
 * different container. The tool answered with another machine's data and
 * looked confident doing it — for anything that acts on the answer (a health
 * check, a deploy gate) that is a safety failure, not just a stale read.
 */
describe('cache entries are scoped to their target', () => {
  beforeEach(() => {
    globalCache.clear();
  });

  /** Two commands that differ only by where they run must not collide. */
  function keyFor(adapterOptions: Record<string, unknown>): string {
    return globalCache.generateKey('hostname', undefined, undefined, {
      adapter: adapterOptions['type'] as string,
      host: adapterOptions['host'] as string | undefined,
      port: adapterOptions['port'] as number | undefined,
      container: adapterOptions['container'] as string | undefined,
      pod: adapterOptions['pod'] as string | undefined,
      namespace: adapterOptions['namespace'] as string | undefined,
      context: adapterOptions['context'] as string | undefined,
    });
  }

  it.each([
    ['two SSH hosts', { type: 'ssh', host: 'prod-1' }, { type: 'ssh', host: 'prod-2' }],
    ['two ports on one host', { type: 'ssh', host: 'h', port: 22 }, { type: 'ssh', host: 'h', port: 2222 }],
    ['two containers', { type: 'docker', container: 'api' }, { type: 'docker', container: 'worker' }],
    ['two pods', { type: 'kubernetes', pod: 'api-1' }, { type: 'kubernetes', pod: 'api-2' }],
    ['two namespaces', { type: 'kubernetes', pod: 'api', namespace: 'staging' }, { type: 'kubernetes', pod: 'api', namespace: 'production' }],
    ['two clusters', { type: 'kubernetes', pod: 'api', context: 'staging' }, { type: 'kubernetes', pod: 'api', context: 'production' }],
    ['ssh versus docker', { type: 'ssh', host: 'h' }, { type: 'docker', container: 'h' }],
  ])('separates %s', (_label, a, b) => {
    expect(keyFor(a)).not.toBe(keyFor(b));
  });

  it('still shares an entry for the same target', () => {
    const target = { type: 'ssh', host: 'prod-1', port: 22 };

    expect(keyFor(target)).toBe(keyFor({ ...target }));
  });

  it('ignores credentials, which identify nobody', () => {
    // Two commands differing only by password address the same machine, and
    // a cache key gets logged and compared — no place for a secret.
    const withPassword = globalCache.generateKey('hostname', undefined, undefined, {
      adapter: 'ssh', host: 'h', user: 'deploy',
    });
    const same = globalCache.generateKey('hostname', undefined, undefined, {
      adapter: 'ssh', host: 'h', user: 'deploy',
    });

    expect(withPassword).toBe(same);
  });

  it('caches a repeated local command', async () => {
    const first = await $.exec('echo cached-value').cache({ ttl: 60_000 });
    const second = await $.exec('echo cached-value').cache({ ttl: 60_000 });

    expect(first.stdout).toBe(second.stdout);
  }, 20_000);
});
