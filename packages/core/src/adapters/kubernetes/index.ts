import type { K8sLogStream, K8sLogOptions, K8sPortForwardOptions } from './kubernetes-api.js';

import { LocalAdapter } from '../local/index.js';
import { ExecutionResult } from '../../core/result.js';
import { findKubectlPath } from './kubernetes-utils.js';
import { LocalCommandSession } from '../local/command-session.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { Command, KubernetesAdapterOptions } from '../../types/command.js';
import { quoteForShell, validateEnvName } from '../../utils/shell-escape.js';
import { TimeoutError, ExecutionError, sanitizeCommandForError } from '../../core/error.js';

export interface KubernetesAdapterConfig extends BaseAdapterConfig {
  /**
   * Path to kubeconfig file. Defaults to ~/.kube/config
   */
  kubeconfig?: string;

  /**
   * Kubernetes context to use
   */
  context?: string;

  /**
   * Default namespace. Defaults to 'default'
   */
  namespace?: string;

  /**
   * kubectl binary path. Defaults to 'kubectl'
   */
  kubectlPath?: string;

  /**
   * Timeout for kubectl commands (ms)
   */
  kubectlTimeout?: number;
}

type KubectlOptions = Pick<Command, 'signal' | 'maxBuffer' | 'throwOnNonZeroExit'> & {
  timeout?: number;
  context?: string;
  kubeconfig?: string;
};

export class KubernetesAdapter extends BaseAdapter {
  protected readonly adapterName = 'kubernetes';
  private kubectlPath: string;
  private k8sConfig: KubernetesAdapterConfig;
  private local: LocalAdapter;
  private sessions = new Set<LocalCommandSession>();
  private disposed = false;

