import type { SSHAdapter } from './index.js';
import type { Duration } from '../../utils/helpers.js';
import type { Command, SSHAdapterOptions } from '../../types/command.js';
import type { ProcessPromise, ExecutionEngine } from '../../core/execution-engine.js';

import { withEngineSurface } from '../target-surface.js';

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
 * A reverse tunnel: the remote host listens and forwards each connection to a
 * local address. The counterpart of {@link SSHTunnel}, which listens locally.
 */
export interface ReverseSSHTunnel {
  /** Port the remote host is listening on; resolved if 0 was requested. */
  remotePort: number;
  remoteHost: string;
  localHost: string;
  localPort: number;
  isOpen: boolean;
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
  /**
   * Open a reverse tunnel (`ssh -R`): the remote host listens and forwards
   * each connection to a local address.
   */
  reverseTunnel(options: {
    remotePort: number;
    remoteHost?: string;
    localHost?: string;
    localPort: number;
  }): Promise<ReverseSSHTunnel>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  uploadDirectory(localPath: string, remotePath: string): Promise<void>;

  // Chainable configuration methods
  env(env: Record<string, string>): SSHExecutionContext;
  cd(dir: string): SSHExecutionContext;
  timeout(duration: Duration): SSHExecutionContext;
  shell(shell: string | boolean): SSHExecutionContext;
  retry(options: { maxRetries?: number; initialDelay?: number; maxDelay?: number; factor?: number }): SSHExecutionContext;
  with(config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }): SSHExecutionContext;
  defaults(config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }): SSHExecutionContext;
}

/**
 * Create an enhanced SSH execution context
 */
export function createSSHExecutionContext(
  engine: ExecutionEngine,
  sshOptions: Omit<SSHAdapterOptions, 'type'>,
  commandConfig: Partial<Command> & {
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
   * Open a reverse tunnel through the established connection.
   */
  const reverseTunnel = async (options: {
    remotePort: number;
    remoteHost?: string;
    localHost?: string;
    localPort: number;
  }): Promise<ReverseSSHTunnel> => {
    const adapter = engine.getAdapter('ssh') as SSHAdapter;

    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    // The adapter binds the tunnel to the last used connection, so one must
    // exist before asking for it.
    await exec`echo "Establishing connection for tunnel"`.quiet();

    return adapter.reverseTunnel(options);
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

  const timeout = (duration: Duration): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    timeout: duration
  });

  const shell = (shellValue: string | boolean): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    shell: shellValue
  });

  const retry = (options: { maxRetries?: number; initialDelay?: number; maxDelay?: number; factor?: number }): SSHExecutionContext => createSSHExecutionContext(engine, sshOptions, {
    ...commandConfig,
    retry: options
  });

  /**
   * Derive a configured context that still targets this host.
   *
   * Returning a bare engine here would keep the SSH target but lose `tunnel`
   * and the file-transfer helpers — the reason this target was chosen.
   */
  const withConfig = (config: Partial<Command> & {
    defaultEnv?: Record<string, string>;
    defaultCwd?: string;
  }): SSHExecutionContext => {
    const { defaultEnv, defaultCwd, ...rest } = config;

    return createSSHExecutionContext(engine, sshOptions, {
      ...commandConfig,
      ...rest,
      ...(defaultCwd === undefined ? {} : { cwd: defaultCwd }),
      env: { ...commandConfig.env, ...defaultEnv, ...rest.env }
    });
  };

  // Create the callable object
  const context = Object.assign(exec, {
    exec,
    raw,
    tunnel,
    reverseTunnel,
    uploadFile,
    downloadFile,
    uploadDirectory,
    env,
    cd,
    timeout,
    shell,
    retry,
    with: withConfig,
    defaults: withConfig
  });

  // Everything else — which(), readFile(), batch(), transfer, the event
  // methods — is delegated to an engine already pointed at this host, so a
  // step written against one target runs against all of them.
  return withEngineSurface(context, () => {
    const targeted = engine.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...sshOptions },
      ...commandConfig
    });

    return commandConfig.retry ? targeted.retry(commandConfig.retry) : targeted;
  });
}