import type { Readable, Writable } from 'node:stream';
import type { ProcessHandle } from './process-handle.js';
import type { RetryOptions } from '../utils/retry-adapter.js';

/**
 * Stream configuration options for command execution
 */
export type StreamOption = 'pipe' | 'ignore' | 'inherit' | Writable;

/**
 * Supported adapter types for command execution
 */
export type AdapterType = 'local' | 'ssh' | 'docker' | 'kubernetes' | 'auto' | 'mock';

/**
 * SSH adapter configuration options
 */
export interface SSHAdapterOptions {
  type: 'ssh';
  host: string;
  username: string;
  port?: number;
  privateKey?: string | Buffer;
  passphrase?: string;
  password?: string;
  /**
   * Host key checking policy. Defaults to `accept-new`: a host's key is
   * recorded on first use and a later mismatch is refused.
   */
  hostKeyChecking?: 'accept-new' | 'strict' | 'off';
  /** Override the `known_hosts` file consulted for verification. */
  knownHostsPath?: string;
  sudo?: {
    enabled: boolean;
    password?: string;
    user?: string;
    passwordMethod?: 'stdin' | 'askpass' | 'echo' | 'secure';
    secureHandler?: any; // SecurePasswordHandler
  };
}

/**
 * Docker adapter configuration options
 */
export interface DockerAdapterOptions {
  type: 'docker';
  container: string;
  user?: string;
  workdir?: string;
  tty?: boolean;
  runMode?: 'exec' | 'run';
  image?: string;
  volumes?: string[];
  autoRemove?: boolean;
}

/**
 * Local adapter configuration options
 */
export interface LocalAdapterOptions {
  type: 'local';
}

/**
 * Kubernetes adapter configuration options
 */
export interface KubernetesAdapterOptions {
  type: 'kubernetes';
  pod: string;
  container?: string;
  namespace?: string;
  execFlags?: string[];
  tty?: boolean;
  stdin?: boolean;

  /**
   * Which cluster this target lives in.
   *
   * Without it a target belongs to whatever `kubectl config current-context`
   * happens to be — so a target that says `production` runs against staging,
   * or the reverse, silently and with the operator's full credentials.
   * A target names its own cluster; it does not inherit one.
   */
  context?: string;

  /** Kubeconfig this target is described by; defaults to the ambient one. */
  kubeconfig?: string;
}

/**
 * Union type for all adapter-specific options
 */
export type AdapterSpecificOptions =
  | SSHAdapterOptions
  | DockerAdapterOptions
  | LocalAdapterOptions
  | KubernetesAdapterOptions;

/**
 * Command execution configuration
 */
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

  /**
   * Called once the command is live, with a handle to it.
   *
   * This is how `ProcessPromise.child`, `.pid`, `.stdin`, `.stdout` and
   * `.stderr` get their values: the adapter owns the process, the caller
   * needs to reach it, and this is the seam between them.
   */
  onSpawn?: (handle: ProcessHandle) => void;

  /**
   * Opaque stack holder recording where the caller wrote this command.
   * Resolved into a `file:line` only if the command fails.
   */
  callSite?: { stack?: string } | null;

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