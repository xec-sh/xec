import type { UshEventMap } from '../types/events.js';
import type { Disposable } from '../types/disposable.js';
import type { ProcessPromise } from '../types/process.js';
import type { DockerOptions, ExecutionEngineConfig, DockerEphemeralOptions, DockerPersistentOptions } from '../types/execution.js';

import * as os from 'os';
import * as path from 'path';

import { AdapterError } from './error.js';
import { stream } from '../utils/stream.js';
import { ExecutionResult } from './result.js';
import { TransferEngine } from '../utils/transfer.js';
import { SSHAdapter } from '../adapters/ssh/index.js';
import { BaseAdapter } from '../adapters/base-adapter.js';
// Note: Unhandled rejection handling is managed centrally in index.ts
// using branded symbols (XEC_PROMISE_BRAND) instead of fragile string checks
import { LocalAdapter } from '../adapters/local/index.js';
import { DockerAdapter } from '../adapters/docker/index.js';
import { EnhancedEventEmitter } from '../utils/event-emitter.js';
import { TempDir, TempFile, TempOptions } from '../utils/temp.js';
import { parseDuration, type Duration } from '../utils/helpers.js';
import { KubernetesAdapter } from '../adapters/kubernetes/index.js';
import { createOptimizedMasker } from '../utils/optimized-masker.js';
import { CommandTemplate, TemplateOptions } from '../utils/templates.js';
import { DockerFluentAPI } from '../adapters/docker/docker-fluent-api.js';
import { within, withinSync, asyncLocalStorage } from '../utils/within.js';
import { ProcessContext, ProcessPromiseBuilder } from './process-context.js';
import { parseK8sTarget, parseSSHTarget } from '../utils/target-shorthand.js';
import { ParallelEngine, ParallelResult, ParallelOptions } from '../utils/parallel.js';
import { select, confirm, Spinner, question, password } from '../utils/interactive.js';
import { RetryError, RetryOptions, withExecutionRetry } from '../utils/retry-adapter.js';
import { SSHExecutionContext, createSSHExecutionContext } from '../adapters/ssh/ssh-api.js';
import { DEFAULT_REDACTION, createDefaultSensitivePatterns } from '../utils/sensitive-patterns.js';
import { K8sExecutionContext, createK8sExecutionContext } from '../adapters/kubernetes/kubernetes-api.js';
import { Command, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions } from '../types/command.js';
import {
  dialectFor,
  quoteForShell,
  interpolateRaw,
  interpolateForShell,
  isTemplateStringsArray,
} from '../utils/shell-escape.js';

export type { ProcessPromise } from '../types/process.js';
export type { DockerOptions, ExecutionEngineConfig, DockerEphemeralOptions, DockerPersistentOptions } from '../types/execution.js';

/**
 * Redact credentials from a string before it is published to event listeners.
 *
 * Events reach loggers, telemetry sinks and user code, so anything emitted
 * from them must already be safe to persist.
 */
const maskSecrets = createOptimizedMasker(createDefaultSensitivePatterns(), DEFAULT_REDACTION);

/**
 * Reject a tagged-template method invoked as an ordinary function.
 *
 * `run`/`raw` iterate `strings` as template segments. Handed a plain string
 * they iterate its *characters*, splicing each argument between them:
 * `run('echo hello', { cwd: '/tmp' })` produced the command
 * `e'{"cwd":"/tmp"}'cho hello`. That corruption was silent, so callers with a
 * command already in a variable worked around it instead of reporting it.
 *
 * @param strings - The value received in the `strings` position.
 * @param method - Method name, used in the error message.
 * @throws {TypeError} When the call is not a tagged template.
 */
