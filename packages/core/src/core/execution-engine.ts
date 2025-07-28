
import * as os from 'os';
import * as path from 'path';

import { AdapterError } from './error.js';
import { stream } from '../utils/stream.js';
import { TransferEngine } from '../utils/transfer.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
import { globalCache, CacheOptions } from '../utils/cache.js';
import { EnhancedEventEmitter } from '../utils/event-emitter.js';
import { TempDir, TempFile, TempOptions } from '../utils/temp.js';
import { ExecutionResult, ExecutionResultImpl } from './result.js';
import { interpolate, interpolateRaw } from '../utils/shell-escape.js';
import { CommandTemplate, TemplateOptions } from '../utils/templates.js';
import { SSHAdapter, SSHAdapterConfig } from '../adapters/ssh-adapter.js';
import { within, withinSync, asyncLocalStorage } from '../utils/within.js';
import { LocalAdapter, LocalAdapterConfig } from '../adapters/local-adapter.js';
import { DockerAdapter, DockerAdapterConfig } from '../adapters/docker-adapter.js';
import { SSHExecutionContext, createSSHExecutionContext } from '../utils/ssh-api.js';
import { ParallelEngine, ParallelResult, ParallelOptions } from '../utils/parallel.js';
import { select, confirm, Spinner, question, password } from '../utils/interactive.js';
import { RetryError, RetryOptions, withExecutionRetry } from '../utils/retry-adapter.js';
import { executePipe, type PipeTarget, type PipeOptions } from './pipe-implementation.js';
import { K8sExecutionContext, createK8sExecutionContext } from '../utils/kubernetes-api.js';
import { KubernetesAdapter, KubernetesAdapterConfig } from '../adapters/kubernetes-adapter.js';
import { DockerContext, createDockerContext, DockerContainerConfig } from '../utils/docker-api.js';
import { RemoteDockerAdapter, RemoteDockerAdapterConfig } from '../adapters/remote-docker-adapter.js';
import { Command, StreamOption, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions, RemoteDockerAdapterOptions } from './command.js';

import type { Disposable } from '../types/disposable.js';
import type { UshEventMap, EventConfig } from '../types/events.js';


export interface ExecutionEngineConfig extends EventConfig {
  // Global settings
  defaultTimeout?: number;
  defaultCwd?: string;
  defaultEnv?: Record<string, string>;
  defaultShell?: string | boolean;

  // Adapter settings
  adapters?: {
    local?: LocalAdapterConfig;
    ssh?: SSHAdapterConfig;
    docker?: DockerAdapterConfig;
    kubernetes?: KubernetesAdapterConfig;
    remoteDocker?: RemoteDockerAdapterConfig;
  };

  // Behavior
  throwOnNonZeroExit?: boolean;
  encoding?: BufferEncoding;
  maxBuffer?: number;

  // Runtime specific settings
  runtime?: {
    preferBun?: boolean;
    bunPath?: string;
  };

}

export interface ProcessPromise extends Promise<ExecutionResult> {
  stdin: NodeJS.WritableStream;
  pipe(target: PipeTarget | TemplateStringsArray, ...args: any[]): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  kill(signal?: string): void;
  // Configuration methods
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  // Stream configuration methods
  interactive(): ProcessPromise;
  stdout(stream: StreamOption): ProcessPromise;
  stderr(stream: StreamOption): ProcessPromise;
  // New methods for zx compatibility
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  lines(): Promise<string[]>;
  buffer(): Promise<Buffer>;
  // Caching
  cache(options?: CacheOptions): ProcessPromise;
  // Process-related properties
  child?: any;
  exitCode: Promise<number | null>;
}

export class ExecutionEngine extends EnhancedEventEmitter implements Disposable {
  // Core features
  // Removed retry and expBackoff - use command-level retry options instead
  public readonly stream = stream;
  private _parallel?: ParallelEngine;
  public get parallel(): ParallelEngine {
    if (!this._parallel) {
      this._parallel = new ParallelEngine(this);
    }
    return this._parallel;
  }
  private _transfer?: TransferEngine;
  public get transfer(): TransferEngine {
    if (!this._transfer) {
      this._transfer = new TransferEngine(this);
    }
    return this._transfer;
  }
  public readonly question = question;
  public readonly prompt = question; // Alias for question
  public readonly password = password;
  public readonly confirm = confirm;
  public readonly select = select;
  public readonly spinner = (text?: string) => new Spinner(text);
  public readonly within = within;
  public readonly withinSync = withinSync;

  private _config: ExecutionEngineConfig;
  private adapters: Map<string, BaseAdapter> = new Map();
  private currentConfig: Partial<Command> = {};
  private _tempTracker: Set<TempFile | TempDir> = new Set();
  private _activeProcesses: Set<ProcessPromise> = new Set();

  constructor(config: ExecutionEngineConfig = {}, existingAdapters?: Map<string, BaseAdapter>) {
    super();

    this._config = this.validateConfig(config);

    // Set max listeners based on config
    this.setMaxListeners(config.maxEventListeners || 100);

    // Disable event emission if requested
    if (config.enableEvents === false) {
      this.emit = () => false;
    }


    if (existingAdapters) {
      this.adapters = existingAdapters;
    } else {
      this.initializeAdapters();
    }
  }

  /**
   * Helper method to emit events with proper typing and performance optimization
   */
  private emitEvent<K extends keyof UshEventMap>(
    event: K,
    data: Omit<UshEventMap[K], 'timestamp' | 'adapter'>
  ): void {
    // Skip if no listeners (performance optimization)
    if (!this.listenerCount(event)) return;

    this.emit(event, {
      ...data,
      timestamp: new Date(),
      adapter: this.getCurrentAdapter()?.name || 'local'
    } as UshEventMap[K]);
  }

