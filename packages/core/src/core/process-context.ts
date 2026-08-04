import type { ExecutionResult } from './result.js';
import type { ProcessPromise } from '../types/process.js';
import type { ProcessHandle } from '../types/process-handle.js';
import type { Command, StreamOption } from '../types/command.js';
import type { CacheTarget, CacheOptions } from '../utils/cache.js';
import type { PipeTarget, PipeOptions } from './pipe-implementation.js';

import { Writable, PassThrough } from 'node:stream';

import { globalCache } from '../utils/cache.js';
import { ExecutionResultImpl } from './result.js';
import { executePipe } from './pipe-implementation.js';
import { captureCallSite } from '../utils/call-site.js';
import { parseDuration, type Duration } from '../utils/helpers.js';

/** Branded symbol for xec promise identification — shared across modules */
const XEC_PROMISE_BRAND = Symbol.for('xec:promise');

/** Marker for transform handlers (text/json/lines/buffer) to distinguish from direct await */
/**
 * Whether this engine has been told not to throw on a non-zero exit.
 *
 * Checked in two places because `$.with({ throwOnNonZeroExit: false })` lands
 * in the engine's per-command config, not its base config — reading only the
 * base meant a derived engine's setting was silently ignored and the caller
 * got exceptions they had explicitly opted out of.
 */
function throwingDisabled(engine: { _config?: { throwOnNonZeroExit?: boolean }; currentConfig?: { throwOnNonZeroExit?: boolean } }): boolean {
  return engine.currentConfig?.throwOnNonZeroExit === false
    || (engine.currentConfig?.throwOnNonZeroExit === undefined
      && engine._config?.throwOnNonZeroExit === false);
}

const TRANSFORM_HANDLER = Symbol.for('xec:transform');

/**
 * Carries the unstarted context of a ProcessPromise to `.pipe()`.
 *
 * @see ProcessPromise
 */
export const PIPE_TARGET = Symbol.for('xec:pipe-target');

/**
 * Accept a callback where a stream is expected.
 *
 * `.stdout(chunk => ...)` is the obvious way to ask for output as it arrives,
 * and it used to be accepted and dropped: the option is typed
 * `'pipe' | 'ignore' | 'inherit' | Writable`, so TypeScript rejected it, but
 * nothing at runtime did. A JavaScript caller got a command that ran perfectly
 * while their handler was never called.
 */
function asStreamOption(value: StreamOption | ((chunk: string) => void)): StreamOption {
  if (typeof value !== 'function') return value;

  return new Writable({
    write(chunk, _encoding, done) {
      try {
        value(String(chunk));
        done();
      } catch (error) {
        done(error as Error);
      }
    }
  });
}

export type { ProcessPromise } from '../types/process.js';

/**
 * Process context with minimal state and maximum performance
 */
export class ProcessContext {
  // Single object for all modifications - reduces memory allocations
  // Made public for ProcessPromiseBuilder to access in arrow functions
  public state = {
    modifications: {} as Partial<Command>,
    cacheOptions: null as CacheOptions | null,
    abortController: null as AbortController | null,
    handle: null as ProcessHandle | null,
    started: false,
    isQuiet: false,

    /** Where the caller wrote this command; see utils/call-site.ts. */
    callSite: null as { stack?: string } | null,

    /**
     * Buffers anything written to `.stdin` before the process exists.
     *
     * Spawning cannot be synchronous here — adapter selection is async, and
     * for SSH the "process" needs a connection first — so a caller writing
     * `p.stdin.write(...)` on the next line would otherwise hit `null`. The
     * bridge accepts writes immediately and is piped into the real stdin the
     * moment there is one. zx does the same with its own stream.
     */
    stdinBridge: null as PassThrough | null,

    /** Resolves once the command is live; see `ProcessPromise.spawned`. */
    spawnDeferred: null as { promise: Promise<ProcessHandle>; resolve: (h: ProcessHandle) => void } | null
  };

  /** The stdin bridge, created on first use. */
  getStdinBridge(): PassThrough {
    this.state.stdinBridge ??= new PassThrough();
    return this.state.stdinBridge;
  }

