/**
 * Configuration system type definitions for Xec
 */

import type { AdapterType as CoreAdapterType } from '@xec-sh/core';

/**
 * Re-export AdapterType from core for consistency
 */
export type { CoreAdapterType as AdapterType };

/**
 * Main configuration interface
 */
export interface Configuration {
  /** Configuration format version */
  version: string;

  /** Project name */
  name?: string;

  /** Project description */
  description?: string;

  /** Global variables for reuse */
  vars?: Record<string, any>;

  /** Execution targets (hosts, containers, pods) */
  targets?: TargetsConfig;

  /** Environment profiles */
  profiles?: Record<string, ProfileConfig>;

  /** Executable tasks */
  tasks?: Record<string, TaskConfig>;

  /** Scripts configuration */
  scripts?: ScriptConfig;

  /** Built-in command defaults */
  commands?: Record<string, CommandConfig>;

  /** Secrets configuration */
  secrets?: SecretsConfig;

  /** Extensions configuration */
  extensions?: ExtensionConfig[];
}

/**
 * Target types - aligned with core adapter types
 * Note: Use 'kubernetes' instead of 'k8s' for consistency with core
 */
export type TargetType = 'local' | 'ssh' | 'docker' | 'kubernetes';

/**
 * Base target configuration
 */
export interface BaseTarget {
  type: TargetType;
  name?: string;
  description?: string;
  env?: Record<string, string>;
  workdir?: string;
  cwd?: string;
}

/**
 * SSH host configuration
 */
export interface HostConfig extends BaseTarget {
  type: 'ssh';
  host: string;
  port?: number;
  user?: string;
  privateKey?: string;
  password?: string;
  passphrase?: string;
  proxy?: string;
  keepAlive?: boolean;
  keepAliveInterval?: number;
  connectionPool?: ConnectionPoolConfig;
  sudo?: {
    enabled?: boolean;
    method?: string;
    password?: string;
  };
  sftp?: {
    enabled?: boolean;
    concurrency?: number;
  };
  timeout?: number;
  shell?: boolean | string;
  encoding?: string;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
}

/**
 * Docker container configuration
 */
export interface ContainerConfig extends BaseTarget {
  type: 'docker';
  image?: string;
  container?: string;
  volumes?: string[];
  ports?: string[];
  network?: string;
  restart?: string;
  privileged?: boolean;
  user?: string;
  labels?: Record<string, string>;
  healthcheck?: DockerHealthCheckConfig;
  tty?: boolean;
  autoRemove?: boolean;
  socketPath?: string;
  runMode?: 'exec' | 'run';
  timeout?: number;
  shell?: boolean | string;
  encoding?: string;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
}

/**
 * Kubernetes pod configuration
 */
export interface PodConfig extends BaseTarget {
  type: 'kubernetes';
  namespace?: string;
  pod?: string;
  selector?: string;
  container?: string;
  context?: string;
  kubeconfig?: string;
  tty?: boolean;
  stdin?: boolean;
  execFlags?: string[];
  timeout?: number;
  shell?: boolean | string;
  encoding?: string;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
}

/**
 * Local target configuration
 */
export interface LocalConfig extends BaseTarget {
  type: 'local';
  timeout?: number;
  shell?: boolean | string;
  encoding?: string;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
}

/**
 * Union of all target types
 */
export type TargetConfig = HostConfig | ContainerConfig | PodConfig | LocalConfig;

/**
 * Targets configuration section
 */
export interface TargetsConfig {
  /** Global defaults for all target types */
  defaults?: TargetDefaults;

  /** Local machine (optional, defaults exist) */
  local?: LocalConfig;

  /** SSH hosts */
  hosts?: Record<string, Omit<HostConfig, 'type'>>;

  /** Docker containers */
  containers?: Record<string, Omit<ContainerConfig, 'type'>>;

  /** Kubernetes pods */
  pods?: Record<string, Omit<PodConfig, 'type'>>;

  /** Kubernetes configuration */
  kubernetes?: {
    $context?: string;
    $namespace?: string;
    [key: string]: any;
  };

  /** Docker compose integration */
  $compose?: {
    file?: string;
    project?: string;
  };
}

/**
 * Global target defaults
 */