function assertTaggedTemplate(strings: unknown, method: 'run' | 'raw'): void {
  // A genuine tagged template, or a plain array of segments — the latter is a
  // long-standing way to build a command programmatically and is unambiguous.
  if (isTemplateStringsArray(strings) || Array.isArray(strings)) {
    return;
  }

  throw new TypeError(
    `$.${method} is a tagged template and must be called as $.${method}\`command\`, ` +
      `not as $.${method}(...). ` +
      (typeof strings === 'string'
        ? `Passing a command string directly interleaves the remaining arguments ` +
          `between its characters. Use $.exec(command, options) for a command ` +
          `you already have as a string, or $\`\${command}\` to interpolate ` +
          `values safely.`
        : `Received ${Object.prototype.toString.call(strings)}.`)
  );
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

    // Normalize before validating, so a duration string is checked as the
    // number it means rather than compared against zero as a string.
    if (config.defaultTimeout !== undefined) {
      const ms = parseDuration(config.defaultTimeout);

      if (!Number.isFinite(ms) || ms < 0) {
        throw new Error(`Invalid timeout value: ${config.defaultTimeout}`);
      }
      validatedConfig.defaultTimeout = ms;
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

      // Spreading the command wholesale let an explicitly-undefined key win:
      // a command object carrying `cwd: undefined` — which is what building
      // one from optional fields produces — clobbered the scope's directory,
      // so `within('/tmp', …)` set a cwd that was immediately erased.
      const explicit = Object.fromEntries(
        Object.entries(command).filter(([, value]) => value !== undefined)
      ) as typeof command;

      contextCommand = {
        ...otherContext,
        ...explicit,
        env: {
          ...(defaultEnv || {}),
          ...(command.env || {})
        }
      };
    }

    // defaultEnv and defaultCwd are both engine-level, so both are resolved
    // here. Leaving the directory to the adapter used to lose it: `with()`
    // reuses the parent's adapters to keep connection pools alive, and each
    // adapter holds the `defaultCwd` it was constructed with — so a directory
    // set on the new engine never reached the command.
    // A duration string reaching setTimeout unparsed became NaN, which Node
    // clamps to 1ms — so `{ timeout: '5m' }` failed every command instantly
    // while the message claimed five minutes had passed. Normalized here so
    // every spelling of the option behaves like `.timeout()`.
    const requestedTimeout = contextCommand.timeout ?? this.currentConfig.timeout;

    const finalCommand = {
      ...this.currentConfig,
      ...contextCommand,
      cwd: contextCommand.cwd ?? this.currentConfig.cwd ?? this._config.defaultCwd,
      timeout: requestedTimeout === undefined ? undefined : parseDuration(requestedTimeout),
      env: {
        ...(this._config.defaultEnv || {}),
        ...(contextCommand.env || {})
      }
    };
    // Apply prefix/postfix to command string if configured
    const prefix = this._config.prefix || '';
    const postfix = this._config.postfix || '';
    if ((prefix || postfix) && finalCommand.command && finalCommand.shell !== false) {
      finalCommand.command = `${prefix}${finalCommand.command}${postfix}`;
    }

    // Resolve preferLocal: prepend node_modules/.bin to PATH
    if (this._config.preferLocal && finalCommand.env) {
      const localBin = typeof this._config.preferLocal === 'string'
        ? this._config.preferLocal
        : path.join(finalCommand.cwd || process.cwd(), 'node_modules', '.bin');
      finalCommand.env['PATH'] = `${localBin}:${finalCommand.env['PATH'] || process.env['PATH'] || ''}`;
    }

    const mergedCommand = finalCommand;
    const adapter = await this.selectAdapter(mergedCommand);

    if (!adapter) {
      throw new AdapterError('unknown', 'execute', new Error('No suitable adapter found'));
    }

    // The zx-style debugging aid: echo each command before it runs. This
    // config flag existed and was consumed nowhere — a declared option that
    // silently did nothing. Redacted with the same rules as every event.
    if (this._config.verbose) {
      process.stderr.write(`$ ${maskSecrets(mergedCommand.command || '')}\n`);
    }

    // Emit start event. The command is redacted and only environment variable
    // *names* are published — the values routinely hold credentials.
    this.emitEvent('command:start', {
      command: maskSecrets(mergedCommand.command || ''),
      args: mergedCommand.args,
      cwd: mergedCommand.cwd,
      shell: typeof mergedCommand.shell === 'boolean' ? mergedCommand.shell : !!mergedCommand.shell,
      envKeys: mergedCommand.env ? Object.keys(mergedCommand.env) : undefined
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
        command: maskSecrets(mergedCommand.command || ''),
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      // Emit error event
      this.emitEvent('command:error', {
        command: maskSecrets(mergedCommand.command || ''),
        error: maskSecrets(error instanceof Error ? error.message : String(error)),
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
    assertTaggedTemplate(strings, 'run');

    // Create a deferred command that will await thenables before execution
    const deferredCommand = async () => {
      const resolvedValues = await this.awaitThenables(values);
      // Quote for the shell that will actually parse this command, so that
      // `.shell('pwsh')` on Linux or a cmd.exe target get correct escaping.
      const command = interpolateForShell(
        dialectFor(this.currentConfig.shell),
        strings,
        ...resolvedValues
      );
      return { command, shell: this.currentConfig.shell ?? true };
    };

    return this.createDeferredProcessPromise(deferredCommand);
  }

  /**
   * Run a command that is already a string, with the full chaining API.
   *
   * The tagged-template form assumes the command is written as a literal, but
   * in practice commands arrive as strings — from a config file, a database
   * row, or an agent. Those callers previously had to choose between
   * `execute()`, which returns a bare promise and loses `.nothrow()`,
   * `.quiet()` and `.pipe()`, or smuggling the string through the template
   * tag. This is the first-class path for that case.
   *
   * The string is passed to the shell verbatim — it is the caller's command,
   * not a template — so build it from trusted input, or interpolate values
   * with `` $`…` `` which escapes them.
   *
   * @param command - The command line to run.
   * @param options - Per-command overrides such as `cwd`, `env` or `timeout`.
   * @returns A chainable process promise, exactly as `` $`…` `` returns.
   *
   * @example
   * ```typescript
   * const command = task.command;            // a string from config
   * const result = await $.exec(command, { cwd: repo }).nothrow();
   *
   * if (!result.ok) {
   *   console.error(result.stderr);
   * }
   * ```
   */
  exec(command: string, options: Partial<Command> = {}): ProcessPromise {
    if (typeof command !== 'string') {
      throw new TypeError(
        `$.exec expects a command string; received ${Object.prototype.toString.call(command)}. ` +
          'To interpolate values safely, use $`command ${value}`.'
      );
    }

    return this.createDeferredProcessPromise(async () => ({
      ...options,
      command,
      shell: options.shell ?? this.currentConfig.shell ?? true,
    }));
  }

  // Raw template literal support (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise {
    assertTaggedTemplate(strings, 'raw');

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

        // Every substituted value is quoted for the target shell. Double-quote
        // wrapping is not enough here: `$(…)`, backticks and `$VAR` all still
        // expand inside double quotes, which made this an injection point.
        if (typeof value === 'string') {
          return quoteForShell(value, dialectFor(this.currentConfig.shell));
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
  async readFile(filePath: string): Promise<string> {
    const result = await this.execute({
      command: 'cat',
      args: [filePath],
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:read event
      this.emitEvent('file:read', {
        path: filePath
      });
      return result.stdout;
    } else {
      throw new Error(`Failed to read file ${filePath}: ${result.stderr}`);
    }
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    const result = await this.execute({
      command: 'tee',
      args: [filePath],
      stdin: content,
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:write event
      this.emitEvent('file:write', {
        path: filePath,
        size: Buffer.byteLength(content, 'utf8')
      });
    } else {
      throw new Error(`Failed to write file ${filePath}: ${result.stderr}`);
    }
  }

  async deleteFile(filePath: string): Promise<void> {
    const result = await this.execute({
      command: 'rm',
      args: ['-f', filePath],
      shell: false
    });

    if (result.exitCode === 0) {
      // Emit file:delete event
      this.emitEvent('file:delete', {
        path: filePath
      });
    } else {
      throw new Error(`Failed to delete file ${filePath}: ${result.stderr}`);
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

  /**
   * Target an SSH host.
   *
   * @param target - Either `[user@]host[:port]` shorthand or full adapter options.
   *
   * @example
   * ```typescript
   * await $.ssh('deploy@web-1')`systemctl restart api`;
   * await $.ssh({ host: 'web-1', username: 'deploy', privateKey })`uptime`;
   * ```
   */
  ssh(target: string | Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext {
    const options = typeof target === 'string' ? parseSSHTarget(target) : target;
    return createSSHExecutionContext(this, options);
  }

  // Overloaded signatures for fluent API and adapter configuration
  docker(container: string): ExecutionEngine;
  docker(options: DockerOptions): ExecutionEngine;
  docker(options: Omit<DockerAdapterOptions, 'type'>): ExecutionEngine;
  docker(): DockerFluentAPI;
  docker(options?: string | DockerOptions | Omit<DockerAdapterOptions, 'type'>): ExecutionEngine | DockerFluentAPI {
    // If no options provided, return fluent API
    if (!options) {
      if (!this._dockerFluentAPI) {
        this._dockerFluentAPI = new DockerFluentAPI(this);
      }
      return this._dockerFluentAPI;
    }

    // `$.docker('my-container')`, symmetric with `$.ssh('user@host')` and
    // `$.k8s('ns/pod')`. This form was documented and crashed with a
    // TypeError, because the object branches probed it with `in`.
    if (typeof options === 'string') {
      options = { container: options };
    }

    // Test the *value*, not the key. `'image' in options` was true for
    // `{ container: 'api', image: undefined }` — the shape every caller
    // produces when it forwards an optional config field — which routed the
    // command into the ephemeral-container branch and then crashed on
    // `image.split(':')`. Callers should not have to strip undefined keys to
    // avoid running somewhere else entirely.
    if (typeof (options as { image?: unknown }).image === 'string') {
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

  /**
   * Target a Kubernetes pod.
   *
   * @param target - Either `[namespace/]pod[:container]` shorthand or full
   *   adapter options. Omit it to build the target fluently.
   *
   * @example
   * ```typescript
   * await $.k8s('prod/api-pod')`./migrate.sh`;
   * await $.k8s({ pod: 'api-pod', namespace: 'prod' })`./migrate.sh`;
   * ```
   */
  k8s(target?: string | Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext {
    if (typeof target === 'string') {
      return createK8sExecutionContext(this, parseK8sTarget(target));
    }

    // If no options provided, return a context that requires pod() to be called
    return createK8sExecutionContext(this, target || {});
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

  timeout(duration: Duration): ExecutionEngine {
    const ms = parseDuration(duration);
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
    return {
      /**
       * Set configuration values without recreating the engine
       * @example
       * $.config.set({ timeout: 30000, shell: '/bin/bash' });
       */
      set: (updates: Partial<ExecutionEngineConfig>): void => {
        // Deep merge for certain properties
        if (updates.defaultEnv) {
          this._config.defaultEnv = { ...this._config.defaultEnv, ...updates.defaultEnv };
          delete updates.defaultEnv;
        }

        // Shallow merge for the rest
        Object.assign(this._config, updates);

        // Update adapters with new config if needed
        if (updates.adapters) {
          this.updateAdapterConfigs(updates.adapters);
        }
      },

      /**
       * Get current configuration
       */
      get: (): Readonly<ExecutionEngineConfig> => ({ ...this._config })
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
      const resolved = result.stdout.trim();
      // If which returns empty output or non-zero exit, command not found
      return (resolved && result.exitCode === 0) ? resolved : null;
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
