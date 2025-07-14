import { Command } from '../core/command.js';
import { StreamHandler } from '../core/stream-handler.js';
import { TimeoutError, AdapterError } from '../core/error.js';
import { ExecutionResult, ExecutionResultImpl } from '../core/result.js';

export interface BaseAdapterConfig {
  defaultTimeout?: number;
  defaultCwd?: string;
  defaultEnv?: Record<string, string>;
  defaultShell?: string | boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
}

export abstract class BaseAdapter {
  protected config: Required<BaseAdapterConfig>;
  protected abstract readonly adapterName: string;

  constructor(config: BaseAdapterConfig = {}) {
    this.config = {
      defaultTimeout: config.defaultTimeout ?? 120000, // 2 minutes
      defaultCwd: config.defaultCwd ?? process.cwd(),
      defaultEnv: config.defaultEnv ?? {},
      defaultShell: config.defaultShell ?? true,
      encoding: config.encoding ?? 'utf8',
      maxBuffer: config.maxBuffer ?? 10 * 1024 * 1024, // 10MB
      throwOnNonZeroExit: config.throwOnNonZeroExit ?? true
    };
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
      onData: options?.onData
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

  protected createResult(
    stdout: string,
    stderr: string,
    exitCode: number,
    signal: string | undefined,
    command: string,
    startTime: number,
    endTime: number,
    context?: { host?: string; container?: string }
  ): ExecutionResult {
    const result = new ExecutionResultImpl(
      stdout,
      stderr,
      exitCode,
      signal,
      command,
      endTime - startTime,
      new Date(startTime),
      new Date(endTime),
      this.adapterName,
      context?.host,
      context?.container
    );

    if (this.config.throwOnNonZeroExit && exitCode !== 0) {
      result.throwIfFailed();
    }

    return result;
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
    this.config = {
      ...this.config,
      ...config
    };
  }

  getConfig(): Readonly<Required<BaseAdapterConfig>> {
    return { ...this.config };
  }
}