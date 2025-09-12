/**
 * Global type definitions for xec scripts
 * Import this file in your xec script to get TypeScript IntelliSense:
 * 
 * ```typescript
 * import '@xec-sh/cli/globals';
 * ```
 * 
 * This will make all types from @xec-sh/cli and @xec-sh/core available globally.
 */

// Import ALL types from @xec-sh/core
import type {
  K8sPod,
  Command,
  PipeTarget,
  Disposable,
  AdapterType,
  EventFilter,
  K8sLogStream,
  RetryOptions,
  ErrorContext,
  DockerOptions,
  DockerContext,
  ProgressEvent,
  ProcessPromise,
  SSHSudoOptions,
  K8sPortForward,
  ExecutionResult,
  ProgressOptions,
  ErrorSuggestion,
  SSHAdapterConfig,
  SSHAdapterOptions,
  CommandSuggestion,
  SSHExecutionContext,
  K8sExecutionContext,
  DisposableContainer,
  DockerAdapterOptions,
  EnhancedErrorDetails,
  ExecutionEngineConfig,
  DockerContainerConfig,
  DockerEphemeralOptions,
  CallableExecutionEngine,
  DockerPersistentOptions,
  KubernetesAdapterOptions,
  RemoteDockerAdapterOptions,
} from '@xec-sh/core';

// Import types from @xec-sh/cli config
import type {
  TargetType,
  TargetConfig,
  Configuration,
  CommandConfig,
  ResolvedTarget,
} from './config/types.js';

// Re-export commonly used items to global scope
declare global {
  // Core execution engine from @xec-sh/core
  const $: typeof import('@xec-sh/core').$;

  // Module loader functions
  const use: (spec: string) => Promise<any>;
  const x: (spec: string) => Promise<any>;

  // Script utilities from @xec-sh/cli
  const ps: typeof import('./utils/script-utils.js').ps;
  const cd: typeof import('./utils/script-utils.js').cd;
  const env: typeof import('./utils/script-utils.js').env;
  const csv: typeof import('./utils/script-utils.js').csv;
  const pwd: typeof import('./utils/script-utils.js').pwd;
  const log: typeof import('./utils/script-utils.js').log;
  const echo: typeof import('./utils/script-utils.js').echo;
  const exit: typeof import('./utils/script-utils.js').exit;
  const kill: typeof import('./utils/script-utils.js').kill;
  const yaml: typeof import('./utils/script-utils.js').yaml;
  const diff: typeof import('./utils/script-utils.js').diff;
  const sleep: typeof import('./utils/script-utils.js').sleep;
  const retry: typeof import('./utils/script-utils.js').retry;
  const quote: typeof import('./utils/script-utils.js').quote;
  const kit: typeof import('./utils/script-utils.js').kit;
  const prism: typeof import('./utils/script-utils.js').prism;
  const within: typeof import('./utils/script-utils.js').within;
  const setEnv: typeof import('./utils/script-utils.js').setEnv;
  const tmpdir: typeof import('./utils/script-utils.js').tmpdir;
  const spinner: typeof import('./utils/script-utils.js').spinner;
  const tmpfile: typeof import('./utils/script-utils.js').tmpfile;
  const loadEnv: typeof import('./utils/script-utils.js').loadEnv;
  const template: typeof import('./utils/script-utils.js').template;
  const parseArgs: typeof import('./utils/script-utils.js').parseArgs;
  const fs: typeof import('./utils/script-utils.js').fs;
  const os: typeof import('./utils/script-utils.js').os;
  const glob: typeof import('./utils/script-utils.js').glob;
  const path: typeof import('./utils/script-utils.js').path;
  const which: typeof import('./utils/script-utils.js').which;

  // Make types available in global namespace
  namespace Xec {
    export type {
      ProcessPromise,
      ExecutionResult,
      ExecutionEngineConfig,
      CallableExecutionEngine,
    };

    export type {
      Command,
      AdapterType,
      DockerOptions,
      DockerContext,
      SSHSudoOptions,
      SSHAdapterConfig,
      SSHAdapterOptions,
      SSHExecutionContext,
      DockerAdapterOptions,
      DockerContainerConfig,
      DockerEphemeralOptions,
      DockerPersistentOptions,
      KubernetesAdapterOptions,
      RemoteDockerAdapterOptions,
    };

    export type {
      K8sPod,
      K8sLogStream,
      K8sPortForward,
      K8sExecutionContext,
    };

    export type {
      PipeTarget,
      Disposable,
      EventFilter,
      RetryOptions,
      ProgressEvent,
      ProgressOptions,
      CommandSuggestion,
      DisposableContainer,
    };

    export type {
      ErrorContext,
      ErrorSuggestion,
      EnhancedErrorDetails,
    };

    export type {
      TargetType,
      TargetConfig,
      Configuration,
      CommandConfig,
      ResolvedTarget,
    };
  }
}

export type { Xec };
