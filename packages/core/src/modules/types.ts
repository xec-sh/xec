import { z } from 'zod';

export interface ModuleMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  license?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  tags?: string[];
  capabilities?: string[];
  requiredPermissions?: string[];
}

export interface ModuleConfig {
  enabled?: boolean;
  priority?: number;
  settings?: Record<string, any>;
  overrides?: Record<string, any>;
}

export interface ModuleLifecycle {
  onInstall?(): Promise<void>;
  onUninstall?(): Promise<void>;
  onEnable?(): Promise<void>;
  onDisable?(): Promise<void>;
  onStart?(): Promise<void>;
  onStop?(): Promise<void>;
  onHealthCheck?(): Promise<HealthCheckResult>;
}

export interface HealthCheckResult {
  status: 'healthy' | 'degraded' | 'unhealthy';
  message?: string;
  details?: Record<string, any>;
  timestamp: number;
}

export interface Module extends ModuleLifecycle {
  metadata: ModuleMetadata;
  exports?: Record<string, any>;
  tasks?: Record<string, TaskDefinition>;
  patterns?: Record<string, PatternDefinition>;
  integrations?: Record<string, IntegrationDefinition>;
  helpers?: Record<string, HelperDefinition>;
}

export interface TaskDefinition {
  name: string;
  description?: string;
  parameters?: z.ZodSchema;
  returns?: z.ZodSchema;
  handler: (params: any) => Promise<any>;
  timeout?: number;
  retries?: number;
  tags?: string[];
}

export interface PatternDefinition {
  name: string;
  description?: string;
  type: 'deployment' | 'scaling' | 'migration' | 'custom';
  parameters?: z.ZodSchema;
  template: (params: any) => Promise<any>;
  validate?: (params: any) => Promise<boolean>;
}

export interface IntegrationDefinition {
  name: string;
  type: string;
  description?: string;
  connectionSchema?: z.ZodSchema;
  connect: (config: any) => Promise<any>;
  disconnect?: () => Promise<void>;
  healthCheck?: () => Promise<boolean>;
}

export interface HelperDefinition {
  name: string;
  description?: string;
  methods: Record<string, ((...args: any[]) => any) | ((...args: any[]) => Promise<any>)>;
}

export interface ModuleLoadOptions {
  path?: string;
  config?: ModuleConfig;
  override?: boolean;
  validateDependencies?: boolean;
}

export interface ModuleRegistration {
  module: Module;
  config: ModuleConfig;
  loadedAt: number;
  status: 'loaded' | 'enabled' | 'disabled' | 'error';
  error?: Error;
  instance?: any;
}

export interface ModuleDependencyGraph {
  nodes: Map<string, ModuleNode>;
  edges: Map<string, Set<string>>;
}

export interface ModuleNode {
  name: string;
  version: string;
  module: Module;
  dependencies: string[];
  dependents: string[];
}

export interface ModuleSearchCriteria {
  name?: string;
  tags?: string[];
  capabilities?: string[];
  version?: string;
  status?: string;
}

export interface ModuleUpdateOptions {
  backup?: boolean;
  force?: boolean;
  skipValidation?: boolean;
  preserveConfig?: boolean;
}

export const ModuleMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  license: z.string().optional(),
  dependencies: z.record(z.string()).optional(),
  peerDependencies: z.record(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  capabilities: z.array(z.string()).optional(),
  requiredPermissions: z.array(z.string()).optional(),
});

export const ModuleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  settings: z.record(z.any()).optional(),
  overrides: z.record(z.any()).optional(),
});