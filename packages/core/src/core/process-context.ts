import { globalCache } from '../utils/cache.js';
import { ExecutionResultImpl } from './result.js';
import { executePipe } from './pipe-implementation.js';

import type { ExecutionResult } from './result.js';
import type { CacheOptions } from '../utils/cache.js';
import type { ProcessPromise } from '../types/process.js';
import type { Command, StreamOption } from '../types/command.js';
import type { PipeTarget, PipeOptions } from './pipe-implementation.js';

export { ProcessPromise } from '../types/process.js';

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
    isQuiet: false
  };

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
    // Create new context with cloned state for immutability
    const newContext = new ProcessContext(this.engine, this.commandResolver);
    // Deep clone the state
    newContext.state = {
      modifications: { ...this.state.modifications },
      cacheOptions: this.state.cacheOptions,
      abortController: this.state.abortController,
      isQuiet: this.state.isQuiet
    };
    // Apply changes to the new state
    changes(newContext.state);
    return this.engine.createProcessPromiseWithContext(newContext);
  }

  withSignal = (signal: AbortSignal): ProcessPromise =>
    this.mutate(s => { s.modifications.signal = signal; });

  withTimeout = (ms: number, timeoutSignal?: string): ProcessPromise =>
    this.mutate(s => {
      s.modifications.timeout = ms;
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
  kill = (signal = 'SIGTERM'): void => {
    const { abortController, modifications } = this.state;
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

    const lazyPromise = {
      then(onfulfilled?: any, onrejected?: any) {
        if (!executionStarted) {
          executionStarted = true;
          executionPromise = context.execute();
          // Track active process
          const processes = context.engine._activeProcesses;
          if (processes) {
            processes.add(lazyPromise);
            executionPromise.finally(() => processes.delete(lazyPromise));
          }
        }
        // Check if we're being awaited directly (not through .text(), .json(), etc)
        // We can detect this by checking if onfulfilled is the internal handler from .text()/.json()
        // or if it's a user-provided handler
        const isDirectAwait = onfulfilled && !onfulfilled.__isTransformHandler;

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

    // Add properties for type compatibility and tracking
    Object.assign(lazyPromise, {
      __isXecPromise: true,
      engine: context.engine
    });

    // Attach methods in single pass
    this.attachProcessMethods(lazyPromise, context);

    return lazyPromise;
  }

  /**
   * Method attachment with minimal allocations
   */
  private attachProcessMethods(promise: ProcessPromise, context: ProcessContext): void {
    // Batch assign properties
    Object.assign(promise, {
      stdin: null,
      child: undefined,

      // Method wrappers with proper binding
      signal: (signal: AbortSignal) => context.withSignal(signal),
      timeout: (ms: number, timeoutSignal?: string) => context.withTimeout(ms, timeoutSignal),
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
      kill: (signal?: string) => context.kill(signal),

      // Transformations - these should throw if the command failed and throwOnNonZeroExit is true
      text: () => {
        const handler = (r: ExecutionResult) => {
          // Check if we should throw based on exitCode and throwOnNonZeroExit
          if (r.exitCode !== 0 && !context.state.modifications.nothrow) {
            const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
            if (!globalNothrow) {
              r.throwIfFailed();
            }
          }
          return r.stdout.trim();
        };
        // Mark this as a transform handler
        (handler as any).__isTransformHandler = true;
        return promise.then(handler);
      },
      json: <T = any>() => {
        const handler = (r: ExecutionResult) => {
          // Check if we should throw based on exitCode and throwOnNonZeroExit
          if (r.exitCode !== 0 && !context.state.modifications.nothrow) {
            const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
            if (!globalNothrow) {
              r.throwIfFailed();
            }
          }
          return this.parseJson(r.stdout.trim()) as T;
        };
        // Mark this as a transform handler
        (handler as any).__isTransformHandler = true;
        return promise.then(handler);
      },
      lines: () => {
        const handler = (r: ExecutionResult) => {
          // Check if we should throw based on exitCode and throwOnNonZeroExit
          if (r.exitCode !== 0 && !context.state.modifications.nothrow) {
            const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
            if (!globalNothrow) {
              r.throwIfFailed();
            }
          }
          return this.parseLines(r.stdout);
        };
        // Mark this as a transform handler
        (handler as any).__isTransformHandler = true;
        return promise.then(handler);
      },
      buffer: () => {
        const handler = (r: ExecutionResult) => {
          // Check if we should throw based on exitCode and throwOnNonZeroExit
          if (r.exitCode !== 0 && !context.state.modifications.nothrow) {
            const globalNothrow = context.engine._config?.throwOnNonZeroExit === false;
            if (!globalNothrow) {
              r.throwIfFailed();
            }
          }
          return Buffer.from(r.stdout);
        };
        // Mark this as a transform handler
        (handler as any).__isTransformHandler = true;
        return promise.then(handler);
      }
    });

    // Single property definition for lazy evaluation
    Object.defineProperty(promise, 'exitCode', {
      get: () => promise.then(r => r.exitCode),
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
      const error = e instanceof Error ? e.message : String(e);
      throw new Error(`Failed to parse JSON: ${error}\nOutput: ${text}`);
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
