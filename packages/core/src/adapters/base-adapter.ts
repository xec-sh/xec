import { Command } from '../types/command.js';
import { StreamHandler } from '../utils/stream.js';
import { ProgressReporter } from '../utils/progress.js';
import { TimeoutError, AdapterError } from '../core/error.js';
import { EnhancedEventEmitter } from '../utils/event-emitter.js';
import { createOptimizedMasker } from '../utils/optimized-masker.js';
import { ExecutionResult, ExecutionResultImpl } from '../core/result.js';

import type { UshEventMap } from '../types/events.js';
import type { Disposable } from '../types/disposable.js';

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

interface ResolvedBaseAdapterConfig extends Omit<Required<BaseAdapterConfig>, 'sensitiveDataMasking'> {
  sensitiveDataMasking: SensitiveDataMaskingConfig;
}

export abstract class BaseAdapter extends EnhancedEventEmitter implements Disposable {
  protected config: ResolvedBaseAdapterConfig;
  protected abstract readonly adapterName: string;
  public name: string;
  private maskSensitiveDataOptimized: ((text: string) => string) | null = null;

  constructor(config: BaseAdapterConfig = {}) {
    super();
    // Default sensitive data patterns
    // Using named groups for better clarity in replacement
    const defaultPatterns = [
      // JSON string values for sensitive keys
      /"(api[_-]?key|apikey|password|token|secret|client[_-]?secret)":\s*"([^"]+)"/gi,
      // API keys and tokens - capture the value part
      /\b(api[_-]?key|apikey|access[_-]?token|auth[_-]?token|authentication[_-]?token|private[_-]?key|secret[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // Authorization headers - preserve "Bearer" or "Basic" prefix
      /(Authorization:\s*)(Bearer|Basic)(\s+)([a-zA-Z0-9_\-/.+=]+)/gi,
      // AWS credentials
      /\b(aws[_-]?access[_-]?key[_-]?id|aws[_-]?secret[_-]?access[_-]?key)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // GitHub tokens with pattern - direct matches
      /\b(gh[ps]_[a-zA-Z0-9]{16,})/gi,
      // GitHub token assignments
      /\b(github[_-]?token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // Generic tokens (including slack xoxb-, etc)
      /\b(token)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // Generic passwords - handle quoted and unquoted values (including template variables)
      /\b(password|passwd|pwd)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
      // Command line password arguments
      /(--password)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // Command line secret arguments
      /(--client[_-]?secret|--secret)(\s+)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // SSH private keys (full replacement)
      /-----BEGIN\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----[\s\S]+?-----END\s+(RSA|DSA|EC|OPENSSH)\s+PRIVATE\s+KEY-----/gi,
      // Environment variable assignments with secrets (including template variables)
      /\b([A-Z][A-Z0-9_]*(?:SECRET|TOKEN|KEY|PASSWORD|PASSWD|PWD|APIKEY|API_KEY)[A-Z0-9_]*)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^\s]+))/gi,
      // Generic secret patterns
      /\b(secret|client[_-]?secret)(\s*[:=]\s*)("([^"]+)"|'([^']+)'|([^"'\s]+))/gi,
      // Standalone Bearer tokens
      /\b(Bearer)(\s+)([a-zA-Z0-9_\-/.]+)/gi
    ];

    this.config = {
      defaultTimeout: config.defaultTimeout ?? 120000, // 2 minutes
      defaultCwd: config.defaultCwd ?? process.cwd(),
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

    // Initialize optimized masker if masking is enabled
    if (this.config.sensitiveDataMasking.enabled) {
      this.maskSensitiveDataOptimized = createOptimizedMasker(
        this.config.sensitiveDataMasking.patterns,
        this.config.sensitiveDataMasking.replacement
      );
    }

    // Name will be set by subclasses
    this.name = '';
  }

  /**
   * Helper method to emit adapter events
   */
  protected emitAdapterEvent<K extends keyof UshEventMap>(
    event: K,
    data: Omit<UshEventMap[K], 'timestamp' | 'adapter'>
  ): void {
    // Skip if no listeners (performance optimization)
    if (!this.listenerCount(event)) return;

    this.emit(event, {
      ...data,
      timestamp: new Date(),
      adapter: this.adapterName
    } as UshEventMap[K]);
  }

  abstract execute(command: Command): Promise<ExecutionResult>;

  abstract isAvailable(): Promise<boolean>;

  // Synchronous execution (optional - adapters can implement if they support it)
  executeSync?(command: Command): ExecutionResult;

  protected mergeCommand(command: Command): Command {
    return {
      ...command,
      cwd: command.cwd ?? this.config.defaultCwd,
      env: { ...this.config.defaultEnv, ...command.env },
      timeout: command.timeout ?? this.config.defaultTimeout,
      shell: command.shell ?? this.config.defaultShell,
      stdout: command.stdout ?? 'pipe',
      stderr: command.stderr ?? 'pipe'
    };
  }

  protected createStreamHandler(options?: { onData?: (chunk: string) => void }): StreamHandler {
    return new StreamHandler({
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer,
      onData: options?.onData ? (chunk: string) => {
        // Apply masking to streaming data
        const maskedChunk = this.maskSensitiveData(chunk);
        options.onData!(maskedChunk);
      } : undefined
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
    timeout: number,
    command: string,
    cleanup?: () => void
  ): Promise<any> {
    if (timeout <= 0) {
      return promise;
    }

    const timeoutPromise = new Promise((_, reject) => {
      const timer = setTimeout(() => {
        if (cleanup) cleanup();
        reject(new TimeoutError(command, timeout));
      }, timeout);

      promise.finally(() => clearTimeout(timer));
    });

    return Promise.race([promise, timeoutPromise]);
  }

  protected maskSensitiveData(text: string): string {
    if (!this.maskSensitiveDataOptimized || !text) {
      return text;
    }

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
    context?: { host?: string; container?: string; originalCommand?: Command }
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
      context?.container
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
    context?: { host?: string; container?: string; originalCommand?: Command }
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
      context?.container
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
    context?: { host?: string; container?: string; originalCommand?: Command }
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
      context?.container
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
    context?: { host?: string; container?: string; originalCommand?: Command }
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
      context?.container
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

    // Otherwise, follow the global configuration
    return this.config.throwOnNonZeroExit;
  }

  protected buildCommandString(command: Command): string {
    if (command.args && command.args.length > 0) {
      return `${command.command} ${command.args.join(' ')}`;
    }
    return command.command;
  }

  protected async handleAbortSignal(
    signal: AbortSignal | undefined,
    cleanup: () => void
  ): Promise<void> {
    if (!signal) return;

    if (signal.aborted) {
      cleanup();
      throw new AdapterError(this.adapterName, 'execute', new Error('Operation aborted'));
    }

    const abortHandler = () => {
      cleanup();
    };

    signal.addEventListener('abort', abortHandler, { once: true });
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