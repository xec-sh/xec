import type { ResolvedTarget } from '@xec-sh/ops';
import type { Target, FleetEntry, FleetResult } from '@xec-sh/core';

import { fleetEntry, fleetResult, exceedsFailureLimit } from '@xec-sh/core';

/**
 * Running one command across a set of targets, once.
 *
 * `on` and `in` each grew their own copy of this loop, and the copies
 * drifted the way copies do: `on` acquired a worker pool, a concurrency
 * cap and `--fail-fast`, while `in` kept an unbounded `Promise.all` that
 * honoured none of them. Both silenced every target under `--parallel` —
 * they passed `quiet: true` to the single-target path to keep the output
 * from interleaving, which stopped the interleaving by throwing away the
 * results.
 *
 * One loop, producing a {@link FleetResult}, ends both problems: the
 * output is collected rather than printed as it arrives, so it can be
 * grouped afterwards, and there is one place where concurrency and failure
 * limits are decided.
 *
 * @module
 */

/** How the fan-out should be run. */
export interface FleetRunOptions {
  /** Run targets concurrently rather than one after another. */
  readonly parallel?: boolean;
  /** Most targets running at once. Ignored when serial. */
  readonly maxConcurrent?: number;
  /** Stop starting new targets after the first failure. */
  readonly failFast?: boolean;
  /** Stop after this many failures: `5`, or `'20%'` of the fleet. */
  readonly maxFailures?: number | string;
}

/** What one target produced, before it is folded into a result. */
export interface TargetOutcome {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  /** Set when the command never ran: no route, refused connection. */
  readonly error?: string;
}

/** Runs the command against one target. Never throws; failure is a value. */
export type TargetRunner = (target: ResolvedTarget) => Promise<TargetOutcome>;

/** What a fan-out did, and what it did not get to. */
export interface FleetRun {
  readonly result: FleetResult;
  /**
   * Targets never started, because a limit stopped the fan-out.
   *
   * Reported rather than inferred: entries accumulate in the order targets
   * *answered*, so with any concurrency the ones that ran are not a prefix
   * of the ones that were asked for, and counting cannot tell them apart.
   */
  readonly skipped: readonly ResolvedTarget[];
}

/**
 * Describe a configured target as the kind of thing core understands.
 *
 * The CLI's `ResolvedTarget` carries configuration — credentials, work
 * directories, provenance. A {@link Target} is only the address. Narrowing
 * to the address is what lets a result be reported, compared and retried
 * without dragging the configuration through every layer that displays it.
 *
 * @param target - The target as configuration resolved it.
 * @returns Its address.
 */
export function toCoreTarget(target: ResolvedTarget): Target {
  // Through `unknown`: the union of target configurations has no index
  // signature, and the fields read here differ per member by design.
  const config = (target.config ?? {}) as unknown as Record<string, unknown>;
  const text = (key: string): string | undefined => {
    const value = config[key];
    return typeof value === 'string' && value.length > 0 ? value : undefined;
  };

  switch (target.type) {
    case 'ssh': {
      const port = config['port'];
      return {
        kind: 'ssh',
        host: text('host') ?? target.name ?? target.id,
        ...(text('username') || text('user') ? { user: text('username') ?? text('user')! } : {}),
        ...(typeof port === 'number' ? { port } : {}),
      };
    }
    case 'docker':
      return { kind: 'docker', container: text('container') ?? target.name ?? target.id };
    case 'kubernetes':
      return {
        kind: 'kubernetes',
        namespace: text('namespace') ?? 'default',
        pod: text('pod') ?? target.name ?? target.id,
        ...(text('container') ? { container: text('container')! } : {}),
      };
    default:
      return { kind: 'local' };
  }
}

/**
 * Run the command against every target and collect what each produced.
 *
 * Nothing is printed here. A fan-out only becomes readable once all of it
 * has answered — which output was shared, which host disagreed, what
 * failed — and a loop that prints as it goes cannot know any of that yet.
 *
 * @param targets - Where to run, in the order they should be started.
 * @param command - What was run, recorded on the result.
 * @param run - Runs one target and reports what happened.
 * @param options - Concurrency and failure limits.
 * @returns One entry per target that was started, and those that were not.
 */
export async function runFleet(
  targets: readonly ResolvedTarget[],
  command: string,
  run: TargetRunner,
  options: FleetRunOptions = {}
): Promise<FleetRun> {
  const startedAt = Date.now();
  const entries: FleetEntry[] = [];
  const queue = [...targets];
  const skipped: ResolvedTarget[] = [];
  let failed = 0;
  let stopped = false;

  const runOne = async (target: ResolvedTarget): Promise<void> => {
    const target0 = Date.now();
    let outcome: TargetOutcome;

    try {
      outcome = await run(target);
    } catch (error) {
      // A runner is meant to return failures, but an adapter that throws
      // before producing anything would otherwise reject the whole
      // fan-out and lose the results of every target that succeeded.
      outcome = {
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }

    entries.push(
      fleetEntry(toCoreTarget(target), {
        ok: outcome.exitCode === 0 && outcome.error === undefined,
        exitCode: outcome.exitCode,
        stdout: outcome.stdout,
        stderr: outcome.stderr,
        durationMs: Date.now() - target0,
        ...(outcome.error !== undefined ? { error: outcome.error } : {}),
      })
    );

    if (outcome.exitCode !== 0 || outcome.error !== undefined) {
      failed++;

      // Both limits stop *starting* work; targets already running are
      // allowed to finish, so their results are reported rather than
      // discarded halfway through.
      if (options.failFast || exceedsFailureLimit(failed, targets.length, options.maxFailures)) {
        stopped = true;
        skipped.push(...queue);
        queue.length = 0;
      }
    }
  };

  if (options.parallel && targets.length > 1) {
    const width = Math.max(1, Math.min(options.maxConcurrent ?? 10, targets.length));

    const worker = async (): Promise<void> => {
      while (queue.length > 0 && !stopped) {
        const target = queue.shift();
        if (target) await runOne(target);
      }
    };

    await Promise.all(Array.from({ length: width }, () => worker()));
  } else {
    while (queue.length > 0 && !stopped) {
      const target = queue.shift();
      if (target) await runOne(target);
    }
  }

  return { result: fleetResult(command, entries, Date.now() - startedAt), skipped };
}
