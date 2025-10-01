import { Readable } from 'node:stream';
import { spawn, type ChildProcess } from 'child_process';

import { StreamHandler } from '../../utils/stream.js';
import { ExecutionResult } from '../../core/result.js';
import { findKubectlPath } from './kubernetes-utils.js';
import { BaseAdapter, BaseAdapterConfig } from '../base-adapter.js';
import { Command, KubernetesAdapterOptions } from '../../types/command.js';
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

export class KubernetesAdapter extends BaseAdapter {
  protected readonly adapterName = 'kubernetes';
  private kubectlPath: string;
  private k8sConfig: KubernetesAdapterConfig;

  constructor(config: KubernetesAdapterConfig = {}) {
    super(config);
    this.name = this.adapterName;
    this.k8sConfig = config;
    this.kubectlPath = config.kubectlPath || findKubectlPath();
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

    // Execute via kubectl
    const startTime = Date.now();
    const stdoutHandler = new StreamHandler({
      maxBuffer: this.config.maxBuffer,
      encoding: this.config.encoding,
    });
    const stderrHandler = new StreamHandler({
      maxBuffer: this.config.maxBuffer,
      encoding: this.config.encoding,
    });

    return new Promise((resolve, reject) => {
      const env = this.createCombinedEnv(mergedCommand.env || {});

      const proc = spawn(this.kubectlPath, kubectlArgs, {
        cwd: mergedCommand.cwd,
        env: {
          ...env,
          PATH: `${env['PATH'] || process.env['PATH'] || ''}:/usr/local/bin:/opt/homebrew/bin`
        },
        shell: false, // Never use shell for kubectl
      });

      // Handle timeout
      let timeoutHandle: NodeJS.Timeout | undefined;
      if (mergedCommand.timeout) {
        timeoutHandle = setTimeout(async () => {
          proc.kill((mergedCommand.timeoutSignal as any) || 'SIGTERM');
          const timeoutMs = mergedCommand.timeout as number;
          const timeoutError = new TimeoutError(
            `kubectl exec timed out after ${timeoutMs}ms`,
            timeoutMs
          );

          // If nothrow is set, resolve with a non-throwing result representation
          if (mergedCommand.nothrow) {
            const endTime = Date.now();
            const result = await this.createResultNoThrow(
              '',
              timeoutError.message,
              124,
              'SIGTERM',
              mergedCommand.command,
              startTime,
              endTime,
              { originalCommand: mergedCommand }
            );
            resolve(result);
          } else {
            reject(timeoutError);
          }
        }, mergedCommand.timeout);
      }

      // Pipe stdin if provided
      if (mergedCommand.stdin) {
        if (typeof mergedCommand.stdin === 'string' || Buffer.isBuffer(mergedCommand.stdin)) {
          proc.stdin.write(mergedCommand.stdin);
          proc.stdin.end();
        } else if (mergedCommand.stdin instanceof Readable) {
          mergedCommand.stdin.pipe(proc.stdin);
        }
      }

      // Handle streams
      if (proc.stdout && mergedCommand.stdout === 'pipe') {
        proc.stdout.pipe(stdoutHandler.createTransform());
      }

      if (proc.stderr && mergedCommand.stderr === 'pipe') {
        proc.stderr.pipe(stderrHandler.createTransform());
      }

      // Handle process exit
      proc.on('error', (error) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        reject(new ExecutionError(`Failed to execute kubectl: ${error.message}`, 'KUBERNETES_ERROR'));
      });

      proc.on('exit', (code, signal) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);

        const endTime = Date.now();
        const stdout = stdoutHandler.getContent();
        const stderr = stderrHandler.getContent();

        // Create result without throwing on non-zero exit (we handle it below)
        const originalThrowOnNonZeroExit = this.config.throwOnNonZeroExit;
        this.config.throwOnNonZeroExit = false;
        const result = this.createResult(
          stdout,
          stderr,
          code ?? -1,
          signal || undefined,
          mergedCommand.command,
          startTime,
          endTime,
          { originalCommand: mergedCommand }
        );
        this.config.throwOnNonZeroExit = originalThrowOnNonZeroExit;

        if (this.shouldThrowOnNonZeroExit(mergedCommand, code ?? -1)) {
          reject(new ExecutionError(
            `Command failed with exit code ${code}`,
            'KUBERNETES_ERROR',
            { stdout, stderr, command: sanitizeCommandForError(kubectlArgs.join(' ')) }
          ));
        } else {
          resolve(result);
        }
      });
    });
  }

  private async buildKubectlExecArgs(command: Command): Promise<string[]> {
    const k8sOptions = command.adapterOptions as KubernetesAdapterOptions;
    const args: string[] = [];

    // Global options
    if (this.k8sConfig.kubeconfig) {
      args.push('--kubeconfig', this.k8sConfig.kubeconfig);
    }

    if (this.k8sConfig.context) {
      args.push('--context', this.k8sConfig.context);
    }

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

    // The actual command
    if (command.shell) {
      // Execute through shell
      const shellCmd = command.shell === true ? '/bin/sh' : command.shell;
      args.push(shellCmd, '-c', this.buildCommandString(command));
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
    options: { timeout?: number; throwOnNonZeroExit?: boolean } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      // Build full args with global options
      const fullArgs: string[] = [];

      // Add global options first
      if (this.k8sConfig.kubeconfig) {
        fullArgs.push('--kubeconfig', this.k8sConfig.kubeconfig);
      }

      if (this.k8sConfig.context) {
        fullArgs.push('--context', this.k8sConfig.context);
      }

      // Add the actual command args
      fullArgs.push(...args);

      const proc = spawn(this.kubectlPath, fullArgs, {
        timeout: options.timeout,
        env: {
          ...process.env,
          PATH: `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`
        }
      });

      let stdout = '';
      let stderr = '';

      if (proc.stdout) {
        proc.stdout.on('data', (chunk) => {
          stdout += chunk.toString();
        });
      }

      if (proc.stderr) {
        proc.stderr.on('data', (chunk) => {
          stderr += chunk.toString();
        });
      }

      proc.on('error', (error) => {

        reject(new ExecutionError(`kubectl command failed: ${error.message}`, 'KUBERNETES_ERROR'));
      });

      proc.on('exit', (code) => {
        const exitCode = code ?? -1;

        if (options.throwOnNonZeroExit && exitCode !== 0) {
          reject(new ExecutionError(
            `kubectl command failed with exit code ${exitCode}: ${stderr}`,
            'KUBERNETES_ERROR',
            { stdout, stderr, args }
          ));
        } else {
          resolve({ stdout, stderr, exitCode });
        }
      });
    });
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
    }
  ): Promise<void> {
    const args = ['cp'];

    // Use provided namespace or fall back to configured default
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    args.push('-n', ns);

    if (options.container) {
      args.push('-c', options.container);
    }

    // Build source and destination based on direction
    if (options.direction === 'to') {
      args.push(source, destination);
    } else {
      // For 'from' direction, source is the pod path, destination is local
      args.push(source, destination);
    }

    await this.executeKubectl(args, { throwOnNonZeroExit: true });
  }

  async dispose(): Promise<void> {
    // Clean up any active port forwards
    await this.closeAllPortForwards();
  }

  /**
   * Port forward to a pod
   */
  async portForward(
    pod: string,
    localPort: number,
    remotePort: number,
    options: {
      namespace?: string;
      dynamicLocalPort?: boolean;
    } = {}
  ): Promise<KubernetesPortForward> {
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    const actualLocalPort = options.dynamicLocalPort ? 0 : localPort;

    const args = ['port-forward', '-n', ns];

    // Build port mapping
    const portMapping = actualLocalPort === 0
      ? `:${remotePort}` // Dynamic local port
      : `${localPort}:${remotePort}`;

    args.push(pod, portMapping);

    return new KubernetesPortForward(
      this.kubectlPath,
      args,
      localPort,
      remotePort,
      this.buildGlobalOptions()
    );
  }

  /**
   * Stream logs from a pod
   */
  async streamLogs(
    pod: string,
    onData: (data: string) => void,
    options: {
      namespace?: string;
      container?: string;
      follow?: boolean;
      tail?: number;
      previous?: boolean;
      timestamps?: boolean;
    } = {}
  ): Promise<{ stop: () => void }> {
    const ns = options.namespace || this.k8sConfig.namespace || 'default';
    const args = ['logs', '-n', ns];

    if (options.container) {
      args.push('-c', options.container);
    }

    if (options.follow) {
      args.push('-f');
    }

    if (options.tail !== undefined) {
      args.push('--tail', String(options.tail));
    }

    if (options.previous) {
      args.push('--previous');
    }

    if (options.timestamps) {
      args.push('--timestamps');
    }

    args.push(pod);

    const proc = spawn(this.kubectlPath, [...this.buildGlobalOptions(), ...args], {
      env: {
        ...process.env,
        PATH: `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`
      }
    });

    let stopped = false;

    if (proc.stdout) {
      proc.stdout.on('data', (chunk) => {
        if (!stopped) {
          const lines = chunk.toString().split('\n').filter((line: string) => line.trim());
          lines.forEach((line: string) => onData(line + '\n'));
        }
      });
    }

    if (proc.stderr) {
      proc.stderr.on('data', (chunk) => {
        if (!stopped) {
          console.error('kubectl logs stderr:', chunk.toString());
        }
      });
    }

    proc.on('error', (error) => {
      console.error('kubectl logs error:', error);
    });

    return {
      stop: () => {
        stopped = true;
        proc.kill();
      }
    };
  }

  private buildGlobalOptions(): string[] {
    const options: string[] = [];

    if (this.k8sConfig.kubeconfig) {
      options.push('--kubeconfig', this.k8sConfig.kubeconfig);
    }

    if (this.k8sConfig.context) {
      options.push('--context', this.k8sConfig.context);
    }

    return options;
  }

  private portForwards: Set<KubernetesPortForward> = new Set();

  private async closeAllPortForwards(): Promise<void> {
    const closes = Array.from(this.portForwards).map(pf => pf.close());
    await Promise.all(closes);
    this.portForwards.clear();
  }
}

