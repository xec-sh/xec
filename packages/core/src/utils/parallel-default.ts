import type { Command } from '../types/command.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ParallelResult, ParallelOptions } from './parallel.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

import { $ } from '../index.js';
import { parallel as parallelOn } from './parallel.js';

/**
 * Run commands concurrently, on the process-wide engine unless told otherwise.
 *
 * The underlying `parallel` takes an engine as its second argument, but every
 * example — both READMEs included — writes `parallel(commands, { … })`. That
 * call passed its options where an engine was expected, so they were never
 * read: the concurrency limit silently became Infinity and every command
 * started at once. For "roll out to 100 hosts, five at a time" that is not a
 * missed optimisation, it is the wrong operation.
 *
 * @param commands - Commands or process promises to run.
 * @param engineOrOptions - An engine, or the options when the default will do.
 * @param maybeOptions - Options, when an engine was given.
 * @returns Results, successes and failures.
 */
export async function parallel(
  commands: Array<string | Command | ProcessPromise>,
  engineOrOptions?: ExecutionEngine | CallableExecutionEngine | ParallelOptions,
  maybeOptions: ParallelOptions = {}
): Promise<ParallelResult> {
  const engineGiven = isEngine(engineOrOptions);

  return parallelOn(
    commands,
    engineGiven ? (engineOrOptions as ExecutionEngine | CallableExecutionEngine) : $,
    engineGiven ? maybeOptions : ((engineOrOptions as ParallelOptions) ?? {})
  );
}

/**
 * Tell an execution engine apart from an options object.
 *
 * @param value - The second argument, whatever it turned out to be.
 * @returns `true` when it is an engine.
 */
function isEngine(value: unknown): boolean {
  return typeof value === 'function' ||
    (typeof value === 'object' && value !== null && 'execute' in value);
}
