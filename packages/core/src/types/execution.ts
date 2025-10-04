import type { Command } from './command.js';

/**
 * Configuration for execution with partial command defaults
 */
export interface ExecutionConfig extends Partial<Command> {
  defaultEnv?: Record<string, string>;
  verbose?: boolean;
  debug?: boolean;
  quiet?: boolean;
}

/**
 * Event configuration options
 */
export interface EventConfig {
  // Event control
  enableEvents?: boolean;
  maxEventListeners?: number;
  
  // Event subscriptions
  events?: {
    onExecute?: (event: any) => void;
    onComplete?: (event: any) => void;
    onError?: (event: any) => void;
    onTimeout?: (event: any) => void;
    onProgress?: (event: any) => void;
  };
}

/**
 * Docker options for ephemeral container execution
 */
export interface DockerEphemeralOptions {
  image: string;
  autoRemove?: boolean;
  volumes?: string[];
  env?: Record<string, string>;
  network?: string;
  platform?: string;
  pull?: boolean;
  entrypoint?: string | string[];
  workingDir?: string;
  workdir?: string; // Alias for workingDir
  user?: string;
  ports?: string[];
  labels?: Record<string, string>;
  privileged?: boolean;
}

/**
 * Docker options for persistent container execution
 */
export interface DockerPersistentOptions {
  container: string;
  user?: string;
  workingDir?: string;
  workdir?: string; // Alias for workingDir
  env?: Record<string, string>;
}

/**
 * Union type for Docker execution options
 */
export type DockerOptions = DockerEphemeralOptions | DockerPersistentOptions;

/**
 * Main execution engine configuration
 */
export interface ExecutionEngineConfig extends EventConfig {
  // Global settings
  defaultAdapter?: string;
  throwOnNonZeroExit?: boolean;
  
  // Environment
  env?: Record<string, string>;
  defaultEnv?: Record<string, string>;
  
  // Working directory
  cwd?: string;
  defaultCwd?: string;
  
  // Shell configuration
  shell?: string | boolean;
  defaultShell?: string | boolean;
  
  // Timeouts
  timeout?: number;
  defaultTimeout?: number;
  
  // Stream configuration
  encoding?: BufferEncoding;
  verbose?: boolean;
  quiet?: boolean;
  
  // Retry configuration
  retry?: {
    retries?: number;
    delay?: number;
    factor?: number;
  };
  
  // Resource limits
  maxBuffer?: number;
  
  // Runtime detection
  runtime?: string;
  
  // Adapter configurations
  adapters?: {
    ssh?: any;     // SSHAdapterConfig
    docker?: any;  // DockerAdapterConfig
    kubernetes?: any; // KubernetesAdapterConfig
    local?: any;   // LocalAdapterConfig
  };
}