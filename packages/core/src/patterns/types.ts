import { Task, Recipe } from '../core/types';

// Base pattern interface
export interface Pattern {
  name: string;
  description: string;
  category: 'deployment' | 'workflow' | 'resilience';
  tags: string[];
  build(): Recipe;
}

// Deployment patterns
export interface DeploymentPattern extends Pattern {
  category: 'deployment';
}

export interface BlueGreenOptions {
  service: string;
  healthCheckUrl?: string;
  healthCheckTimeout?: number;
  switchStrategy: 'dns' | 'loadbalancer' | 'service-mesh';
  rollbackOnFailure?: boolean;
  warmupTime?: number;
  validationSteps?: Task[];
}

export interface CanaryOptions {
  service: string;
  initialPercentage: number;
  incrementPercentage: number;
  incrementInterval: number; // seconds
  targetPercentage: number;
  healthCheckUrl?: string;
  metrics?: {
    errorRateThreshold?: number;
    latencyThreshold?: number;
    customMetrics?: MetricCheck[];
  };
  rollbackOnFailure?: boolean;
  analysisTemplate?: string;
}

export interface RollingUpdateOptions {
  service: string;
  maxSurge: number | string; // number or percentage
  maxUnavailable: number | string;
  healthCheckUrl?: string;
  readinessProbe?: HealthCheck;
  updateStrategy?: 'sequential' | 'parallel';
  pauseBetweenBatches?: number; // seconds
  rollbackOnFailure?: boolean;
}

export interface RecreateOptions {
  service: string;
  gracefulShutdownTimeout?: number;
  healthCheckUrl?: string;
  preStopHook?: Task;
  postStartHook?: Task;
}

export interface ABTestingOptions {
  service: string;
  variants: ABVariant[];
  distribution: 'weighted' | 'header-based' | 'cookie-based';
  duration?: number; // seconds
  metrics?: MetricCheck[];
}

export interface ABVariant {
  name: string;
  version: string;
  weight?: number;
  rules?: RoutingRule[];
}

// Workflow patterns
export interface WorkflowPattern extends Pattern {
  category: 'workflow';
}

export interface SequentialOptions {
  tasks: Task[];
  continueOnError?: boolean;
  timeout?: number;
}

export interface ParallelOptions {
  tasks: Task[];
  maxConcurrency?: number;
  failFast?: boolean;
  timeout?: number;
}

export interface ConditionalOptions {
  condition: string | (() => boolean | Promise<boolean>);
  then: Task | Task[];
  else?: Task | Task[];
}

export interface LoopOptions {
  items: any[] | (() => any[] | Promise<any[]>);
  task: (item: any, index: number) => Task;
  maxConcurrency?: number;
  continueOnError?: boolean;
}

export interface RetryOptions {
  task: Task;
  maxAttempts: number;
  backoff?: BackoffStrategy;
  retryOn?: (error: Error) => boolean;
  onRetry?: (attempt: number, error: Error) => void | Promise<void>;
}

// Resilience patterns
export interface ResiliencePattern extends Pattern {
  category: 'resilience';
}

export interface CircuitBreakerOptions {
  task: Task;
  failureThreshold: number;
  resetTimeout: number; // milliseconds
  halfOpenRequests?: number;
  onOpen?: () => void | Promise<void>;
  onClose?: () => void | Promise<void>;
  onHalfOpen?: () => void | Promise<void>;
}

export interface BulkheadOptions {
  tasks: Task[];
  maxConcurrency: number;
  queueSize?: number;
  timeout?: number;
  onReject?: (task: Task) => void | Promise<void>;
}

export interface TimeoutOptions {
  task: Task;
  timeout: number; // milliseconds
  fallback?: Task;
  onTimeout?: () => void | Promise<void>;
}

export interface FallbackOptions {
  primary: Task;
  fallback: Task | ((error: Error) => Task);
  fallbackOn?: (error: Error) => boolean;
}

// Supporting types
export interface HealthCheck {
  path?: string;
  port?: number;
  initialDelaySeconds?: number;
  periodSeconds?: number;
  timeoutSeconds?: number;
  successThreshold?: number;
  failureThreshold?: number;
}

export interface MetricCheck {
  name: string;
  query: string;
  threshold: number;
  operator: '<' | '>' | '<=' | '>=' | '==' | '!=';
}

export interface RoutingRule {
  header?: { name: string; value: string | RegExp };
  cookie?: { name: string; value: string | RegExp };
  path?: string | RegExp;
  method?: string | string[];
}

export interface BackoffStrategy {
  type: 'fixed' | 'exponential' | 'linear';
  delay: number; // milliseconds
  maxDelay?: number;
  factor?: number; // for exponential
  jitter?: boolean;
}

// Pattern registry
export interface PatternRegistry {
  register(pattern: Pattern): void;
  get(name: string): Pattern | undefined;
  getByCategory(category: string): Pattern[];
  getByTag(tag: string): Pattern[];
  list(): Pattern[];
}