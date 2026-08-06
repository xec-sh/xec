import type { UshEventMap } from '../types/events.js';
import type { Disposable } from '../types/disposable.js';

import { Command } from '../types/command.js';
import { StreamHandler } from '../utils/stream.js';
import { resolveCallSite } from '../utils/call-site.js';
import { ProgressReporter } from '../utils/progress.js';
import { TimeoutError, AdapterError } from '../core/error.js';
import { EnhancedEventEmitter } from '../utils/event-emitter.js';
import { MaskingStreamFilter } from '../utils/masking-stream.js';
import { parseDuration, type Duration } from '../utils/helpers.js';
import { createOptimizedMasker } from '../utils/optimized-masker.js';
import { ExecutionResult, ExecutionResultImpl } from '../core/result.js';
import { defaultSensitiveRules, createDefaultSensitivePatterns } from '../utils/sensitive-patterns.js';

export interface SensitiveDataMaskingConfig {
  enabled: boolean;
  patterns: RegExp[];
  replacement: string;
}

export interface BaseAdapterConfig {
  defaultTimeout?: number;
  defaultCwd?: string;
  defaultEnv?: Record<string, string>;
  defaultShell?: string | boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
  sensitiveDataMasking?: Partial<SensitiveDataMaskingConfig>;
}

interface ResolvedBaseAdapterConfig extends Omit<Required<BaseAdapterConfig>, 'sensitiveDataMasking' | 'defaultCwd'> {
  /**
   * Set only when configured explicitly. There is deliberately no
   * `process.cwd()` fallback: the adapter may execute on an SSH host, in a
   * container or in a pod, where the operator's local directory means
   * nothing. That ambient default made every remote command carry a local
   * path as its cwd — the SSH adapter grew a workaround stripping it back
   * out, and once Docker/K8s honoured cwd it sent them `cd`-ing into a
   * directory that only exists on the operator's machine.
   */
  defaultCwd: string | undefined;
  sensitiveDataMasking: SensitiveDataMaskingConfig;
}

/**
 * A command whose duration options have been resolved to milliseconds.
 *
 * `Command.timeout` accepts a duration string for the caller's convenience;
 * everything past {@link BaseAdapter.mergeCommand} works in numbers, and the
 * type says so rather than leaving each adapter to remember.
 */
export type ResolvedCommand = Omit<Command, 'timeout'> & { timeout?: number };

export abstract class BaseAdapter extends EnhancedEventEmitter implements Disposable {
  protected config: ResolvedBaseAdapterConfig;
  protected abstract readonly adapterName: string;
  public name: string;
  private maskSensitiveDataOptimized: ((text: string) => string) | null = null;
  private maskingEnabled = true;
  private callerSuppliedPatterns: RegExp[] | undefined;

  constructor(config: BaseAdapterConfig = {}) {
    super();
    // Shared with the execution engine so every layer redacts identically.
    const defaultPatterns = createDefaultSensitivePatterns();

    this.config = {
      defaultTimeout: config.defaultTimeout ?? 120000, // 2 minutes
      defaultCwd: config.defaultCwd,
      defaultEnv: config.defaultEnv ?? {},
      defaultShell: config.defaultShell ?? true,
      encoding: config.encoding ?? 'utf8',
      maxBuffer: config.maxBuffer ?? 10 * 1024 * 1024, // 10MB
      throwOnNonZeroExit: config.throwOnNonZeroExit !== undefined ? config.throwOnNonZeroExit : true,
      sensitiveDataMasking: {
        enabled: config.sensitiveDataMasking?.enabled ?? true,
        patterns: config.sensitiveDataMasking?.patterns ?? defaultPatterns,
        replacement: config.sensitiveDataMasking?.replacement ?? '[REDACTED]'
      }
    };

    // The masker is built on first use, not here. Compiling twenty-odd
    // expressions in a constructor makes every adapter — including one
    // created to run a single `echo` — pay for redaction it may never
    // perform, and turns any fault in the rules into a failure to
    // *construct an adapter*, a long way from anything that names a rule.
    this.maskingEnabled = this.config.sensitiveDataMasking.enabled;
    this.callerSuppliedPatterns = config.sensitiveDataMasking?.patterns;

    // Name will be set by subclasses
    this.name = '';
  }