  constructor(config: KubernetesAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.k8sConfig = config;
    this.kubectlPath = config.kubectlPath || findKubectlPath();
    this.local = new LocalAdapter({
      forceImplementation: 'node',
      encoding: config.encoding,
      // kubectl results are protocol data. Errors and events are sanitized at their boundary.
      sensitiveDataMasking: { enabled: false },
    });
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Check if kubectl is available
      const result = await this.executeKubectl(['version', '--client'], {
        timeout: 5000,
        throwOnNonZeroExit: false,
      });

      if (result.exitCode !== 0) {
        return false;
      }

      // Check if we can connect to a cluster by listing namespaces
      const clusterResult = await this.executeKubectl(['get', 'ns'], {
        timeout: 5000,
        throwOnNonZeroExit: false,
      });

      return clusterResult.exitCode === 0;
    } catch {
      return false;
    }
  }

  async execute(command: Command): Promise<ExecutionResult> {
    const mergedCommand = this.mergeCommand(command);

    // Validate kubernetes options
    const k8sOptions = mergedCommand.adapterOptions as KubernetesAdapterOptions;
    if (!k8sOptions || !k8sOptions.pod) {
      throw new ExecutionError('Pod name or selector is required', 'KUBERNETES_ERROR');
    }

    // Build kubectl exec command
    const kubectlArgs = await this.buildKubectlExecArgs(mergedCommand);

    // Emit k8s:exec event
    this.emitAdapterEvent('k8s:exec', {
      pod: k8sOptions.pod,
      namespace: k8sOptions.namespace || this.k8sConfig.namespace || 'default',
      container: k8sOptions.container,
      command: this.buildCommandString(mergedCommand)
    });

    const startTime = Date.now();
    let result: ExecutionResult;
    try {
      const session = this.startSession({
        ...mergedCommand,
        command: this.kubectlPath,
        args: kubectlArgs,
        // Pod env and cwd already travel in the quoted remote command.
        env: { PATH: `${process.env['PATH'] ?? ''}:/usr/local/bin:/opt/homebrew/bin` },
        cwd: undefined,
        shell: false,
        throwOnNonZeroExit: false,
      });
      result = await session.result;
      if (session.stopped) throw new ExecutionError('kubectl exec stopped before completion', 'KUBERNETES_ERROR');
    } catch (error) {
      if (error instanceof TimeoutError && mergedCommand.nothrow) {
        return this.createResultNoThrow('', error.message, 124, 'SIGTERM', mergedCommand.command,
          startTime, Date.now(), { originalCommand: mergedCommand });
      }
      throw error;
    }
    if (this.shouldThrowOnNonZeroExit(mergedCommand, result.exitCode)) {
      throw new ExecutionError(`Command failed with exit code ${result.exitCode}`, 'KUBERNETES_ERROR', {
        stdout: sanitizeCommandForError(result.stdout),
        stderr: sanitizeCommandForError(result.stderr),
        command: sanitizeCommandForError(kubectlArgs.join(' ')),
      });
    }
    return this.createResultNoThrow(result.stdout, result.stderr, result.exitCode, result.signal,
      mergedCommand.command, startTime, Date.now(), { originalCommand: mergedCommand, stdall: result.stdall });
  }

  /**
   * Cluster-selection flags for a kubectl invocation.
   *
   * Per-target values win over the adapter's defaults: a target that names
   * `production` must reach production regardless of what the operator's
   * current context happens to be. These used to be read only from the
   * adapter config, so a per-target context was accepted and dropped, and
   * the command went wherever `kubectl config current-context` pointed.
   *
   * @param options - The target's adapter options, when there are any.
   * @returns `--kubeconfig` / `--context` flags, in kubectl's expected order.
   */
  private clusterFlags(options?: Partial<KubernetesAdapterOptions>): string[] {
    const flags: string[] = [];

    const kubeconfig = options?.kubeconfig ?? this.k8sConfig.kubeconfig;
    if (kubeconfig) {
      flags.push('--kubeconfig', kubeconfig);
    }

    const context = options?.context ?? this.k8sConfig.context;
    if (context) {
      flags.push('--context', context);
    }

    return flags;
  }

  private async buildKubectlExecArgs(command: Command): Promise<string[]> {
    const k8sOptions = command.adapterOptions as KubernetesAdapterOptions;
    const args: string[] = [...this.clusterFlags(k8sOptions)];

    // Command
    args.push('exec');

    // Namespace
    const namespace = k8sOptions.namespace || this.k8sConfig.namespace || 'default';
    args.push('-n', namespace);

    // TTY/stdin options
    // Note: TTY requires stdin, so if TTY is true, always enable stdin
    if (k8sOptions.tty) {
      args.push('-t');
      args.push('-i');
    } else if (k8sOptions.stdin !== false || command.stdin) {
      // Add -i if stdin is not explicitly disabled or if stdin data is provided
      args.push('-i');
    }

    // Container
    if (k8sOptions.container) {
      args.push('-c', k8sOptions.container);
    }

    // Additional flags
    if (k8sOptions.execFlags) {
      args.push(...k8sOptions.execFlags);
    }

    // Pod (can be name or -l selector)
    let podName = k8sOptions.pod;

    // If it's a label selector, we need to get the pod name first
    if (k8sOptions.pod.startsWith('-l')) {
      const selector = k8sOptions.pod.substring(2).trim(); // Remove '-l' prefix
      const selectedPod = await this.getPodFromSelector(selector, namespace);

      if (!selectedPod) {
        throw new ExecutionError(`No pod found matching selector: ${k8sOptions.pod}`, 'KUBERNETES_ERROR');
      }

      podName = selectedPod;
    }

    // Pod name
    args.push(podName);

    // Separator
    args.push('--');

    // The actual command. `kubectl exec` has no --workdir or --env flags, so
    // cwd and env reach the pod as a shell prelude. They used to be applied
    // to the *local* kubectl process instead: `.env({TOKEN})` exported the
    // secret into the operator's environment while the pod never saw it, and
    // `.cd()` changed the local directory kubectl ran from.
    const podEnv = command.env && Object.keys(command.env).length > 0 ? command.env : undefined;
    const needsShell = Boolean(command.shell) || Boolean(command.cwd) || Boolean(podEnv);

    if (needsShell) {
      const shellCmd = typeof command.shell === 'string' ? command.shell : '/bin/sh';

      const prelude: string[] = [];
      if (command.cwd) {
        prelude.push(`cd ${quoteForShell(command.cwd, 'posix')}`);
      }
      if (podEnv) {
        for (const [key, value] of Object.entries(podEnv)) {
          prelude.push(`export ${validateEnvName(key)}=${quoteForShell(value, 'posix')}`);
        }
      }

      // A command written without shell:true still needs each part quoted
      // once it is routed through `sh -c` for the prelude.
      const body = command.shell
        ? this.buildCommandString(command)
        : this.buildCommandArray(command).map(part => quoteForShell(part, 'posix')).join(' ');

      args.push(shellCmd, '-c', prelude.length > 0 ? `${prelude.join(' && ')} && ${body}` : body);
    } else {
      // Direct command execution
      args.push(...this.buildCommandArray(command));
    }

    return args;
  }

  private buildCommandArray(command: Command): string[] {
    if (Array.isArray(command.command)) {
      return command.command;
    }

    const parts: string[] = [];

    // Add the main command
    parts.push(command.command);

    // Add any args if provided
    if (command.args && command.args.length > 0) {
      parts.push(...command.args);
    }

    return parts;
  }

  async executeKubectl(
    args: string[],
    options: KubectlOptions = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const session = this.startSession(this.kubectlCommand(args, options));
    const result = await session.result;
    if (session.stopped) throw new ExecutionError('kubectl operation stopped before completion', 'KUBERNETES_ERROR');
    return { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode };
  }

  private kubectlCommand(args: string[], options: KubectlOptions = {}): Command {
    if (this.disposed) throw new Error('Kubernetes adapter has been disposed');
    return {
      command: this.kubectlPath,
      args: [...this.clusterFlags(options), ...args],
      shell: false,
      env: { PATH: `${process.env['PATH'] ?? ''}:/usr/local/bin:/opt/homebrew/bin` },
      timeout: options.timeout ?? this.k8sConfig.kubectlTimeout ?? this.config.defaultTimeout,
      maxBuffer: options.maxBuffer ?? this.config.maxBuffer,
      signal: options.signal,
      throwOnNonZeroExit: options.throwOnNonZeroExit ?? false,
    };
  }

  private startSession(command: Command, onLine?: (data: string) => void): LocalCommandSession {
    if (this.disposed) throw new Error('Kubernetes adapter has been disposed');
    const session = new LocalCommandSession(this.local, command, {
      encoding: this.config.encoding,
      onStdout: onLine,
      onNonZero: result => new ExecutionError(
        `kubectl exited with code ${result.exitCode}: ${result.stderr}`,
        'KUBERNETES_ERROR', { stdout: result.stdout, stderr: result.stderr, exitCode: result.exitCode },
      ),
    });
    this.sessions.add(session);
    const release = () => { this.sessions.delete(session); };
    void session.completion.then(release, release);
    return session;
  }

  /**
   * Get a pod name from a label selector
   */
  async getPodFromSelector(selector: string, namespace?: string): Promise<string | null> {
    const args = ['get', 'pods', '-o', 'jsonpath={.items[0].metadata.name}'];

    // Use provided namespace or fall back to configured default
    const ns = namespace || this.k8sConfig.namespace || 'default';
    args.push('-n', ns);

    if (selector.startsWith('-l')) {
      args.push(selector);
    } else {
      args.push('-l', selector);
    }

    try {
      const result = await this.executeKubectl(args);
      const podName = result.stdout.trim();
      return podName || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if a pod exists and is ready
   */
  async isPodReady(pod: string, namespace?: string): Promise<boolean> {
    const args = ['get', 'pod', pod, '-o', 'jsonpath={.status.conditions[?(@.type=="Ready")].status}'];

    // Use provided namespace or fall back to configured default
    const ns = namespace || this.k8sConfig.namespace || 'default';
    args.push('-n', ns);

    try {
      const result = await this.executeKubectl(args, { throwOnNonZeroExit: false });
      return result.stdout.trim() === 'True';
    } catch {
      return false;
    }
  }

  /**
   * Copy files to/from a pod
   */
  async copyFiles(
    source: string,
    destination: string,
    options: {
      namespace?: string;
      container?: string;
      direction: 'to' | 'from';
      context?: string;
      kubeconfig?: string;
    }
  ): Promise<void> {
    const args = ['cp'];

    // Use provided namespace or fall back to configured default
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    args.push('-n', ns);

    if (options.container) {
      args.push('-c', options.container);
    }

    args.push(source, destination);
    await this.executeKubectl(args, { ...options, throwOnNonZeroExit: true });
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    const results = await Promise.allSettled([...this.sessions].map(session => session.stop()));
    const errors = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Kubernetes operation cleanup failed');
  }

  /** Create a forward. The pod API also waits for open(). */
  async portForward(
    pod: string,
    localPort: number,
    remotePort: number,
    options: K8sPortForwardOptions & {
      namespace?: string;
      dynamicLocalPort?: boolean;
      context?: string;
      kubeconfig?: string;
    } = {}
  ): Promise<KubernetesPortForward> {
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    const actualLocalPort = options.dynamicLocalPort ? 0 : localPort;
    if (!Number.isInteger(actualLocalPort) || actualLocalPort < 0 || actualLocalPort > 65535
      || !Number.isInteger(remotePort) || remotePort < 1 || remotePort > 65535) {
      throw new RangeError('Port forwarding requires local port 0–65535 and remote port 1–65535');
    }
    const mapping = `${actualLocalPort || ''}:${remotePort}`;
    const command = this.kubectlCommand(['port-forward', '-n', ns, pod, mapping], options);
    return new KubernetesPortForward(
      actualLocalPort,
      remotePort,
      Number(command.timeout),
      onLine => this.startSession({ ...command, timeout: 0, throwOnNonZeroExit: true }, onLine),
    );
  }

  async streamLogs(
    pod: string,
    onData: (data: string) => void,
    options: K8sLogOptions & { namespace?: string; context?: string; kubeconfig?: string } = {}
  ): Promise<K8sLogStream> {
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    const args = ['logs', '-n', ns];
    if (options.container) args.push('-c', options.container);
    if (options.follow) args.push('-f');
    if (options.tail !== undefined) args.push('--tail', String(options.tail));
    if (options.previous) args.push('--previous');
    if (options.timestamps) args.push('--timestamps');
    args.push(pod);

    const command = this.kubectlCommand(args, {
      ...options,
      timeout: options.timeout ?? (options.follow ? 0 : undefined),
    });
    return this.startSession({ ...command, throwOnNonZeroExit: true }, onData);
  }
}

class KubernetesPortForward {
  private session?: LocalCommandSession;
  private opening?: Promise<void>;
  private _localPort: number;
  private _isOpen = false;

  constructor(
    private requestedLocalPort: number,
    public readonly remotePort: number,
    private readinessTimeout: number,
    private start: (onLine: (data: string) => void) => LocalCommandSession,
  ) {
    this._localPort = requestedLocalPort;
  }

  get localPort(): number { return this._localPort; }
  get isOpen(): boolean { return this._isOpen; }

  open(): Promise<void> {
    if (this._isOpen || this.opening) return Promise.reject(new Error('Port forward is already opening or open'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ready = new Promise<void>((resolve, reject) => {
      this.session = this.start(line => {
        const match = line.match(/^Forwarding from (?:127\.0\.0\.1:|\[::1\]:)(\d+) -> (\d+)\r?\n?$/);
        if (!match) return;
        const port = Number(match[1]);
        if (port < 1 || port > 65535 || Number(match[2]) !== this.remotePort
          || (this.requestedLocalPort !== 0 && port !== this.requestedLocalPort)) return;
        this._localPort = port;
        this._isOpen = true;
        clearTimeout(timer);
        resolve();
      });
      if (this.readinessTimeout > 0) {
        timer = setTimeout(() => {
          if (!this.session?.stopped) this.session?.cancel(
            new TimeoutError('kubectl port-forward readiness', this.readinessTimeout),
          );
        }, this.readinessTimeout);
      }
      const finish = (error?: unknown) => {
        clearTimeout(timer);
        this._isOpen = false;
        reject(error ?? new ExecutionError('Port forward exited before becoming ready', 'KUBERNETES_ERROR'));
      };
      void this.session.completion.then(() => finish(), finish);
    });
    this.opening = ready.finally(() => { this.opening = undefined; });
    return this.opening;
  }

  close(): Promise<void> {
    return this.session?.stop() ?? Promise.resolve();
  }
}
