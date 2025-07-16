import { EventEmitter } from 'events';

import { ModuleLoader } from './module-loader.js';
import { TaskRegistry } from './task-registry.js';
import { HelperRegistry } from './helper-registry.js';
import { PatternRegistry } from './pattern-registry.js';
import { createModuleLogger } from '../utils/logger.js';
import { IntegrationRegistry } from './integration-registry.js';
import {
  IModuleLoader,
  ITaskRegistry,
  IModuleRegistry,
  IHelperRegistry,
  IPatternRegistry,
  IIntegrationRegistry,
} from './interfaces.js';
import {
  Module,
  ModuleNode,
  ModuleConfig,
  ModuleLoadOptions,
  ModuleRegistration,
  ModuleSearchCriteria,
  ModuleDependencyGraph,
} from './types.js';

export class ModuleRegistry extends EventEmitter implements IModuleRegistry {
  private modules: Map<string, ModuleRegistration> = new Map();
  private loader: IModuleLoader;
  private taskRegistry: ITaskRegistry;
  private patternRegistry: IPatternRegistry;
  private integrationRegistry: IIntegrationRegistry;
  private helperRegistry: IHelperRegistry;
  private dependencyGraph: ModuleDependencyGraph;
  private logger = createModuleLogger('module-registry');

  constructor() {
    super();
    this.loader = new ModuleLoader();
    this.taskRegistry = new TaskRegistry();
    this.patternRegistry = new PatternRegistry();
    this.integrationRegistry = new IntegrationRegistry();
    this.helperRegistry = new HelperRegistry();
    this.dependencyGraph = {
      nodes: new Map(),
      edges: new Map(),
    };
  }

  async register(module: Module, config?: ModuleConfig): Promise<void> {
    const moduleName = module.metadata.name;

    if (this.modules.has(moduleName)) {
      throw new Error(`Module '${moduleName}' is already registered`);
    }

    const validated = await this.loader.validate(module);
    if (!validated) {
      throw new Error(`Module '${moduleName}' failed validation`);
    }

    const registration: ModuleRegistration = {
      module,
      config: config || {},
      loadedAt: Date.now(),
      status: 'loaded',
    };

    this.modules.set(moduleName, registration);
    this.updateDependencyGraph(module);

    if (module.tasks) {
      for (const [taskName, task] of Object.entries(module.tasks)) {
        this.taskRegistry.register(moduleName, { ...task, name: taskName });
      }
    }

    if (module.patterns) {
      for (const [patternName, pattern] of Object.entries(module.patterns)) {
        this.patternRegistry.register(moduleName, { ...pattern, name: patternName });
      }
    }

    if (module.integrations) {
      for (const [integrationName, integration] of Object.entries(module.integrations)) {
        this.integrationRegistry.register(moduleName, { ...integration, name: integrationName });
      }
    }

    if (module.helpers) {
      for (const [helperName, helper] of Object.entries(module.helpers)) {
        this.helperRegistry.register(moduleName, { ...helper, name: helperName });
      }
    }

    if (module.onInstall) {
      try {
        await module.onInstall();
      } catch (error) {
        registration.status = 'error';
        registration.error = error as Error;
        throw error;
      }
    }

    if (config?.enabled !== false) {
      await this.enable(moduleName);
    }

    this.emit('module:registered', { module, config });
  }