  /** A promise for the live handle, created on first use. */
  getSpawnDeferred(): { promise: Promise<ProcessHandle>; resolve: (h: ProcessHandle) => void } {
    if (!this.state.spawnDeferred) {
      let resolve!: (h: ProcessHandle) => void;
      const promise = new Promise<ProcessHandle>(r => { resolve = r; });
      this.state.spawnDeferred = { promise, resolve };
    }
    return this.state.spawnDeferred;
  }

  constructor(
    public readonly engine: any, // ExecutionEngine type
    protected readonly commandResolver: () => Promise<Partial<Command>> | Partial<Command>
  ) { }

  /**
   * Build the command this context would run, without running it.
   *
   * Used by `.pipe()`, which has to run the target with the source's output as
   * its stdin. Awaiting the target instead would start it with no stdin at
   * all — `grep` sees EOF, exits 1, and the pipe reports a failure that has
   * nothing to do with the data.
   */
  async resolveCommand(): Promise<Command> {
    return this.buildCommand(await Promise.resolve(this.commandResolver()));
  }

  /**
   * Execute with async flow and early returns
   */
  async execute(): Promise<ExecutionResult> {
    try {
      // Lazy abort controller setup
      if (!this.state.modifications.signal && !this.state.abortController) {
        this.state.abortController = new AbortController();
        this.state.modifications.signal = this.state.abortController.signal;
      }

      // Resolve command (supports both sync and async)
      const commandParts = await Promise.resolve(this.commandResolver());
      const command = this.buildCommand(commandParts);

      // Save the final nothrow value back to state for use in promise handling
      if (command.nothrow !== undefined) {
        this.state.modifications.nothrow = command.nothrow;
      }

      // Fast path for non-cached execution
      if (!this.state.cacheOptions) {
        try {
          return await this.engine.execute(command);
        } catch (error) {
          if (command.nothrow) {
            return new ExecutionResultImpl(
              '',
              error instanceof Error ? error.message : String(error),
              1,
              undefined,
              command.command || '',
              0,
              new Date(),
              new Date(),
              command.adapter || 'local'
            );
          }
          throw error;
        }
      }

      // Cache path
      const cacheKey = this.getCacheKey(command);

      // Check cache and inflight
      const existing = globalCache.get(cacheKey) || globalCache.getInflight(cacheKey);
      if (existing) return existing;

      // Execute with cache tracking
      const executePromise = this.engine.execute(command);
      globalCache.setInflight(cacheKey, executePromise);

      try {
        const result = await executePromise;
        if (result.exitCode === 0 || command.nothrow) {
          globalCache.set(cacheKey, result, this.state.cacheOptions.ttl || 60000);
          if (this.state.cacheOptions.invalidateOn) {
            globalCache.invalidate(this.state.cacheOptions.invalidateOn);
          }
        }
        return result;
      } finally {
        globalCache.clearInflight(cacheKey);
      }
    } catch (error) {
      if (this.state.modifications.nothrow) {
        return new ExecutionResultImpl(
          '',
          error instanceof Error ? error.message : String(error),
          1,
          undefined,
          this.state.modifications.command || '',
          0,
          new Date(),
          new Date(),
          'local'
        );
      }
      throw error;
    }
  }

  // ===== Chainable methods with immutable state =====

  /**
   * An empty context of the same kind, for configuration to be applied to.
   *
   * Overridden by contexts that run something other than a plain command.
   * Producing a base ProcessContext here dropped a pipe: `.pipe(x).nothrow()`
   * came back as a context whose command resolved to `{}`, so the engine tried
   * to spawn nothing and reported `The "file" argument must be of type string`
   * — a message about an internal argument, for a chain the caller wrote
   * correctly.
   */
  protected cloneContext(): ProcessContext {
    return new ProcessContext(this.engine, this.commandResolver);
  }

