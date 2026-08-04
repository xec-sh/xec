import type { ExecutionResult } from './result.js';
import type { CacheOptions } from '../utils/cache.js';
import type { ProcessPromise } from '../types/process.js';
import type { ProcessHandle } from '../types/process-handle.js';
import type { Command, StreamOption } from '../types/command.js';
import type { PipeTarget, PipeOptions } from './pipe-implementation.js';

import { PassThrough } from 'node:stream';

import { globalCache } from '../utils/cache.js';
import { ExecutionResultImpl } from './result.js';
import { executePipe } from './pipe-implementation.js';
import { parseDuration, type Duration } from '../utils/helpers.js';

/** Branded symbol for xec promise identification — shared across modules */
const XEC_PROMISE_BRAND = Symbol.for('xec:promise');

/** Marker for transform handlers (text/json/lines/buffer) to distinguish from direct await */
const TRANSFORM_HANDLER = Symbol.for('xec:transform');

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
    const newContext = new ProcessContext(this.engine, this.commandResolver);
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

  withStdout = (stream: StreamOption): ProcessPromise =>
    this.mutate(s => { s.modifications.stdout = stream; });

  withStderr = (stream: StreamOption): ProcessPromise =>
    this.mutate(s => { s.modifications.stderr = stream; });

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
    const globalNothrow = this.engine._config?.throwOnNonZeroExit === false;

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
        command.env
      );
  }
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
        const isDirectAwait = onfulfilled && !(onfulfilled as any)[TRANSFORM_HANDLER];

        if (isDirectAwait) {
          // For direct await, check if we should throw
          return executionPromise!.then(result => {
            if (result.exitCode !== 0 && !context.state.modifications.nothrow) {
              const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
              if (!globalNothrow) {
                result.throwIfFailed();
              }
            }
            return result;
          }).then(onfulfilled, onrejected);
        } else {
          // For transform methods, don't throw automatically
          return executionPromise!.then(onfulfilled, onrejected);
        }
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
        const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
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

      // Async iteration: for await (const line of $`cmd`) { ... }
      [Symbol.asyncIterator]: () => {
        let lines: string[] | null = null;
        let index = 0;
        return {
          async next(): Promise<IteratorResult<string>> {
            if (!lines) {
              const result = await promise;
              lines = result.stdout.split('\n').filter((l: string) => l.length > 0);
            }
            if (index < lines.length) {
              return { value: lines[index++]!, done: false };
            }
            return { value: undefined as any, done: true };
          },
        };
      },
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
