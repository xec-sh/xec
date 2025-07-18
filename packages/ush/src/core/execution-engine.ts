import { Readable } from 'node:stream';

import { pipe } from '../utils/pipe.js';
import { AdapterError } from './error.js';
import { stream } from '../utils/stream.js';
import { ExecutionResult } from './result.js';
import { TransferEngine } from '../utils/transfer.js';
import { ParallelEngine } from '../utils/parallel.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
import { interpolate, interpolateRaw } from '../utils/shell-escape.js';
import { CommandTemplate, TemplateOptions } from '../utils/templates.js';
import { SSHAdapter, SSHAdapterConfig } from '../adapters/ssh-adapter.js';
import { within, withinSync, asyncLocalStorage } from '../utils/within.js';
import { LocalAdapter, LocalAdapterConfig } from '../adapters/local-adapter.js';
import { DockerAdapter, DockerAdapterConfig } from '../adapters/docker-adapter.js';
import { select, confirm, Spinner, question, password } from '../utils/interactive.js';
import { KubernetesAdapter, KubernetesAdapterConfig } from '../adapters/kubernetes-adapter.js';
import { RemoteDockerAdapter, RemoteDockerAdapterConfig } from '../adapters/remote-docker-adapter.js';
// Core features imports
import { withRetry as withRetryFunction, RetryOptions as RetryAdapterOptions } from '../utils/retry-adapter.js';
import { TempDir, TempFile, TempOptions, withTempDir as _withTempDir, withTempFile as _withTempFile } from '../utils/temp.js';
import { Command, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions, RemoteDockerAdapterOptions } from './command.js';


export interface ExecutionEngineConfig {
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
  stdout: Readable;
  stderr: Readable;
  stdin: NodeJS.WritableStream;
  pipe(target: ProcessPromise | ExecutionEngine | NodeJS.WritableStream | TemplateStringsArray, ...args: any[]): ProcessPromise;
  signal(signal: AbortSignal): ProcessPromise;
  timeout(ms: number, timeoutSignal?: string): ProcessPromise;
  quiet(): ProcessPromise;
  nothrow(): ProcessPromise;
  interactive(): ProcessPromise;
  kill(signal?: string): void;
  // Configuration methods
  cwd(dir: string): ProcessPromise;
  env(env: Record<string, string>): ProcessPromise;
  shell(shell: string | boolean): ProcessPromise;
  // New methods for zx compatibility
  text(): Promise<string>;
  json<T = any>(): Promise<T>;
  lines(): Promise<string[]>;
  buffer(): Promise<Buffer>;
  // Process-related properties
  child?: any;
  exitCode: Promise<number | null>;
}

export class ExecutionEngine {
  // Core features
  // Removed retry and expBackoff - use command-level retry options instead
  public readonly pipe = pipe;
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
  
  public readonly config: ExecutionEngineConfig;
  private adapters: Map<string, BaseAdapter> = new Map();
  private currentConfig: Partial<Command> = {};

  constructor(config: ExecutionEngineConfig = {}) {
    this.config = this.validateConfig(config);
    this.initializeAdapters();
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
    
    // Set defaults
    validatedConfig.defaultTimeout = config.defaultTimeout ?? 30000;
    validatedConfig.throwOnNonZeroExit = config.throwOnNonZeroExit ?? false;
    validatedConfig.encoding = config.encoding ?? 'utf8';
    validatedConfig.maxBuffer = config.maxBuffer ?? 10 * 1024 * 1024;
    
    return validatedConfig;
  }

  private initializeAdapters(): void {
    // Initialize local adapter (always available)
    const localConfig = {
      ...this.getBaseAdapterConfig(),
      ...this.config.adapters?.local,
      preferBun: this.config.runtime?.preferBun
    };
    this.adapters.set('local', new LocalAdapter(localConfig));

    // Initialize SSH adapter if config provided
    if (this.config.adapters?.ssh) {
      const sshConfig = {
        ...this.getBaseAdapterConfig(),
        ...this.config.adapters.ssh
      };
      this.adapters.set('ssh', new SSHAdapter(sshConfig));
    }

    // Initialize Docker adapter if config provided
    if (this.config.adapters?.docker) {
      const dockerConfig = {
        ...this.getBaseAdapterConfig(),
        ...this.config.adapters.docker
      };
      this.adapters.set('docker', new DockerAdapter(dockerConfig));
    }
    // Initialize Kubernetes adapter if config provided
    if (this.config.adapters?.kubernetes) {
      const k8sConfig = {
        ...this.getBaseAdapterConfig(),
        ...this.config.adapters.kubernetes
      };
      this.adapters.set('kubernetes', new KubernetesAdapter(k8sConfig));
    }
    
    // Initialize Remote Docker adapter if config provided
    if (this.config.adapters?.remoteDocker) {
      const remoteDockerConfig = {
        ...this.getBaseAdapterConfig(),
        ...this.config.adapters.remoteDocker
      };
      this.adapters.set('remote-docker', new RemoteDockerAdapter(remoteDockerConfig));
    }
  }

  private getBaseAdapterConfig() {
    return {
      defaultTimeout: this.config.defaultTimeout,
      defaultCwd: this.config.defaultCwd,
      defaultEnv: this.config.defaultEnv,
      defaultShell: this.config.defaultShell,
      encoding: this.config.encoding,
      maxBuffer: this.config.maxBuffer,
      throwOnNonZeroExit: this.config.throwOnNonZeroExit
    };
  }