  private mutate(changes: (state: typeof this.state) => void): ProcessPromise {
    // Configuration is immutable: each call returns a *new* command. Doing
    // that to an already-running one would silently discard the running
    // process and hand back an unstarted twin — `p.start().signal(ac.signal)`
    // would abort nothing at all. Failing here names the mistake instead.
    if (this.state.started) {
      throw new Error(
        'Cannot configure a command that is already running. Apply configuration before start(), await or any live accessor.'
      );
    }

    // Create new context with cloned state for immutability
    const newContext = this.cloneContext();
    // Deep clone the state
    newContext.state = {
      modifications: { ...this.state.modifications },
      cacheOptions: this.state.cacheOptions,
      abortController: this.state.abortController,
      // Deliberately not carried over: the handle belongs to a running
      // command, and this context describes a new one.
      handle: null,
      started: false,
      isQuiet: this.state.isQuiet,
      callSite: this.state.callSite,
      stdinBridge: this.state.stdinBridge,
      spawnDeferred: null
    };
    // Apply changes to the new state
    changes(newContext.state);
    return this.engine.createProcessPromiseWithContext(newContext);
  }

  withSignal = (signal: AbortSignal): ProcessPromise =>
    this.mutate(s => { s.modifications.signal = signal; });

  withTimeout = (duration: Duration, timeoutSignal?: string): ProcessPromise =>
    this.mutate(s => {
      // `.timeout('30s')` reads as the intent; `.timeout(30000)` invites the
      // classic seconds/milliseconds slip. Both are accepted.
      s.modifications.timeout = parseDuration(duration);
      if (timeoutSignal) s.modifications.timeoutSignal = timeoutSignal;
    });

  withQuiet = (): ProcessPromise =>
    this.mutate(s => { s.isQuiet = true; });

  withNothrow = (): ProcessPromise =>
    this.mutate(s => { s.modifications.nothrow = true; });

  withInteractive = (): ProcessPromise =>
    this.mutate(s => {
      Object.assign(s.modifications, {
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: process.stdin
      });
    });

  withCwd = (dir: string): ProcessPromise =>
    this.mutate(s => { s.modifications.cwd = dir; });

  withEnv = (env: Record<string, string>): ProcessPromise =>
    this.mutate(s => { s.modifications.env = { ...s.modifications.env, ...env }; });

  withShell = (shell: string | boolean): ProcessPromise =>
    this.mutate(s => { s.modifications.shell = shell; });

  withStdout = (stream: StreamOption | ((chunk: string) => void)): ProcessPromise =>
    this.mutate(s => { s.modifications.stdout = asStreamOption(stream); });

  withStderr = (stream: StreamOption | ((chunk: string) => void)): ProcessPromise =>
    this.mutate(s => { s.modifications.stderr = asStreamOption(stream); });

  withCache = (options?: CacheOptions): ProcessPromise =>
    this.mutate(s => { s.cacheOptions = options || {}; });

  /**
   * Pipe with inline parsing
   */
  pipe = (target: PipeTarget, ...args: any[]): ProcessPromise => {
    const [optionsOrFirstValue, ...restArgs] = args;

    // Fast path for common case - no options
    if (!optionsOrFirstValue || (
      Array.isArray(target) && 'raw' in target &&
      (typeof optionsOrFirstValue !== 'object' || optionsOrFirstValue === null ||
        !('throwOnError' in optionsOrFirstValue || 'encoding' in optionsOrFirstValue ||
          'lineByLine' in optionsOrFirstValue || 'lineSeparator' in optionsOrFirstValue))
    )) {
      return this.engine.createProcessPromiseWithContext(
        new PipedProcessContext(
          this.engine,
          () => this.execute(),
          target,
          {},
          optionsOrFirstValue !== undefined ? [optionsOrFirstValue, ...restArgs] : restArgs,
          this.state.modifications.nothrow
        )
      );
    }

    // Options case
    return this.engine.createProcessPromiseWithContext(
      new PipedProcessContext(
        this.engine,
        () => this.execute(),
        target,
        optionsOrFirstValue,
        restArgs,
        this.state.modifications.nothrow
      )
    );
  }

  /**
   * Kill with direct access
   */
  kill = (signal: NodeJS.Signals = 'SIGTERM'): void => {
    const { abortController, modifications, handle } = this.state;

    // Signal the process itself when it is running: the adapter's handle
    // takes down the whole process tree, whereas aborting only unblocks the
    // caller and leaves whatever the command spawned still running. The
    // abort still follows, so the promise settles.
    if (handle) {
      handle.kill(signal);
    }

    if (abortController && !abortController.signal.aborted) {
      abortController.abort();
    } else if (modifications.signal && typeof modifications.signal.dispatchEvent === 'function') {
      modifications.signal.dispatchEvent(new Event('abort'));
    }
  }

