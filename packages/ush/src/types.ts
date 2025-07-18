import type { ProcessPromise, ExecutionEngine } from './core/execution-engine.js';
import type { Command, SSHAdapterOptions, DockerAdapterOptions, KubernetesAdapterOptions, RemoteDockerAdapterOptions } from './core/command.js';


// Callable ExecutionEngine interface
export interface CallableExecutionEngine extends Omit<ExecutionEngine, 'with' | 'ssh' | 'docker' | 'kubernetes' | 'remoteDocker' | 'local' | 'cd' | 'env' | 'timeout' | 'shell' | 'withRetry' | 'retry'> {
  // Make it callable
  (strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Raw template literal support (no escaping)
  raw(strings: TemplateStringsArray, ...values: any[]): ProcessPromise;
  
  // Override methods that return CallableExecutionEngine instead of ExecutionEngine
  with(config: Partial<Command>): CallableExecutionEngine;
  ssh(options: Omit<SSHAdapterOptions, 'type'>): CallableExecutionEngine;
  docker(options: Omit<DockerAdapterOptions, 'type'>): CallableExecutionEngine;
  kubernetes(options: Omit<KubernetesAdapterOptions, 'type'>): CallableExecutionEngine;
  remoteDocker(options: Omit<RemoteDockerAdapterOptions, 'type'>): CallableExecutionEngine;
  local(): CallableExecutionEngine;
  cd(dir: string): CallableExecutionEngine;
  env(env: Record<string, string>): CallableExecutionEngine;
  timeout(ms: number): CallableExecutionEngine;
  shell(shell: string | boolean): CallableExecutionEngine;
  withRetry(options: any): CallableExecutionEngine;
  retry(options: any): CallableExecutionEngine;
}