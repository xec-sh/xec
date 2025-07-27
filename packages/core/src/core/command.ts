import type { Readable, Writable } from 'node:stream';

import type { RetryOptions } from '../utils/retry-adapter.js';

export type StreamOption = 'pipe' | 'ignore' | 'inherit' | Writable;
export type AdapterType = 'local' | 'ssh' | 'docker' | 'kubernetes' | 'remote-docker' | 'auto' | 'mock';

export interface SSHAdapterOptions {
  type: 'ssh';
  host: string;
  username: string;
  port?: number;
  privateKey?: string | Buffer;
  passphrase?: string;
  password?: string;
  sudo?: {
    enabled: boolean;
    password?: string;
    user?: string;
    passwordMethod?: 'stdin' | 'askpass' | 'echo' | 'secure';
    secureHandler?: any; // SecurePasswordHandler
  };
}

export interface DockerAdapterOptions {
  type: 'docker';
  container: string;
  user?: string;
  workdir?: string;
  tty?: boolean;
}

export interface LocalAdapterOptions {
  type: 'local';
}

export interface KubernetesAdapterOptions {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  execFlags?: string[];
  tty?: boolean;
  stdin?: boolean;
}

export interface RemoteDockerAdapterOptions {
  type: 'remote-docker';
  ssh: Omit<SSHAdapterOptions, 'type'>;
  docker: Omit<DockerAdapterOptions, 'type'>;
}

export type AdapterSpecificOptions =
  | SSHAdapterOptions
  | DockerAdapterOptions
  | LocalAdapterOptions
  | KubernetesAdapterOptions
  | RemoteDockerAdapterOptions;

export interface Command {
  // Basic
  command: string;                      // Command to execute
  args?: string[];                      // Command arguments

  // Execution context
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  timeout?: number;                     // Execution timeout
  timeoutSignal?: string;               // Signal to send on timeout

  // Stream management
  stdin?: string | Buffer | Readable;   // Input data
  stdout?: StreamOption;
  stderr?: StreamOption;

  // Execution options
  shell?: string | boolean;             // Use shell
  detached?: boolean;                   // Detached process
  signal?: AbortSignal;                 // Abort signal
  nothrow?: boolean;                    // Don't throw exceptions on non-zero exit code

  // Retry configuration
  retry?: RetryOptions;                 // Retry options

  // Progress reporting
  progress?: {
    enabled?: boolean;
    onProgress?: (event: any) => void;
    updateInterval?: number;
    reportLines?: boolean;
  };

  // Adapter-specific
  adapter?: AdapterType;
  adapterOptions?: AdapterSpecificOptions;
}