  /**
   * Emit an adapter event with its command redacted.
   *
   * The engine-level events (`command:start` and friends) already mask, but
   * adapter events did not, so `ssh:execute`, `docker:exec`, `k8s:exec` and
   * `command:retry` published the raw command string. Since the obvious
   * reason to subscribe to these is logging, telemetry or audit, a secret in
   * a command line went straight to the sink an integrator trusts most.
   */
  protected emitAdapterEvent<K extends keyof UshEventMap>(
    event: K,
    data: Omit<UshEventMap[K], 'timestamp' | 'adapter'>
  ): void {
    // Skip if no listeners (performance optimization)
    if (!this.listenerCount(event)) return;

    const payload = data as { command?: unknown };
    const masked =
      typeof payload.command === 'string'
        ? { ...data, command: this.maskSensitiveData(payload.command) }
        : data;

    this.emit(event, {
      ...masked,
      timestamp: new Date(),
      adapter: this.adapterName
    } as UshEventMap[K]);
  }

  abstract execute(command: Command): Promise<ExecutionResult>;

  abstract isAvailable(): Promise<boolean>;

  // Synchronous execution (optional - adapters can implement if they support it)
  executeSync?(command: Command): ExecutionResult;

  /**
   * Fill a command in with this adapter's defaults.
   *
   * The timeout is resolved to milliseconds here, so every adapter downstream
   * can treat it as a number. A duration string that reached setTimeout
   * unparsed became NaN, which Node clamps to 1ms — every command failed at
   * once, under a message that claimed the whole duration had elapsed.
   */
  protected mergeCommand(command: Command): ResolvedCommand {
    const timeout = command.timeout ?? this.config.defaultTimeout;

    return {
      ...command,
      cwd: command.cwd ?? this.config.defaultCwd,
      env: { ...this.config.defaultEnv, ...command.env },
      timeout: timeout === undefined ? undefined : parseDuration(timeout),
      shell: command.shell ?? this.config.defaultShell,
      maxBuffer: command.maxBuffer ?? this.config.maxBuffer,
      throwOnNonZeroExit: command.throwOnNonZeroExit ?? this.config.throwOnNonZeroExit,
      stdout: command.stdout ?? 'pipe',
      stderr: command.stderr ?? 'pipe'
    };
  }