  // ===== Private helpers =====

  private buildCommand(commandParts: Partial<Command>): Command {
    const { modifications } = this.state;
    const globalNothrow = throwingDisabled(this.engine);

    // Single object spread for better performance
    return Object.assign(
      {},
      this.engine.currentConfig,
      commandParts,
      modifications,
      {
        nothrow: modifications.nothrow ??
          commandParts.nothrow ??
          (globalNothrow || undefined),
        // The adapter publishes the live process here; everything the caller
        // can reach while a command runs — `.child`, `.pid`, `.stdin`,
        // `.stdout`, `.stderr`, a targeted `.kill()` — flows from it.
        callSite: this.state.callSite,
        onSpawn: (handle: ProcessHandle) => {
          this.state.handle = handle;
          this.state.spawnDeferred?.resolve(handle);
        },
        // A caller who touched `.stdin` gets their writes forwarded; an
        // explicitly supplied stdin still wins.
        ...(this.state.stdinBridge && !modifications.stdin && !commandParts.stdin
          ? { stdin: this.state.stdinBridge }
          : {}),
        // Mark this command as coming from ProcessPromise
        __fromProcessPromise: true
      }
    ) as Command;
  }

  private getCacheKey(command: Command): string {
    const { cacheOptions } = this.state;
    return cacheOptions?.key ||
      globalCache.generateKey(
        command.command || '',
        command.cwd,
        command.env,
        describeCacheTarget(command)
      );
  }
}

/**
 * Deliver a running command's stdout line by line, as it arrives.
 *
 * Backpressure is respected: the source stream is paused while the consumer
 * is busy, so a fast producer cannot outrun a slow `for await` body and
 * accumulate without bound.
 *
 * @param promise - The command promise; awaited so failures still throw.
 * @param context - Context holding the live process handle.
 * @returns An async iterator over output lines.
 */
function streamLines(promise: ProcessPromise, context: ProcessContext): AsyncIterator<string> {
  const queue: string[] = [];
  let pending: ((result: IteratorResult<string>) => void) | null = null;
  let failure: unknown = null;
  let streamEnded = false;
  let settled = false;
  let finished = false;
  let remainder = '';

  const push = (line: string): void => {
    if (pending) {
      const resolve = pending;
      pending = null;
      resolve({ value: line, done: false });
      return;
    }
    queue.push(line);
  };

  /**
   * Complete the iteration — but only once the stream has ended *and* the
   * command has settled.
   *
   * The stream ends when the process exits, which is strictly before the
   * promise settles. Ending on the stream alone therefore closed the loop
   * before the failure was known, and a non-zero exit finished quietly
   * instead of throwing.
   */
  const finishIfDone = (): void => {
    if (finished || !streamEnded || !settled) return;
    finished = true;

    if (remainder) {
      const last = remainder;
      remainder = '';
      push(last);
    }

    if (pending) {
      const resolve = pending;
      pending = null;
      resolve({ value: undefined as never, done: true });
    }
  };

  // Reading the handle starts the command.
  promise.spawned.then(handle => {
    const stdout = handle.stdout;
    if (!stdout) {
      streamEnded = true;
      finishIfDone();
      return;
    }

    stdout.setEncoding('utf8');
    stdout.on('data', (chunk: string) => {
      const parts = (remainder + chunk).split('\n');
      remainder = parts.pop() ?? '';
      for (const line of parts) {
        push(line);
      }
    });
    stdout.on('end', () => {
      streamEnded = true;
      finishIfDone();
    });
  }, () => {
    streamEnded = true;
    finishIfDone();
  });

  promise.then(
    () => {
      settled = true;
      finishIfDone();
    },
    error => {
      failure = error;
      settled = true;
      // A command that failed before producing output never gets a stream
      // end, so the loop would wait forever for one.
      streamEnded = true;
      finishIfDone();
    }
  );

  return {
    async next(): Promise<IteratorResult<string>> {
      if (queue.length > 0) {
        return { value: queue.shift()!, done: false };
      }
      if (failure) {
        throw failure;
      }
      if (finished) {
        return { value: undefined as never, done: true };
      }

      const result = await new Promise<IteratorResult<string>>(resolve => {
        pending = resolve;
      });

      // A failure surfaces once the queued lines have been delivered, so the
      // consumer sees everything the command managed to produce first.
      if (result.done && failure) {
        throw failure;
      }
      return result;
    },

    async return(): Promise<IteratorResult<string>> {
      // Leaving the loop early must not orphan the command.
      context.kill();
      finished = true;
      return { value: undefined as never, done: true };
    },
  };
}