  private getCurrentAdapter(): BaseAdapter | undefined {
    const adapterType = this.currentConfig.adapter || 'local';
    return this.adapters.get(adapterType);
  }

  private validateConfig(config: ExecutionEngineConfig): ExecutionEngineConfig {
    const validatedConfig = { ...config };

    // Validate timeout
    if (config.defaultTimeout !== undefined && config.defaultTimeout < 0) {
      throw new Error(`Invalid timeout value: ${config.defaultTimeout}`);
    }

    // Validate encoding
    if (config.encoding !== undefined) {
      const validEncodings: BufferEncoding[] = ['ascii', 'utf8', 'utf-8', 'utf16le', 'ucs2', 'ucs-2', 'base64', 'base64url', 'latin1', 'binary', 'hex'];
      if (!validEncodings.includes(config.encoding)) {
        throw new Error(`Unsupported encoding: ${config.encoding}`);
      }
    }

    // Validate maxBuffer
    if (config.maxBuffer !== undefined && config.maxBuffer <= 0) {
      throw new Error(`Invalid buffer size: ${config.maxBuffer}`);
    }

    // Validate maxEventListeners
    if (config.maxEventListeners !== undefined && config.maxEventListeners <= 0) {
      throw new Error(`Invalid max event listeners: ${config.maxEventListeners}`);
    }

    // Set defaults
    validatedConfig.defaultTimeout = config.defaultTimeout ?? 30000;
    validatedConfig.throwOnNonZeroExit = config.throwOnNonZeroExit ?? true;
    validatedConfig.encoding = config.encoding ?? 'utf8';
    validatedConfig.maxBuffer = config.maxBuffer ?? 10 * 1024 * 1024;
    
    // Preserve event configuration
    validatedConfig.enableEvents = config.enableEvents;
    validatedConfig.maxEventListeners = config.maxEventListeners;

    return validatedConfig;
  }

  private initializeAdapters(): void {
    // Initialize local adapter (always available)
    const localConfig = {
      ...this.getBaseAdapterConfig(),
      ...this._config.adapters?.local,
      preferBun: this._config.runtime?.preferBun
    };
    this.adapters.set('local', new LocalAdapter(localConfig));

    // Initialize SSH adapter (always available for lazy loading)
    const sshConfig = {
      ...this.getBaseAdapterConfig(),
      ...this._config.adapters?.ssh
    };
    this.adapters.set('ssh', new SSHAdapter(sshConfig));

    // Initialize Kubernetes adapter (always available for lazy loading)
    const k8sConfig = {
      ...this.getBaseAdapterConfig(),
      ...this._config.adapters?.kubernetes
    };
    this.adapters.set('kubernetes', new KubernetesAdapter(k8sConfig));

    // Initialize Docker adapter if config provided
    if (this._config.adapters?.docker) {
      const dockerConfig = {
        ...this.getBaseAdapterConfig(),
        ...this._config.adapters.docker
      };
      this.adapters.set('docker', new DockerAdapter(dockerConfig));
    }

    // Initialize Remote Docker adapter if config provided
    if (this._config.adapters?.remoteDocker) {
      const remoteDockerConfig = {
        ...this.getBaseAdapterConfig(),
        ...this._config.adapters.remoteDocker
      };
      this.adapters.set('remote-docker', new RemoteDockerAdapter(remoteDockerConfig));
    }
  }

  private getBaseAdapterConfig() {
    return {
      defaultTimeout: this._config.defaultTimeout,
      defaultCwd: this._config.defaultCwd,
      defaultEnv: this._config.defaultEnv,
      defaultShell: this._config.defaultShell,
      encoding: this._config.encoding,
      maxBuffer: this._config.maxBuffer,
      throwOnNonZeroExit: this._config.throwOnNonZeroExit,
    };
  }

  // Main execution method
  async execute(command: Command): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Check for local context from within()
    const localContext = asyncLocalStorage.getStore();
    let contextCommand = command;

    if (localContext) {
      // Handle defaultEnv from within() context
      const { defaultEnv, ...otherContext } = localContext;
      contextCommand = {
        ...otherContext,
        ...command,
        env: {
          ...(defaultEnv || {}),
          ...(command.env || {})
        }
      };
    }

    const mergedCommand = { ...this.currentConfig, ...contextCommand };
    const adapter = await this.selectAdapter(mergedCommand);

    if (!adapter) {
      throw new AdapterError('unknown', 'execute', new Error('No suitable adapter found'));
    }

    // Emit start event
    this.emitEvent('command:start', {
      command: mergedCommand.command || '',
      args: mergedCommand.args,
      cwd: mergedCommand.cwd,
      shell: typeof mergedCommand.shell === 'boolean' ? mergedCommand.shell : !!mergedCommand.shell,
      env: mergedCommand.env
    });

