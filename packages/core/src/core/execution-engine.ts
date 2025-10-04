import * as os from 'os';
import * as path from 'path';

import { AdapterError } from './error.js';
import { stream } from '../utils/stream.js';
import { ExecutionResult } from './result.js';
import { TransferEngine } from '../utils/transfer.js';
import { SSHAdapter } from '../adapters/ssh/index.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
import { EnhancedEventEmitter } from '../utils/event-emitter.js';
import { TempDir, TempFile, TempOptions } from '../utils/temp.js';
import { interpolate, interpolateRaw } from '../utils/shell-escape.js';
import { CommandTemplate, TemplateOptions } from '../utils/templates.js';
import { DockerFluentAPI } from '../adapters/docker/docker-fluent-api.js';
import { within, withinSync, asyncLocalStorage } from '../utils/within.js';
import { ProcessContext, ProcessPromiseBuilder } from './process-context.js';

// Global handler for unhandled promise rejections from xec promises
// This prevents Node.js from logging unhandled rejection warnings for xec promises
// that will be handled later when awaited or chained
let unhandledRejectionHandler: ((reason: any, promise: Promise<any>) => void) | null = null;

function setupUnhandledRejectionHandler() {
  if (unhandledRejectionHandler) return; // Already set up

  unhandledRejectionHandler = (reason: any, promise: Promise<any>) => {
    // Check if this is an xec promise by looking for xec-specific error types or properties
    const isXecPromise = (promise as any).__isXecPromise ||
      (reason && reason.code === 'COMMAND_FAILED') ||
      (reason && reason.constructor && reason.constructor.name === 'CommandError');

    if (isXecPromise) {
      // Suppress the unhandled rejection warning for xec promises
      // They will be handled when awaited or chained
      return;
    }

    // For non-xec promises, log the unhandled rejection as usual
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  };

  process.on('unhandledRejection', unhandledRejectionHandler);
}

// Set up the handler when this module is loaded
setupUnhandledRejectionHandler();
import { LocalAdapter } from '../adapters/local/index.js';
import { DockerAdapter } from '../adapters/docker/index.js';
import { KubernetesAdapter } from '../adapters/kubernetes/index.js';
import { ParallelEngine, ParallelResult, ParallelOptions } from '../utils/parallel.js';
import { select, confirm, Spinner, question, password } from '../utils/interactive.js';
import { RetryError, RetryOptions, withExecutionRetry } from '../utils/retry-adapter.js';
import { SSHExecutionContext, createSSHExecutionContext } from '../adapters/ssh/ssh-api.js';
import { K8sExecutionContext, createK8sExecutionContext } from '../adapters/kubernetes/kubernetes-api.js';
import { Command, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions } from '../types/command.js';

import type { UshEventMap } from '../types/events.js';
import type { Disposable } from '../types/disposable.js';
import type { ProcessPromise } from '../types/process.js';
import type { DockerOptions, ExecutionEngineConfig, DockerEphemeralOptions, DockerPersistentOptions } from '../types/execution.js';

export { ProcessPromise } from '../types/process.js';
export { DockerOptions, ExecutionEngineConfig, DockerEphemeralOptions, DockerPersistentOptions } from '../types/execution.js';

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

  // Optimized process promise builder
  private processBuilder = new ProcessPromiseBuilder(this);

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
      ...this._config.adapters?.local
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

    // Initialize Docker adapter (always available for lazy loading)
    const dockerConfig = {
      ...this.getBaseAdapterConfig(),
      ...this._config.adapters?.docker
    };
    this.adapters.set('docker', new DockerAdapter(dockerConfig));
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

    // Merge defaultEnv from config if not already in the command
    const finalCommand = {
      ...this.currentConfig,
      ...contextCommand,
      env: {
        ...(this._config.defaultEnv || {}),
        ...(contextCommand.env || {})
      }
    };
    const mergedCommand = finalCommand;
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

  // Optimized: Create a deferred process promise (reduced from 298 lines to 3 lines!)
  createDeferredProcessPromise(commandResolver: () => Promise<Partial<Command>>): ProcessPromise {
    return this.processBuilder.createProcessPromise(commandResolver);
  }

  // Helper method for context-based creation
  createProcessPromiseWithContext(context: ProcessContext): ProcessPromise {
    return this.processBuilder.createProcessPromiseWithContext(context);
  }

  // Optimized: Create a process promise (reduced from 289 lines to 3 lines!)
  createProcessPromise(command: Command): ProcessPromise {
    return this.processBuilder.createProcessPromise(command);
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

    // Create a new ProcessPromiseBuilder that references the new engine
    // This ensures that when template literals are used, they call the modified execute
    newEngine.processBuilder = new ProcessPromiseBuilder(newEngine);

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

  // Overloaded signatures for fluent API and adapter configuration
  docker(options: DockerOptions): ExecutionEngine;
  docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine;
  docker(): DockerFluentAPI;
  docker(options?: DockerOptions | Omit<DockerAdapterOptions, 'type'>): ExecutionEngine | DockerFluentAPI {
    // If no options provided, return fluent API
    if (!options) {
      if (!this._dockerFluentAPI) {
        this._dockerFluentAPI = new DockerFluentAPI(this);
      }
      return this._dockerFluentAPI;
    }

    if ('image' in options) {
      // Ephemeral container flow
      const ephemeralOptions = options as DockerEphemeralOptions;
      const containerName = this.generateEphemeralContainerName(ephemeralOptions.image);

      return this.with({
        adapter: 'docker',
        adapterOptions: {
          type: 'docker',
          container: containerName,
          runMode: 'run',
          image: ephemeralOptions.image,
          volumes: ephemeralOptions.volumes,
          autoRemove: true, // Always true for ephemeral
          workdir: ephemeralOptions.workdir,
          user: ephemeralOptions.user,
          env: ephemeralOptions.env,
          // Additional options not in current DockerAdapterOptions but would be passed through
        } as DockerAdapterOptions
      });
    } else {
      // Persistent container flow
      const persistentOptions = options as DockerPersistentOptions;
      return this.with({
        adapter: 'docker',
        adapterOptions: {
          type: 'docker',
          container: persistentOptions.container,
          workdir: persistentOptions.workdir,
          user: persistentOptions.user,
          env: persistentOptions.env
        } as DockerAdapterOptions
      });
    }
  }

  private generateEphemeralContainerName(image: string): string {
    // Extract image name from full image string (e.g., "registry.com/org/image:tag" -> "image")
    const imageWithoutTag = image.split(':')[0] || image;
    const imageParts = imageWithoutTag.split('/');
    const imageName = imageParts[imageParts.length - 1] || 'container';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `xec-${imageName}-${timestamp}-${random}`;
  }

  // Lazy-loaded fluent Docker API
  private _dockerFluentAPI?: any;

  k8s(options?: Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext {
    // If no options provided, return a context that requires pod() to be called
    return createK8sExecutionContext(this, options || {});
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
    return await this.which(command) !== null;
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