export interface TargetDefaults {
  /** Common options (apply to all adapters) */
  timeout?: number;
  shell?: boolean | string;
  encoding?: string;
  maxBuffer?: number;
  throwOnNonZeroExit?: boolean;
  cwd?: string;
  env?: Record<string, string>;

  /** SSH-specific defaults */
  ssh?: SSHDefaults;

  /** Docker-specific defaults */
  docker?: DockerDefaults;

  /** Kubernetes-specific defaults */
  kubernetes?: KubernetesDefaults;
}

/**
 * SSH-specific default options
 */
export interface SSHDefaults {
  port?: number;
  keepAlive?: boolean;
  keepAliveInterval?: number;
  connectionPool?: {
    enabled?: boolean;
    maxConnections?: number;
    idleTimeout?: number;
  };
  sudo?: {
    enabled?: boolean;
    method?: string;
    password?: string;
  };
  sftp?: {
    enabled?: boolean;
    concurrency?: number;
  };
}

/**
 * Docker-specific default options
 */
export interface DockerDefaults {
  tty?: boolean;
  workdir?: string;
  autoRemove?: boolean;
  socketPath?: string;
  user?: string;
  runMode?: 'exec' | 'run';
}

/**
 * Kubernetes-specific default options
 */
export interface KubernetesDefaults {
  namespace?: string;
  tty?: boolean;
  stdin?: boolean;
  kubeconfig?: string;
  context?: string;
  execFlags?: string[];
}

/**
 * Profile configuration
 */
export interface ProfileConfig {
  /** Profile-specific variables */
  vars?: Record<string, any>;

  /** Profile-specific targets */
  targets?: Partial<TargetsConfig>;

  /** Profile-specific environment */
  env?: Record<string, string>;

  /** Extends another profile */
  extends?: string;
}

/**
 * Task parameter definition
 */
export interface TaskParameter {
  name: string;
  type?: 'string' | 'number' | 'boolean' | 'array' | 'enum';
  description?: string;
  required?: boolean;
  default?: any;
  pattern?: string;
  values?: any[];
  min?: number;
  max?: number;
  minItems?: number;
  maxItems?: number;
  itemType?: string;
}

/**
 * Task step definition
 */
export interface TaskStep {
  name?: string;
  command?: string;
  task?: string;
  script?: string;
  target?: string;
  targets?: string[];
  args?: string[];
  env?: Record<string, string>;
  when?: string;
  onSuccess?: 'continue' | 'abort';
  onFailure?: 'continue' | 'abort' | 'ignore' | TaskErrorHandler;
  alwaysRun?: boolean;
  register?: string;
  parallel?: boolean;
}

/**
 * Task error handler
 */
export interface TaskErrorHandler {
  retry?: number;
  delay?: string;
  task?: string;
  command?: string;
}

/**
 * Task hook definition
 */
export interface TaskHook {
  name?: string;
  command?: string;
  task?: string;
}

/**
 * Task configuration
 */
export type TaskConfig = string | TaskDefinition;

/**
 * Full task definition
 */
export interface TaskDefinition {
  command?: string;
  script?: string;
  description?: string;
  target?: string;
  targets?: string[];
  params?: TaskParameter[];
  steps?: TaskStep[];
  env?: Record<string, string>;
  workdir?: string;
  timeout?: string | number;
  parallel?: boolean;
  failFast?: boolean;
  maxConcurrent?: number;
  hooks?: {
    before?: TaskHook[];
    after?: TaskHook[];
    onError?: TaskHook[];
  };
  emits?: Array<{
    name: string;
    data?: any;
  }>;
  on?: Record<string, string>;
  onSuccess?: {
    emit?: string;
    command?: string;
  };
  onError?: {
    emit?: string;
    command?: string;
  };
  cache?: {
    key: string;
    ttl?: number;
    storage?: 'memory' | 'disk' | 'redis';
  };
  schedule?: string;
  template?: string;
  dependsOn?: string[];
  private?: boolean;
}

/**
 * Script configuration
 */
export interface ScriptConfig {
  /** Default environment for all scripts */
  env?: Record<string, string>;

  /** Auto-load these modules in scripts */
  globals?: string[];

