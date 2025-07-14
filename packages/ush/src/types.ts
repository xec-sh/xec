import type { ExecutionResult } from './core/result.js';
import type { ExecutionEngine } from './core/execution-engine.js';
import type { Command, SSHAdapterOptions, DockerAdapterOptions } from './core/command.js';


// Callable ExecutionEngine interface
export interface CallableExecutionEngine extends Omit<ExecutionEngine, 'with' | 'ssh' | 'docker' | 'local' | 'cd' | 'env' | 'timeout' | 'shell' | 'withRetry'> {
  // Make it callable
  (strings: TemplateStringsArray, ...values: any[]): Promise<ExecutionResult>;
  
  // Override methods that return CallableExecutionEngine instead of ExecutionEngine
  with(config: Partial<Command>): CallableExecutionEngine;
  ssh(options: Omit<SSHAdapterOptions, 'type'>): CallableExecutionEngine;
  docker(options: Omit<DockerAdapterOptions, 'type'>): CallableExecutionEngine;
  local(): CallableExecutionEngine;
  cd(dir: string): CallableExecutionEngine;
  env(env: Record<string, string>): CallableExecutionEngine;
  timeout(ms: number): CallableExecutionEngine;
  shell(shell: string | boolean): CallableExecutionEngine;
  withRetry(options: any): CallableExecutionEngine;
}