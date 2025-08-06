import type { KubernetesAdapter } from './index.js';
import type { KubernetesAdapterOptions } from '../../types/command.js';
import type { ProcessPromise, ExecutionEngine } from '../../core/execution-engine.js';

/**
 * Kubernetes port forward instance
 */
export interface K8sPortForward {
  localPort: number;
  remotePort: number;
  isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Kubernetes log stream handle
 */
export interface K8sLogStream {
  stop(): void;
}

/**
 * Kubernetes pod instance
 */
export interface K8sPod {
  name: string;
  namespace: string;

  /**
   * Execute a command in the pod
   */
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  /**
   * Execute a raw command in the pod
   */
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  /**
   * Port forward from local to pod
   */
  portForward(localPort: number, remotePort: number): Promise<K8sPortForward>;

  /**
   * Port forward with dynamic local port
   */
  portForwardDynamic(remotePort: number): Promise<K8sPortForward>;

  /**
   * Get logs from the pod
   */
  logs(options?: {
    container?: string;
    tail?: number;
    previous?: boolean;
    timestamps?: boolean;
  }): Promise<string>;

  /**
   * Stream logs from the pod
   */
  streamLogs(
    onData: (data: string) => void,
    options?: {
      container?: string;
      follow?: boolean;
      tail?: number;
      previous?: boolean;
      timestamps?: boolean;
    }
  ): Promise<K8sLogStream>;

  /**
   * Follow logs (alias for streamLogs with follow: true)
   */
  follow(
    onData: (data: string) => void,
    options?: {
      container?: string;
      tail?: number;
      timestamps?: boolean;
    }
  ): Promise<K8sLogStream>;

  /**
   * Copy file to the pod
   */
  copyTo(localPath: string, remotePath: string, container?: string): Promise<void>;

  /**
   * Copy file from the pod
   */
  copyFrom(remotePath: string, localPath: string, container?: string): Promise<void>;
}

/**
 * Kubernetes execution context
 */
export interface K8sExecutionContext {
  /**
   * Execute a command (for backwards compatibility)
   */
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  /**
   * Get a pod instance
   */
  pod(name: string): K8sPod;

  /**
   * Execute in a specific pod
   */
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  /**
   * Execute raw command
   */
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
}

/**
 * Create a Kubernetes pod instance
 */
function createK8sPod(
  engine: ExecutionEngine,
  adapter: KubernetesAdapter,
  name: string,
  namespace: string,
  baseOptions: Omit<KubernetesAdapterOptions, 'type' | 'pod'>
): K8sPod {
  const exec = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    const k8sEngine = engine.with({
      adapter: 'kubernetes',
      adapterOptions: {
        type: 'kubernetes',
        ...baseOptions,
        pod: name,
        namespace
      }
    });
    return k8sEngine.run(strings, ...values);
  };