  /** Sandbox configuration */
  sandbox?: {
    enabled?: boolean;
    restrictions?: ScriptRestriction[];
    memoryLimit?: string;
    cpuLimit?: number;
    timeout?: string;
  };
}

/**
 * Script restrictions
 */
export type ScriptRestriction =
  | 'no_network'
  | 'no_filesystem'
  | 'no_child_process';

/**
 * Command configuration
 */
export interface CommandConfig {
  /** Default timeout */
  defaultTimeout?: string | number;

  /** Default parallel execution */
  parallel?: boolean;

  /** Enable compression for transfers */
  compress?: boolean;

  /** Enable progress display */
  progress?: boolean;

  /** Dynamic port allocation */
  dynamic?: boolean;

  /** Watch interval */
  interval?: number;

  /** Clear screen before each run */
  clear?: boolean;

  /** Additional command-specific options */
  [key: string]: any;
}

/**
 * Secrets provider configuration
 */
export interface SecretsConfig {
  /** Provider type */
  provider: 'local' | 'vault' | '1password' | 'aws-secrets' | 'env' | 'dotenv';

  /** Provider-specific configuration */
  config?: {
    address?: string;
    path?: string;
    region?: string;
    file?: string;
    storageDir?: string;
    passphrase?: string;
    [key: string]: any;
  };
}

/**
 * Extension configuration
 */
export interface ExtensionConfig {
  /** Extension source (npm package, git repo, local path) */
  source: string;

  /** Tasks to import from extension */
  tasks?: string[];

  /** Extension-specific configuration */
  config?: Record<string, any>;
}

/**
 * Connection pool configuration
 */
export interface ConnectionPoolConfig {
  min?: number;
  max?: number;
  idleTimeout?: string | number;
  acquireTimeout?: string | number;
}

/**
 * Docker health check configuration
 */
export interface DockerHealthCheckConfig {
  test: string | string[];
  interval?: string;
  timeout?: string;
  retries?: number;
  startPeriod?: string;
}

/**
 * Variable interpolation types
 */
export type VariableValue =
  | string
  | number
  | boolean
  | null
  | VariableValue[]
  | { [key: string]: VariableValue };

/**
 * Target reference (parsed from string like "hosts.web-1")
 */
export interface TargetReference {
  type: 'hosts' | 'containers' | 'pods' | 'local';
  name?: string;
  pattern?: string;
  isWildcard?: boolean;
}

/**
 * Resolved target with full configuration
 */
export interface ResolvedTarget extends BaseTarget {
  id: string;
  type: TargetType;
  config: TargetConfig;
  source: 'configured' | 'detected' | 'created';
}

/**
 * Task execution result
 */
export interface TaskResult {
  task: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: Error;
  steps?: StepResult[];
}

/**
 * Task step execution result
 */
export interface StepResult {
  name?: string;
  success: boolean;
  duration: number;
  output?: string;
  error?: Error;
  target?: string;
}

/**
 * Configuration source information
 */
export interface ConfigSource {
  type: 'builtin' | 'global' | 'project' | 'profile' | 'env' | 'cli';
  path?: string;
  name?: string;
  priority: number;
  config: Partial<Configuration>;
}

/**
 * Variable context for interpolation
 */
export interface VariableContext {
  vars?: Record<string, any>;
  env?: Record<string, string>;
  params?: Record<string, any>;
  secrets?: Record<string, string>;
  profile?: string;
  target?: ResolvedTarget;
}

/**
 * Configuration validation error
 */
export interface ValidationError {
  path: string;
  message: string;
  value?: any;
  rule?: string;
}

/**
 * Configuration manager options
 */
export interface ConfigManagerOptions {
  /** Project root directory */
  projectRoot?: string;

  /** Global config directory */
  globalHomeDir?: string;

  /** Active profile */
  profile?: string;

  /** Environment variable prefix */
  envPrefix?: string;

  /** Enable caching */
  cache?: boolean;

  /** Strict mode (fail on warnings) */
  strict?: boolean;

  /** Secret provider configuration */
  secretProvider?: {
    type: 'local' | 'vault' | 'aws-secrets' | '1password' | 'env' | 'dotenv';
    config?: Record<string, any>;
  };
}