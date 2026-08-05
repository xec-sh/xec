import type { Command } from './types/command.js';
import type { CallableExecutionEngine } from './types/engine.js';

import { ExecutionEngine, type ExecutionEngineConfig } from './core/execution-engine.js';

export { pipeUtils } from './utils/pipe.js';
export { isDisposable } from './types/disposable.js';
export type { EventFilter } from './types/events.js';
export type { PipeTarget } from './types/process.js';
export { ParallelEngine } from './utils/parallel.js';
import { getLocalContext } from './utils/within.js';

export { within, withinSync } from './utils/within.js';
export { parallel } from './utils/parallel-default.js';
export type { ExecutionResult } from './core/result.js';
export { LocalAdapter } from './adapters/local/index.js';
export type { ProcessPromise } from './types/process.js';
export { DockerAdapter } from './adapters/docker/index.js';

export { withTempDir, withTempFile } from './utils/temp.js';

export type { ExecutionEngineConfig };
export { ExecutionEngine } from './core/execution-engine.js';
export type { RetryOptions } from './utils/retry-adapter.js';
export { EnhancedEventEmitter } from './utils/event-emitter.js';
export type { CommandSuggestion } from './utils/suggestions.js';
export type { CallableExecutionEngine } from './types/engine.js';
export { DockerContainer } from './adapters/docker/docker-api.js';
export { KubernetesAdapter } from './adapters/kubernetes/index.js';

