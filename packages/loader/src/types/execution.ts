/**
 * Execution-related types
 * @module @xec-sh/loader/types/execution
 */

/**
 * Execution engine interface (compatible with @xec-sh/core)
 * This provides a generic interface for command execution without tight coupling
 */
export interface ExecutionEngine {
  /**
   * Execute a command and return result
   */
  (command: string | TemplateStringsArray, ...args: unknown[]): Promise<ExecutionEngineResult>;
}

/**
 * Result from execution engine
 */
export interface ExecutionEngineResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/**
 * Module exports interface for dynamic module loading
 */
export interface ModuleExports {
  default?: unknown;
  [key: string]: unknown;
}

/**
 * Target configuration with known properties
 */
export interface TargetConfig {
  /** SSH host */
  host?: string;
  /** SSH port */
  port?: number;
  /** SSH username */
  username?: string;
  /** Docker container name */
  container?: string;
  /** Kubernetes pod name */
  pod?: string;
  /** Kubernetes namespace */
  namespace?: string;
  /** Working directory */
  cwd?: string;
  /** Environment variables */
  env?: Record<string, string>;
  /** Additional configuration */
  [key: string]: unknown;
}

/**
 * Target information for remote execution
 */
export interface TargetInfo {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name: string;
  host?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  config: TargetConfig;
}

/**
 * Script context passed to executing scripts
 */
export interface ScriptContext {
  args: string[];
  argv: string[];
  __filename: string;
  __dirname: string;
}

/**
 * Execution context options
 */
export interface ExecutionContextOptions {
  /** Target information for remote execution */
  target?: TargetInfo;

  /** Target execution engine (from @xec-sh/core) */
  targetEngine?: ExecutionEngine;

  /** Script context */
  context?: ScriptContext;

  /** Enable verbose logging */
  verbose?: boolean;

  /** Suppress output */
  quiet?: boolean;

  /** Working directory */
  cwd?: string;

  /** Environment variables */
  env?: Record<string, string>;

  /** Custom globals to inject */
  customGlobals?: Record<string, unknown>;
}

/**
 * Execution options for scripts
 */
export interface ExecutionOptions extends ExecutionContextOptions {
  /** Watch for file changes and re-execute */
  watch?: boolean;

  /** Enable TypeScript transformation */
  typescript?: boolean;

  /** Execution timeout in milliseconds */
  timeout?: number;

  /** Enable module caching */
  cache?: boolean;

  /** Preferred CDN for module loading */
  preferredCDN?: 'esm.sh' | 'jsr.io' | 'unpkg' | 'skypack' | 'jsdelivr';
}

/**
 * Execution result
 */
export interface ExecutionResult {
  /** Execution succeeded */
  success: boolean;

  /** Error if execution failed */
  error?: Error;

  /** Output from execution */
  output?: string;

  /** Exit code (if applicable) */
  exitCode?: number;
}

/**
 * Script loader options
 */
export interface ScriptLoaderOptions {
  /** Enable verbose logging */
  verbose?: boolean;

  /** Enable caching */
  cache?: boolean;

  /** Cache directory */
  cacheDir?: string;

  /** Preferred CDN */
  preferredCDN?: 'esm.sh' | 'jsr.io' | 'unpkg' | 'skypack' | 'jsdelivr';

  /** Suppress output */
  quiet?: boolean;

  /** Enable TypeScript support */
  typescript?: boolean;
}

/**
 * Code evaluation options
 */
export interface EvaluationOptions extends ExecutionContextOptions {
  /** Enable TypeScript transformation */
  typescript?: boolean;

  /** Evaluation timeout in milliseconds */
  timeout?: number;
}
