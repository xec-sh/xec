import type { Target, FleetEntry } from '@xec-sh/core';

import { fleetEntry, fleetResult } from '@xec-sh/core';

import { reportFleet, fleetFailure, fleetDocument } from '../../src/utils/fleet-report.js';

/**
 * What a fan-out looks like once it has answered. The rules here are the
 * ones a caller acts on: one target's output is the answer and nothing may
 * decorate it, many targets are grouped so the outlier is visible, and the
 * exit code says as much as it truthfully can.
 */
describe('reporting a fleet', () => {
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

  /** Capture what was written, per stream. */
  const capture = (fn: () => void): { out: string; err: string } => {
    const out: string[] = [];
    const err: string[] = [];
    const realOut = process.stdout.write.bind(process.stdout);
    const realErr = process.stderr.write.bind(process.stderr);

    (process.stdout as { write: unknown }).write = (chunk: string) => { out.push(String(chunk)); return true; };
    (process.stderr as { write: unknown }).write = (chunk: string) => { err.push(String(chunk)); return true; };

    try {
      fn();
    } finally {
      (process.stdout as { write: unknown }).write = realOut;
      (process.stderr as { write: unknown }).write = realErr;
    }

    return { out: out.join(''), err: err.join('') };
  };

  describe('one target', () => {
    it('writes its output and nothing else', () => {
      // `xec on web-1 'cat /etc/hosts' > hosts` has to produce the file,
      // not a report about producing it.
      const result = fleetResult('cat /etc/hosts', [entry('web-1', { stdout: '127.0.0.1 localhost\n' })], 5);

      const { out } = capture(() => reportFleet(result));

      expect(out).toBe('127.0.0.1 localhost\n');
    });

    it('does not trim what the command printed', () => {
      // The output used to be `.trim()`ed, which silently rewrote every
      // file this command was used to fetch.
      const result = fleetResult('cat f', [entry('web-1', { stdout: '  indented\n\n' })], 5);

      const { out } = capture(() => reportFleet(result));

      expect(out).toBe('  indented\n\n');
    });

    it('adds the newline a command forgot, and only then', () => {
      const result = fleetResult('printf x', [entry('web-1', { stdout: 'x' })], 5);

      const { out } = capture(() => reportFleet(result));

      expect(out).toBe('x\n');
    });

    it('sends the command\'s stderr to stderr', () => {
      // It reached the terminal only under --verbose before, so a warning
      // from a command that still exited 0 was thrown away.
      const result = fleetResult('build', [entry('web-1', { stdout: 'done\n', stderr: 'warning: deprecated\n' })], 5);

      const { out, err } = capture(() => reportFleet(result));

      expect(out).toBe('done\n');
      expect(err).toContain('warning: deprecated');
    });
  });

  describe('several targets', () => {
    const fleet = fleetResult('cat /etc/os-release', [
      entry('web-1', { stdout: 'ubuntu 24.04' }),
      entry('web-2', { stdout: 'ubuntu 24.04' }),
      entry('web-3', { stdout: 'ubuntu 22.04' }),
    ], 40);

    it('groups identical output and names who said it', () => {
      const { out } = capture(() => reportFleet(fleet));

      expect(out).toContain('web-1, web-2');
      expect(out).toContain('ubuntu 24.04');
      expect(out).toContain('web-3');
      // The shared answer is printed once, not once per host.
      expect(out.match(/ubuntu 24\.04/g)).toHaveLength(1);
    });

    it('puts the tally on stderr, where it cannot corrupt the data', () => {
      const { out, err } = capture(() => reportFleet(fleet));

      expect(err).toContain('3/3');
      expect(out).not.toContain('3/3');
    });

    it('names each failure', () => {
      const withFailure = fleetResult('deploy', [
        entry('web-1'),
        entry('web-2', { ok: false, exitCode: 1, stdout: '', stderr: 'permission denied\n' }),
      ], 20);

      const { err } = capture(() => reportFleet(withFailure));

      expect(err).toContain('web-2');
      expect(err).toContain('permission denied');
    });

    it('says what it never started', () => {
      const stopped = fleetResult('deploy', [entry('web-1', { ok: false, exitCode: 1 })], 10);

      const { err } = capture(() => reportFleet(stopped, ['web-2', 'web-3']));

      expect(err).toContain('web-2, web-3');
      expect(err).toMatch(/stopped/i);
    });
  });

  describe('as a document', () => {
    it('carries every field, including the empty ones', () => {
      // A consumer that has to test for a key before reading it is one
      // that will forget to, once.
      const doc = fleetDocument(fleetResult('uptime', [entry('web-1')], 12));

      expect(doc).toEqual({
        command: 'uptime',
        ok: true,
        total: 1,
        succeeded: 1,
        failed: 0,
        durationMs: 12,
        targets: [{
          target: 'web-1',
          ok: true,
          exitCode: 0,
          stdout: 'up 3 days',
          stderr: '',
          durationMs: 10,
        }],
        skipped: [],
      });
    });

    it('records why a target never ran', () => {
      const doc = fleetDocument(
        fleetResult('uptime', [entry('web-1', { ok: false, exitCode: -1, error: 'connection refused' })], 12)
      );

      expect(doc.targets[0]!.error).toBe('connection refused');
    });

    it('lists what was skipped', () => {
      const doc = fleetDocument(fleetResult('deploy', [entry('a')], 5), ['b', 'c']);

      expect(doc.skipped).toEqual(['b', 'c']);
    });
  });

  describe('the exit code', () => {
    it('carries a single target\'s own code, the way ssh does', () => {
      const result = fleetResult('test -f /etc/nginx.conf', [
        entry('web-1', { ok: false, exitCode: 7 }),
      ], 5);

      expect(fleetFailure(result).exitCode).toBe(7);
    });

    it('falls back to 1 across a fleet, where there is no single code', () => {
      const result = fleetResult('deploy', [
        entry('a', { ok: false, exitCode: 3 }),
        entry('b', { ok: false, exitCode: 9 }),
      ], 5);

      expect(fleetFailure(result).exitCode).toBe(1);
    });

    it('says so when nothing matched', () => {
      expect(fleetFailure(fleetResult('deploy', [], 0)).message).toMatch(/No targets/);
    });

    it('explains a target that never ran', () => {
      const result = fleetResult('uptime', [
        entry('web-1', { ok: false, exitCode: -1, error: 'connection refused' }),
      ], 5);

      const failure = fleetFailure(result);

      expect(failure.message).toContain('connection refused');
      // -1 is not a code a process can exit with; it must not become one.
      expect(failure.exitCode).toBe(1);
    });
  });
});
