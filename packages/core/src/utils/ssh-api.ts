import type { SSHAdapterOptions } from '../core/command.js';
import type { SSHAdapter } from '../adapters/ssh-adapter.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';

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
  }): Promise<{
    localPort: number;
    localHost: string;
    remoteHost: string;
    remotePort: number;
    isOpen: boolean;
    close: () => Promise<void>;
  }>;
  uploadFile(localPath: string, remotePath: string): Promise<void>;
  downloadFile(remotePath: string, localPath: string): Promise<void>;
  uploadDirectory(localPath: string, remotePath: string): Promise<void>;
}

/**
 * Create an enhanced SSH execution context
 */
export function createSSHExecutionContext(
  engine: ExecutionEngine,
  sshOptions: Omit<SSHAdapterOptions, 'type'>
): SSHExecutionContext {
  /**
   * Execute a command via SSH
   */
  const exec = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    // Create new engine with SSH adapter configured
    const sshEngine = engine.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...sshOptions }
    });
    
    // Use the engine's run method which properly handles template literals
    return (sshEngine as any).run(strings, ...values);
  };

  /**
   * Execute a raw command via SSH
   */
  const raw = (strings: TemplateStringsArray, ...values: any[]): ProcessPromise => {
    const sshEngine = engine.with({
      adapter: 'ssh',
      adapterOptions: { type: 'ssh', ...sshOptions }
    });
    
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
  }) => {
    // Get the SSH adapter
    const adapter = engine.getAdapter('ssh') as SSHAdapter;
    if (!adapter) {
      throw new Error('SSH adapter not available');
    }

    // First, establish a connection by executing a simple command
    // This ensures the connection is established and cached
    await exec`echo "Establishing connection for tunnel"`.quiet();

    // Now create the tunnel using the established connection
    return adapter.tunnel(options);
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

  // Create the callable object
  const context = Object.assign(exec, {
    exec,
    raw,
    tunnel,
    uploadFile,
    downloadFile,
    uploadDirectory
  });

  return context;
}