  // Main execution method
  async execute(command: Command): Promise<ExecutionResult> {
    // Check for local context from within()
    const localContext = asyncLocalStorage.getStore();
    const contextCommand = localContext
      ? { ...localContext, ...command }
      : command;
      
    const mergedCommand = { ...this.currentConfig, ...contextCommand };
    const adapter = await this.selectAdapter(mergedCommand);
    
    if (!adapter) {
      throw new AdapterError('unknown', 'execute', new Error('No suitable adapter found'));
    }

    // Apply retry logic if retry options are specified in the command
    if (mergedCommand.retry && mergedCommand.retry.maxAttempts && mergedCommand.retry.maxAttempts > 0) {
      return withRetryFunction(
        () => adapter.execute(mergedCommand), 
        mergedCommand.retry
      );
    }

    return adapter.execute(mergedCommand);
  }

  // Template literal support
  run(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    const command = interpolate(strings, ...values);
    return this.createProcessPromise({ 
      command,
      shell: this.currentConfig.shell ?? true
    });
  }

  // Raw template literal support (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    const command = interpolateRaw(strings, ...values);
    return this.createProcessPromise({ 
      command,
      shell: this.currentConfig.shell ?? true
    });
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

  // Create a process promise for advanced usage
  createProcessPromise(command: Command): ProcessPromise {
    const currentCommand = { ...command };
    let isQuiet = false;
    let noThrow = false;

    const executeCommand = async (): Promise<ExecutionResult> => {
      try {
        const result = await this.execute(currentCommand);
        return result;
      } catch (error) {
        if (noThrow) {
          // Return error as result
          return {
            stdout: '',
            stderr: error instanceof Error ? error.message : String(error),
            exitCode: 1,
            signal: undefined,
            command: currentCommand.command,
            duration: 0,
            startedAt: new Date(),
            finishedAt: new Date(),
            adapter: 'unknown'
          } as ExecutionResult;
        }
        throw error;
      }
    };

    const promise = executeCommand() as ProcessPromise;

    // Add stream properties (simplified implementation)
    promise.stdout = null as any;
    promise.stderr = null as any;
    promise.stdin = null as any;

    // Add method chaining
    promise.pipe = (target: ProcessPromise | ExecutionEngine | NodeJS.WritableStream | TemplateStringsArray, ...args: any[]): ProcessPromise => {
      // Simplified pipe implementation
      throw new Error('Piping not yet implemented in simplified version');
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
      noThrow = true;
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

    promise.kill = (signal = 'SIGTERM'): void => {
      if (currentCommand.signal && typeof currentCommand.signal.dispatchEvent === 'function') {
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
          return this.adapters.get('docker') || null;
        case 'kubernetes':
          return this.adapters.get('kubernetes') || null;
        case 'remote-docker':
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
  withRetry(options: RetryAdapterOptions = {}): ExecutionEngine {
    const originalExecute = this.execute.bind(this);
    
    const newEngine = Object.create(this);
    newEngine.execute = async (cmd: Command): Promise<ExecutionResult> => {
      // Merge command retry options with method options
      const retryOptions = { ...options, ...cmd.retry };
      return withRetryFunction(() => originalExecute(cmd), retryOptions);
    };
    
    return newEngine;
  }

  // Enhanced temp methods
  async tempFile(options?: TempOptions): Promise<TempFile> {
    const file = new TempFile(options);
    await file.create();
    return file;
  }

  async tempDir(options?: TempOptions): Promise<TempDir> {
    const dir = new TempDir(options);
    await dir.create();
    return dir;
  }

  async withTempFile<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T> {
    return _withTempFile(async (file) => fn(file.path), options);
  }

  async withTempDir<T>(fn: (path: string) => T | Promise<T>, options?: TempOptions): Promise<T> {
    return _withTempDir(async (dir) => fn(dir.path), options);
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
      ...this.config,
      defaultEnv: defaultEnv ?? this.config.defaultEnv,
      defaultCwd: defaultCwd ?? this.config.defaultCwd
    } : this.config;
    
    // Create new engine with potentially updated config
    const newEngine = new ExecutionEngine(engineConfig);
    newEngine.currentConfig = { ...this.currentConfig, ...commandConfig };
    newEngine.adapters = this.adapters; // Share adapter instances
    return newEngine;
  }

  ssh(options: Omit<SSHAdapterOptions, 'type'>): ExecutionEngine {
    return this.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...options }
    });
  }

  docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine {
    return this.with({
      adapter: 'docker',
      adapterOptions: { type: 'docker', ...options }
    });
  }
  
  kubernetes(options: Omit<KubernetesAdapterOptions, 'type'>): ExecutionEngine {
    return this.with({
      adapter: 'kubernetes',
      adapterOptions: { type: 'kubernetes', ...options }
    });
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
    return this.with({ cwd: dir });
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

  // Utility methods
  async which(command: string): Promise<string | null> {
    try {
      const result = await this.run`which ${command}`;
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

  // Cleanup
  async dispose(): Promise<void> {
    for (const adapter of this.adapters.values()) {
      if ('dispose' in adapter && typeof adapter.dispose === 'function') {
        await adapter.dispose();
      }
    }
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

