import { ExecutionResult } from './core/result.js';
import { CallableExecutionEngine } from './types.js';
import { Command, AdapterType, SSHAdapterOptions, DockerAdapterOptions } from './core/command.js';
import { ProcessPromise, ExecutionEngine, ExecutionEngineConfig } from './core/execution-engine.js';

// Re-export types
export type {
  Command,
  AdapterType,
  ProcessPromise,
  ExecutionResult,
  SSHAdapterOptions,
  DockerAdapterOptions,
  ExecutionEngineConfig,
  CallableExecutionEngine
};

export * from './utils/pipe.js';

export * from './utils/temp.js';
export * from './utils/retry.js';
export * from './utils/within.js';

// Helper to wrap ExecutionEngine into a callable function
function wrapEngine(engine: ExecutionEngine): CallableExecutionEngine {
  // Create a function that also has all the methods of ExecutionEngine
  const execFunction = async (strings: TemplateStringsArray, ...values: any[]): Promise<ExecutionResult> => engine.run(strings, ...values);

  // Copy all methods from engine to the function
  const prototype = Object.getPrototypeOf(engine);
  const propertyNames = Object.getOwnPropertyNames(prototype);

  for (const name of propertyNames) {
    if (name !== 'constructor') {
      const prop = (engine as any)[name];
      if (typeof prop === 'function') {
        // These methods return ExecutionEngine, so wrap the result
        if (name === 'with' || name === 'ssh' || name === 'docker' || name === 'local' || name === 'cd' || name === 'env' || name === 'timeout' || name === 'shell' || name === 'withRetry') {
          (execFunction as any)[name] = function (...args: any[]) {
            const result = prop.apply(engine, args);
            return wrapEngine(result);
          };
        } else {
          (execFunction as any)[name] = prop.bind(engine);
        }
      }
    }
  }

  // Copy non-function properties
  const engineProps = Object.getOwnPropertyNames(engine);
  for (const name of engineProps) {
    if (!(name in execFunction)) {
      const descriptor = Object.getOwnPropertyDescriptor(engine, name);
      if (descriptor) {
        Object.defineProperty(execFunction, name, descriptor);
      }
    }
  }

  // Add static properties
  Object.setPrototypeOf(execFunction, engine);

  // Add engine property for accessing raw engine
  (execFunction as any).engine = engine;

  return execFunction as any;
}

// Factory function to create execution engine
export function createExecutionEngine(config?: ExecutionEngineConfig): CallableExecutionEngine {
  const engine = new ExecutionEngine(config);
  return wrapEngine(engine);
}

// Default export with global configuration
let defaultEngine: ReturnType<typeof createExecutionEngine> | null = null;

export function getDefaultEngine(): ReturnType<typeof createExecutionEngine> {
  if (!defaultEngine) {
    defaultEngine = createExecutionEngine();
  }
  return defaultEngine;
}

// Configure default engine
export function configure(config: ExecutionEngineConfig): void {
  defaultEngine = createExecutionEngine(config);
}

// Convenience export
export const $ = new Proxy((() => { }) as any, {
  get(target, prop) {
    const engine = getDefaultEngine();
    if (prop in engine) {
      const value = (engine as any)[prop];
      if (typeof value === 'function') {
        return value.bind(engine);
      }
      return value;
    }
    return undefined;
  },
  apply(target, thisArg, argumentsList) {
    const engine = getDefaultEngine();
    return (engine as any)(...argumentsList);
  }
}) as CallableExecutionEngine;

// Additional utility functions
export async function exec(command: string, options?: Partial<Command>): Promise<ExecutionResult> {
  const engine = getDefaultEngine();
  return engine.execute({ command, shell: true, ...options });
}

export async function spawn(command: string, args?: string[], options?: Partial<Command>): Promise<ExecutionResult> {
  const engine = getDefaultEngine();
  return engine.execute({ command, args, shell: false, ...options });
}

// Helper to create engines with specific adapters
export const ssh = (options: Omit<SSHAdapterOptions, 'type'>): CallableExecutionEngine => {
  const engine = getDefaultEngine();
  return engine.ssh(options);
};

export const docker = (options: Omit<DockerAdapterOptions, 'type'>): CallableExecutionEngine => {
  const engine = getDefaultEngine();
  return engine.docker(options);
};

export const local = (): CallableExecutionEngine => {
  const engine = getDefaultEngine();
  return engine.local();
};


export * from './utils/stream.js';
export * from './utils/parallel.js';
export * from './utils/transfer.js';

export * from './utils/templates.js';
// Export global $ instance
export { $ as $$ } from './global.js';

export * from './utils/interactive.js';
export { withSpinner } from './utils/interactive.js';

export { SSHAdapter } from './adapters/ssh-adapter.js';
// Mock adapter for testing
export { MockAdapter } from './adapters/mock-adapter.js';

// Export adapters for direct usage
export { BaseAdapter } from './adapters/base-adapter.js';
export { LocalAdapter } from './adapters/local-adapter.js';
// Runtime detection utility
export { RuntimeDetector } from './utils/runtime-detect.js';
export { DockerAdapter } from './adapters/docker-adapter.js';
// Keep createEnhancedEngine as deprecated alias for backward compatibility
export const createEnhancedEngine = createExecutionEngine;
export { ProcessOutput, type ProcessOutputOptions } from './core/process-output.js';
// Re-export errors
export {
  DockerError,
  CommandError,
  TimeoutError,
  AdapterError,
  ExecutionError,
  ConnectionError
} from './core/error.js';
export type { SSHAdapterConfig } from './adapters/ssh-adapter.js';
// Re-export adapter configs
export type { LocalAdapterConfig } from './adapters/local-adapter.js';

export type { DockerAdapterConfig } from './adapters/docker-adapter.js';