import type { DockerOptions } from '../types/execution.js';
import type { RetryOptions } from '../utils/retry-adapter.js';
import type { SSHExecutionContext } from '../adapters/ssh/ssh-api.js';
import type { DockerFluentAPI } from '../adapters/docker/docker-fluent-api.js';
import type { ProcessPromise, ExecutionEngine } from '../core/execution-engine.js';
import type { K8sExecutionContext } from '../adapters/kubernetes/kubernetes-api.js';
import type { Command, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions } from '../types/command.js';

// Callable ExecutionEngine interface
export interface CallableExecutionEngine extends Omit<ExecutionEngine, 'with' | 'ssh' | 'docker' | 'k8s' | 'local' | 'cd' | 'env' | 'timeout' | 'shell' | 'retry' | 'defaults'> {
  // Make it callable
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  // Raw template literal support (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;

  // Override methods that return CallableExecutionEngine instead of ExecutionEngine
  with(config: Partial<Command>): CallableExecutionEngine;
  /**
   * Run a command that is already a string, with the full chaining API.
   *
   * The first-class path for commands that arrive from config, a database or
   * an agent rather than being written as a template literal.
   */
  exec(command: string, options?: Partial<Command>): ProcessPromise;

  /** Target an SSH host by `[user@]host[:port]` shorthand or full options. */
  ssh(target: string | Omit<SSHAdapterOptions, 'type'>): SSHExecutionContext;
  docker(options: DockerOptions): CallableExecutionEngine;
  docker(options: Omit<DockerAdapterOptions, 'type'>): CallableExecutionEngine;
  docker(): DockerFluentAPI;
  /** Target a pod by `[namespace/]pod[:container]` shorthand or full options. */
  k8s(target?: string | Omit<KubernetesAdapterOptions, 'type'>): K8sExecutionContext;
  local(): CallableExecutionEngine;
  cd(dir: string): CallableExecutionEngine;
  env(env: Record<string, string>): CallableExecutionEngine;
  timeout(ms: number): CallableExecutionEngine;
  shell(shell: string | boolean): CallableExecutionEngine;
  retry(options: RetryOptions): CallableExecutionEngine;
  defaults(config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }): CallableExecutionEngine;

  // Configuration property
  readonly config: {
    set(updates: Partial<import('../core/execution-engine.js').ExecutionEngineConfig>): void;
    get(): Readonly<import('../core/execution-engine.js').ExecutionEngineConfig>;
  };

  // Directory operations
  pwd(): string;
}