  const raw = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    const k8sEngine = engine.with({
      adapter: 'kubernetes',
      adapterOptions: {
        type: 'kubernetes',
        ...baseOptions,
        pod: name,
        namespace
      }
    });
    return k8sEngine.raw(strings, ...values);
  };

  return {
    name,
    namespace,
    exec,
    raw,

    async portForward(localPort: number, remotePort: number): Promise<K8sPortForward> {
      const pf = await adapter.portForward(name, localPort, remotePort, { namespace });
      await pf.open();
      return pf;
    },

    async portForwardDynamic(remotePort: number): Promise<K8sPortForward> {
      const pf = await adapter.portForward(name, 0, remotePort, {
        namespace,
        dynamicLocalPort: true
      });
      await pf.open();
      return pf;
    },

    async logs(options?: {
      container?: string;
      tail?: number;
      previous?: boolean;
      timestamps?: boolean;
    }): Promise<string> {
      // Use kubectl logs command
      const args = ['logs', '-n', namespace];

      if (options?.container) {
        args.push('-c', options.container);
      }

      if (options?.tail !== undefined) {
        args.push('--tail', String(options.tail));
      }

      if (options?.previous) {
        args.push('--previous');
      }

      if (options?.timestamps) {
        args.push('--timestamps');
      }

      args.push(name);

      // Execute kubectl directly
      const result = await adapter.executeKubectl(args, { throwOnNonZeroExit: true });
      return result.stdout;
    },

    async streamLogs(
      onData: (data: string) => void,
      options?: {
        container?: string;
        follow?: boolean;
        tail?: number;
        previous?: boolean;
        timestamps?: boolean;
      }
    ): Promise<K8sLogStream> {
      return adapter.streamLogs(name, onData, {
        namespace,
        ...options
      });
    },

    async follow(
      onData: (data: string) => void,
      options?: {
        container?: string;
        tail?: number;
        timestamps?: boolean;
      }
    ): Promise<K8sLogStream> {
      return this.streamLogs(onData, { ...options, follow: true });
    },

    async copyTo(localPath: string, remotePath: string, container?: string): Promise<void> {
      const podPath = container ? `${name}:${remotePath} -c ${container}` : `${name}:${remotePath}`;
      await adapter.copyFiles(localPath, podPath, {
        namespace,
        container,
        direction: 'to'
      });
    },

    async copyFrom(remotePath: string, localPath: string, container?: string): Promise<void> {
      const podPath = container ? `${name}:${remotePath} -c ${container}` : `${name}:${remotePath}`;
      await adapter.copyFiles(podPath, localPath, {
        namespace,
        container,
        direction: 'from'
      });
    }
  };
}

/**
 * Create a Kubernetes execution context
 */
export function createK8sExecutionContext(
  engine: ExecutionEngine,
  k8sOptions: Partial<Omit<KubernetesAdapterOptions, 'type'>>
): K8sExecutionContext {
  const adapter = engine.getAdapter('kubernetes') as KubernetesAdapter;
  if (!adapter) {
    throw new Error('Kubernetes adapter not available');
  }

  // For backwards compatibility - execute in specified pod
  const exec = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    if (!k8sOptions.pod) {
      throw new Error('Pod must be specified for direct execution');
    }

    const k8sEngine = engine.with({
      adapter: 'kubernetes',
      adapterOptions: {
        type: 'kubernetes',
        pod: k8sOptions.pod,
        ...(k8sOptions.namespace && { namespace: k8sOptions.namespace }),
        ...(k8sOptions.container && { container: k8sOptions.container }),
        ...(k8sOptions.execFlags && { execFlags: k8sOptions.execFlags }),
        ...(k8sOptions.tty !== undefined && { tty: k8sOptions.tty }),
        ...(k8sOptions.stdin !== undefined && { stdin: k8sOptions.stdin })
      }
    });
    return k8sEngine.run(strings, ...values);
  };

  const raw = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    if (!k8sOptions.pod) {
      throw new Error('Pod must be specified for direct execution');
    }

    const k8sEngine = engine.with({
      adapter: 'kubernetes',
      adapterOptions: {
        type: 'kubernetes',
        pod: k8sOptions.pod,
        ...(k8sOptions.namespace && { namespace: k8sOptions.namespace }),
        ...(k8sOptions.container && { container: k8sOptions.container }),
        ...(k8sOptions.execFlags && { execFlags: k8sOptions.execFlags }),
        ...(k8sOptions.tty !== undefined && { tty: k8sOptions.tty }),
        ...(k8sOptions.stdin !== undefined && { stdin: k8sOptions.stdin })
      }
    });
    return k8sEngine.raw(strings, ...values);
  };

  const context = Object.assign(exec, {
    exec,
    raw,

    pod(name: string): K8sPod {
      const namespace = k8sOptions.namespace || 'default';
      return createK8sPod(engine, adapter, name, namespace, k8sOptions);
    }
  });

  return context;
}