  protected createStreamHandler(
    options?: { onData?: (chunk: string) => void; maxBuffer?: number }
  ): StreamHandler {
    // A per-command cap wins, so `$.with({ maxBuffer })` reaches an adapter it
    // shares with its parent engine.
    const maxBuffer = options?.maxBuffer ?? this.config.maxBuffer;

    if (!options?.onData) {
      return new StreamHandler({
        encoding: this.config.encoding,
        maxBuffer
      });
    }

    const onData = options.onData;

    // Mask across chunk boundaries. Masking each chunk independently missed
    // any secret split by a pipe read — `TOKEN=` at the end of one chunk and
    // the value at the start of the next matched no pattern in either.
    const filter = new MaskingStreamFilter(chunk => this.maskSensitiveData(chunk));

    return new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer,
      onData: (chunk: string) => {
        const masked = filter.push(chunk);
        if (masked) onData(masked);
      },
      onEnd: () => {
        const remainder = filter.flush();
        if (remainder) onData(remainder);
      }
    });
  }

  protected createProgressReporter(command: Command): ProgressReporter | null {
    if (!command.progress?.enabled) {
      return null;
    }

    return new ProgressReporter({
      enabled: true,
      onProgress: command.progress.onProgress,
      updateInterval: command.progress.updateInterval,
      reportLines: command.progress.reportLines,
      prefix: this.adapterName
    });
  }

  protected async handleTimeout(
    promise: Promise<any>,
    duration: Duration | undefined,
    command: string,
    cleanup?: () => void
  ): Promise<any> {
    // Normalized here because adapters reach this helper by several routes,
    // some of which read command.timeout directly rather than through
    // mergeCommand. An unparsed string became NaN, and NaN <= 0 is false, so
    // it fell through to setTimeout and was clamped to 1ms.
    const timeout = duration === undefined ? 0 : parseDuration(duration);

    if (!(timeout > 0)) {
      return promise;
    }

    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        if (cleanup) cleanup();
        reject(new TimeoutError(command, timeout));
      }, timeout);

      // Not `.finally()`: that returns a second promise which rejects with
      // the same reason and which nothing handles, so every failing command
      // also surfaced as an unhandledRejection alongside the one the caller
      // caught.
      const clear = () => clearTimeout(timer);
      promise.then(clear, clear);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  protected maskSensitiveData(text: string): string {
    if (!this.maskingEnabled || !text) {
      return text;
    }

    // The built-ins are handed over as rules, which carry what each
    // redaction should leave behind. A caller's own patterns arrive as
    // bare expressions and are inferred, which is all that can be done
    // with a pattern nothing is known about.
    this.maskSensitiveDataOptimized ??= createOptimizedMasker(
      this.callerSuppliedPatterns ?? defaultSensitiveRules(),
      this.config.sensitiveDataMasking.replacement
    );

    return this.maskSensitiveDataOptimized(text);
  }

  protected createResultSync(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command; stdall?: string; rawStdout?: Buffer }
  ): ExecutionResult {
    // Apply sensitive data masking
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    const result = new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container,
      context?.stdall !== undefined ? this.maskSensitiveData(context.stdall) : undefined,
      // Resolved here rather than at capture: formatting a stack is the
      // expensive half, and most commands succeed.
      resolveCallSite(context?.originalCommand?.callSite),
      context?.rawStdout
    );


    // Use originalCommand if available, otherwise fall back to command string
    const commandForThrowCheck = context?.originalCommand ?? command;

    // Don't throw immediately for promise chain compatibility
    // The error will be thrown when .text(), .json(), etc are called
    // or when the base promise is awaited directly
    // Only throw if it's not being used through ProcessPromise
    // We can detect this by checking if the command has a special marker
    const isProcessPromise = commandForThrowCheck && typeof commandForThrowCheck === 'object' &&
                            '__fromProcessPromise' in commandForThrowCheck;

    if (!isProcessPromise && this.shouldThrowOnNonZeroExit(commandForThrowCheck, exitCode)) {
      result.throwIfFailed();
    }

    return result;
  }

  protected async createResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command; stdall?: string; rawStdout?: Buffer }
  ): Promise<ExecutionResult> {
    // Apply sensitive data masking
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    const result = new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container,
      context?.stdall !== undefined ? this.maskSensitiveData(context.stdall) : undefined,
      // Resolved here rather than at capture: formatting a stack is the
      // expensive half, and most commands succeed.
      resolveCallSite(context?.originalCommand?.callSite),
      context?.rawStdout
    );


    // Use originalCommand if available, otherwise fall back to command string
    const commandForThrowCheck = context?.originalCommand ?? command;

    // Don't throw immediately for promise chain compatibility
    // The error will be thrown when .text(), .json(), etc are called
    // or when the base promise is awaited directly
    // Only throw if it's not being used through ProcessPromise
    // We can detect this by checking if the command has a special marker
    const isProcessPromise = commandForThrowCheck && typeof commandForThrowCheck === 'object' &&
                            '__fromProcessPromise' in commandForThrowCheck;

    if (!isProcessPromise && this.shouldThrowOnNonZeroExit(commandForThrowCheck, exitCode)) {
      result.throwIfFailed();
    }

    return result;
  }

  /**
   * Create an ExecutionResult without throwing on non-zero exit code regardless of configuration.
   * This is useful for adapters that need to decide on custom error types after constructing the result
   * or when implementing special cases like timeout handling with nothrow.
   */
  protected async createResultNoThrow(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command; stdall?: string; rawStdout?: Buffer }
  ): Promise<ExecutionResult> {
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    return new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container,
      context?.stdall !== undefined ? this.maskSensitiveData(context.stdall) : undefined,
      // Resolved here rather than at capture: formatting a stack is the
      // expensive half, and most commands succeed.
      resolveCallSite(context?.originalCommand?.callSite),
      context?.rawStdout
    );
  }

  /**
   * Synchronous variant of createResultNoThrow.
   */
  protected createResultNoThrowSync(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string; originalCommand?: Command; stdall?: string; rawStdout?: Buffer }
  ): ExecutionResult {
    const maskedStdout = this.maskSensitiveData(stdout);
    const maskedStderr = this.maskSensitiveData(stderr);
    const maskedCommand = this.maskSensitiveData(command);

    return new ExecutionResultImpl(
      maskedStdout,
      maskedStderr,
      exitCode,
      signal,
      maskedCommand,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container,
      context?.stdall !== undefined ? this.maskSensitiveData(context.stdall) : undefined,
      // Resolved here rather than at capture: formatting a stack is the
      // expensive half, and most commands succeed.
      resolveCallSite(context?.originalCommand?.callSite),
      context?.rawStdout
    );
  }

  // Helper method to determine if we should throw on non-zero exit
  protected shouldThrowOnNonZeroExit(command: Command | string, exitCode: number): boolean {
    if (exitCode === 0) {
      return false;
    }

    // If command is a string, use global configuration
    if (typeof command === 'string') {
      return this.config.throwOnNonZeroExit;
    }

    // If nothrow is explicitly set on the command, respect it
    if (command.nothrow !== undefined) {
      return !command.nothrow;
    }

    // Then the engine's own setting, which reaches us on the command because
    // `$.with()` shares its parent's adapters — reading it from the adapter
    // config alone meant `$.with({ throwOnNonZeroExit: false })` was ignored.
    if (command.throwOnNonZeroExit !== undefined) {
      return command.throwOnNonZeroExit;
    }

    // Otherwise, follow the global configuration
    return this.config.throwOnNonZeroExit;
  }

  protected buildCommandString(command: Command): string {
    if (command.args && command.args.length > 0) {
      return `${command.command} ${command.args.join(' ')}`;
    }
    return command.command;
  }

  /**
   * Absorb write errors on a child's stdin before feeding it.
   *
   * A process is free to exit without reading its input — `head -1`, a
   * failing pipe target, plain `true`. The OS then closes the pipe and the
   * pending write surfaces as an asynchronous 'error' event on the stream;
   * with no listener, that is an uncaught exception that takes down the
   * whole host process. The race window depends on buffer sizes and
   * scheduling, which is why it appeared as a once-in-many-runs flake
   * locally and reliably in CI.
   *
   * The command's outcome is the child's exit status and output, already
   * collected by the exit handler — a stdin delivery failure adds nothing
   * to it, so every stdin error is absorbed, not just EPIPE: the same race
   * also surfaces as ERR_STREAM_DESTROYED or write-after-end depending on
   * timing.
   */
  protected absorbStdinErrors(stdin: NodeJS.WritableStream | null | undefined): void {
    stdin?.on('error', () => {});
  }

  /**
   * Set up abort signal handling. Returns a cleanup function that MUST be
   * called when the operation completes (in a finally block) to prevent
   * listener accumulation on long-lived AbortSignal instances.
   */
  protected setupAbortSignal(
    signal: AbortSignal | undefined,
    onAbort: () => void
  ): (() => void) {
    if (!signal) return () => {};

    if (signal.aborted) {
      onAbort();
      throw new AdapterError(this.adapterName, 'execute', new Error('Operation aborted'));
    }

    const abortHandler = () => { onAbort(); };
    signal.addEventListener('abort', abortHandler, { once: true });

    // Return cleanup function to remove listener on normal completion
    return () => { signal.removeEventListener('abort', abortHandler); };
  }

  /** @deprecated Use setupAbortSignal instead */
  protected async handleAbortSignal(
    signal: AbortSignal | undefined,
    cleanup: () => void
  ): Promise<void> {
    this.setupAbortSignal(signal, cleanup);
  }

  protected createCombinedEnv(baseEnv: Record<string, string>, commandEnv?: Record<string, string>): Record<string, string> {
    const combined: Record<string, string> = {};

    // Copy process.env, filtering out undefined values
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) {
        combined[key] = value;
      }
    }

    // Override with baseEnv
    Object.assign(combined, baseEnv);

    // Override with commandEnv
    if (commandEnv) {
      Object.assign(combined, commandEnv);
    }

    return combined;
  }

  updateConfig(config: Partial<BaseAdapterConfig>): void {
    // Handle sensitiveDataMasking separately to ensure proper merging
    const newSensitiveDataMasking = config.sensitiveDataMasking
      ? {
        enabled: config.sensitiveDataMasking.enabled ?? this.config.sensitiveDataMasking.enabled,
        patterns: config.sensitiveDataMasking.patterns ?? this.config.sensitiveDataMasking.patterns,
        replacement: config.sensitiveDataMasking.replacement ?? this.config.sensitiveDataMasking.replacement
      }
      : this.config.sensitiveDataMasking;

    // Masking is rebuilt on next use. It was built once in the constructor
    // and never again, so changing `sensitiveDataMasking` through this
    // method was accepted and had no effect — new patterns never applied,
    // and turning masking off left it on.
    this.maskSensitiveDataOptimized = null;
    this.maskingEnabled = newSensitiveDataMasking.enabled;
    this.callerSuppliedPatterns = config.sensitiveDataMasking?.patterns ?? this.callerSuppliedPatterns;

    this.config = {
      defaultTimeout: config.defaultTimeout ?? this.config.defaultTimeout,
      defaultCwd: config.defaultCwd ?? this.config.defaultCwd,
      defaultEnv: config.defaultEnv ?? this.config.defaultEnv,
      defaultShell: config.defaultShell ?? this.config.defaultShell,
      encoding: config.encoding ?? this.config.encoding,
      maxBuffer: config.maxBuffer ?? this.config.maxBuffer,
      throwOnNonZeroExit: config.throwOnNonZeroExit !== undefined ? config.throwOnNonZeroExit : this.config.throwOnNonZeroExit,
      sensitiveDataMasking: newSensitiveDataMasking
    };

  }

  getConfig(): Readonly<ResolvedBaseAdapterConfig> {
    return { ...this.config };
  }

  /**
   * Execute command with retry logic
   * @param command - Command to execute
   * @param maxRetries - Maximum number of retries (default: 0)
   * @param retryDelay - Delay between retries in milliseconds (default: 1000)
   * @param shouldRetry - Function to determine if error should trigger retry (default: retry all errors)
   * @returns Execution result
   */
  protected async executeWithRetry(
    command: Command,
    maxRetries = 0,
    retryDelay = 1000,
    shouldRetry?: (error: any) => boolean
  ): Promise<ExecutionResult> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // If this is a retry, wait before attempting
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));

          // Emit retry event
          this.emitAdapterEvent('command:retry', {
            command: this.buildCommandString(command),
            attempt,
            maxRetries
          });
        }

        // Execute the command
        return await this.execute(command);
      } catch (error) {
        lastError = error;

        // Check if we should retry
        if (attempt < maxRetries) {
          if (shouldRetry && !shouldRetry(error)) {
            throw error; // Don't retry this error
          }
          // Continue to next retry
        } else {
          // No more retries left
          throw error;
        }
      }
    }

    // This should never be reached, but TypeScript needs it
    throw lastError;
  }

  /**
   * Dispose of any resources held by this adapter.
   * Subclasses should override this method to clean up their specific resources.
   */
  abstract dispose(): Promise<void>;
}