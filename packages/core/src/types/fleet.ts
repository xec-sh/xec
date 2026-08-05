import { describeTarget, type Target } from './target.js';

/**
 * The result of running one command across many targets.
 *
 * A fan-out has a shape that a loop does not. Twenty hosts answer at
 * different times, some fail, most say the same thing, and the question a
 * person actually has is never "what did each of them print" — it is
 * "did anything break, and is anyone disagreeing with the others". Without
 * a type for that, every caller re-invents the answer badly: the CLI
 * silenced per-host output entirely under `--parallel` because interleaved
 * lines were unreadable, which traded one bad answer for a worse one.
 *
 * This is also the only surface where the project has no competitor. zx,
 * execa, dax and Bun Shell stop at the local machine; pssh is archived,
 * pdsh is an HPC relic, and ansible needs an inventory and an interpreter
 * on the far side. What none of them offer is a fleet result as a value —
 * something a script, or an agent, can read without parsing prose.
 *
 * @module
 */

/** What one target did. */
export interface FleetEntry {
  readonly target: Target;
  /** The target as a person would name it, for output and for keys. */
  readonly name: string;
  readonly ok: boolean;
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  /** Present when the command never ran: no route, refused connection. */
  readonly error?: string;
}

/** A group of targets that produced byte-identical output. */
export interface FleetAgreement {
  /** The shared output, trimmed. */
  readonly output: string;
  /** Names of the targets that produced it, in the order they answered. */
  readonly targets: readonly string[];
}

/** What the whole fan-out did. */
export interface FleetResult {
  readonly command: string;
  readonly entries: readonly FleetEntry[];
  readonly total: number;
  readonly succeeded: number;
  readonly failed: number;
  /** Wall-clock time for the fan-out, not the sum of its parts. */
  readonly durationMs: number;
  /** True when every target succeeded. */
  readonly ok: boolean;
}

/**
 * Assemble a fleet result from the entries.
 *
 * @param command - The command that was run everywhere.
 * @param entries - One entry per target, in the order they were started.
 * @param durationMs - Wall-clock duration of the whole fan-out.
 * @returns The result with its aggregates computed.
 */
export function fleetResult(
  command: string,
  entries: readonly FleetEntry[],
  durationMs: number
): FleetResult {
  const succeeded = entries.filter(entry => entry.ok).length;

  return {
    command,
    entries,
    total: entries.length,
    succeeded,
    failed: entries.length - succeeded,
    durationMs,
    // An empty fan-out is not a success. `every` over nothing is vacuously
    // true, which is how a deployment to zero targets once reported that
    // it had deployed.
    ok: entries.length > 0 && succeeded === entries.length,
  };
}

/**
 * Group targets by the output they produced.
 *
 * "Twenty-two hosts said X; web-07 said Y" is the answer a person wants
 * from a fleet, and the tool that gave it — `dshbak -c`, from the pdsh
 * suite — has been forgotten for twenty years. Reading twenty identical
 * blocks to find the one that differs is work a machine should do.
 *
 * @param result - The fleet result.
 * @param stream - Which stream to compare.
 * @returns Groups ordered largest first, so the outlier is last and visible.
 */
export function coalesceOutput(
  result: FleetResult,
  stream: 'stdout' | 'stderr' = 'stdout'
): FleetAgreement[] {
  const groups = new Map<string, string[]>();

  for (const entry of result.entries) {
    const output = entry[stream].trim();
    const names = groups.get(output);
    if (names) {
      names.push(entry.name);
    } else {
      groups.set(output, [entry.name]);
    }
  }

  return [...groups.entries()]
    .map(([output, targets]) => ({ output, targets }))
    .sort((a, b) => b.targets.length - a.targets.length);
}

/** The targets that failed, for a retry that costs one flag. */
export function failedTargets(result: FleetResult): Target[] {
  return result.entries.filter(entry => !entry.ok).map(entry => entry.target);
}

/**
 * Build an entry, filling the name from the target.
 *
 * @param target - Where the command ran.
 * @param outcome - What happened.
 * @returns The entry.
 */
export function fleetEntry(
  target: Target,
  outcome: Omit<FleetEntry, 'target' | 'name'>
): FleetEntry {
  return { target, name: describeTarget(target), ...outcome };
}

/**
 * Whether a fan-out should stop, given how much of it has already failed.
 *
 * Expressed as a predicate rather than as a loop condition because both
 * strategies — stop after N failures, stop after a percentage — are the
 * same question asked with different units, and a caller should not have
 * to translate one into the other.
 *
 * @param failed - Failures so far.
 * @param total - Targets in the fan-out.
 * @param limit - `5` for five failures, `'20%'` for a fifth of them.
 * @returns Whether the limit has been reached.
 */
export function exceedsFailureLimit(
  failed: number,
  total: number,
  limit: number | string | undefined
): boolean {
  if (limit === undefined || total === 0) return false;

  if (typeof limit === 'number') return failed >= limit;

  const percent = /^(\d+(?:\.\d+)?)%$/.exec(limit.trim());
  if (percent) {
    return (failed / total) * 100 >= Number(percent[1]);
  }

  const count = Number(limit);
  return Number.isFinite(count) && failed >= count;
}