/**
 * Reduce a command's target to the fields that make its result distinct.
 *
 * Only identity, never credentials: a cache key is hashed but is also a
 * value that gets logged, compared and passed around, and a password has no
 * business in one. Two commands differing only by password address the same
 * machine and legitimately share a cache entry.
 *
 * @param command - The command about to run.
 * @returns Target identity, or undefined for plain local execution.
 */
function describeCacheTarget(command: Command): CacheTarget | undefined {
  const options = command.adapterOptions as Record<string, unknown> | undefined;
  const adapter = command.adapter ?? (options?.['type'] as string | undefined);

  if (!options && (!adapter || adapter === 'local')) {
    return undefined;
  }

  const pick = (key: string): string | undefined => {
    const value = options?.[key];
    return typeof value === 'string' ? value : undefined;
  };

  return {
    adapter,
    host: pick('host'),
    port: typeof options?.['port'] === 'number' ? (options['port'] as number) : undefined,
    user: pick('username'),
    container: pick('container'),
    pod: pick('pod'),
    namespace: pick('namespace'),
    context: pick('context'),
  };
}

/**
 * Piped context with minimal overhead
 */
export class PipedProcessContext extends ProcessContext {
  constructor(
    engine: any,
    private readonly sourceExecutor: () => Promise<ExecutionResult>,
    private readonly target: PipeTarget,
    private readonly pipeOptions: PipeOptions,
    private readonly templateArgs: readonly any[],
    private readonly sourceNothrow?: boolean
  ) {
    super(engine, () => ({})); // No async needed for empty object
  }

  /** Keep the pipe when configuration is chained after it. */
  protected override cloneContext(): ProcessContext {
    return new PipedProcessContext(
      this.engine,
      this.sourceExecutor,
      this.target,
      this.pipeOptions,
      this.templateArgs,
      this.sourceNothrow
    );
  }

  override async execute(): Promise<ExecutionResult> {
    return executePipe(
      this.sourceExecutor(), // No need for Promise.resolve
      this.target,
      this.engine,
      { throwOnError: !this.sourceNothrow, ...this.pipeOptions },
      ...this.templateArgs
    );
  }
}

/**
 * Maximally Promise builder with method caching
 */
export class ProcessPromiseBuilder {
  // Cache method bindings for performance
  private readonly parseJson = this._parseJson.bind(this);
  private readonly parseLines = this._parseLines.bind(this);

  constructor(private readonly engine: any) { }

  /**
   * Create any type of process promise with unified logic
   */
  createProcessPromise(
    commandOrResolver: Command | (() => Promise<Partial<Command>> | Partial<Command>)
  ): ProcessPromise {
    const resolver = typeof commandOrResolver === 'function'
      ? commandOrResolver
      : () => commandOrResolver;

    const context = new ProcessContext(this.engine, resolver);
    return this.createProcessPromiseWithContext(context);
  }

