import { spawn } from 'child_process';
import { Readable } from 'node:stream';

import { ExecutionResult } from '../core/result.js';
import { StreamHandler } from '../core/stream-handler.js';
import { TimeoutError, ExecutionError } from '../core/error.js';
import { BaseAdapter, BaseAdapterConfig } from './base-adapter.js';
import { Command, KubernetesAdapterOptions } from '../core/command.js';

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

export class KubernetesError extends ExecutionError {
  override readonly details?: any;
  
  constructor(message: string, details?: any) {
    super(message, 'KUBERNETES_ERROR', details);
    this.name = 'KubernetesError';
    this.details = details;
  }
}

export class KubernetesAdapter extends BaseAdapter {
  protected readonly adapterName = 'kubernetes';
  private kubectlPath: string;
  private k8sConfig: KubernetesAdapterConfig;
  
  constructor(config: KubernetesAdapterConfig = {}) {
    super(config);
    this.k8sConfig = config;
    this.kubectlPath = config.kubectlPath || 'kubectl';
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      // Check if kubectl is available
      const result = await this.executeKubectl(['version', '--client', '--short'], {
        timeout: 5000,
        throwOnNonZeroExit: false,
      });
      
      if (result.exitCode !== 0) {
        return false;
      }
      
      // Check if we can connect to a cluster
      const clusterResult = await this.executeKubectl(['cluster-info'], {
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
      throw new KubernetesError('Pod name or selector is required');
    }
    
    // Build kubectl exec command
    const kubectlArgs = await this.buildKubectlExecArgs(mergedCommand);
    
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
        env,
        shell: false, // Never use shell for kubectl
      });
      
      // Handle timeout
      let timeoutHandle: NodeJS.Timeout | undefined;
      if (mergedCommand.timeout) {
        timeoutHandle = setTimeout(() => {
          proc.kill((mergedCommand.timeoutSignal as any) || 'SIGTERM');
          reject(new TimeoutError(
            `Command timed out after ${mergedCommand.timeout}ms`,
            mergedCommand.timeout as number
          ));
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
        reject(new KubernetesError(`Failed to execute kubectl: ${error.message}`));
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
          endTime
        );
        this.config.throwOnNonZeroExit = originalThrowOnNonZeroExit;
        
        if (this.shouldThrowOnNonZeroExit(mergedCommand, code ?? -1)) {
          reject(new KubernetesError(
            `Command failed with exit code ${code}`,
            { stdout, stderr, command: kubectlArgs.join(' ') }
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
    if (k8sOptions.tty) {
      args.push('-t');
    }
    
    if (k8sOptions.stdin !== false) {
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
    if (k8sOptions.pod.startsWith('-l')) {
      // Label selector
      args.push(k8sOptions.pod);
    } else {
      // Pod name
      args.push(k8sOptions.pod);
    }
    
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
  
  private async executeKubectl(
    args: string[],
    options: { timeout?: number; throwOnNonZeroExit?: boolean } = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return new Promise((resolve, reject) => {
      const proc = spawn(this.kubectlPath, args, {
        timeout: options.timeout,
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
        reject(new KubernetesError(`kubectl command failed: ${error.message}`));
      });
      
      proc.on('exit', (code) => {
        const exitCode = code ?? -1;
        
        if (options.throwOnNonZeroExit && exitCode !== 0) {
          reject(new KubernetesError(
            `kubectl command failed with exit code ${exitCode}`,
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
    
    if (namespace) {
      args.push('-n', namespace);
    }
    
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
    
    if (namespace) {
      args.push('-n', namespace);
    }
    
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
    
    if (options.namespace) {
      args.push('-n', options.namespace);
    }
    
    if (options.container) {
      args.push('-c', options.container);
    }
    
    // Build source and destination based on direction
    if (options.direction === 'to') {
      args.push(source, destination);
    } else {
      args.push(destination, source);
    }
    
    await this.executeKubectl(args, { throwOnNonZeroExit: true });
  }
  
  async dispose(): Promise<void> {
    // No resources to clean up for kubectl adapter
  }
}