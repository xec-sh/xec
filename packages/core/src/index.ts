import { ExecutionEngine, type ExecutionEngineConfig } from './core/execution-engine.js';

import type { Command } from './types/command.js';
import type { CallableExecutionEngine } from './types/engine.js';

export { pipeUtils } from './utils/pipe.js';
export { isDisposable } from './types/disposable.js';
export { within, withinSync } from './utils/within.js';
export { LocalAdapter } from './adapters/local/index.js';
export { DockerAdapter } from './adapters/docker/index.js';
export { withTempDir, withTempFile } from './utils/temp.js';
export { ExecutionEngine } from './core/execution-engine.js';
export { parallel, ParallelEngine } from './utils/parallel.js';

export type { ExecutionEngineConfig };
export { EnhancedEventEmitter } from './utils/event-emitter.js';
export { DockerContainer } from './adapters/docker/docker-api.js';
export { KubernetesAdapter } from './adapters/kubernetes/index.js';
export { RuntimeDetector } from './adapters/local/runtime-detect.js';
export { SSHKeyValidator } from './adapters/ssh/ssh-key-validator.js';
export { SecurePasswordHandler } from './adapters/ssh/secure-password.js';

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

        // Special handling for docker method which may return DockerFluentBuildAPI or ExecutionEngine
        if (prop === 'docker') {
          return (...args: any[]) => {
            const result = value.apply(engine, args);
            // If it returns DockerFluentAPI (has ephemeral/persistent methods), return it directly
            if (result && (typeof result.ephemeral === 'function' || typeof result.persistent === 'function')) {
              return result;
            }
            // Otherwise, it's an ExecutionEngine, wrap it
            return createCallableEngine(result);
          };
        }

        // Methods that return a new engine instance
        const chainableMethods = [
          'with', 'k8s',
          'local', 'cd', 'env', 'timeout', 'shell', 'retry', 'defaults', 'raw'
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

    // Special handling for defaults() on global $ to mutate instead of create new instance
    if (prop === 'defaults') {
      return (config: Partial<Command> & { defaultEnv?: Record<string, string>; defaultCwd?: string }) => {
        if (!defaultEngineInstance) {
          defaultEngineInstance = new ExecutionEngine();
          defaultEngine = createCallableEngine(defaultEngineInstance);
        }

        // Build the config update object
        const configUpdate: Partial<ExecutionEngineConfig> = {};

        if (config.defaultEnv) {
          configUpdate.defaultEnv = config.defaultEnv;
        }
        if (config.defaultCwd !== undefined) {
          configUpdate.defaultCwd = config.defaultCwd;
        }
        if (config.timeout !== undefined) {
          configUpdate.defaultTimeout = config.timeout;
        }
        if (config.shell !== undefined) {
          configUpdate.defaultShell = config.shell;
        }
        if (config.env !== undefined) {
          configUpdate.defaultEnv = { ...configUpdate.defaultEnv, ...config.env };
        }
        if (config.cwd !== undefined && config.defaultCwd === undefined) {
          configUpdate.defaultCwd = config.cwd;
        }

        // Use config.set() to mutate the global configuration
        (defaultEngine as any).config.set(configUpdate);

        // Return the same global $ for chaining
        return defaultEngine;
      };
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

let isConfiguringPromise: Promise<void> | null = null;

export function configure(config: ExecutionEngineConfig): void {
  // Create a synchronous version that schedules cleanup asynchronously
  if (defaultEngineInstance) {
    // Store the old instance to clean up
    const oldInstance = defaultEngineInstance;

    // Create new instance immediately to avoid race conditions
    defaultEngineInstance = new ExecutionEngine(config);
    defaultEngine = createCallableEngine(defaultEngineInstance);

    // Schedule cleanup of old instance asynchronously
    isConfiguringPromise = (async () => {
      try {
        if (typeof (oldInstance as any).dispose === 'function') {
          await (oldInstance as any).dispose();
        }
      } catch (error) {
        // Ignore errors during cleanup
      } finally {
        isConfiguringPromise = null;
      }
    })();
  } else {
    defaultEngineInstance = new ExecutionEngine(config);
    defaultEngine = createCallableEngine(defaultEngineInstance);
  }
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
  // Wait for any ongoing configuration to complete
  if (isConfiguringPromise) {
    await isConfiguringPromise;
  }
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
      // Only exit if not in test environment
      if (process.env['NODE_ENV'] !== 'test') {
        process.exit(0);
      }
    }
  });

  // Handle SIGTERM
  process.on('SIGTERM', async () => {
    try {
      await cleanupEngine();
    } catch {
      // Ignore errors
    } finally {
      // Only exit if not in test environment
      if (process.env['NODE_ENV'] !== 'test') {
        process.exit(0);
      }
    }
  });

  // Handle uncaught exceptions (skip in test environment)
  if (process.env['NODE_ENV'] !== 'test' && !process.env['JEST_WORKER_ID']) {
    process.on('uncaughtException', async (error) => {
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
      // Check if this is an xec promise that will be handled later
      const isXecPromise = (promise as any).__isXecPromise ||
        (reason && (reason as any).code === 'COMMAND_FAILED') ||
        (reason && (reason as any).constructor && (reason as any).constructor.name === 'CommandError');

      if (isXecPromise) {
        // Suppress the warning for xec promises - they will be handled when awaited
        return;
      }

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
}

// Register cleanup handlers when the module is first loaded
registerCleanupHandlers();

export { RetryError, withExecutionRetry as retry } from './utils/retry-adapter.js';

export {
  type ProgressEvent,
  type ProgressOptions
} from './utils/progress.js';
export { SSHAdapter, type SSHSudoOptions, type SSHAdapterConfig } from './adapters/ssh/index.js';

export { findSimilar, CommandRegistry, checkForCommandTypo, getCommandCompletions, defaultCommandRegistry } from './utils/suggestions.js';

export {
  DockerFluentAPI,
  DockerFluentBuildAPI,
  DockerRedisClusterAPI,
  type RedisClusterOptions
} from './adapters/docker/docker-fluent-api.js';
export {
  DockerError,
  CommandError,
  TimeoutError,
  AdapterError,
  ExecutionError,
  ConnectionError,
  KubernetesError
} from './core/error.js';
export type { EventFilter } from './types/events.js';
export type { PipeTarget } from './types/process.js';

export type { ExecutionResult } from './core/result.js';

export type { ProcessPromise } from './types/process.js';
export type { RetryOptions } from './utils/retry-adapter.js';

export type { CommandSuggestion } from './utils/suggestions.js';
export type { CallableExecutionEngine } from './types/engine.js';

export type { SSHExecutionContext } from './adapters/ssh/ssh-api.js';
export type { Disposable, DisposableContainer } from './types/disposable.js';
export type {
  ErrorContext,
  ErrorSuggestion,
  EnhancedErrorDetails
} from './types/error.js';
export type { DockerOptions, DockerEphemeralOptions, DockerPersistentOptions } from './types/execution.js';
export type { K8sPod, K8sLogStream, K8sPortForward, K8sExecutionContext } from './adapters/kubernetes/kubernetes-api.js';
export type {
  Command,
  AdapterType,
  SSHAdapterOptions,
  DockerAdapterOptions,
  KubernetesAdapterOptions
} from './types/command.js';