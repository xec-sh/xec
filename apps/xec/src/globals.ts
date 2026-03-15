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

// Re-export specific commonly used types for convenience
import type {
  Command,
  DockerOptions,
  ProcessPromise,
  ExecutionResult,
  SSHAdapterOptions,
  DockerAdapterOptions,
  ExecutionEngineConfig,
  DockerEphemeralOptions,
  CallableExecutionEngine,
  DockerPersistentOptions,
  KubernetesAdapterOptions,
} from '@xec-sh/core';

// Import ALL exports from @xec-sh/core as a namespace
// This automatically includes all current and future types
import * as CoreExports from '@xec-sh/core';

// Import types from @xec-sh/cli config
import type {
  TargetType,
  TargetConfig,
  Configuration,
  CommandConfig,
  ResolvedTarget,
} from '@xec-sh/ops';

// Re-export commonly used items to global scope
declare global {
  // Core execution engine from @xec-sh/core
  const $: typeof import('@xec-sh/core').$;

  // Module loader functions
  const use: (spec: string) => Promise<any>;
  const x: (spec: string) => Promise<any>;

  // Script utilities from @xec-sh/cli
  const ps: typeof import('@xec-sh/ops').ps;
  const cd: typeof import('@xec-sh/ops').cd;
  const env: typeof import('@xec-sh/ops').env;
  const csv: typeof import('@xec-sh/ops').csv;
  const pwd: typeof import('@xec-sh/ops').pwd;
  const log: typeof import('@xec-sh/ops').log;
  const echo: typeof import('@xec-sh/ops').echo;
  const exit: typeof import('@xec-sh/ops').exit;
  const kill: typeof import('@xec-sh/ops').kill;
  const yaml: typeof import('@xec-sh/ops').yaml;
  const diff: typeof import('@xec-sh/ops').diff;
  const sleep: typeof import('@xec-sh/ops').sleep;
  const retry: typeof import('@xec-sh/ops').retry;
  const quote: typeof import('@xec-sh/ops').quote;
  const kit: typeof import('@xec-sh/ops').kit;
  const prism: typeof import('@xec-sh/ops').prism;
  const within: typeof import('@xec-sh/ops').within;
  const setEnv: typeof import('@xec-sh/ops').setEnv;
  const tmpdir: typeof import('@xec-sh/ops').tmpdir;
  const spinner: typeof import('@xec-sh/ops').spinner;
  const tmpfile: typeof import('@xec-sh/ops').tmpfile;
  const loadEnv: typeof import('@xec-sh/ops').loadEnv;
  const template: typeof import('@xec-sh/ops').template;
  const parseArgs: typeof import('@xec-sh/ops').parseArgs;
  const fs: typeof import('@xec-sh/ops').fs;
  const os: typeof import('@xec-sh/ops').os;
  const glob: typeof import('@xec-sh/ops').glob;
  const path: typeof import('@xec-sh/ops').path;
  const which: typeof import('@xec-sh/ops').which;

  // Make ALL types from @xec-sh/core available in global namespace
  // This automatically includes all current and future types
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Xec {
    // Re-export everything from @xec-sh/core
    export import Core = CoreExports;

    // Also re-export commonly used types directly for convenience
    export type {
      Command,
      DockerOptions,
      ProcessPromise,
      ExecutionResult,
      SSHAdapterOptions,
      DockerAdapterOptions,
      ExecutionEngineConfig,
      DockerEphemeralOptions,
      CallableExecutionEngine,
      DockerPersistentOptions,
      KubernetesAdapterOptions,
    };

    // Export CLI configuration types
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
