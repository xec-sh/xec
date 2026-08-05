import {
  fleetEntry,
  fleetResult,
  type Target,
  failedTargets,
  coalesceOutput,
  type FleetEntry,
  exceedsFailureLimit,
} from '../../../src/index.js';

/**
 * A fan-out has a shape a loop does not, and the aggregates are where that
 * shape either helps or lies. The rules pinned here are the ones a caller
 * acts on: an empty fan-out is not a success, a failure is counted whether
 * it exited non-zero or never ran at all, and identical outputs collapse so
 * that the one machine disagreeing is the one you see.
 */
describe('fleet results', () => {
  const host = (name: string): Target => ({ kind: 'ssh', host: name });

  const entry = (name: string, overrides: Partial<FleetEntry> = {}): FleetEntry =>
    fleetEntry(host(name), {
      ok: true,
      exitCode: 0,
      stdout: 'up 3 days',
      stderr: '',
      durationMs: 10,
      ...overrides,
    });

  it('counts what succeeded and what did not', () => {
    const result = fleetResult('uptime', [
      entry('web-1'),
      entry('web-2'),
      entry('web-3', { ok: false, exitCode: 1, stdout: '', stderr: 'boom' }),
    ], 120);

    expect(result.total).toBe(3);
    expect(result.succeeded).toBe(2);
    expect(result.failed).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.durationMs).toBe(120);
  });

  it('does not call an empty fan-out a success', () => {
    // `every` over an empty list is vacuously true, which is how a
    // deployment to zero targets once reported that it had deployed.
    const result = fleetResult('deploy', [], 0);

    expect(result.ok).toBe(false);
    expect(result.total).toBe(0);
  });

  it('counts a target that never ran as failed', () => {
    const result = fleetResult('uptime', [
      entry('web-1'),
      entry('web-2', { ok: false, exitCode: -1, stdout: '', stderr: '', error: 'connection refused' }),
    ], 50);

    expect(result.failed).toBe(1);
    expect(result.entries[1]!.error).toBe('connection refused');
  });

  it('names each target the way a person would', () => {
    const withUser = fleetEntry({ kind: 'ssh', host: 'db-1', user: 'deploy' }, {
      ok: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1,
    });
    const container = fleetEntry({ kind: 'docker', container: 'api' }, {
      ok: true, exitCode: 0, stdout: '', stderr: '', durationMs: 1,
    });

    expect(withUser.name).toBe('deploy@db-1');
    expect(container.name).toBe('api');
  });

  describe('coalescing', () => {
    it('groups identical output and puts the outlier last', () => {
      // Reading twenty identical blocks to find the one that differs is
      // work a machine should do — the idea `dshbak -c` had in 2003 and
      // nothing since.
      const result = fleetResult('cat /etc/os-release', [
        entry('web-1', { stdout: 'ubuntu 24.04' }),
        entry('web-2', { stdout: 'ubuntu 24.04' }),
        entry('web-3', { stdout: 'ubuntu 22.04' }),
        entry('web-4', { stdout: 'ubuntu 24.04' }),
      ], 80);

      const groups = coalesceOutput(result);

      expect(groups).toHaveLength(2);
      expect(groups[0]!.targets).toEqual(['web-1', 'web-2', 'web-4']);
      expect(groups[0]!.output).toBe('ubuntu 24.04');
      expect(groups[1]!.targets).toEqual(['web-3']);
    });

    it('ignores trailing whitespace when comparing', () => {
      const result = fleetResult('hostname', [
        entry('a', { stdout: 'same\n' }),
        entry('b', { stdout: 'same' }),
      ], 10);

      expect(coalesceOutput(result)).toHaveLength(1);
    });

    it('can compare stderr instead', () => {
      const result = fleetResult('systemctl status app', [
        entry('a', { stdout: '', stderr: 'inactive' }),
        entry('b', { stdout: '', stderr: 'inactive' }),
      ], 10);

      expect(coalesceOutput(result, 'stderr')[0]!.output).toBe('inactive');
    });
  });

  describe('retry set', () => {
    it('offers exactly the targets that failed', () => {
      const result = fleetResult('deploy', [
        entry('web-1'),
        entry('web-2', { ok: false, exitCode: 1 }),
        entry('web-3', { ok: false, exitCode: 2 }),
      ], 90);

      expect(failedTargets(result).map(t => (t as { host: string }).host)).toEqual(['web-2', 'web-3']);
    });
  });

  describe('failure limits', () => {
    it('stops at a count', () => {
      expect(exceedsFailureLimit(2, 10, 3)).toBe(false);
      expect(exceedsFailureLimit(3, 10, 3)).toBe(true);
    });

    it('stops at a percentage', () => {
      expect(exceedsFailureLimit(1, 10, '20%')).toBe(false);
      expect(exceedsFailureLimit(2, 10, '20%')).toBe(true);
      expect(exceedsFailureLimit(3, 10, '20%')).toBe(true);
    });

    it('accepts a count written as a string', () => {
      expect(exceedsFailureLimit(3, 10, '3')).toBe(true);
    });

    it('never stops when no limit was asked for', () => {
      expect(exceedsFailureLimit(10, 10, undefined)).toBe(false);
    });

    it('does not divide by zero', () => {
      expect(exceedsFailureLimit(0, 0, '10%')).toBe(false);
    });
  });
});