  async unregister(moduleName: string): Promise<void> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      throw new Error(`Module '${moduleName}' is not registered`);
    }

    if (registration.status === 'enabled') {
      await this.disable(moduleName);
    }

    const module = registration.module;

    if (module.onUninstall) {
      await module.onUninstall();
    }

    this.taskRegistry.unregisterAll(moduleName);
    this.patternRegistry.unregisterAll(moduleName);
    this.integrationRegistry.unregisterAll(moduleName);
    this.helperRegistry.unregisterAll(moduleName);

    this.modules.delete(moduleName);
    this.removeDependencyNode(moduleName);

    this.emit('module:unregistered', { moduleName });
  }

  async load(modulePath: string, options?: ModuleLoadOptions): Promise<Module> {
    const module = await this.loader.load(modulePath);

    if (options?.validateDependencies !== false) {
      await this.validateDependencies(module.metadata.name);
    }

    if (options?.override && this.has(module.metadata.name)) {
      await this.unregister(module.metadata.name);
    }

    await this.register(module, options?.config);

    return module;
  }

  async loadMany(modulePaths: string[], options?: ModuleLoadOptions): Promise<Module[]> {
    const modules: Module[] = [];

    for (const path of modulePaths) {
      try {
        const module = await this.load(path, options);
        modules.push(module);
      } catch (error) {
        this.logger.error(`Failed to load module from ${path}`, { error });
        if (!options?.override) {
          throw error;
        }
      }
    }

    return modules;
  }

  get(moduleName: string): Module | undefined {
    return this.modules.get(moduleName)?.module;
  }

  getAll(): Module[] {
    return Array.from(this.modules.values()).map(reg => reg.module);
  }

  list(): Module[] {
    return this.getAll();
  }

  has(moduleName: string): boolean {
    return this.modules.has(moduleName);
  }

  async enable(moduleName: string): Promise<void> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      throw new Error(`Module '${moduleName}' is not registered`);
    }

    if (registration.status === 'enabled') {
      return;
    }

    const module = registration.module;

    if (module.onEnable) {
      await module.onEnable();
    }

    if (module.onStart) {
      await module.onStart();
    }

    registration.status = 'enabled';
    registration.config.enabled = true;

    this.emit('module:enabled', { moduleName });
  }

  async disable(moduleName: string): Promise<void> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      throw new Error(`Module '${moduleName}' is not registered`);
    }

    if (registration.status === 'disabled') {
      return;
    }

    const module = registration.module;

    if (module.onStop) {
      await module.onStop();
    }

    if (module.onDisable) {
      await module.onDisable();
    }

    registration.status = 'disabled';
    registration.config.enabled = false;

    this.emit('module:disabled', { moduleName });
  }

  async reload(moduleName: string): Promise<void> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      throw new Error(`Module '${moduleName}' is not registered`);
    }

    const wasEnabled = registration.status === 'enabled';
    const config = registration.config;

    await this.unregister(moduleName);

    this.loader.clearCache();

    const module = await this.loader.load(moduleName);
    await this.register(module, config);

    if (wasEnabled) {
      await this.enable(moduleName);
    }
  }

  search(criteria: ModuleSearchCriteria): Module[] {
    const results: Module[] = [];

    for (const registration of this.modules.values()) {
      const module = registration.module;
      const metadata = module.metadata;

      if (criteria.name && !metadata.name.includes(criteria.name)) {
        continue;
      }

      if (criteria.version && metadata.version !== criteria.version) {
        continue;
      }

      if (criteria.status && registration.status !== criteria.status) {
        continue;
      }

      if (criteria.tags && criteria.tags.length > 0) {
        const moduleTags = metadata.tags || [];
        const hasAllTags = criteria.tags.every(tag => moduleTags.includes(tag));
        if (!hasAllTags) {
          continue;
        }
      }

      if (criteria.capabilities && criteria.capabilities.length > 0) {
        const moduleCapabilities = metadata.capabilities || [];
        const hasAllCapabilities = criteria.capabilities.every(cap =>
          moduleCapabilities.includes(cap)
        );
        if (!hasAllCapabilities) {
          continue;
        }
      }

      results.push(module);
    }

    return results;
  }

  getDependencyGraph(): ModuleDependencyGraph {
    return this.dependencyGraph;
  }

  async validateDependencies(moduleName: string): Promise<boolean> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      return false;
    }

    const module = registration.module;
    const dependencies = module.metadata.dependencies || {};

    for (const [depName, depVersion] of Object.entries(dependencies)) {
      const depModule = this.get(depName);
      if (!depModule) {
        this.logger.error(`Missing dependency: ${depName}@${depVersion}`);
        return false;
      }

      if (!this.isVersionCompatible(depModule.metadata.version, depVersion)) {
        this.logger.error(`Incompatible version for ${depName}: expected ${depVersion}, found ${depModule.metadata.version}`);
        return false;
      }
    }

    return true;
  }

  getRegistration(moduleName: string): ModuleRegistration | undefined {
    return this.modules.get(moduleName);
  }

  async healthCheck(moduleName: string): Promise<void> {
    const registration = this.modules.get(moduleName);
    if (!registration) {
      throw new Error(`Module '${moduleName}' is not registered`);
    }

    const module = registration.module;
    if (module.onHealthCheck) {
      const result = await module.onHealthCheck();
      this.emit('module:health-check', { moduleName, result });
    }
  }

  getTaskRegistry(): ITaskRegistry {
    return this.taskRegistry;
  }

  getPatternRegistry(): IPatternRegistry {
    return this.patternRegistry;
  }

  getIntegrationRegistry(): IIntegrationRegistry {
    return this.integrationRegistry;
  }

  getHelperRegistry(): IHelperRegistry {
    return this.helperRegistry;
  }

  private updateDependencyGraph(module: Module): void {
    const node: ModuleNode = {
      name: module.metadata.name,
      version: module.metadata.version,
      module,
      dependencies: Object.keys(module.metadata.dependencies || {}),
      dependents: [],
    };

    this.dependencyGraph.nodes.set(module.metadata.name, node);

    if (!this.dependencyGraph.edges.has(module.metadata.name)) {
      this.dependencyGraph.edges.set(module.metadata.name, new Set());
    }

    for (const dep of node.dependencies) {
      this.dependencyGraph.edges.get(module.metadata.name)!.add(dep);

      const depNode = this.dependencyGraph.nodes.get(dep);
      if (depNode) {
        depNode.dependents.push(module.metadata.name);
      }
    }
  }

  private removeDependencyNode(moduleName: string): void {
    const node = this.dependencyGraph.nodes.get(moduleName);
    if (!node) return;

    for (const dep of node.dependencies) {
      const depNode = this.dependencyGraph.nodes.get(dep);
      if (depNode) {
        depNode.dependents = depNode.dependents.filter(d => d !== moduleName);
      }
    }

    this.dependencyGraph.nodes.delete(moduleName);
    this.dependencyGraph.edges.delete(moduleName);
  }

  private isVersionCompatible(actual: string, expected: string): boolean {
    // Simple version check - in production use semver
    if (expected === '*' || expected === 'latest') {
      return true;
    }

    if (expected.startsWith('^')) {
      const expectedMajor = expected.slice(1).split('.')[0];
      const actualMajor = actual.split('.')[0];
      return expectedMajor === actualMajor;
    }

    if (expected.startsWith('~')) {
      const expectedParts = expected.slice(1).split('.');
      const actualParts = actual.split('.');
      return expectedParts[0] === actualParts[0] && expectedParts[1] === actualParts[1];
    }

    return actual === expected;
  }
}