/**
 * Kubernetes port forward handler
 */
class KubernetesPortForward {
  private proc: ChildProcess | null = null;
  private _localPort: number;
  private _isOpen = false;

  constructor(
    private kubectlPath: string,
    private args: string[],
    private requestedLocalPort: number,
    public readonly remotePort: number,
    private globalOptions: string[]
  ) {
    this._localPort = requestedLocalPort;
  }

  get localPort(): number {
    return this._localPort;
  }

  get isOpen(): boolean {
    return this._isOpen;
  }

  async open(): Promise<void> {
    if (this._isOpen) {
      throw new Error('Port forward is already open');
    }

    return new Promise((resolve, reject) => {
      this.proc = spawn(this.kubectlPath, [...this.globalOptions, ...this.args], {
        env: {
          ...process.env,
          PATH: `${process.env['PATH']}:/usr/local/bin:/opt/homebrew/bin`
        }
      });

      let resolved = false;

      if (this.proc.stdout) {
        this.proc.stdout.on('data', (chunk) => {
          const output = chunk.toString();

          // Parse dynamic port if needed
          const portMatch = output.match(/Forwarding from (?:127\.0\.0\.1:|\[::1\]:)(\d+) -> \d+/);
          if (portMatch && this.requestedLocalPort === 0) {
            this._localPort = parseInt(portMatch[1], 10);
          }

          if (output.includes('Forwarding from') && !resolved) {
            resolved = true;
            this._isOpen = true;
            resolve();
          }
        });
      }

      if (this.proc.stderr) {
        this.proc.stderr.on('data', (chunk) => {
          const error = chunk.toString();
          if (!resolved) {
            resolved = true;
            reject(new ExecutionError(`Port forward failed: ${error}`, 'KUBERNETES_ERROR'));
          }
        });
      }

      this.proc.on('error', (error) => {
        if (!resolved) {
          resolved = true;
          reject(new ExecutionError(`Port forward process error: ${error.message}`, 'KUBERNETES_ERROR'));
        }
      });

      this.proc.on('exit', (code) => {
        this._isOpen = false;
        if (!resolved && code !== 0) {
          resolved = true;
          reject(new ExecutionError(`Port forward exited with code ${code}`, 'KUBERNETES_ERROR'));
        }
      });
    });
  }

  async close(): Promise<void> {
    if (this.proc && this._isOpen) {
      this.proc.kill();
      this._isOpen = false;
      this.proc = null;
    }
  }
}