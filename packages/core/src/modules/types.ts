import { z } from 'zod';

// Import consolidated types from the types directory
import type {
  ModuleLoaderOptions as ModuleLoadOptions,
  ModuleRegistryEntry as ModuleRegistration
} from '../types/module-types.js';

// Re-export consolidated module types
export * from '../types/module-types.js';

// Re-export specific types with correct names
export type {
  ModuleLoadOptions,
  ModuleRegistration
};

export type { Recipe } from '../types/recipe-types.js';

export type { Pattern } from '../types/pattern-types.js';

// Import and re-export TaskDefinition from task-types
export type { TaskDefinition } from '../types/task-types.js';
// Import from correct locations
export type { Task, TaskHandler } from '../types/task-types.js';
// Still export environment-specific types that aren't in module-types
export type {
  Time,
  YAML,
  OSInfo,
  Crypto,
  Process,
  Package,
  Service,
  Network,
  SetupHook,
  OSPlatform,
  FileSystem,
  HttpClient,
  TaskContext,
  Environment,
  Architecture,
  TeardownHook,
  HelperFunction,
  TemplateEngine,
  EnvironmentType,
  EnvironmentInfo,
  JSON as JSONUtil,
  ModuleCollection,
  EnvironmentProvider
} from '../types/environment-types.js';

// Zod schemas for validation

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

// New XecModule schema
export const XecModuleSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  dependencies: z.record(z.string()).optional(),
  requires: z.array(z.string()).optional(),
  tasks: z.record(z.object({
    name: z.string(),
    description: z.string().optional(),
    run: z.function(),
    hints: z.object({
      preferredEnvironments: z.array(z.string()).optional(),
      unsupportedEnvironments: z.array(z.string()).optional(),
    }).optional(),
  })).optional(),
  helpers: z.record(z.function()).optional(),
  patterns: z.record(z.object({
    name: z.string(),
    description: z.string().optional(),
    template: z.function(),
  })).optional(),
  setup: z.function().optional(),
  teardown: z.function().optional(),
});

export const ModuleConfigSchema = z.object({
  enabled: z.boolean().optional(),
  priority: z.number().optional(),
  settings: z.record(z.any()).optional(),
  overrides: z.record(z.any()).optional(),
});