    try {
      let result: ExecutionResult;

      // Apply retry logic if retry options are specified in the command
      if (mergedCommand.retry) {
        const maxRetries = mergedCommand.retry.maxRetries ?? 0;
        if (maxRetries > 0) {
          try {
            result = await withExecutionRetry(
              () => adapter.execute(mergedCommand),
              mergedCommand.retry,
              this
            );
          } catch (error) {
            // If nothrow is set and it's a RetryError, return the last result
            if (mergedCommand.nothrow && error instanceof RetryError) {
              result = error.lastResult;
            } else {
              throw error;
            }
          }
        } else {
          result = await adapter.execute(mergedCommand);
        }
      } else {
        result = await adapter.execute(mergedCommand);
      }

      // Emit complete event
      this.emitEvent('command:complete', {
        command: mergedCommand.command || '',
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      // Emit error event
      this.emitEvent('command:error', {
        command: mergedCommand.command || '',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      });

      throw error;
    }
  }

  // Helper to await any thenables in values
  private async awaitThenables(values: any[]): Promise<any[]> {
    const results = [];
    for (const value of values) {
      if (value && typeof value === 'object' && typeof value.then === 'function') {
        // This is a thenable (Promise or Promise-like object)
        results.push(await value);
      } else {
        results.push(value);
      }
    }
    return results;
  }

  // Template literal support
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    // Create a deferred command that will await thenables before execution
    const deferredCommand = async () => {
      const resolvedValues = await this.awaitThenables(values);
      const command = interpolate(strings, ...resolvedValues);
      return { command, shell: this.currentConfig.shell ?? true };
    };

    return this.createDeferredProcessPromise(deferredCommand);
  }

  // Raw template literal support (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    // Create a deferred command that will await thenables before execution
    const deferredCommand = async () => {
      const resolvedValues = await this.awaitThenables(values);
      const command = interpolateRaw(strings, ...resolvedValues);
      return { command, shell: this.currentConfig.shell ?? true };
    };

