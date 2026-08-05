import type { FleetResult } from '@xec-sh/core';

import { prism } from '@xec-sh/kit';
import { UserError } from '@xec-sh/ops';
import { coalesceOutput } from '@xec-sh/core';

/**
 * Turning a fleet result into something worth reading.
 *
 * Two audiences, two shapes. A person wants to know whether anything broke
 * and whether anyone disagrees with the others — twenty identical blocks
 * with one different block buried inside is the answer nobody can use. A
 * program wants one document with every field present whether or not it
 * happened to be interesting.
 *
 * @module
 */

/** The fan-out as a document, for `-o json`, `-o yaml`, `-o csv`. */
export interface FleetDocument {
  readonly command: string;
  readonly ok: boolean;
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly durationMs: number;
  readonly targets: ReadonlyArray<{
    readonly target: string;
    readonly ok: boolean;
    readonly exitCode: number;
    readonly stdout: string;
    readonly stderr: string;
    readonly durationMs: number;
    readonly error?: string;
  }>;
  /** Targets never started, because a failure limit stopped the fan-out. */
  readonly skipped: readonly string[];
}

/**
 * Render the result as data.
 *
 * Every field is always present, including the empty ones: a consumer that
 * has to test for a key's existence before reading it is a consumer that
 * will forget to, once.
 *
 * @param result - What the fan-out did.
 * @param skipped - Names of targets that were never started.
 * @returns The document.
 */
export function fleetDocument(result: FleetResult, skipped: readonly string[] = []): FleetDocument {
  return {
    command: result.command,
    ok: result.ok,
    total: result.total,
    succeeded: result.succeeded,
    failed: result.failed,
    durationMs: result.durationMs,
    targets: result.entries.map(entry => ({
      target: entry.name,
      ok: entry.ok,
      exitCode: entry.exitCode,
      stdout: entry.stdout,
      stderr: entry.stderr,
      durationMs: entry.durationMs,
      ...(entry.error !== undefined ? { error: entry.error } : {}),
    })),
    skipped: [...skipped],
  };
}

/**
 * Print the result for a person.
 *
 * A single target prints its output verbatim and nothing else, because
 * `xec on web-1 'cat /etc/hosts' > hosts` has to produce the file and not
 * a report about producing it. From two targets upward the output is
 * grouped by what was said, so the machine that disagrees is one line
 * rather than a diff the reader has to perform by eye.
 *
 * @param result - What the fan-out did.
 * @param skipped - Names of targets that were never started.
 */
export function reportFleet(result: FleetResult, skipped: readonly string[] = []): void {
  // Verbatim only when the fleet really was one target. A fan-out that
  // stopped after its first failure also has one entry, and printing that
  // entry alone would report a truncated run as a complete one.
  if (result.total === 1 && skipped.length === 0) {
    const only = result.entries[0]!;
    if (only.stdout) process.stdout.write(ensureNewline(only.stdout));
    if (only.stderr) process.stderr.write(ensureNewline(only.stderr));
    if (only.error) process.stderr.write(`${prism.red('✗')} ${only.name}: ${only.error}\n`);
    return;
  }

  for (const group of coalesceOutput(result)) {
    if (!group.output) continue;

    process.stdout.write(`${prism.bold(group.targets.join(', '))}\n`);
    for (const line of group.output.split('\n')) {
      process.stdout.write(`  ${line}\n`);
    }
  }

  for (const entry of result.entries) {
    if (entry.ok) continue;

    const why = entry.error ?? firstLine(entry.stderr) ?? `exit ${entry.exitCode}`;
    process.stderr.write(`${prism.red('✗')} ${entry.name}: ${why}\n`);
  }

  if (skipped.length > 0) {
    // Never silent. A fan-out that stopped early and said nothing reads
    // exactly like one that covered the whole fleet.
    process.stderr.write(
      `${prism.yellow('!')} stopped after ${result.failed} failures; ` +
      `not started: ${skipped.join(', ')}\n`
    );
  }

  const tally = result.ok
    ? prism.green(`✓ ${result.succeeded}/${result.total}`)
    : prism.red(`${result.succeeded}/${result.total} succeeded, ${result.failed} failed`);
  process.stderr.write(`${tally} in ${formatDuration(result.durationMs)}\n`);
}

/**
 * The failure to raise when a fan-out did not fully succeed.
 *
 * With a single target the target's own exit code is carried through, the
 * way `ssh` does, so `xec on web-1 'test -f /etc/nginx.conf'` can be used
 * in an `if`. Answering 1 for every kind of failure told the caller only
 * that something went wrong, which is the least useful true statement
 * available.
 *
 * Across a fleet there is no single code to carry — twenty hosts can fail
 * twenty ways — so it stays 1 and the detail lives in the report.
 *
 * @param result - What the fan-out did.
 * @returns The failure, ready to throw.
 */
export function fleetFailure(result: FleetResult): UserError {
  if (result.total === 0) {
    return new UserError('No targets matched');
  }

  const only = result.total === 1 ? result.entries[0] : undefined;

  if (only && only.exitCode > 0) {
    return new UserError(`${only.name}: exit ${only.exitCode}`, { exitCode: only.exitCode });
  }

  if (only) {
    return new UserError(`${only.name}: ${only.error ?? `exit ${only.exitCode}`}`);
  }

  return new UserError(`${result.failed} of ${result.total} targets failed`);
}

/** Keep output byte-faithful, but never leave the cursor mid-line. */
function ensureNewline(text: string): string {
  return text.endsWith('\n') ? text : `${text}\n`;
}

/** The first non-empty line, for a one-line explanation of a failure. */
function firstLine(text: string): string | undefined {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed) return trimmed;
  }
  return undefined;
}

/** Durations as a person says them. */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60_000)}m${Math.round((ms % 60_000) / 1000)}s`;
}
