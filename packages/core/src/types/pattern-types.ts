/**
 * Pattern-related types for Xec
 * This file contains all pattern system type definitions
 */

import type { Recipe } from './recipe-types.js';
import type { Metadata, Variables } from './base-types.js';

/**
 * Core Pattern interface
 * This is the unified pattern interface used throughout the system
 */
export interface Pattern {
  name: string;
  description: string;
  category: PatternCategory;
  tags: string[];
  
  // Pattern configuration
  parameters?: PatternParameter[];
  
  // Pattern builder
  build(options?: PatternOptions): Recipe;
  
  // Metadata
  metadata?: PatternMetadata;
}

/**
 * Pattern categories
 */
export type PatternCategory = 
  | 'deployment'
  | 'workflow'
  | 'resilience'
  | 'security'
  | 'monitoring'
  | 'testing'
  | 'infrastructure'
  | 'application';

/**
 * Pattern parameter definition
 */
export interface PatternParameter {
  name: string;
  description?: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required?: boolean;
  default?: any;
  validation?: any; // Schema for validation
}

/**
 * Pattern options passed to build method
 */
export interface PatternOptions {
  vars?: Variables;
  name?: string;
  description?: string;
  [key: string]: any; // Allow pattern-specific options
}

/**
 * Pattern metadata
 */
export interface PatternMetadata extends Metadata {
  examples?: PatternExample[];
  requirements?: string[];
  limitations?: string[];
  bestPractices?: string[];
}

/**
 * Pattern usage example
 */
export interface PatternExample {
  name: string;
  description?: string;
  code: string;
  options?: PatternOptions;
}

/**
 * Deployment pattern options
 */
export interface DeploymentPatternOptions extends PatternOptions {
  app: string;
  environment?: string;
  version?: string;
  healthCheck?: boolean;
  rollbackOnFailure?: boolean;
}

/**
 * Blue-Green deployment pattern options
 */
export interface BlueGreenOptions extends DeploymentPatternOptions {
  activeEnvironment?: 'blue' | 'green';
  switchDelay?: number;
  validateSwitch?: boolean;
}

/**
 * Canary deployment pattern options
 */
export interface CanaryOptions extends DeploymentPatternOptions {
  stages?: number[];
  analysisTime?: number;
  successCriteria?: CanarySuccessCriteria;
}

/**
 * Canary success criteria
 */
export interface CanarySuccessCriteria {
  errorRate?: number;
  latency?: number;
  customMetrics?: Record<string, number>;
}

/**
 * Rolling update pattern options
 */
export interface RollingUpdateOptions extends DeploymentPatternOptions {
  batchSize?: number;
  pauseBetweenBatches?: number;
  maxUnavailable?: number | string;
  maxSurge?: number | string;
}

/**
 * A/B testing pattern options
 */
export interface ABTestingOptions extends DeploymentPatternOptions {
  variants: string[];
  trafficSplit: Record<string, number>;
  duration?: number;
  metrics?: string[];
}

/**
 * Circuit breaker pattern options
 */
export interface CircuitBreakerOptions extends PatternOptions {
  threshold?: number;
  timeout?: number;
  resetTimeout?: number;
  halfOpenRequests?: number;
}

/**
 * Retry pattern options
 */
export interface RetryPatternOptions extends PatternOptions {
  maxAttempts?: number;
  backoff?: 'fixed' | 'exponential' | 'linear';
  initialDelay?: number;
  maxDelay?: number;
  retryableErrors?: string[];
}

/**
 * Pattern execution context
 */
export interface PatternContext {
  pattern: string;
  options: PatternOptions;
  vars: Variables;
  startTime: Date;
  metadata?: Record<string, any>;
}

/**
 * Pattern execution result
 */
export interface PatternResult {
  success: boolean;
  pattern: string;
  duration: number;
  recipe?: Recipe;
  outputs?: Record<string, any>;
  error?: Error;
}

/**
 * Pattern registry entry
 */
export interface PatternRegistryEntry {
  pattern: Pattern;
  module?: string;
  priority?: number;
}

/**
 * Pattern error class
 */
export class PatternError extends Error {
  constructor(
    message: string,
    public patternName?: string,
    public override cause?: Error
  ) {
    super(message);
    this.name = 'PatternError';
    Error.captureStackTrace(this, this.constructor);
  }
}