  /**
   * Context-based creation with minimal overhead
   */
  createProcessPromiseWithContext(context: ProcessContext): ProcessPromise {
    // Captured once per command and carried through the chain, so the frame
    // points at where the caller wrote it rather than at a chaining method.
    if (!context.state.callSite && context.engine._config?.captureCallSite !== false) {
      context.state.callSite = captureCallSite();
    }

    // Create a lazy promise that only executes when awaited
    let executionStarted = false;
    let executionPromise: Promise<ExecutionResult> | null = null;

    /**
     * Begin execution, once.
     *
     * Commands are lazy so that the whole chain — `.timeout()`, `.env()`,
     * `.nothrow()` — is applied before anything runs. That leaves one gap:
     * a long-running command you intend to kill later never started, because
     * nothing had awaited it yet. `start()` closes it explicitly, and every
     * live accessor (`.child`, `.pid`, `.stdin`) calls it, so reaching for
     * the process is itself enough to launch it.
     */
    const ensureStarted = (): void => {
      if (executionStarted) return;
      executionStarted = true;
      context.state.started = true;
      executionPromise = context.execute();

      // Track active process
      const processes = context.engine._activeProcesses;
      if (processes) {
        processes.add(lazyPromise);
        // Untrack on both outcomes rather than with `.finally()`. That
        // returns a second promise which rejects with the same reason and
        // which nothing handles, so every failed command emitted an
        // unhandled rejection alongside the one the caller caught — enough
        // to kill a host application that treats them as fatal.
        const untrack = (): void => {
          processes.delete(lazyPromise);
        };
        executionPromise.then(untrack, untrack);
      }
    };

    const lazyPromise = {
      /**
       * The command this promise would run, for a consumer that needs to run
       * it differently.
       *
       * `.pipe($`grep x`)` is the case: the target has to run with the
       * source's output as its stdin, and reading it through `.then()` starts
       * it first — with no stdin at all. Exposed under a symbol because it is
       * an internal seam, not part of the API.
       */
      [PIPE_TARGET]: context,

      /**
       * Start the command without awaiting it.
       *
       * @returns The same promise, now running.
       */
      start() {
        ensureStarted();
        return lazyPromise as unknown as ProcessPromise;
      },

      then(onfulfilled?: any, onrejected?: any) {
        ensureStarted();
        // Check if we're being awaited directly (not through .text(), .json(), etc)
        // We can detect this by checking if onfulfilled is the internal handler from .text()/.json()
        // or if it's a user-provided handler
        // Only our own text()/json()/lines()/buffer() handlers opt out of
        // throwing — they apply their own error checks. Everything else,
        // including `.catch(fn)` and `.then(null, fn)` which arrive here with
        // no onfulfilled at all, must see a failure as a rejection.
        //
        // The test used to be "is there an onfulfilled?", so `.catch()` took
        // the non-throwing branch: a failing command resolved with its result
        // and the handler never ran. A standard promise idiom silently
        // reported success.
        const isTransform = Boolean(onfulfilled && (onfulfilled as any)[TRANSFORM_HANDLER]);

        if (isTransform) {
          return executionPromise!.then(onfulfilled, onrejected);
        }

        return executionPromise!.then(result => {
          if (result.exitCode !== 0 && !context.state.modifications.nothrow) {
            const globalNothrow = throwingDisabled(context.engine);
            if (!globalNothrow) {
              result.throwIfFailed();
            }
          }
          return result;
        }).then(onfulfilled, onrejected);
      },
      catch(onrejected?: any) {
        return lazyPromise.then(undefined, onrejected);
      },
      finally(onfinally?: any) {
        return lazyPromise.then(
          (value: any) => {
            onfinally?.();
            return value;
          },
          (reason: any) => {
            onfinally?.();
            throw reason;
          }
        );
      }
    } as any;

    // Brand the promise for reliable identification in unhandled rejection handler
    (lazyPromise as unknown as Record<symbol, boolean>)[XEC_PROMISE_BRAND] = true;
    Object.assign(lazyPromise, { engine: context.engine });

    // Attach methods in single pass
    this.attachProcessMethods(lazyPromise, context);

    return lazyPromise;
  }

  /**
   * Create a transform handler that checks exit code before applying transform.
   * Shared logic extracted to avoid duplicating the same closure 4 times.
   */
  private createTransformHandler<T>(
    context: ProcessContext,
    transform: (r: ExecutionResult) => T
  ): ((r: ExecutionResult) => T) {
    const handler = (r: ExecutionResult): T => {
      if (r.exitCode !== 0 && !context.state.modifications.nothrow) {
        const globalNothrow = throwingDisabled(context.engine);
        if (!globalNothrow) {
          r.throwIfFailed();
        }
      }
      return transform(r);
    };
    (handler as any)[TRANSFORM_HANDLER] = true;
    return handler;
  }

