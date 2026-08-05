import type { ResolvedTarget } from '@xec-sh/ops';
import type { TargetOutcome } from '../../src/utils/fleet-run.js';

import { runFleet, toCoreTarget } from '../../src/utils/fleet-run.js';

/**
 * The fan-out loop, which `on` and `in` both now run through. Everything
 * pinned here was broken in at least one of the two copies it replaces.
 */
describe('running one command across a fleet', () => {
  const host = (name: string): ResolvedTarget => ({
    id: `hosts.${name}`,
    name,
    type: 'ssh',
    config: { type: 'ssh', host: `${name}.example.com` },
    source: 'configured',
  });

  const ok = (stdout = 'fine'): TargetOutcome => ({ exitCode: 0, stdout, stderr: '' });
  const bad = (exitCode = 1): TargetOutcome => ({ exitCode, stdout: '', stderr: 'boom' });

  it('keeps the output of every target', async () => {
    // Both copies passed `quiet: true` to the single-target path under
    // --parallel to stop the lines interleaving. It stopped the
    // interleaving by discarding every result.
    const { result } = await runFleet(
      [host('web-1'), host('web-2')],
      'uptime',
      async target => ok(`output from ${target.name}`),
      { parallel: true }
    );

    expect(result.entries.map(entry => entry.stdout).sort()).toEqual([
      'output from web-1',
      'output from web-2',
    ]);
  });

  it('reports the command that produced it', async () => {
    const { result } = await runFleet([host('a')], 'uptime', async () => ok());

    expect(result.command).toBe('uptime');
  });

  it('counts a non-zero exit as a failure without losing the others', async () => {
    const { result } = await runFleet(
      [host('a'), host('b'), host('c')],
      'systemctl status app',
      async target => (target.name === 'b' ? bad(3) : ok()),
      { parallel: true }
    );

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.ok).toBe(false);
  });

  it('survives a runner that throws instead of returning', async () => {
    // An adapter that fails before producing anything used to reject the
    // whole fan-out, discarding every target that had already succeeded.
    const { result } = await runFleet(
      [host('a'), host('b')],
      'uptime',
      async target => {
        if (target.name === 'a') throw new Error('connection refused');
        return ok();
      },
      { parallel: true }
    );

    expect(result.total).toBe(2);
    expect(result.succeeded).toBe(1);
    expect(result.entries.find(entry => entry.name === 'a')?.error)
      .toBe('connection refused');
  });

  describe('limits on how much may fail', () => {
    it('stops starting new targets after --fail-fast', async () => {
      const started: string[] = [];

      const { result, skipped } = await runFleet(
        [host('a'), host('b'), host('c'), host('d')],
        'deploy',
        async target => {
          started.push(target.name!);
          return bad();
        },
        { failFast: true }
      );

      expect(started).toEqual(['a']);
      expect(result.entries).toHaveLength(1);
      expect(skipped.map(t => t.name)).toEqual(['b', 'c', 'd']);
    });

    it('stops at a share of the fleet', async () => {
      const { result, skipped } = await runFleet(
        [host('a'), host('b'), host('c'), host('d'), host('e')],
        'deploy',
        async () => bad(),
        { maxFailures: '20%' }
      );

      expect(result.entries).toHaveLength(1);
      expect(skipped).toHaveLength(4);
    });

    it('names what it did not run rather than going quiet', async () => {
      // A fan-out that stopped early and said nothing reads exactly like
      // one that covered the whole fleet.
      const { skipped } = await runFleet(
        [host('a'), host('b')],
        'deploy',
        async () => bad(),
        { failFast: true }
      );

      expect(skipped.map(t => t.name)).toEqual(['b']);
    });

    it('runs everything when no limit was asked for', async () => {
      const { result, skipped } = await runFleet(
        [host('a'), host('b'), host('c')],
        'deploy',
        async () => bad(),
        {}
      );

      expect(result.entries).toHaveLength(3);
      expect(skipped).toEqual([]);
    });
  });

  describe('concurrency', () => {
    it('never exceeds the cap', async () => {
      let running = 0;
      let peak = 0;

      await runFleet(
        Array.from({ length: 12 }, (_, i) => host(`h${i}`)),
        'uptime',
        async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise(resolve => setTimeout(resolve, 5));
          running--;
          return ok();
        },
        { parallel: true, maxConcurrent: 3 }
      );

      expect(peak).toBeLessThanOrEqual(3);
      expect(peak).toBeGreaterThan(1);
    });

    it('runs one at a time when not parallel', async () => {
      let running = 0;
      let peak = 0;

      await runFleet(
        [host('a'), host('b'), host('c')],
        'uptime',
        async () => {
          running++;
          peak = Math.max(peak, running);
          await new Promise(resolve => setTimeout(resolve, 1));
          running--;
          return ok();
        },
        { parallel: false }
      );

      expect(peak).toBe(1);
    });

    it('treats a cap below one as one', async () => {
      const { result } = await runFleet(
        [host('a'), host('b')],
        'uptime',
        async () => ok(),
        { parallel: true, maxConcurrent: 0 }
      );

      expect(result.total).toBe(2);
    });
  });

  it('names a target the way the operator named it', async () => {
    // `describeTarget` answers with the address — right for core, where a
    // target may have no other name; wrong in a report about `hosts.web-*`,
    // where the reader is looking for `web-1`.
    const { result } = await runFleet([host('web-1')], 'uptime', async () => ok());

    expect(result.entries[0]!.name).toBe('web-1');
  });

  it('falls back to the address when there is no name', async () => {
    const anonymous: ResolvedTarget = {
      id: 'ssh:direct',
      type: 'ssh',
      config: { type: 'ssh', host: 'direct.example.com' } as never,
      source: 'created',
    };

    const { result } = await runFleet([anonymous], 'uptime', async () => ok());

    expect(result.entries[0]!.name).toBe('direct.example.com');
  });

  it('does not call an empty fleet a success', async () => {
    const { result } = await runFleet([], 'deploy', async () => ok());

    expect(result.ok).toBe(false);
    expect(result.total).toBe(0);
  });
});

