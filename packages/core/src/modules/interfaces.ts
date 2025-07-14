import {
  Module,
  ModuleConfig,
  TaskDefinition,
  HelperDefinition,
  ModuleLoadOptions,
  PatternDefinition,
  ModuleRegistration,
  ModuleSearchCriteria,
  ModuleDependencyGraph,
  IntegrationDefinition,
} from './types.js';

export interface IModuleRegistry {
  register(module: Module, config?: ModuleConfig): Promise<void>;
  unregister(moduleName: string): Promise<void>;
  load(modulePath: string, options?: ModuleLoadOptions): Promise<Module>;
  loadMany(modulePaths: string[], options?: ModuleLoadOptions): Promise<Module[]>;
  get(moduleName: string): Module | undefined;
  getAll(): Module[];
  has(moduleName: string): boolean;
  enable(moduleName: string): Promise<void>;
  disable(moduleName: string): Promise<void>;
  reload(moduleName: string): Promise<void>;
  search(criteria: ModuleSearchCriteria): Module[];
  getDependencyGraph(): ModuleDependencyGraph;
  validateDependencies(moduleName: string): Promise<boolean>;
  getRegistration(moduleName: string): ModuleRegistration | undefined;
}

export interface IModuleLoader {
  load(path: string): Promise<Module>;
  validate(module: Module): Promise<boolean>;
  resolveModule(specifier: string, parentPath?: string): Promise<string>;
  clearCache(path?: string): void;
}

export interface IModuleResolver {
  resolve(specifier: string, options?: ResolveOptions): Promise<ResolvedModule>;
  resolveAll(specifiers: string[], options?: ResolveOptions): Promise<ResolvedModule[]>;
  addSearchPath(path: string): void;
  removeSearchPath(path: string): void;
  getSearchPaths(): string[];
}

export interface ResolveOptions {
  basePath?: string;
  extensions?: string[];
  preferLocal?: boolean;
  allowRemote?: boolean;
}

export interface ResolvedModule {
  path: string;
  specifier: string;
  version?: string;
  isLocal: boolean;
  isRemote: boolean;
  metadata?: any;
}

export interface ITaskRegistry {
  register(moduleName: string, task: TaskDefinition): void;
  unregister(moduleName: string, taskName: string): void;
  unregisterAll(moduleName: string): void;
  get(taskName: string): TaskDefinition | undefined;
  getByModule(moduleName: string): Map<string, TaskDefinition>;
  getAll(): Map<string, TaskDefinition>;
  execute(taskName: string, params: any): Promise<any>;
  search(criteria: { name?: string; tags?: string[] }): TaskDefinition[];
}

export interface IPatternRegistry {
  register(moduleName: string, pattern: PatternDefinition): void;
  unregister(moduleName: string, patternName: string): void;
  unregisterAll(moduleName: string): void;
  get(patternName: string): PatternDefinition | undefined;
  getByType(type: string): PatternDefinition[];
  getByModule(moduleName: string): Map<string, PatternDefinition>;
  getAll(): Map<string, PatternDefinition>;
  instantiate(patternName: string, params: any): Promise<any>;
}

export interface IIntegrationRegistry {
  register(moduleName: string, integration: IntegrationDefinition): void;
  unregister(moduleName: string, integrationName: string): void;
  unregisterAll(moduleName: string): void;
  get(integrationName: string): IntegrationDefinition | undefined;
  getByType(type: string): IntegrationDefinition[];
  getByModule(moduleName: string): Map<string, IntegrationDefinition>;
  getAll(): Map<string, IntegrationDefinition>;
  connect(integrationName: string, config: any): Promise<any>;
  disconnect(integrationName: string): Promise<void>;
  getConnection(integrationName: string): any;
}

export interface IHelperRegistry {
  register(moduleName: string, helper: HelperDefinition): void;
  unregister(moduleName: string, helperName: string): void;
  unregisterAll(moduleName: string): void;
  get(helperName: string): HelperDefinition | undefined;
  getByModule(moduleName: string): Map<string, HelperDefinition>;
  getAll(): Map<string, HelperDefinition>;
  getInstance(helperName: string): any;
}

export interface IModuleEventEmitter {
  on(event: ModuleEvent, handler: ModuleEventHandler): void;
  off(event: ModuleEvent, handler: ModuleEventHandler): void;
  emit(event: ModuleEvent, data: any): void;
}

export type ModuleEvent =
  | 'module:registered'
  | 'module:unregistered'
  | 'module:enabled'
  | 'module:disabled'
  | 'module:loaded'
  | 'module:error'
  | 'module:health-check'
  | 'task:registered'
  | 'task:executed'
  | 'pattern:registered'
  | 'pattern:instantiated'
  | 'integration:connected'
  | 'integration:disconnected';

export type ModuleEventHandler = (data: any) => void | Promise<void>;

export interface IModuleStore {
  save(module: Module): Promise<void>;
  load(moduleName: string): Promise<Module | null>;
  delete(moduleName: string): Promise<void>;
  list(): Promise<string[]>;
  update(moduleName: string, updates: Partial<Module>): Promise<void>;
  backup(moduleName: string): Promise<string>;
  restore(moduleName: string, backupId: string): Promise<void>;
}

export interface IModuleValidator {
  validateMetadata(metadata: any): boolean;
  validateExports(exports: any): boolean;
  validateDependencies(dependencies: Record<string, string>): Promise<boolean>;
  validatePermissions(permissions: string[]): boolean;
  validateModule(module: Module): Promise<ValidationResult>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

export interface ValidationWarning {
  field: string;
  message: string;
  code: string;
}