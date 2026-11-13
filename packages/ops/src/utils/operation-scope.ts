import { within, type Command, ExecutionEngine, getExecutionSignal, type ExecutionResult, sanitizeCommandForError, sanitizeErrorForDiagnostics } from '@xec-sh/core';

export interface OperationOptions {
  /** Cooperative lifetime of the callback and all commands it starts. */
  timeout?: number;
  signal?: AbortSignal;
  env?: Record<string, string>;
  cwd?: string;
}

export interface OperationExec {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<ExecutionResult>;
  /** A string is trusted shell source; use a template or Command argv for data. */
  (command: string | Command): Promise<ExecutionResult>;
}

interface OperationScope { exec: OperationExec; signal: AbortSignal }

/**
 * Own commands started by an Ops callback. Core owns parsing, execution,
 * cancellation and process cleanup; this scope only joins that work before
 * returning or retrying. Function callbacks must cooperate with signal.
 */
export async function runOperation<T>(options: OperationOptions, fn: (scope: OperationScope) => Promise<T>, capture: { exactOutput?: boolean } = {}): Promise<T> {
  const timeout = options.timeout ?? 300_000;
  if (!Number.isFinite(timeout) || timeout <= 0) throw new Error('Operation timeout must be positive');
  const inherited = getExecutionSignal(options.signal);
  const controller = new AbortController();
  const signal = inherited ? AbortSignal.any([inherited, controller.signal]) : controller.signal;
  signal.throwIfAborted();
  const engine = new ExecutionEngine({ defaultEnv: options.env, defaultCwd: options.cwd, defaultTimeout: timeout,
    // Discovery/health parse protocol data formerly returned by execFile/exec.
    // Events still pass through core's diagnostic masking boundary.
    ...(capture.exactOutput ? { adapters: { local: { sensitiveDataMasking: { enabled: false } } } } : {}),
  });
  const timer = setTimeout(() => controller.abort(new Error(`Operation timed out after ${timeout}ms`)), timeout);
  const commands: Array<Promise<ExecutionResult>> = [];
  let open = true;
  const exec: OperationExec = (input: TemplateStringsArray | string | Command, ...values: unknown[]) => {
    if (!open) throw new Error('Operation scope is closed');
    signal.throwIfAborted();
    const command = within({ signal, defaultEnv: options.env, cwd: options.cwd }, async () => {
      const result = typeof input === 'string'
        ? await engine.exec(input)
        : Array.isArray(input)
          ? await engine.run(input as unknown as TemplateStringsArray, ...values)
          : await engine.execute({ shell: false, ...input as Command });
      signal.throwIfAborted();
      return result;
    });
    commands.push(command);
    // A forgotten await must neither leak a rejection nor report success.
    void command.catch(error => controller.abort(error));
    return command;
  };
  let value: T | undefined;
  let failure: { error: unknown } | undefined;
  try {
    try { value = await within({ signal, defaultEnv: options.env, cwd: options.cwd }, () => fn({ exec, signal })); }
    catch (error) { failure = { error }; controller.abort(error); }
    open = false;
    const settled = await Promise.allSettled(commands);
    const rejected = settled.find(result => result.status === 'rejected');
    if (failure) throw failure.error;
    signal.throwIfAborted();
    if (rejected?.status === 'rejected') throw rejected.reason;
    return value as T;
  } catch (error) {
    if (!capture.exactOutput) throw error;
    throw error instanceof Error ? sanitizeErrorForDiagnostics(error) : new Error(sanitizeCommandForError(String(error)));
  } finally {
    open = false;
    clearTimeout(timer);
    await engine.dispose();
  }
}
