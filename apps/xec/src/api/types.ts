/**
 * Type definitions for the Xec Programmatic API
 */

import type { ExecutionEngine, ExecutionResult as CoreExecutionResult } from '@xec-sh/core';

import type { TargetType, ResolvedTarget, TaskDefinition as ConfigTaskDefinition } from '../config/types.js';

// Configuration API Types
export interface ConfigurationOptions {
  path?: string;
  profile?: string;
  overrides?: Record<string, any>;
}

export type ConfigValue = any;

export interface ProfileOptions {
  name: string;
  merge?: boolean;
}

export interface InterpolationContext {
  vars?: Record<string, any>;
  env?: Record<string, string>;
  params?: Record<string, any>;
  secrets?: Record<string, string>;
}

// Task API Types
export interface TaskDefinition extends ConfigTaskDefinition {
  name: string;
}

export interface TaskResult {
  success: boolean;
  outputs: Record<string, any>;
  error?: Error;
  duration?: number;
  steps?: StepResult[];
}

export interface StepResult {
  name: string;
  success: boolean;
  output?: string;
  error?: Error;
  duration?: number;
}

export interface TaskOptions {
  profile?: string;
  vars?: Record<string, any>;
  dryRun?: boolean;
}

export interface TaskExecutionOptions {
  target?: string;
  timeout?: number;
  env?: Record<string, string>;
  parallel?: boolean;
  maxConcurrent?: number;
}

// Target API Types
export type Target = ResolvedTarget;

export interface TargetInfo {
  type: TargetType;
  name?: string;
  host?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  config: any;
}

export interface ExecutionResult extends CoreExecutionResult {
  target?: Target;
}

export interface CopyOptions {
  recursive?: boolean;
  compress?: boolean;
  progress?: boolean;
  exclude?: string[];
}

export interface ForwardOptions {
  dynamic?: boolean;
  background?: boolean;
}

export interface PortForward {
  localPort: number;
  remotePort: number;
  target: Target;
  close: () => Promise<void>;
}

// Script Context Types
export interface ScriptGlobals {
  // Execution context
  $target: ExecutionEngine;
  $targetInfo?: TargetInfo;
  $: ExecutionEngine;

  // Script metadata
  __filename: string;
  __dirname: string;
  __script: ScriptInfo;

  // Configuration access
  config: any; // ConfigAPI instance
  vars: Record<string, any>;
  params: Record<string, any>;

  // Task management
  tasks: any; // TaskAPI instance
  targets: any; // TargetAPI instance

  // Utilities
  prism: any;
  glob: (pattern: string) => Promise<string[]>;
  minimatch: (path: string, pattern: string) => boolean;
}

export interface ScriptInfo {
  path: string;
  args: string[];
  target?: Target;
}