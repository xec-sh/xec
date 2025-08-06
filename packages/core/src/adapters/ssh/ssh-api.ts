import type { SSHAdapter } from './index.js';
import type { SSHAdapterOptions } from '../../types/command.js';
import type { ProcessPromise, ExecutionEngine } from '../../core/execution-engine.js';

// Type for SSH tunnel
export interface SSHTunnel {
  localPort: number;
  localHost: string;
  remoteHost: string;
  remotePort: number;
  isOpen: boolean;
  open(): Promise<void>;
  close(): Promise<void>;
}

/**
 * Interface for the SSH execution context
 */
export interface SSHExecutionContext {
  // Callable interface for template literals
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  // Methods
  exec(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  tunnel(options: {
    localPort?: number;
    localHost?: string;
    remoteHost: string;
    remotePort: number;
  }): Promise<SSHTunnel>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  uploadDirectory(localPath: string, remotePath: string): Promise<void>;

  // Chainable configuration methods
  env(env: Record<string, string>): SSHExecutionContext;
  cd(dir: string): SSHExecutionContext;
  timeout(ms: number): SSHExecutionContext;
  shell(shell: string | boolean): SSHExecutionContext;
  retry(options: { maxRetries?: number; initialDelay?: number; maxDelay?: number; factor?: number }): SSHExecutionContext;
}

/**
 * Create an enhanced SSH execution context
 */
export function createSSHExecutionContext(
  engine: ExecutionEngine,
  sshOptions: Omit<SSHAdapterOptions, 'type'>,
  commandConfig: {
    env?: Record<string, string>;
    cwd?: string;
    timeout?: number;
    shell?: string | boolean;
    retry?: { maxRetries?: number; initialDelay?: number; maxDelay?: number; factor?: number };
  } = {}
): SSHExecutionContext {
  /**
   * Execute a command via SSH
   */
  const exec = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    // Create new engine with SSH adapter configured
    let sshEngine = engine.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...sshOptions },
      ...commandConfig
    });

    // Apply retry if configured
    if (commandConfig.retry) {
      sshEngine = sshEngine.retry(commandConfig.retry);
    }

    // Use the engine's run method which properly handles template literals
    return (sshEngine as any).run(strings, ...values);
  };

  /**
   * Execute a raw command via SSH
   */
  const raw = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    let sshEngine = engine.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...sshOptions },
      ...commandConfig
    });

    // Apply retry if configured
    if (commandConfig.retry) {
      sshEngine = sshEngine.retry(commandConfig.retry);
    }

    return (sshEngine as any).raw(strings, ...values);
  };

  /**
   * Create an SSH tunnel
   */
  const tunnel = async (options: {
    localPort?: number;
    localHost?: string;
    remoteHost: string;
    remotePort: number;
  }): Promise<SSHTunnel> => {
    // Get the SSH adapter
    const adapter = engine.getAdapter('ssh') as SSHAdapter;
    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    // First, establish a connection by executing a simple command
    // This ensures the connection is established and cached
    await exec`echo "Establishing connection for tunnel"`.quiet();

    // Now create the tunnel using the established connection
    return adapter.tunnel(options) as Promise<SSHTunnel>;
  };

  /**
   * Upload a file via SFTP
   */
  const uploadFile = async (localPath: string, remotePath: string): Promise<void> => {
    const adapter = engine.getAdapter('ssh') as SSHAdapter;
    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    await adapter.uploadFile(localPath, remotePath, {
      type: 'ssh',
      ...sshOptions
    });
  };

  /**
   * Download a file via SFTP
   */
  const downloadFile = async (remotePath: string, localPath: string): Promise<void> => {
    const adapter = engine.getAdapter('ssh') as SSHAdapter;
    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    await adapter.downloadFile(remotePath, localPath, {
      type: 'ssh',
      ...sshOptions
    });
  };

  /**
   * Upload a directory via SFTP
   */
  const uploadDirectory = async (localPath: string, remotePath: string): Promise<void> => {
    const adapter = engine.getAdapter('ssh') as SSHAdapter;
    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    await adapter.uploadDirectory(localPath, remotePath, {
      type: 'ssh',
      ...sshOptions
    });
  };

  // Chainable configuration methods
  const env = (envVars: Record<string, string>): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    env: { ...commandConfig.env, ...envVars }
  });

  const cd = (dir: string): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    cwd: dir
  });

  const timeout = (ms: number): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    timeout: ms
  });

  const shell = (shellValue: string | boolean): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    shell: shellValue
  });

  const retry = (options: { maxRetries?: number; initialDelay?: number; maxDelay?: number; factor?: number }): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    retry: options
  });

  // Create the callable object
  const context = Object.assign(exec, {
    exec,
    raw,
    tunnel,
    uploadFile,
    downloadFile,
    uploadDirectory,
    env,
    cd,
    timeout,
    shell,
    retry
  });

  return context;
}