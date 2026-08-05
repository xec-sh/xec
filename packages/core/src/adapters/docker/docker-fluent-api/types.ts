/**
 * Docker Fluent API Type Definitions
 */

import type { ExecutionResult } from '../../../types/result.js';

/**
 * Base Docker container configuration
 */
export interface DockerContainerConfig {
  image?: string;
  container?: string;
  name?: string;
  workdir?: string;
  user?: string;
  env?: Record<string, string>;
  labels?: Record<string, string>;
  command?: string | string[];
  entrypoint?: string | string[];
}

/**
 * Ephemeral container specific configuration
 */
export interface DockerEphemeralConfig extends DockerContainerConfig {
  image: string;
  volumes?: string[];
  network?: string;
  ports?: string[];
  privileged?: boolean;
  autoRemove?: boolean;
  platform?: string;
  pull?: boolean;
  restart?: 'no' | 'always' | 'unless-stopped' | 'on-failure';
  memory?: string;
  cpus?: string;
  hostname?: string;
  domainname?: string;
  dns?: string[];
  dnsSearch?: string[];
  extraHosts?: string[];
  securityOpt?: string[];
  cap_add?: string[];
  cap_drop?: string[];
  devices?: string[];
  ulimits?: string[];
  shmSize?: string;
  sysctls?: Record<string, string>;
  tmpfs?: string[];
  init?: boolean;
  healthcheck?: DockerHealthcheck;
}

/**
 * Persistent container specific configuration
 */
export interface DockerPersistentConfig extends DockerContainerConfig {
  container: string;
}

/**
 * Docker healthcheck configuration
 */
export interface DockerHealthcheck {
  test: string | string[];
  interval?: string;
  timeout?: string;
  startPeriod?: string;
  retries?: number;
}

/**
 * Docker build configuration
 */
export interface DockerBuildConfig {
  context: string;
  dockerfile?: string;
  tag?: string;
  buildArgs?: Record<string, string>;
  target?: string;
  platform?: string;
  noCache?: boolean;
  pull?: boolean;
  progress?: 'auto' | 'plain' | 'tty';
  secrets?: Record<string, string>;
  ssh?: string;
  cacheFrom?: string[];
  cacheTo?: string[];
  outputs?: string[];
  labels?: Record<string, string>;
}

/**
 * Docker compose configuration
 */
export interface DockerComposeConfig {
  file?: string;
  projectName?: string;
  profiles?: string[];
  env?: Record<string, string>;
  parallel?: boolean;
  timeout?: number;
}

/**
 * Service lifecycle hooks
 */
export interface ServiceLifecycleHooks {
  beforeStart?: () => Promise<void> | void;
  afterStart?: () => Promise<void> | void;
  beforeStop?: () => Promise<void> | void;
  afterStop?: () => Promise<void> | void;
  healthCheck?: () => Promise<boolean>;
  onReady?: () => Promise<void> | void;
}

/**
 * Container runtime info
 */
export interface ContainerRuntimeInfo {
  id: string;
  name: string;
  image: string;
  status: string;
  ports: string[];
  networks: string[];
  created: Date;
  started?: Date;
  ip?: string;
  volumes?: string[];
  labels?: Record<string, string>;
}

/**
 * Cluster node info
 */
export interface ClusterNodeInfo {
  id: string;
  name: string;
  role: string;
  status: string;
  host: string;
  port: number;
  master?: string;
  replicas?: string[];
}

/**
 * Service status
 */
export interface ServiceStatus {
  running: boolean;
  healthy?: boolean;
  containers: ContainerRuntimeInfo[];
  endpoints?: string[];
  metrics?: Record<string, any>;
}

/**
 * Fluent API builder interface
 */
export interface FluentAPIBuilder<T> {
  build(): T;
  reset(): this;
  validate(): string[];
}

/**
 * Service manager interface
 */
export interface ServiceManager {
  start(): Promise<void>;
  stop(): Promise<void>;
  restart(): Promise<void>;
  remove(): Promise<void>;
  status(): Promise<ServiceStatus>;
  logs(options?: LogOptions): Promise<string>;
  exec(command: string | string[]): Promise<ExecutionResult>;
  isRunning(): Promise<boolean>;
  waitForReady(timeout?: number): Promise<void>;
}

/**
 * Log options
 */
export interface LogOptions {
  follow?: boolean;
  tail?: number | 'all';
  since?: string;
  until?: string;
  timestamps?: boolean;
  details?: boolean;
}

/**
 * Network configuration
 */
export interface NetworkConfig {
  name: string;
  driver?: 'bridge' | 'host' | 'overlay' | 'macvlan' | 'none';
  subnet?: string;
  gateway?: string;
  ipRange?: string;
  attachable?: boolean;
  internal?: boolean;
  labels?: Record<string, string>;
  options?: Record<string, string>;
}

/**
 * Volume configuration
 */
export interface VolumeConfig {
  name: string;
  driver?: string;
  labels?: Record<string, string>;
  options?: Record<string, string>;
}

/**
 * Registry configuration
 */
export interface RegistryConfig {
  url: string;
  username?: string;
  password?: string;
  email?: string;
  serverAddress?: string;
  identityToken?: string;
  registryToken?: string;
}

/**
 * Swarm service configuration
 */
export interface SwarmServiceConfig {
  name: string;
  image: string;
  replicas?: number;
  updateConfig?: {
    parallelism?: number;
    delay?: string;
    failureAction?: 'pause' | 'continue' | 'rollback';
    monitor?: string;
    maxFailureRatio?: number;
  };
  rollbackConfig?: {
    parallelism?: number;
    delay?: string;
    failureAction?: 'pause' | 'continue';
    monitor?: string;
    maxFailureRatio?: number;
  };
  placement?: {
    constraints?: string[];
    preferences?: Record<string, string>[];
    maxReplicas?: number;
  };
  resources?: {
    limits?: {
      cpus?: string;
      memory?: string;
    };
    reservations?: {
      cpus?: string;
      memory?: string;
    };
  };
  restartPolicy?: {
    condition?: 'none' | 'on-failure' | 'any';
    delay?: string;
    maxAttempts?: number;
    window?: string;
  };
  secrets?: Array<{
    source: string;
    target: string;
    uid?: string;
    gid?: string;
    mode?: number;
  }>;
  configs?: Array<{
    source: string;
    target: string;
    uid?: string;
    gid?: string;
    mode?: number;
  }>;
}

