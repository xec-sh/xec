/**
 * Module-related types for Xec
 * This file contains all module system type definitions
 */

import type { Recipe } from './recipe-types.js';
import type { Pattern } from './pattern-types.js';
import type { Task, TaskDefinition } from './task-types.js';
import type { Helper, Metadata, JSONSchema } from './base-types.js';

/**
 * Module lifecycle hook types
 */
export type SetupHook = (config?: any) => Promise<void> | void;
export type TeardownHook = (config?: any) => Promise<void> | void;

/**
 * Helper function type for modules
 */
export type HelperFunction = (...args: any[]) => any | Promise<any>;

/**
 * Core Module interface
 * This is the unified module interface used throughout the system
 */
export interface Module {
  // Identification
  name: string;
  version: string;
  description?: string;
  
  // Exports
  exports: ModuleExports;
  
  // Dependencies
  dependencies?: string[] | Record<string, string>;  // Support both formats
  peerDependencies?: string[] | Record<string, string>;
  requires?: string[];  // Environment packages/capabilities
  
  // Metadata
  metadata?: ModuleMetadata;
  
  // Lifecycle hooks (optional)
  lifecycle?: ModuleLifecycle;
  setup?: SetupHook;      // Environment-aware setup
  teardown?: TeardownHook;  // Environment-aware teardown
}

/**
 * Module exports structure
 */
export interface ModuleExports {
  tasks?: Record<string, Task | TaskDefinition>;
  recipes?: Record<string, Recipe>;
  patterns?: Record<string, Pattern | any>;
  helpers?: Record<string, Helper | HelperFunction>;
  integrations?: Record<string, IntegrationDefinition | any>;
  constants?: Record<string, any>;
  // Allow custom exports
  [key: string]: any;
}

/**
 * Module metadata
 */
export interface ModuleMetadata extends Metadata {
  displayName?: string;
  category?: string;
  keywords?: string[];
  homepage?: string;
  repository?: string;
  license?: string;
  maintainers?: string[];
  capabilities?: string[];
  requiredPermissions?: string[];
  engines?: {
    xec?: string;
    node?: string;
  };
}

/**
 * Module lifecycle hooks (optional)
 */
export interface ModuleLifecycle {
  onInstall?: () => Promise<void> | void;
  onUninstall?: () => Promise<void> | void;
  onLoad?: () => Promise<void> | void;
  onUnload?: () => Promise<void> | void;
  onEnable?: () => Promise<void> | void;
  onDisable?: () => Promise<void> | void;
  onStart?: () => Promise<void> | void;
  onStop?: () => Promise<void> | void;
  onHealthCheck?: () => Promise<HealthCheckResult>;
}

/**
 * Module loader options
 */
export interface ModuleLoaderOptions {
  searchPaths?: string[];
  cache?: boolean;
  autoload?: boolean;
  strict?: boolean;
  config?: ModuleConfig;
  validateDependencies?: boolean;
}

/**
 * Module resolution result
 */
export interface ModuleResolution {
  path: string;
  module: Module;
  source: 'builtin' | 'node_modules' | 'local' | 'global';
}

/**
 * Module registry entry
 */
export interface ModuleRegistryEntry {
  module: Module;
  path?: string;
  overrides?: string[];
  priority?: number;
  loadTime: Date;
  enabled: boolean;
  status?: 'loaded' | 'enabled' | 'disabled' | 'error';
  error?: Error;
  instance?: any;
  config?: ModuleConfig;
}

/**
 * Module dependency information
 */
export interface ModuleDependency {
  name: string;
  version?: string;
  optional?: boolean;
  peer?: boolean;
}

/**
 * Module validation result
 */
export interface ModuleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Module update information
 */
export interface ModuleUpdate {
  name: string;
  currentVersion: string;
  latestVersion: string;
  updateType: 'major' | 'minor' | 'patch';
  changelog?: string;
}

/**
 * Module load event
 */
export interface ModuleLoadEvent {
  module: string;
  version: string;
  path: string;
  timestamp: Date;
  duration: number;
  success: boolean;
  error?: Error;
}

/**
 * Environment-aware module (extends base Module)
 * Used for modules that need environment-specific features
 */
export interface XecModule extends Module {
  // Environment-aware exports
  tasks?: Record<string, Task>;
  helpers?: Record<string, HelperFunction>;
  patterns?: Record<string, Pattern>;
}

/**
 * Module configuration
 */
export interface ModuleConfig {
  enabled?: boolean;
  priority?: number;
  settings?: Record<string, any>;
  overrides?: Record<string, any>;
}

/**
 * Health check result
 */
export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  timestamp: number;
}

/**
 * Pattern definition for modules
 */
export interface PatternDefinition {
  name: string;
  description?: string;
  type?: 'deployment' | 'scaling' | 'migration' | 'custom';
  parameters?: JSONSchema;
  template: (params: any) => Promise<any>;
  validate?: (params: any) => Promise<boolean>;
}

/**
 * Integration definition for modules
 */
export interface IntegrationDefinition {
  name: string;
  type: string;
  description?: string;
  connectionSchema?: JSONSchema;
  connect: (config: any) => Promise<any>;
  disconnect?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
}

/**
 * Helper definition for modules
 */
export interface HelperDefinition {
  name: string;
  description?: string;
  methods: Record<string, Helper>;
}

/**
 * Integration adapter interface
 */
export interface IntegrationAdapter {
  name: string;
  version: string;
  initialize(config: any): Promise<void>;
  getTasks(): Record<string, Task>;
  getHelpers(): Record<string, Helper>;
  cleanup?(): Promise<void>;
}

/**
 * Module dependency graph
 */
export interface ModuleDependencyGraph {
  nodes: Map<string, ModuleNode>;
  edges: Map<string, Set<string>>;
}

/**
 * Module node in dependency graph
 */
export interface ModuleNode {
  name: string;
  version: string;
  module: Module;
  dependencies: string[];
  dependents: string[];
}

/**
 * Module search criteria
 */
export interface ModuleSearchCriteria {
  name?: string;
  tags?: string[];
  capabilities?: string[];
  version?: string;
  status?: string;
}

/**
 * Module update options
 */
export interface ModuleUpdateOptions {
  backup?: boolean;
  force?: boolean;
  skipValidation?: boolean;
  preserveConfig?: boolean;
}

/**
 * Module error class
 */
export class ModuleError extends Error {
  constructor(
    message: string,
    public moduleName?: string,
    public moduleVersion?: string,
    public override cause?: Error
  ) {
    super(message);
    this.name = 'ModuleError';
    Error.captureStackTrace(this, this.constructor);
  }
}