describe('naming a configured target by its address', () => {
  it('reduces an ssh target to host, user and port', () => {
    expect(
      toCoreTarget({
        id: 'hosts.web',
        name: 'web',
        type: 'ssh',
        config: { type: 'ssh', host: 'web.example.com', username: 'deploy', port: 2222 } as never,
        source: 'configured',
      })
    ).toEqual({ kind: 'ssh', host: 'web.example.com', user: 'deploy', port: 2222 });
  });

  it('falls back to the configured name when there is no host', () => {
    expect(
      toCoreTarget({
        id: 'hosts.web',
        name: 'web',
        type: 'ssh',
        config: { type: 'ssh' } as never,
        source: 'configured',
      })
    ).toEqual({ kind: 'ssh', host: 'web' });
  });

  it('defaults a kubernetes namespace rather than inventing one', () => {
    expect(
      toCoreTarget({
        id: 'pods.api',
        name: 'api',
        type: 'kubernetes',
        config: { type: 'kubernetes', pod: 'api-7f9d' } as never,
        source: 'configured',
      })
    ).toEqual({ kind: 'kubernetes', namespace: 'default', pod: 'api-7f9d' });
  });

  it('carries a container name', () => {
    expect(
      toCoreTarget({
        id: 'containers.app',
        name: 'app',
        type: 'docker',
        config: { type: 'docker', container: 'app-1' } as never,
        source: 'configured',
      })
    ).toEqual({ kind: 'docker', container: 'app-1' });
  });

  it('says local when it is local', () => {
    expect(
      toCoreTarget({
        id: 'local',
        name: 'local',
        type: 'local',
        config: { type: 'local' } as never,
        source: 'detected',
      })
    ).toEqual({ kind: 'local' });
  });
});