export function createCallableEngine(engine: ExecutionEngine): CallableExecutionEngine {
  return new Proxy(function callableEngineTarget() { } as any, {
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

        // k8s returns a K8sExecutionContext — a callable context like ssh's,
        // not an ExecutionEngine. Wrapping it in createCallableEngine gave a
        // proxy whose apply() called context.run(), which does not exist, so
        // `$.k8s(target)\`cmd\`` threw instead of executing.
        if (prop === 'k8s') {
          return value.bind(engine);
        }

        // Methods that return a new engine instance
        // interactive() belongs here for the same reason with() does: it
        // returns a configured engine, and every engine reachable from $ must
        // be usable as a template tag. Left out, `$.interactive()`cmd``
        // threw "not a function" — found when the release command handed the
        // terminal to `npm login` this way.
        const chainableMethods = [
          'with', 'interactive',
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
export const $ = new Proxy(function callableEngineTarget() { } as any, {
  get(target, prop: string) {
    if (!defaultEngine) {
      defaultEngineInstance = new ExecutionEngine();
      defaultEngine = createCallableEngine(defaultEngineInstance);
    }

    // The read half of `$.verbose = true`: a set that cannot be read back
    // looks exactly like the silent no-op it replaced.
    if (prop === 'verbose' || prop === 'quiet') {
      return Boolean((defaultEngine as any).config.get()[prop]);
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

        // Inside a `within()` scope, write to the scope rather than the
        // process-wide engine. Without this the whole point of the scope was
        // lost: `within(() => $.defaults({ cwd: '/tmp' }))` changed the
        // directory for the rest of the program, silently and permanently —
        // the opposite of what a scoped block promises, and the example our
        // own README used to illustrate isolation.
        const scope = getLocalContext();
        if (scope) {
          if (configUpdate.defaultEnv) {
            scope.defaultEnv = { ...scope.defaultEnv, ...configUpdate.defaultEnv };
          }
          if (configUpdate.defaultCwd !== undefined) {
            scope.cwd = configUpdate.defaultCwd;
          }
          if (configUpdate.defaultTimeout !== undefined) {
            scope.timeout = configUpdate.defaultTimeout;
          }
          if (configUpdate.defaultShell !== undefined) {
            scope.shell = configUpdate.defaultShell;
          }
          return defaultEngine;
        }

        // Use config.set() to mutate the global configuration
        (defaultEngine as any).config.set(configUpdate);

        // Return the same global $ for chaining
        return defaultEngine;
      };
    }

    return (defaultEngine as any)[prop];
  },

  // Without a set trap, `$.verbose = true` — zx muscle memory — assigned a
  // property onto the proxy target and silently did nothing. The get half
  // lives in the main trap above: a set that cannot be read back looks
  // exactly like the bug it replaced.
  set(target, prop: string, value) {
    if (!defaultEngine) {
      defaultEngineInstance = new ExecutionEngine();
      defaultEngine = createCallableEngine(defaultEngineInstance);
    }

    if (prop === 'verbose' || prop === 'quiet') {
      (defaultEngine as any).config.set({ [prop]: Boolean(value) });
      return true;
    }

    return Reflect.set(target, prop, value);
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
      } catch {
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
    } catch {
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
  removeCleanupHandlers();
}

// Branded symbol for xec promise identification (replaces fragile string-based checks)
const XEC_PROMISE_BRAND = Symbol.for('xec:promise');

/** Mark a promise as an xec promise for unhandled rejection suppression */
export function brandXecPromise(promise: Promise<unknown>): void {
  (promise as unknown as Record<symbol, boolean>)[XEC_PROMISE_BRAND] = true;
}

// Store handler references for proper cleanup
const cleanupHandlers: {
  exit?: () => void;
  sigint?: () => void;
  sigterm?: () => void;
  uncaughtException?: (error: Error) => void;
  unhandledRejection?: (reason: unknown, promise: Promise<unknown>) => void;
} = {};

let cleanupRegistered = false;

function registerCleanupHandlers(): void {
  if (cleanupRegistered) return;
  cleanupRegistered = true;

  cleanupHandlers.exit = () => {
    if (defaultEngineInstance) {
      cleanupEngine().catch(() => { /* best effort */ });
    }
  };
  process.on('exit', cleanupHandlers.exit);

  // Release connections and temp files on a termination signal, but do not
  // exit: whether the process should stop is the application's decision, and
  // an embedded library calling process.exit() takes that away.
  cleanupHandlers.sigint = async () => {
    try { await cleanupEngine(); } catch { /* ignore */ }
  };
  process.on('SIGINT', cleanupHandlers.sigint);

  cleanupHandlers.sigterm = async () => {
    try { await cleanupEngine(); } catch { /* ignore */ }
  };
  process.on('SIGTERM', cleanupHandlers.sigterm);

}

/** Remove all registered cleanup handlers (for tests and dispose) */
function removeCleanupHandlers(): void {
  if (cleanupHandlers.exit) process.removeListener('exit', cleanupHandlers.exit);
  if (cleanupHandlers.sigint) process.removeListener('SIGINT', cleanupHandlers.sigint);
  if (cleanupHandlers.sigterm) process.removeListener('SIGTERM', cleanupHandlers.sigterm);
  if (cleanupHandlers.uncaughtException) process.removeListener('uncaughtException', cleanupHandlers.uncaughtException);
  if (cleanupHandlers.unhandledRejection) process.removeListener('unhandledRejection', cleanupHandlers.unhandledRejection);
  cleanupRegistered = false;
}

/**
 * Register best-effort cleanup of engine resources on process termination.
 *
 * Not called on import. A library that installs process-global handlers takes
 * over decisions that belong to the application: this module previously
 * handled `unhandledRejection` and called `process.exit(1)`, so importing it
 * killed the host process on a rejection that had nothing to do with xec.
 *
 * Call this from an application entry point — the xec CLI does — when you want
 * connections and temp files released on SIGINT/SIGTERM.
 *
 * @example
 * ```typescript
 * import { installCleanupHandlers } from '@xec-sh/core';
 *
 * installCleanupHandlers();
 * ```
 */
export function installCleanupHandlers(): void {
  registerCleanupHandlers();
}

/** Remove handlers installed by {@link installCleanupHandlers}. */
export function uninstallCleanupHandlers(): void {
  removeCleanupHandlers();
}

export { RuntimeDetector } from './adapters/local/runtime-detect.js';

export type { SSHExecutionContext } from './adapters/ssh/ssh-api.js';
export { SSHKeyValidator } from './adapters/ssh/ssh-key-validator.js';

export { SecurePasswordHandler } from './adapters/ssh/secure-password.js';

export { parseK8sTarget, parseSSHTarget } from './utils/target-shorthand.js';
export type { Disposable, DisposableContainer } from './types/disposable.js';
export { RetryError, withExecutionRetry as retry } from './utils/retry-adapter.js';
export {
  type ProgressEvent,
  type ProgressOptions
} from './utils/progress.js';

export { dialectFor, quoteForShell, type ShellDialect } from './utils/shell-escape.js';

export { isRecoverable, classifyFailure, type FailureKind } from './core/failure-kind.js';

export { SSHAdapter, type SSHSudoOptions, type SSHAdapterConfig } from './adapters/ssh/index.js';
export type {
  ErrorContext,
  ErrorSuggestion,
  EnhancedErrorDetails
} from './types/error.js';

export type { DockerOptions, DockerEphemeralOptions, DockerPersistentOptions } from './types/execution.js';
export type { K8sPod, K8sLogStream, K8sPortForward, K8sExecutionContext } from './adapters/kubernetes/kubernetes-api.js';

export { findSimilar, CommandRegistry, checkForCommandTypo, getCommandCompletions, defaultCommandRegistry } from './utils/suggestions.js';
export type {
  Command,
  AdapterType,
  SSHAdapterOptions,
  DockerAdapterOptions,
  KubernetesAdapterOptions
} from './types/command.js';
// Core helpers — zx-compatible utilities
export {
  echo,
  glob,
  kill,
  sleep,
  xfetch,
  readStdin,
  expBackoff,
  parseDuration,
  type Duration,
} from './utils/helpers.js';
// The Docker fluent surface. `DockerEphemeralFluentAPI` and the service
// types are exported by name because the CLI's service presets (moved out of
// core in 0.10) extend the ephemeral builder — they were already reachable
// through `DockerFluentAPI.ephemeral()`, this only makes them nameable.
export {
  DockerFluentAPI,
  type ServiceStatus,
  type ServiceManager,
  DockerFluentBuildAPI,
  type ClusterNodeInfo,
  DockerEphemeralFluentAPI,
  type ContainerRuntimeInfo
} from './adapters/docker/docker-fluent-api.js';
export {
  DockerError,
  CommandError,
  TimeoutError,
  AdapterError,
  ExecutionError,
  ConnectionError,
  KubernetesError,
  explainExitCode,
  // Thrown when output passes maxBuffer. Exported because the caller has to be
  // able to tell truncated output from a command that genuinely printed
  // little, and `instanceof` is how they do it.
  MaxBufferExceededError
} from './core/error.js';
/**
 * Event types.
 *
 * These were previously internal, which left a consumer no way to type an
 * event handler — the observed result was `(event: any)` at every call site
 * in a project that is otherwise strictly typed.
 */
export type {
  UshEvent,
  UshEventMap,
  UshEventType,
  BaseUshEvent,
  K8sExecEvent,
  DockerRunEvent,
  SSHConnectEvent,
  SSHExecuteEvent,
  DockerExecEvent,
  RetryFailedEvent,
  TypedEventEmitter,
  CommandStartEvent,
  CommandErrorEvent,
  CommandRetryEvent,
  SSHReconnectEvent,
  RetryAttemptEvent,
  RetrySuccessEvent,
  SSHDisconnectEvent,
  TransferStartEvent,
  TransferErrorEvent,
  SSHPoolMetricsEvent,
  ConnectionOpenEvent,
  CommandCompleteEvent,
  ConnectionCloseEvent,
  TransferCompleteEvent,
} from './types/events.js';