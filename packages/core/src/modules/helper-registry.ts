import { HelperDefinition } from './types.js';
import { IHelperRegistry } from './interfaces.js';

export class HelperRegistry implements IHelperRegistry {
  private helpers: Map<string, HelperDefinition> = new Map();
  private helpersByModule: Map<string, Map<string, HelperDefinition>> = new Map();
  private instances: Map<string, any> = new Map();

  register(moduleName: string, helper: HelperDefinition): void {
    const helperName = `${moduleName}:${helper.name}`;

    if (this.helpers.has(helperName)) {
      throw new Error(`Helper '${helperName}' is already registered`);
    }

    this.helpers.set(helperName, helper);

    if (!this.helpersByModule.has(moduleName)) {
      this.helpersByModule.set(moduleName, new Map());
    }
    this.helpersByModule.get(moduleName)!.set(helper.name, helper);

    // Create helper instance
    const instance = this.createInstance(helper);
    this.instances.set(helperName, instance);
  }

  unregister(moduleName: string, helperName: string): void {
    const fullHelperName = `${moduleName}:${helperName}`;

    this.helpers.delete(fullHelperName);
    this.helpersByModule.get(moduleName)?.delete(helperName);
    this.instances.delete(fullHelperName);

    if (this.helpersByModule.get(moduleName)?.size === 0) {
      this.helpersByModule.delete(moduleName);
    }
  }

  unregisterAll(moduleName: string): void {
    const moduleHelpers = this.helpersByModule.get(moduleName);
    if (!moduleHelpers) return;

    for (const helperName of moduleHelpers.keys()) {
      const fullHelperName = `${moduleName}:${helperName}`;
      this.helpers.delete(fullHelperName);
      this.instances.delete(fullHelperName);
    }

    this.helpersByModule.delete(moduleName);
  }

  get(helperName: string): HelperDefinition | undefined {
    // Support both full and short names
    if (this.helpers.has(helperName)) {
      return this.helpers.get(helperName);
    }

    // Try to find by short name
    for (const [fullName, helper] of this.helpers.entries()) {
      if (fullName.endsWith(`:${helperName}`)) {
        return helper;
      }
    }

    return undefined;
  }

  getByModule(moduleName: string): Map<string, HelperDefinition> {
    return this.helpersByModule.get(moduleName) || new Map();
  }

  getAll(): Map<string, HelperDefinition> {
    return new Map(this.helpers);
  }

  getInstance(helperName: string): any {
    // Support both full and short names
    if (this.instances.has(helperName)) {
      return this.instances.get(helperName);
    }

    // Try to find by short name
    for (const [fullName, instance] of this.instances.entries()) {
      if (fullName.endsWith(`:${helperName}`)) {
        return instance;
      }
    }

    return null;
  }

  getAllInstances(): Map<string, any> {
    return new Map(this.instances);
  }

  search(criteria: { name?: string; method?: string }): HelperDefinition[] {
    const results: HelperDefinition[] = [];

    for (const [helperName, helper] of this.helpers.entries()) {
      if (criteria.name && !helper.name.includes(criteria.name)) {
        continue;
      }

      if (criteria.method) {
        const hasMethod = Object.keys(helper.methods).some(m =>
          m.includes(criteria.method!)
        );
        if (!hasMethod) {
          continue;
        }
      }

      results.push(helper);
    }

    return results;
  }

  getMethods(helperName: string): string[] {
    const helper = this.get(helperName);
    if (!helper) return [];

    return Object.keys(helper.methods);
  }

  invokeMethod(helperName: string, methodName: string, ...args: any[]): any {
    const instance = this.getInstance(helperName);
    if (!instance) {
      throw new Error(`Helper '${helperName}' not found`);
    }

    if (typeof instance[methodName] !== 'function') {
      throw new Error(`Method '${methodName}' not found on helper '${helperName}'`);
    }

    return instance[methodName](...args);
  }

  private createInstance(helper: HelperDefinition): any {
    const instance: any = {};

    // Add all methods to the instance
    for (const [methodName, method] of Object.entries(helper.methods)) {
      if (typeof method === 'function') {
        instance[methodName] = method;
      }
    }

    // Add metadata
    instance._name = helper.name;
    instance._description = helper.description;

    // Make instance immutable
    return Object.freeze(instance);
  }

  validateHelper(helper: HelperDefinition): boolean {
    if (!helper.name || typeof helper.name !== 'string') {
      return false;
    }

    if (!helper.methods || typeof helper.methods !== 'object') {
      return false;
    }

    // Check that all methods are functions
    for (const method of Object.values(helper.methods)) {
      if (typeof method !== 'function') {
        return false;
      }
    }

    return true;
  }
}