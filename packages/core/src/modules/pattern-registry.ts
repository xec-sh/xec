import { z } from 'zod';

import { PatternDefinition } from './types.js';
import { IPatternRegistry } from './interfaces';

export class PatternRegistry implements IPatternRegistry {
  private patterns: Map<string, PatternDefinition> = new Map();
  private patternsByModule: Map<string, Map<string, PatternDefinition>> = new Map();
  private patternsByType: Map<string, Set<string>> = new Map();
  private instances: Map<string, any[]> = new Map();

  register(moduleName: string, pattern: PatternDefinition): void {
    const patternName = `${moduleName}:${pattern.name || 'unnamed'}`;

    if (this.patterns.has(patternName)) {
      throw new Error(`Pattern '${patternName}' is already registered`);
    }

    this.patterns.set(patternName, pattern);

    if (!this.patternsByModule.has(moduleName)) {
      this.patternsByModule.set(moduleName, new Map());
    }
    this.patternsByModule.get(moduleName)!.set(pattern.name || 'unnamed', pattern);

    const patternType = pattern.type || 'custom';
    if (!this.patternsByType.has(patternType)) {
      this.patternsByType.set(patternType, new Set());
    }
    this.patternsByType.get(patternType)!.add(patternName);

    this.instances.set(patternName, []);
  }

  unregister(moduleName: string, patternName: string): void {
    const fullPatternName = `${moduleName}:${patternName}`;
    const pattern = this.patterns.get(fullPatternName);

    if (!pattern) return;

    this.patterns.delete(fullPatternName);
    this.patternsByModule.get(moduleName)?.delete(patternName);
    const patternType = pattern.type || 'custom';
    this.patternsByType.get(patternType)?.delete(fullPatternName);
    this.instances.delete(fullPatternName);

    if (this.patternsByModule.get(moduleName)?.size === 0) {
      this.patternsByModule.delete(moduleName);
    }

    if (this.patternsByType.get(patternType)?.size === 0) {
      this.patternsByType.delete(patternType);
    }
  }

  unregisterAll(moduleName: string): void {
    const modulePatterns = this.patternsByModule.get(moduleName);
    if (!modulePatterns) return;

    for (const patternName of modulePatterns.keys()) {
      this.unregister(moduleName, patternName);
    }
  }

  get(patternName: string): PatternDefinition | undefined {
    // Support both full and short names
    if (this.patterns.has(patternName)) {
      return this.patterns.get(patternName);
    }

    // Try to find by short name
    for (const [fullName, pattern] of this.patterns.entries()) {
      if (fullName.endsWith(`:${patternName}`)) {
        return pattern;
      }
    }

    return undefined;
  }

  getByType(type: string): PatternDefinition[] {
    const patternNames = this.patternsByType.get(type);
    if (!patternNames) return [];

    const patterns: PatternDefinition[] = [];
    for (const name of patternNames) {
      const pattern = this.patterns.get(name);
      if (pattern) {
        patterns.push(pattern);
      }
    }

    return patterns;
  }

  getByModule(moduleName: string): Map<string, PatternDefinition> {
    return this.patternsByModule.get(moduleName) || new Map();
  }

  getAll(): Map<string, PatternDefinition> {
    return new Map(this.patterns);
  }

  async instantiate(patternName: string, params: any): Promise<any> {
    const pattern = this.get(patternName);
    if (!pattern) {
      throw new Error(`Pattern '${patternName}' not found`);
    }

    // Validate parameters
    if (pattern.parameters) {
      try {
        params = pattern.parameters['parse'](params);
      } catch (error) {
        if (error instanceof z.ZodError) {
          throw new Error(`Invalid parameters: ${error.message}`);
        }
        throw error;
      }
    }

    // Validate with custom validator
    if (pattern.validate) {
      const isValid = await pattern.validate(params);
      if (!isValid) {
        throw new Error(`Pattern validation failed for '${patternName}'`);
      }
    }

    // Create instance from template
    const instance = await pattern.template(params);

    // Track instance
    const instances = this.instances.get(patternName) || [];
    instances.push({
      params,
      instance,
      createdAt: Date.now(),
    });
    this.instances.set(patternName, instances);

    return instance;
  }

  getInstances(patternName: string): any[] {
    return this.instances.get(patternName) || [];
  }

  search(criteria: { name?: string; type?: string; tags?: string[] }): PatternDefinition[] {
    const results: PatternDefinition[] = [];

    for (const [patternName, pattern] of this.patterns.entries()) {
      if (criteria.name && !pattern.name.includes(criteria.name)) {
        continue;
      }

      if (criteria.type && pattern.type !== criteria.type) {
        continue;
      }

      results.push(pattern);
    }

    return results;
  }

  getTypes(): string[] {
    return Array.from(this.patternsByType.keys());
  }

  validatePattern(pattern: PatternDefinition): boolean {
    if (!pattern.name || typeof pattern.name !== 'string') {
      return false;
    }

    if (!pattern.type || typeof pattern.type !== 'string') {
      return false;
    }

    if (!pattern.template || typeof pattern.template !== 'function') {
      return false;
    }

    const validTypes = ['deployment', 'scaling', 'migration', 'custom'];
    if (!validTypes.includes(pattern.type)) {
      return false;
    }

    if (pattern.validate && typeof pattern.validate !== 'function') {
      return false;
    }

    return true;
  }
}