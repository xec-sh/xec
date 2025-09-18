/**
 * Event types for USH EventEmitter architecture
 * Following the lightweight event-driven approach
 */

/**
 * Base event interface
 */
export interface BaseUshEvent {
  timestamp: Date;
  adapter: string;
}

/**
 * Command events
 */
export interface CommandStartEvent extends BaseUshEvent {
  command: string;
  args?: string[];
  cwd?: string;
  shell?: boolean;
  env?: Record<string, string>;
}

export interface CommandCompleteEvent extends BaseUshEvent {
  command: string;
  exitCode: number;
  stdout?: string;
  stderr?: string;
  duration: number;
}

export interface CommandErrorEvent extends BaseUshEvent {
  command: string;
  error: string;
  duration: number;
}

export interface CommandRetryEvent extends BaseUshEvent {
  command: string;
  attempt: number;
  maxRetries: number;
}

/**
 * File operation events
 */
export interface FileReadEvent extends BaseUshEvent {
  path: string;
  size?: number;
}

export interface FileWriteEvent extends BaseUshEvent {
  path: string;
  size?: number;
}

export interface FileDeleteEvent extends BaseUshEvent {
  path: string;
}

/**
 * SSH events
 */
export interface SSHConnectEvent extends BaseUshEvent {
  host: string;
  port?: number;
  username?: string;
}

export interface SSHDisconnectEvent extends BaseUshEvent {
  host: string;
  reason?: string;
}

export interface SSHExecuteEvent extends BaseUshEvent {
  host: string;
  command: string;
}

export interface SSHKeyValidatedEvent extends BaseUshEvent {
  host: string;
  keyType: string;
  username: string;
}

export interface SSHPoolMetricsEvent extends BaseUshEvent {
  metrics: {
    activeConnections: number;
    idleConnections: number;
    totalConnections: number;
    connectionsCreated: number;
    connectionsDestroyed: number;
    connectionsFailed: number;
    reuseCount: number;
    averageIdleTime: number;
    averageUseCount: number;
    lastCleanup: Date | null;
  };
}

export interface SSHPoolCleanupEvent extends BaseUshEvent {
  cleaned: number;
  remaining: number;
  reason?: string;
}

export interface SSHReconnectEvent extends BaseUshEvent {
  host: string;
  attempts: number;
  success?: boolean;
}