  /**
   * Method attachment with minimal allocations.
   * Uses shared transform handler creator to avoid duplicating error-check logic.
   */
  private attachProcessMethods(promise: ProcessPromise, context: ProcessContext): void {
    Object.assign(promise, {
      // Method wrappers with proper binding
      signal: (signal: AbortSignal) => context.withSignal(signal),
      timeout: (duration: Duration, timeoutSignal?: string) => context.withTimeout(duration, timeoutSignal),
      quiet: () => context.withQuiet(),
      nothrow: () => context.withNothrow(),
      interactive: () => context.withInteractive(),
      cwd: (dir: string) => context.withCwd(dir),
      env: (env: Record<string, string>) => context.withEnv(env),
      shell: (shell: string | boolean) => context.withShell(shell),
      stdout: (stream: StreamOption) => context.withStdout(stream),
      stderr: (stream: StreamOption) => context.withStderr(stream),
      cache: (options?: CacheOptions) => context.withCache(options),
      pipe: (target: PipeTarget, ...args: any[]) => context.pipe(target, ...args),
      kill: (signal?: NodeJS.Signals) => context.kill(signal),

      // Transformations — use shared handler creator to deduplicate error-check logic
      text: () => promise.then(this.createTransformHandler(context, r => r.stdout.trim())),
      json: <T = any>() => promise.then(this.createTransformHandler<T>(context, r => this.parseJson(r.stdout.trim()) as T)),
      lines: () => promise.then(this.createTransformHandler(context, r => this.parseLines(r.stdout))),
      buffer: () => promise.then(this.createTransformHandler(context, r => Buffer.from(r.stdout))),

      /**
       * Stream output line by line: `for await (const line of $\`cmd\`)`.
       *
       * Lines are delivered as they arrive. This used to await the whole
       * command and then split its stdout, which made the loop useless for
       * exactly the commands it exists for — `kubectl logs -f`,
       * `journalctl -f`, a long build — where the first line would never
       * arrive until the command ended, which for a follow is never.
       */
      [Symbol.asyncIterator]: () => streamLines(promise, context),
    });

    Object.defineProperty(promise, 'exitCode', {
      get: () => promise.then(r => r.exitCode),
      configurable: true
    });

    // Live access to the running command. These were `undefined` and `null`
    // constants: the type advertised the process and delivered nothing, so
    // answering a prompt or reading output as it arrived was impossible.
    // Reading any of them starts the command, which is what makes
    // `p.stdin.write(...)` work without a separate start step.
    const liveHandle = (): ProcessHandle | null => {
      promise.start();
      return context.state.handle;
    };

    // `stdout`/`stderr` stay configurators (`.stdout('inherit')`); the live
    // streams are reached through `.child`, which is uniform across
    // environments where a raw ChildProcess would not be.
    for (const [name, read] of [
      ['child', (h: ProcessHandle | null) => h],
      ['pid', (h: ProcessHandle | null) => h?.pid],
    ] as const) {
      Object.defineProperty(promise, name, {
        get: () => read(liveHandle()),
        configurable: true
      });
    }

    // stdin is writable *before* the process exists: writes buffer and are
    // forwarded on spawn. Touching it therefore must not start the command,
    // or `p.stdin.write(x); p.stdin.end(); await p` would race the spawn.
    Object.defineProperty(promise, 'stdin', {
      get: () => context.getStdinBridge(),
      configurable: true
    });

    // The honest answer to "when does the process exist?". Spawning is async
    // by construction — adapter selection is async and SSH needs a connection
    // — so a synchronous `.pid` right after start() cannot be guaranteed.
    Object.defineProperty(promise, 'spawned', {
      get: () => {
        const deferred = context.getSpawnDeferred();
        promise.start();
        return deferred.promise;
      },
      configurable: true
    });
  }

  /**
   * JSON parsing with better error message
   */
  private _parseJson(text: string): any {
    try {
      return JSON.parse(text);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      // The cause must be the caught error, not its message: passing the
      // string discarded the original stack, which is the only thing that
      // says where in the output the parse failed.
      throw new Error(`Failed to parse JSON: ${reason}\nOutput: ${text}`, { cause: e });
    }
  }

  /**
   * Line parsing with single pass
   */
  private _parseLines(stdout: string): string[] {
    // More efficient than split + filter
    const lines: string[] = [];
    let start = 0;
    for (let i = 0; i < stdout.length; i++) {
      if (stdout[i] === '\n') {
        if (i > start) {
          lines.push(stdout.slice(start, i));
        }
        start = i + 1;
      }
    }
    if (start < stdout.length) {
      lines.push(stdout.slice(start));
    }
    return lines;
  }
}
