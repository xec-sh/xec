import { ExecutionEngine, type ExecutionEngineConfig } from './core/execution-engine.js';

import type { CallableExecutionEngine } from './types/engine.js';

export { pipe } from './utils/pipe.js';
export { Pipeline } from './utils/pipeline.js';
export { isDisposable } from './types/disposable.js';
export { within, withinSync } from './utils/within.js';
export { DockerContainer } from './utils/docker-api.js';
export { LocalAdapter } from './adapters/local-adapter.js';
export { withTempDir, withTempFile } from './utils/temp.js';

export type { ExecutionEngineConfig };
export { ExecutionEngine } from './core/execution-engine.js';
export { DockerAdapter } from './adapters/docker-adapter.js';
export { parallel, ParallelEngine } from './utils/parallel.js';
export { SSHKeyValidator } from './utils/ssh-key-validator.js';
export { EnhancedEventEmitter } from './utils/event-emitter.js';
export { SecurePasswordHandler } from './utils/secure-password.js';
export { KubernetesAdapter } from './adapters/kubernetes-adapter.js';

export function createCallableEngine(engine: ExecutionEngine): CallableExecutionEngine {
  return new Proxy(function () { } as any, {
    // Handle function calls like $`ls`
    apply(target, thisArg, [strings, ...values]) {
      return engine.run(strings, ...values);
    },

    // Handle property access like $.ssh()
    get(target, prop: string) {
      const value = (engine as any)[prop];

      if (typeof value === 'function') {
        // Special handling for ssh method which returns SSHExecutionContext
        if (prop === 'ssh') {
          return value.bind(engine); // Return the SSH context directly
        }

        // Special handling for docker method which may return DockerContext
        if (prop === 'docker') {
          return (...args: any[]) => {
            const result = value.apply(engine, args);
            // If it returns a DockerContext (has start method), return it directly
            if (result && typeof result.start === 'function') {
              return result;
            }
            // Otherwise, it's an ExecutionEngine, wrap it
            return createCallableEngine(result);
          };
        }

        // Methods that return a new engine instance
        const chainableMethods = [
          'with', 'k8s', 'remoteDocker',
          'local', 'cd', 'env', 'timeout', 'shell', 'retry', 'defaults'
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
let defaultEngineInstance: ExecutionEngine | null = null;

// Main export - the $ function
export const $ = new Proxy(function () { } as any, {
  get(target, prop: string) {
    if (!defaultEngine) {
      defaultEngineInstance = new ExecutionEngine();
      defaultEngine = createCallableEngine(defaultEngineInstance);
    }
    return (defaultEngine as any)[prop];
  },

  apply(target, thisArg, args) {
    if (!defaultEngine) {
      defaultEngineInstance = new ExecutionEngine();
      defaultEngine = createCallableEngine(defaultEngineInstance);
    }
    return (defaultEngine as any)(...args);
  }
}) as CallableExecutionEngine;

export function configure(config: ExecutionEngineConfig): void {
  if (defaultEngineInstance) {
    cleanupEngine();
  }
  defaultEngineInstance = new ExecutionEngine(config);
  defaultEngine = createCallableEngine(defaultEngineInstance);
}

async function cleanupEngine(): Promise<void> {
  if (defaultEngineInstance) {
    try {
      // Call dispose if it exists
      if (typeof (defaultEngineInstance as any).dispose === 'function') {
        await (defaultEngineInstance as any).dispose();
      }
    } catch (error) {
      // Ignore errors during cleanup
    } finally {
      // Clear references
      defaultEngineInstance = null;
      defaultEngine = null;
    }
  }
}

// Export a way to dispose the global engine (for manual cleanup if needed)
export async function dispose(): Promise<void> {
  await cleanupEngine();
}

// Register cleanup handlers for process termination
let cleanupRegistered = false;

function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  // Handle normal process termination
  process.on('exit', () => {
    // Synchronous cleanup only - can't use async here
    if (defaultEngineInstance) {
      // Best effort cleanup - we can't await in exit handler
      cleanupEngine().catch(() => {
        // Ignore errors during cleanup
      });
    }
  });

  // Handle SIGINT (Ctrl+C)
  process.on('SIGINT', async () => {
    try {
      await cleanupEngine();
    } catch {
      // Ignore errors
    } finally {
      process.exit(0);
    }
  });

  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    try {
      await cleanupEngine();
    } catch {
      // Ignore errors
    } finally {
      process.exit(0);
    }
  });

  // Handle uncaught exceptions
  process.on('uncaughtException', async (error) => {
    console.error('Uncaught Exception:', error);
    try {
      await cleanupEngine();
    } catch {
      // Ignore errors
    } finally {
      process.exit(1);
    }
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', async (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    try {
      await cleanupEngine();
    } catch {
      // Ignore errors
    } finally {
      process.exit(1);
    }
  });
}

// Register cleanup handlers when the module is first loaded
registerCleanupHandlers();

export { RemoteDockerAdapter } from './adapters/remote-docker-adapter.js';
export { RetryError, withExecutionRetry as retry } from './utils/retry-adapter.js';

export {
  type ProgressEvent,
  type ProgressOptions
} from './utils/progress.js';
export {
  CommandError,
  TimeoutError,
  ConnectionError
} from './core/error.js';
export { SSHAdapter, type SSHSudoOptions, type SSHAdapterConfig } from './adapters/ssh-adapter.js';
export type { EventFilter } from './types/events.js';
export type { ExecutionResult } from './core/result.js';
export type { PipelineOptions } from './utils/pipeline.js';

export type { RetryOptions } from './utils/retry-adapter.js';

export type { SSHExecutionContext } from './utils/ssh-api.js';
export type { ProcessPromise } from './core/execution-engine.js';

export type { CallableExecutionEngine } from './types/engine.js';

export type { Disposable, DisposableContainer } from './types/disposable.js';
export type { DockerContext, DockerContainerConfig } from './utils/docker-api.js';
export type { K8sPod, K8sLogStream, K8sPortForward, K8sExecutionContext } from './utils/kubernetes-api.js';
export type {
  Command,
  AdapterType,
  SSHAdapterOptions,
  DockerAdapterOptions,
  KubernetesAdapterOptions,
  RemoteDockerAdapterOptions
} from './core/command.js';