export interface SSHTunnelCreatedEvent extends BaseUshEvent {
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

export interface SSHTunnelClosedEvent extends BaseUshEvent {
  localPort: number;
  remoteHost: string;
  remotePort: number;
}

/**
 * Docker events
 */
export interface DockerRunEvent extends BaseUshEvent {
  image: string;
  container?: string;
  command?: string;
}

export interface DockerExecEvent extends BaseUshEvent {
  container: string;
  command: string;
}

/**
 * Kubernetes events
 */
export interface K8sExecEvent extends BaseUshEvent {
  pod: string;
  namespace?: string;
  container?: string;
  command: string;
}

/**
 * Temp file events
 */
export interface TempCreateEvent extends BaseUshEvent {
  path: string;
  type: 'file' | 'directory';
}

export interface TempCleanupEvent extends BaseUshEvent {
  path: string;
  type: 'file' | 'directory';
}

/**
 * Transfer events
 */
export interface TransferStartEvent extends BaseUshEvent {
  source: string;
  destination: string;
  direction: 'upload' | 'download';
}

export interface TransferCompleteEvent extends BaseUshEvent {
  source: string;
  destination: string;
  direction: 'upload' | 'download';
  bytesTransferred: number;
  duration: number;
}

export interface TransferErrorEvent extends BaseUshEvent {
  source: string;
  destination: string;
  direction: 'upload' | 'download';
  error: string;
}

/**
 * Connection events (generic for all adapters)
 */
export interface ConnectionOpenEvent extends BaseUshEvent {
  host?: string;
  port?: number;
  type: 'ssh' | 'docker' | 'kubernetes' | 'local';
  metadata?: Record<string, any>;
}

export interface ConnectionCloseEvent extends BaseUshEvent {
  host?: string;
  port?: number;
  type: 'ssh' | 'docker' | 'kubernetes' | 'local';
  reason?: string;
  metadata?: Record<string, any>;
}

/**
 * Cache events
 */
export interface CacheHitEvent extends BaseUshEvent {
  key: string;
  ttl?: number;
  size?: number;
}

export interface CacheMissEvent extends BaseUshEvent {
  key: string;
}

export interface CacheSetEvent extends BaseUshEvent {
  key: string;
  ttl?: number;
  size?: number;
}

export interface CacheEvictEvent extends BaseUshEvent {
  key: string;
  reason: 'ttl' | 'size' | 'manual';
}

/**
 * Retry events
 */
export interface RetryAttemptEvent extends BaseUshEvent {
  attempt: number;
  maxAttempts: number;
  delay: number;
  command?: string;
  error?: string;
}

export interface RetrySuccessEvent extends BaseUshEvent {
  attempts: number;
  totalDuration: number;
  command?: string;
}

export interface RetryFailedEvent extends BaseUshEvent {
  attempts: number;
  totalDuration: number;
  command?: string;
  lastError?: string;
}

/**
 * Tunnel events (generic, not just SSH)
 */
export interface TunnelCreatedEvent extends BaseUshEvent {
  localPort: number;
  remoteHost: string;
  remotePort: number;
  type: 'ssh' | 'kubernetes';
}

/**
 * Event map for type-safe event handling
 */
export interface UshEventMap {
  'command:start': CommandStartEvent;
  'command:complete': CommandCompleteEvent;
  'command:error': CommandErrorEvent;
  'command:retry': CommandRetryEvent;
  'file:read': FileReadEvent;
  'file:write': FileWriteEvent;
  'file:delete': FileDeleteEvent;
  'ssh:connect': SSHConnectEvent;
  'ssh:disconnect': SSHDisconnectEvent;
  'ssh:execute': SSHExecuteEvent;
  'ssh:key-validated': SSHKeyValidatedEvent;
  'ssh:pool-metrics': SSHPoolMetricsEvent;
  'ssh:pool-cleanup': SSHPoolCleanupEvent;
  'ssh:reconnect': SSHReconnectEvent;
  'ssh:tunnel-created': SSHTunnelCreatedEvent;
  'ssh:tunnel-closed': SSHTunnelClosedEvent;
  'docker:run': DockerRunEvent;
  'docker:exec': DockerExecEvent;
  'k8s:exec': K8sExecEvent;
  'temp:create': TempCreateEvent;
  'temp:cleanup': TempCleanupEvent;
  'transfer:start': TransferStartEvent;
  'transfer:complete': TransferCompleteEvent;
  'transfer:error': TransferErrorEvent;
  // New generic events
  'connection:open': ConnectionOpenEvent;
  'connection:close': ConnectionCloseEvent;
  'cache:hit': CacheHitEvent;
  'cache:miss': CacheMissEvent;
  'cache:set': CacheSetEvent;
  'cache:evict': CacheEvictEvent;
  'retry:attempt': RetryAttemptEvent;
  'retry:success': RetrySuccessEvent;
  'retry:failed': RetryFailedEvent;
  'tunnel:created': TunnelCreatedEvent;
}

/**
 * Event type union
 */
export type UshEventType = keyof UshEventMap;
export type UshEvent = UshEventMap[UshEventType];

/**
 * Type-safe EventEmitter interface for USH
 */
export interface TypedEventEmitter<TEvents extends Record<string, any>> {
  on<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): this;
  once<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): this;
  emit<K extends keyof TEvents>(event: K, data: TEvents[K]): boolean;
  off<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): this;
  removeListener<K extends keyof TEvents>(event: K, listener: (data: TEvents[K]) => void): this;
  removeAllListeners<K extends keyof TEvents>(event?: K): this;
  listenerCount(event: keyof TEvents): number;
  listeners<K extends keyof TEvents>(event: K): Array<(data: TEvents[K]) => void>;
  rawListeners<K extends keyof TEvents>(event: K): Array<(data: TEvents[K]) => void>;
  eventNames(): Array<keyof TEvents>;
  setMaxListeners(n: number): this;
  getMaxListeners(): number;
}

/**
 * Event filter options
 */
export interface EventFilter {
  adapter?: string | string[];
  host?: string;
  [key: string]: any;
}

/**
 * Event configuration
 */
export interface EventConfig {
  enableEvents?: boolean;
  maxEventListeners?: number;
}