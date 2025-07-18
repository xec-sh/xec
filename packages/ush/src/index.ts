import { CallableExecutionEngine } from './types.js';
import { ExecutionEngine, type ExecutionEngineConfig } from './core/execution-engine.js';

export { pipe } from './utils/pipe.js';
export { SSHAdapter } from './adapters/ssh-adapter.js';

export { LocalAdapter } from './adapters/local-adapter.js';

export type { ExecutionEngineConfig };

// Essential utilities
export { withTempDir, withTempFile } from './utils/temp.js';

// For advanced users who need direct access
export { ExecutionEngine } from './core/execution-engine.js';
export { DockerAdapter } from './adapters/docker-adapter.js';

export { KubernetesAdapter } from './adapters/kubernetes-adapter.js';

// Create a Proxy-based wrapper for cleaner API
function createCallableEngine(engine: ExecutionEngine): CallableExecutionEngine {
  return new Proxy(function() {} as any, {
    // Handle function calls like $`ls`
    apply(target, thisArg, [strings, ...values]) {
      return engine.run(strings, ...values);
    },
    
    // Handle property access like $.ssh()
    get(target, prop: string) {
      const value = (engine as any)[prop];
      
      if (typeof value === 'function') {
        // Methods that return a new engine instance
        const chainableMethods = [
          'with', 'ssh', 'docker', 'kubernetes', 'remoteDocker', 
          'local', 'cd', 'env', 'timeout', 'shell', 'retry'
        ];
        
        if (chainableMethods.includes(prop)) {
          return (...args: any[]) => {
            const newEngine = value.apply(engine, args);
            return createCallableEngine(newEngine);
          };
        }
        
        // Regular methods
        return value.bind(engine);
      }
      
      return value;
    }
  }) as CallableExecutionEngine;
}

// Global instance
let defaultEngine: CallableExecutionEngine | null = null;

// Main export - the $ function
export const $ = new Proxy(function() {} as any, {
  get(target, prop: string) {
    if (!defaultEngine) {
      defaultEngine = createCallableEngine(new ExecutionEngine());
    }
    return (defaultEngine as any)[prop];
  },
  
  apply(target, thisArg, args) {
    if (!defaultEngine) {
      defaultEngine = createCallableEngine(new ExecutionEngine());
    }
    return (defaultEngine as any)(...args);
  }
}) as CallableExecutionEngine;

// Configuration function
export function configure(config: ExecutionEngineConfig): void {
  defaultEngine = createCallableEngine(new ExecutionEngine(config));
}

// That's it! Clean and simple API:
// - $ for execution
// - configure() for setup
// - Essential types
// - Core utilities

// Audit logging
export { AuditLogger, getAuditLogger } from './utils/audit-logger.js';
export { RemoteDockerAdapter } from './adapters/remote-docker-adapter.js';
// Progress reporting (commonly used)
export {
  type ProgressEvent,
  type ProgressOptions
} from './utils/progress.js';
// Core errors
export {
  CommandError,
  TimeoutError,
  ConnectionError
} from './core/error.js';
// Core types that users need
export type { ExecutionResult } from './core/result.js';
export type { CallableExecutionEngine } from './types.js';
export type { ProcessPromise } from './core/execution-engine.js';
export type { AuditEntry, AuditLoggerConfig } from './utils/audit-logger.js';
export type {
  Command,
  AdapterType,
  SSHAdapterOptions,
  DockerAdapterOptions,
  KubernetesAdapterOptions,
  RemoteDockerAdapterOptions
} from './core/command.js';

// Export createCallableEngine for testing
export { createCallableEngine };