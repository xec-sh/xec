import type { Duration } from '../utils/helpers.js';
import type { Readable, Writable } from 'node:stream';
import type { SSHConnectionConfig } from '@xec-sh/ssh';
import type { RetryOptions } from '../utils/retry-adapter.js';
import type { ProcessHandle, ExecutionResource } from './process-handle.js';

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
export interface SSHAdapterOptions extends SSHConnectionConfig {
  type: 'ssh';
  host: string;
  username: string;
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
export type DockerPullPolicy = 'never' | 'missing' | 'always';

export interface DockerResources {
  /** Hard memory limit, in bytes (Docker requires at least 6 MiB). */
  memoryBytes?: number;
  /** CPU quota in cores, for example 0.5. */
  cpus?: number;
  /** Positive process limit for this owned container. */
  pidsLimit?: number;
}

export interface DockerRunOptions {
  image?: string;
  autoRemove?: boolean;
  volumes?: string[];
  env?: Record<string, string>;
  network?: string;
  platform?: string;
  pull?: DockerPullPolicy;
  resources?: DockerResources;
  entrypoint?: string | string[];
  workingDir?: string;
  workdir?: string;
  user?: string;
  ports?: string[];
  labels?: Record<string, string>;
  privileged?: boolean;
}

export interface DockerAdapterOptions extends DockerRunOptions {
  type: 'docker';
  container: string;
  tty?: boolean;
  runMode?: 'exec' | 'run';
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
  /**
   * Caller-journalled UUID of one execution attempt, fixed before effects.
   * It is ownership identity, not an in-memory deduplication cache. A caller
   * supplying it must persist admission and never replay the same attempt.
   * Automatic retries are refused: another attempt requires another UUID.
   */
  operationId?: string;

  // Basic
  command: string;                      // Command to execute
  args?: string[];                      // Command arguments

  // Execution context
  cwd?: string;                         // Working directory
  env?: Record<string, string>;         // Environment variables
  /**
   * Local environment policy. `merge` (default) overlays inherited variables.
   * `replace` passes only this command's env, excluding process, scope, engine
   * and adapter defaults and preferLocal PATH additions. Omitted env means {}.
   * A derived engine/scope may declare its own replacement map. Remote adapters
   * reject replacement because they cannot guarantee the remote process env.
   */
  envMode?: 'merge' | 'replace';
  /**
   * Execution timeout: milliseconds, or a duration string such as `'30s'`.
   *
   * Strings used to be accepted only by `.timeout()`; passed as an option they
   * reached setTimeout unparsed, became NaN and were clamped to 1ms, so every
   * command failed at once under a message claiming the full duration had
   * elapsed. Both spellings are normalized now.
   */
  timeout?: Duration;
  timeoutSignal?: string;               // Signal to send on timeout

  /**
   * Cap on captured output, in bytes.
   *
   * Present here, and not only on the adapter, because `$.with()` reuses the
   * parent's adapters to keep connection pools alive — so a cap set on a
   * derived engine never reached one, and a memory-safety control silently
   * did nothing.
   */
  maxBuffer?: number;

  /** Whether a non-zero exit throws. `.nothrow()` sets this to false. */
  throwOnNonZeroExit?: boolean;

  // Stream management
  /** Decode captured output using this command’s configuration snapshot. */
  encoding?: BufferEncoding;
  stdin?: string | Buffer | Readable;   // Input data
  stdout?: StreamOption;
  stderr?: StreamOption;
  /**
   * Redact captured stdout/stderr/stdall (default true). Set false when parsing
   * exact API payloads. Error objects, events and progress remain sanitized.
   * Native streams and caller-supplied Writable destinations retain their bytes.
   */
  redactOutput?: boolean;

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
   * Awaited write-ahead ownership registration. Docker run invokes it with
   * daemon/operation identity before create and with the full ID before start.
   * Recovered creation IDs are also registered before cleanup. Identity writes
   * after creation use a bounded recovery signal, even if the command was
   * cancelled. Rejection retains the unstarted resource for reconciliation.
   * Must honor the signal passed by Xec; do not substitute the command signal.
   */
  onResource?: (resource: ExecutionResource, signal: AbortSignal) => void | Promise<void>;

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