    return this.createDeferredProcessPromise(deferredCommand);
  }

  // Templates support
  private _templatesRegistry = new Map<string, CommandTemplate>();

  template(templateStr: string, options?: TemplateOptions): CommandTemplate {
    return new CommandTemplate(templateStr, options);
  }

  templates = {
    render: (templateStr: string, data: Record<string, any>, options?: TemplateOptions) => {
      // Reimplement interpolate logic here to match the expected behavior
      const mergedParams = { ...options?.defaults, ...data };

      return templateStr.replace(/\{\{(\w+)\}\}/g, (match, key) => {
        if (!(key in mergedParams)) {
          throw new Error(`Missing required parameter: ${key}`);
        }

        const value = mergedParams[key];

        // Escape string values using double quotes (matching test expectations)
        if (typeof value === 'string') {
          if (value.includes(' ') || value.includes('"') || value.includes("'")) {
            // Escape double quotes and wrap in double quotes
            return '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
          }
          return value;
        }

        return String(value);
      });
    },
    create: (templateStr: string, options?: TemplateOptions) =>
      new CommandTemplate(templateStr, options),
    parse: (templateStr: string) => {
      const regex = /\{\{(\w+)\}\}/g;
      const params: string[] = [];
      let match;
      while ((match = regex.exec(templateStr)) !== null) {
        if (match[1]) {
          params.push(match[1]);
        }
      }
      return { template: templateStr, params };
    },
    register: (name: string, templateStr: string, options?: TemplateOptions) => {
      const template = new CommandTemplate(templateStr, options);
      this._templatesRegistry.set(name, template);
    },
    get: (name: string): CommandTemplate => {
      const template = this._templatesRegistry.get(name);
      if (!template) {
        throw new Error(`Template '${name}' not found`);
      }
      return template;
    }
  };

  // Alias for template literal support (for compatibility)
  tag(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    return this.run(strings, ...values);
  }

  // Create a deferred process promise that awaits command resolution first
  createDeferredProcessPromise(commandResolver: () => Promise<Partial<Command>>): ProcessPromise {
    let pendingModifications: Partial<Command> = {};
    let isQuiet = false;
    let abortController: AbortController | undefined;
    let cacheOptions: CacheOptions | undefined;

    const executeCommand = async (): Promise<ExecutionResult> => {
      try {
        // Create abort controller if not already present
        if (!pendingModifications.signal) {
          abortController = new AbortController();
          pendingModifications.signal = abortController.signal;
        }

        // Resolve the command first (this is where thenables are awaited)
        const commandParts = await commandResolver();
        // Apply global throwOnNonZeroExit configuration if not explicitly set
        const globalNothrow = this._config.throwOnNonZeroExit === false;
        const currentCommand: Command = {
          ...this.currentConfig,
          ...commandParts,
          ...pendingModifications, // Include any modifications from chained methods
          // Apply global nothrow if not explicitly set
          nothrow: pendingModifications.nothrow ?? commandParts.nothrow ?? (globalNothrow ? true : undefined)
        } as Command;

        // Check cache if enabled
        if (cacheOptions) {
          const cacheKey = cacheOptions.key || globalCache.generateKey(
            currentCommand.command || '',
            currentCommand.cwd,
            currentCommand.env
          );

          const cached = globalCache.get(cacheKey);
          if (cached) {
            // Cache hit - returning cached result
            return cached;
          }
          
          // Check if there's an inflight request for this key
          const inflight = globalCache.getInflight(cacheKey);
          if (inflight) {
            return inflight;
          }
        }

        // Execute the command (possibly as an inflight request)
        let result: ExecutionResult;
        let executePromise: Promise<ExecutionResult>;
        try {
          executePromise = this.execute(currentCommand);
          
          // Track as inflight if caching is enabled
          if (cacheOptions) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.setInflight(cacheKey, executePromise);
          }
          
          result = await executePromise;
          
          // Store result in cache if enabled AND (successful OR nothrow is set)
          if (cacheOptions && (result.exitCode === 0 || currentCommand.nothrow)) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.set(cacheKey, result, cacheOptions.ttl || 60000); // Default 1 minute TTL
            globalCache.clearInflight(cacheKey);

            // Invalidate related cache entries
            if (cacheOptions.invalidateOn) {
              globalCache.invalidate(cacheOptions.invalidateOn);
            }
          } else if (cacheOptions) {
            // Clear inflight for failed commands that won't be cached
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.clearInflight(cacheKey);
          }
        } catch (error) {
          // Clear inflight on error
          if (cacheOptions) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.clearInflight(cacheKey);
          }
          throw error;
        }

        return result;
      } catch (error) {
        if (pendingModifications.nothrow) {
          // Return error as result
          const errorResult = new ExecutionResultImpl(
            '',
            error instanceof Error ? error.message : String(error),
            1,
            undefined,
            pendingModifications.command || '',
            0,
            new Date(),
            new Date(),
            'local'
          );
          return errorResult;
        }
        throw error;
      }
    };

    const promise = executeCommand() as ProcessPromise;

    // Track active process
    this._activeProcesses.add(promise);
    promise.finally(() => {
      this._activeProcesses.delete(promise);
    });

    // Add stream properties (simplified implementation)
    promise.stdin = null as any;

    // Add method chaining - these methods modify the deferred command
    promise.pipe = (target: PipeTarget, optionsOrFirstValue?: PipeOptions | any, ...args: any[]): ProcessPromise => {
      // Handle overloaded signatures for template literals
      let pipeOptions: PipeOptions = {};
      let templateArgs: any[] = args;

      // If target is template literal and second arg is not options
      if (Array.isArray(target) && 'raw' in target &&
        optionsOrFirstValue !== undefined &&
        (typeof optionsOrFirstValue !== 'object' || optionsOrFirstValue === null ||
          !('throwOnError' in optionsOrFirstValue || 'encoding' in optionsOrFirstValue ||
            'lineByLine' in optionsOrFirstValue || 'lineSeparator' in optionsOrFirstValue))) {
        // It's a template value, not options
        templateArgs = [optionsOrFirstValue, ...args];
        pipeOptions = {};
      } else if (typeof optionsOrFirstValue === 'object' && optionsOrFirstValue !== null) {
        pipeOptions = optionsOrFirstValue;
      }

      // Create a new ProcessPromise that handles piping
      const pipedPromise = (async () => {
        const result = await executePipe(
          promise,
          target,
          this,
          {
            throwOnError: !pendingModifications.nothrow,
            ...pipeOptions
          },
          ...templateArgs
        );
        return result;
      })() as ProcessPromise;

      // Copy over the ProcessPromise methods
      pipedPromise.stdin = null as any;
      pipedPromise.pipe = promise.pipe;
      pipedPromise.signal = promise.signal;
      pipedPromise.timeout = promise.timeout;
      pipedPromise.quiet = promise.quiet;
      pipedPromise.nothrow = promise.nothrow;
      pipedPromise.interactive = promise.interactive;
      pipedPromise.cache = promise.cache;
      pipedPromise.env = promise.env;
      pipedPromise.cwd = promise.cwd;
      pipedPromise.shell = promise.shell;
      pipedPromise.stdout = promise.stdout;
      pipedPromise.stderr = promise.stderr;
      pipedPromise.text = promise.text;
      pipedPromise.json = promise.json;
      pipedPromise.lines = promise.lines;
      pipedPromise.buffer = promise.buffer;
      pipedPromise.kill = promise.kill;

      return pipedPromise;
    };

    promise.signal = (signal: AbortSignal): ProcessPromise => {
      pendingModifications = { ...pendingModifications, signal };
      return promise;
    };

    promise.timeout = (ms: number, timeoutSignal?: string): ProcessPromise => {
      pendingModifications = { ...pendingModifications, timeout: ms };
      if (timeoutSignal) {
        pendingModifications.timeoutSignal = timeoutSignal;
      }
      return promise;
    };

    promise.quiet = (): ProcessPromise => {
      isQuiet = true;
      return promise;
    };

    promise.nothrow = (): ProcessPromise => {
      pendingModifications = { ...pendingModifications, nothrow: true };
      return promise;
    };

    promise.interactive = (): ProcessPromise => {
      pendingModifications = {
        ...pendingModifications,
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: process.stdin as any
      };
      return promise;
    };

    // Configuration methods
    promise.cwd = (dir: string): ProcessPromise => {
      pendingModifications = { ...pendingModifications, cwd: dir };
      return promise;
    };

    promise.env = (env: Record<string, string>): ProcessPromise => {
      pendingModifications = { ...pendingModifications, env: { ...pendingModifications.env, ...env } };
      return promise;
    };

    promise.shell = (shell: string | boolean): ProcessPromise => {
      pendingModifications = { ...pendingModifications, shell };
      return promise;
    };

    // Stream configuration methods
    promise.stdout = (stream: StreamOption): ProcessPromise => {
      pendingModifications = { ...pendingModifications, stdout: stream };
      return promise;
    };

    promise.stderr = (stream: StreamOption): ProcessPromise => {
      pendingModifications = { ...pendingModifications, stderr: stream };
      return promise;
    };

    // Add zx-compatible methods
    promise.text = async (): Promise<string> => {
      const result = await promise;
      return result.stdout.trim();
    };

    promise.json = async <T = any>(): Promise<T> => {
      const text = await promise.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}\nOutput: ${text}`);
      }
    };

    promise.lines = async (): Promise<string[]> => {
      const result = await promise;
      return result.stdout.split('\n').filter(line => line.length > 0);
    };

    promise.buffer = async (): Promise<Buffer> => {
      const result = await promise;
      return Buffer.from(result.stdout);
    };

    promise.cache = (options?: CacheOptions): ProcessPromise => {
      cacheOptions = options || {};
      return promise;
    };

    promise.kill = (signal = 'SIGTERM'): void => {
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      } else if (pendingModifications.signal && typeof pendingModifications.signal.dispatchEvent === 'function') {
        // Trigger abort event on the signal
        const event = new Event('abort');
        pendingModifications.signal.dispatchEvent(event);
      }
      // Additional kill logic would depend on the adapter implementation
    };

    // Add process-related properties
    promise.child = undefined; // Will be set by adapter if available

    Object.defineProperty(promise, 'exitCode', {
      get: () => promise.then(result => result.exitCode)
    });

    return promise;
  }

  // Create a process promise for advanced usage
  createProcessPromise(command: Command): ProcessPromise {
    const currentCommand = { ...command };
    let isQuiet = false;
    let abortController: AbortController | undefined;
    let cacheOptions: CacheOptions | undefined;

    const executeCommand = async (): Promise<ExecutionResult> => {
      try {
        // Create abort controller if not already present
        if (!currentCommand.signal) {
          abortController = new AbortController();
          currentCommand.signal = abortController.signal;
        }

        // Check cache if enabled
        if (cacheOptions) {
          const cacheKey = cacheOptions.key || globalCache.generateKey(
            currentCommand.command || '',
            currentCommand.cwd,
            currentCommand.env
          );

          const cached = globalCache.get(cacheKey);
          if (cached) {
            // Cache hit - returning cached result
            return cached;
          }
          
          // Check if there's an inflight request for this key
          const inflight = globalCache.getInflight(cacheKey);
          if (inflight) {
            return inflight;
          }
        }

        // Execute the command (possibly as an inflight request)
        let result: ExecutionResult;
        let executePromise: Promise<ExecutionResult>;
        try {
          executePromise = this.execute(currentCommand);
          
          // Track as inflight if caching is enabled
          if (cacheOptions) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.setInflight(cacheKey, executePromise);
          }
          
          result = await executePromise;
          
          // Store result in cache if enabled AND (successful OR nothrow is set)
          if (cacheOptions && (result.exitCode === 0 || currentCommand.nothrow)) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.set(cacheKey, result, cacheOptions.ttl || 60000); // Default 1 minute TTL
            globalCache.clearInflight(cacheKey);

            // Invalidate related cache entries
            if (cacheOptions.invalidateOn) {
              globalCache.invalidate(cacheOptions.invalidateOn);
            }
          } else if (cacheOptions) {
            // Clear inflight for failed commands that won't be cached
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.clearInflight(cacheKey);
          }
        } catch (error) {
          // Clear inflight on error
          if (cacheOptions) {
            const cacheKey = cacheOptions.key || globalCache.generateKey(
              currentCommand.command || '',
              currentCommand.cwd,
              currentCommand.env
            );
            globalCache.clearInflight(cacheKey);
          }
          throw error;
        }

        return result;
      } catch (error) {
        if (currentCommand.nothrow) {
          // Return error as result
          const errorResult = new ExecutionResultImpl(
            '',
            error instanceof Error ? error.message : String(error),
            1,
            undefined,
            currentCommand.command || '',
            0,
            new Date(),
            new Date(),
            'local'
          );
          return errorResult;
        }
        throw error;
      }
    };

    const promise = executeCommand() as ProcessPromise;

    // Track active process
    this._activeProcesses.add(promise);
    promise.finally(() => {
      this._activeProcesses.delete(promise);
    });

    // Add stream properties (simplified implementation)
    promise.stdin = null as any;

    // Add method chaining
    promise.pipe = (target: PipeTarget, optionsOrFirstValue?: PipeOptions | any, ...args: any[]): ProcessPromise => {
      // Handle overloaded signatures for template literals
      let pipeOptions: PipeOptions = {};
      let templateArgs: any[] = args;

      // If target is template literal and second arg is not options
      if (Array.isArray(target) && 'raw' in target &&
        optionsOrFirstValue !== undefined &&
        (typeof optionsOrFirstValue !== 'object' || optionsOrFirstValue === null ||
          !('throwOnError' in optionsOrFirstValue || 'encoding' in optionsOrFirstValue ||
            'lineByLine' in optionsOrFirstValue || 'lineSeparator' in optionsOrFirstValue))) {
        // It's a template value, not options
        templateArgs = [optionsOrFirstValue, ...args];
        pipeOptions = {};
      } else if (typeof optionsOrFirstValue === 'object' && optionsOrFirstValue !== null) {
        pipeOptions = optionsOrFirstValue;
      }

      // Create a new ProcessPromise that handles piping
      const pipedPromise = (async () => {
        const result = await executePipe(
          promise,
          target,
          this,
          {
            throwOnError: !currentCommand.nothrow,
            ...pipeOptions
          },
          ...templateArgs
        );
        return result;
      })() as ProcessPromise;

      // Copy over the ProcessPromise methods
      pipedPromise.stdin = null as any;
      pipedPromise.pipe = promise.pipe;
      pipedPromise.signal = promise.signal;
      pipedPromise.timeout = promise.timeout;
      pipedPromise.quiet = promise.quiet;
      pipedPromise.nothrow = promise.nothrow;
      pipedPromise.interactive = promise.interactive;
      pipedPromise.cache = promise.cache;
      pipedPromise.env = promise.env;
      pipedPromise.cwd = promise.cwd;
      pipedPromise.shell = promise.shell;
      pipedPromise.stdout = promise.stdout;
      pipedPromise.stderr = promise.stderr;
      pipedPromise.text = promise.text;
      pipedPromise.json = promise.json;
      pipedPromise.lines = promise.lines;
      pipedPromise.buffer = promise.buffer;
      pipedPromise.kill = promise.kill;

      // Track the piped promise too
      this._activeProcesses.add(pipedPromise);
      pipedPromise.finally(() => {
        this._activeProcesses.delete(pipedPromise);
      });

      return pipedPromise;
    };

    promise.signal = (signal: AbortSignal): ProcessPromise => {
      currentCommand.signal = signal;
      return this.createProcessPromise(currentCommand);
    };

    promise.timeout = (ms: number, timeoutSignal?: string): ProcessPromise => {
      currentCommand.timeout = ms;
      if (timeoutSignal) {
        currentCommand.timeoutSignal = timeoutSignal;
      }
      return this.createProcessPromise(currentCommand);
    };

    promise.quiet = (): ProcessPromise => {
      isQuiet = true;
      return this.createProcessPromise(currentCommand);
    };

    promise.nothrow = (): ProcessPromise => {
      currentCommand.nothrow = true;
      return this.createProcessPromise(currentCommand);
    };

    promise.interactive = (): ProcessPromise => {
      currentCommand.stdout = 'inherit';
      currentCommand.stderr = 'inherit';
      currentCommand.stdin = process.stdin as any;
      return this.createProcessPromise(currentCommand);
    };

    // Configuration methods
    promise.cwd = (dir: string): ProcessPromise => {
      currentCommand.cwd = dir;
      return this.createProcessPromise(currentCommand);
    };

    promise.env = (env: Record<string, string>): ProcessPromise => {
      currentCommand.env = { ...currentCommand.env, ...env };
      return this.createProcessPromise(currentCommand);
    };

    promise.shell = (shell: string | boolean): ProcessPromise => {
      currentCommand.shell = shell;
      return this.createProcessPromise(currentCommand);
    };

    // Stream configuration methods
    promise.stdout = (stream: StreamOption): ProcessPromise => {
      currentCommand.stdout = stream;
      return this.createProcessPromise(currentCommand);
    };

    promise.stderr = (stream: StreamOption): ProcessPromise => {
      currentCommand.stderr = stream;
      return this.createProcessPromise(currentCommand);
    };

    // Add zx-compatible methods
    promise.text = async (): Promise<string> => {
      const result = await promise;
      return result.stdout.trim();
    };

    promise.json = async <T = any>(): Promise<T> => {
      const text = await promise.text();
      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Failed to parse JSON: ${error instanceof Error ? error.message : String(error)}\nOutput: ${text}`);
      }
    };

    promise.lines = async (): Promise<string[]> => {
      const result = await promise;
      return result.stdout.split('\n').filter(line => line.length > 0);
    };

    promise.buffer = async (): Promise<Buffer> => {
      const result = await promise;
      return Buffer.from(result.stdout);
    };

    promise.cache = (options?: CacheOptions): ProcessPromise => {
      cacheOptions = options || {};
      return promise;
    };

    promise.kill = (signal = 'SIGTERM'): void => {
      if (abortController && !abortController.signal.aborted) {
        abortController.abort();
      } else if (currentCommand.signal && typeof currentCommand.signal.dispatchEvent === 'function') {
        // Trigger abort event on the signal
        const event = new Event('abort');
        currentCommand.signal.dispatchEvent(event);
      }
      // Additional kill logic would depend on the adapter implementation
    };

    // Add process-related properties
    promise.child = undefined; // Will be set by adapter if available

    Object.defineProperty(promise, 'exitCode', {
      get: () => promise.then(result => result.exitCode)
    });

    return promise;
  }

  // Adapter selection
  private async selectAdapter(command: Command): Promise<BaseAdapter | null> {
    // Explicit adapter selection
    if (command.adapter && command.adapter !== 'auto') {
      const adapter = this.adapters.get(command.adapter);
      if (!adapter) {
        throw new AdapterError(command.adapter, 'select', new Error(`Adapter '${command.adapter}' not configured`));
      }
      return adapter;
    }

    // Auto-detect based on adapter options
    if (command.adapterOptions) {
      switch (command.adapterOptions.type) {
        case 'ssh':
          return this.adapters.get('ssh') || null;
        case 'docker':
          if (!this.adapters.has('docker')) {
            // Create Docker adapter on demand
            const dockerConfig = {
              ...this.getBaseAdapterConfig(),
              ...this._config.adapters?.docker
            };
            this.adapters.set('docker', new DockerAdapter(dockerConfig));
          }
          return this.adapters.get('docker') || null;
        case 'kubernetes':
          if (!this.adapters.has('kubernetes')) {
            // Create Kubernetes adapter on demand
            const k8sConfig = {
              ...this.getBaseAdapterConfig(),
              ...this._config.adapters?.kubernetes
            };
            this.adapters.set('kubernetes', new KubernetesAdapter(k8sConfig));
          }
          return this.adapters.get('kubernetes') || null;
        case 'remote-docker':
          if (!this.adapters.has('remote-docker')) {
            // Create Remote Docker adapter on demand
            const remoteDockerConfig = this._config.adapters?.remoteDocker;
            if (!remoteDockerConfig || !remoteDockerConfig.ssh) {
              throw new Error('Remote Docker adapter requires SSH configuration');
            }
            const fullConfig = {
              ...this.getBaseAdapterConfig(),
              ...remoteDockerConfig
            };
            this.adapters.set('remote-docker', new RemoteDockerAdapter(fullConfig));
          }
          return this.adapters.get('remote-docker') || null;
        case 'local':
          return this.adapters.get('local') || null;
        default:
          // Unknown adapter type, fall through to default
          break;
      }
    }

    // Default to local
    return this.adapters.get('local') || null;
  }

  // Enhanced retry method
  retry(options: RetryOptions = {}): ExecutionEngine {
    const originalExecute = this.execute.bind(this);

    const newEngine = Object.create(this);
    newEngine.execute = async (cmd: Command): Promise<ExecutionResult> => {
      // Merge command retry options with method options
      const retryOptions = { ...options, ...cmd.retry };

      try {
        return await withExecutionRetry(
          () => originalExecute(cmd),
          retryOptions,
          this
        );
      } catch (error) {
        // If nothrow is set and it's a RetryError, return the last result
        if (cmd.nothrow && error instanceof RetryError) {
          return error.lastResult;
        }
        throw error;
      }
    };

    return newEngine;
  }

  // Enhanced temp methods
  async tempFile(options?: TempOptions): Promise<TempFile> {
    const file = new TempFile({ ...options, emitter: this });
    await file.create();
    this._tempTracker.add(file);
    return file;
  }

  async tempDir(options?: TempOptions): Promise<TempDir> {
    const dir = new TempDir({ ...options, emitter: this });
    await dir.create();
    this._tempTracker.add(dir);
    return dir;
  }

  async withTempFile<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T> {
    const file = new TempFile({ ...options, emitter: this });
    try {
      await file.create();
      return await fn(file.path);
    } finally {
      await file.cleanup();
    }
  }

  async withTempDir<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T> {
    const dir = new TempDir({ ...options, emitter: this });
    try {
      await dir.create();
      return await fn(dir.path);
    } finally {
      await dir.cleanup();
    }
  }

  // File operation helpers with events
  async readFile(path: string): Promise<string> {
    const result = await this.execute({
      command: 'cat',
      args: [path],
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:read event
      this.emitEvent('file:read', {
        path
      });
      return result.stdout;
    } else {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }
  }

  async writeFile(path: string, content: string): Promise<void> {
    const result = await this.execute({
      command: 'tee',
      args: [path],
      stdin: content,
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:write event
      this.emitEvent('file:write', {
        path,
        size: Buffer.byteLength(content, 'utf8')
      });
    } else {
      throw new Error(`Failed to write file ${path}: ${result.stderr}`);
    }
  }

  async deleteFile(path: string): Promise<void> {
    const result = await this.execute({
      command: 'rm',
      args: ['-f', path],
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:delete event
      this.emitEvent('file:delete', {
        path
      });
    } else {
      throw new Error(`Failed to delete file ${path}: ${result.stderr}`);
    }
  }

  // Enhanced interactive method  
  interactive(): ExecutionEngine {
    const newEngine = Object.create(this);
    // Apply interactive configuration
    newEngine.currentConfig = {
      ...this.currentConfig,
      stdout: 'inherit',
      stderr: 'inherit',
      stdin: process.stdin
    };
    return newEngine;
  }

  // Enhanced spinner method
  async withSpinner<T>(text: string, fn: () => T | Promise<T>): Promise<T> {
    const s = new Spinner(text);
    s.start();
    try {
      const result = await fn();
      s.succeed();
      return result;
    } catch (error) {
      s.fail();
      throw error;
    }
  }

  // Configuration methods
  with(config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }): ExecutionEngine {
    // Check for local context from within()
    const localContext = asyncLocalStorage.getStore();
    const mergedConfig = localContext
      ? { ...localContext, ...config }
      : config;

    // Extract default* properties from command config
    const { defaultEnv, defaultCwd, ...commandConfig } = mergedConfig;

    // Create new config if defaults are provided
    const engineConfig = (defaultEnv !== undefined || defaultCwd !== undefined) ? {
      ...this._config,
      defaultEnv: defaultEnv ?? this._config.defaultEnv,
      defaultCwd: defaultCwd ?? this._config.defaultCwd
    } : this._config;

    // Create new engine with potentially updated config
    const newEngine = new ExecutionEngine(engineConfig, this.adapters);
    newEngine.currentConfig = { ...this.currentConfig, ...commandConfig };
    return newEngine;
  }

  ssh(options: Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext {
    return createSSHExecutionContext(this, options);
  }

  docker(options: DockerContainerConfig): DockerContext;
  docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine;
  docker(options: DockerContainerConfig | Omit<DockerAdapterOptions, 'type'>): ExecutionEngine | DockerContext {
    // If image is provided, return the enhanced Docker API
    if ('image' in options) {
      return createDockerContext(this, options as DockerContainerConfig);
    }

    // Otherwise, return standard execution engine for existing container
    return this.with({
      adapter: 'docker',
      adapterOptions: { type: 'docker', ...options }
    });
  }

  k8s(options?: Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext {
    // If no options provided, return a context that requires pod() to be called
    return createK8sExecutionContext(this, options || {});
  }

  remoteDocker(options: Omit<RemoteDockerAdapterOptions, 'type'>): ExecutionEngine {
    return this.with({
      adapter: 'remote-docker',
      adapterOptions: { type: 'remote-docker', ...options }
    });
  }

  local(): ExecutionEngine {
    return this.with({
      adapter: 'local',
      adapterOptions: { type: 'local' }
    });
  }

  cd(dir: string): ExecutionEngine {
    // Get current working directory
    const currentCwd = this.currentConfig.cwd || this._config.defaultCwd || process.cwd();

    let resolvedPath: string;

    // Handle tilde expansion
    if (dir.startsWith('~')) {
      const homedir = os.homedir();
      resolvedPath = path.join(homedir, dir.slice(1));
    }
    // Handle relative paths
    else if (!path.isAbsolute(dir)) {
      resolvedPath = path.resolve(currentCwd, dir);
    }
    // Handle absolute paths
    else {
      resolvedPath = dir;
    }

    return this.with({ cwd: resolvedPath });
  }

  /**
   * Get the current working directory
   * @returns The current working directory path
   */
  pwd(): string {
    return this.currentConfig.cwd || this._config.defaultCwd || process.cwd();
  }

  /**
   * Execute commands in batches with limited concurrency
   * @param commands Array of commands to execute
   * @param options Batching options including concurrency and progress callback
   * @returns Promise resolving to parallel execution results
   * @example
   * const results = await $.batch(commands, {
   *   concurrency: 5,
   *   onProgress: (completed, total) => console.log(`${completed}/${total}`)
   * });
   */
  async batch(
    commands: Array<string | Command>,
    options: ParallelOptions & { concurrency?: number } = {}
  ): Promise<ParallelResult> {
    // Ensure concurrency is set (alias for maxConcurrency)
    const batchOptions: ParallelOptions = {
      ...options,
      maxConcurrency: options.concurrency || options.maxConcurrency || 5
    };

    return this.parallel.settled(commands, batchOptions);
  }

  env(env: Record<string, string>): ExecutionEngine {
    return this.with({
      env: { ...this.currentConfig.env, ...env }
    });
  }

  timeout(ms: number): ExecutionEngine {
    return this.with({ timeout: ms });
  }

  shell(shell: string | boolean): ExecutionEngine {
    return this.with({ shell });
  }

  /**
   * Mutable configuration object that allows updating global settings
   * without recreating the engine instance
   */
  get config() {
    const self = this;
    return {
      /**
       * Set configuration values without recreating the engine
       * @example
       * $.config.set({ timeout: 30000, shell: '/bin/bash' });
       */
      set(updates: Partial<ExecutionEngineConfig>): void {
        // Deep merge for certain properties
        if (updates.defaultEnv) {
          self._config.defaultEnv = { ...self._config.defaultEnv, ...updates.defaultEnv };
          delete updates.defaultEnv;
        }

        // Shallow merge for the rest
        Object.assign(self._config, updates);

        // Update adapters with new config if needed
        if (updates.adapters) {
          self.updateAdapterConfigs(updates.adapters);
        }
      },

      /**
       * Get current configuration
       */
      get(): Readonly<ExecutionEngineConfig> {
        return { ...self._config };
      }
    };
  }

  /**
   * Set default configuration for subsequent commands
   * @example
   * $.defaults({ timeout: 5000, cwd: '/tmp' });
   */
  defaults(config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }): ExecutionEngine {
    // Create a new engine with the updated defaults
    const newConfig: Partial<ExecutionEngineConfig> = {};

    if (config.defaultEnv) {
      newConfig.defaultEnv = { ...this._config.defaultEnv, ...config.defaultEnv };
    }
    if (config.defaultCwd) {
      newConfig.defaultCwd = config.defaultCwd;
    }
    if (config.timeout !== undefined) {
      newConfig.defaultTimeout = config.timeout;
    }
    if (config.shell !== undefined) {
      newConfig.defaultShell = config.shell;
    }

    // Create new engine with updated config
    // Don't pass existing adapters - let the new engine create fresh adapters with the new config
    const newEngine = new ExecutionEngine({ ...this._config, ...newConfig });

    // Copy current command config
    Object.assign(newEngine.currentConfig, this.currentConfig);

    // Apply remaining command-level defaults
    const { defaultEnv, defaultCwd, timeout, shell, ...commandDefaults } = config;
    Object.assign(newEngine.currentConfig, commandDefaults);

    return newEngine;
  }

  private updateAdapterConfigs(adapterConfigs: ExecutionEngineConfig['adapters']): void {
    if (!adapterConfigs) return;

    // Update existing adapter configurations
    for (const [name, config] of Object.entries(adapterConfigs)) {
      const adapter = this.adapters.get(name);
      if (adapter && 'updateConfig' in adapter && typeof adapter.updateConfig === 'function') {
        adapter.updateConfig(config);
      }
    }
  }

  // Utility methods
  async which(command: string): Promise<string | null> {
    try {
      const result = await this.run`which ${command}`.nothrow();
      const path = result.stdout.trim();
      // If which returns empty output or non-zero exit, command not found
      return (path && result.exitCode === 0) ? path : null;
    } catch {
      return null;
    }
  }

  async isCommandAvailable(command: string): Promise<boolean> {
    const path = await this.which(command);
    return path !== null;
  }

  async commandExists(command: string): Promise<boolean> {
    return this.isCommandAvailable(command);
  }

  /**
   * Dispose of all resources held by this ExecutionEngine.
   * This includes all adapters and clears internal state.
   */
  async dispose(): Promise<void> {
    // Cancel all active processes
    for (const process of this._activeProcesses) {
      try {
        process.kill('SIGTERM');
      } catch {
        // Ignore errors when killing processes
      }
    }
    this._activeProcesses.clear();

    // Clean up temp files
    for (const temp of this._tempTracker) {
      try {
        await temp.cleanup();
      } catch {
        // Ignore cleanup errors
      }
    }
    this._tempTracker.clear();

    // Dispose all adapters
    const disposePromises: Promise<void>[] = [];
    for (const adapter of this.adapters.values()) {
      if ('dispose' in adapter && typeof adapter.dispose === 'function') {
        disposePromises.push(adapter.dispose());
      }
    }

    // Wait for all adapters to dispose, but don't let one failure stop others
    await Promise.allSettled(disposePromises);

    // Clear the adapters map
    this.adapters.clear();

    // Clear lazy-loaded resources
    this._parallel = undefined;
    this._transfer = undefined;

    // Remove all event listeners
    this.removeAllListeners();

    // Clear current config
    this.currentConfig = {};
  }

  // Get adapter for advanced usage
  getAdapter(name: string): BaseAdapter | undefined {
    return this.adapters.get(name);
  }

  // Register custom adapter
  registerAdapter(name: string, adapter: BaseAdapter): void {
    this.adapters.set(name, adapter);
  }

}

