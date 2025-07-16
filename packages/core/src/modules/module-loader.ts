import { pathToFileURL } from 'url';
import { readFile } from 'fs/promises';
import { join, resolve, dirname, extname } from 'path';

import { createModuleLogger } from '../utils/logger.js';
import { Module, ModuleMetadataSchema } from './types.js';
import { IModuleLoader, IModuleValidator, ValidationResult } from './interfaces.js';

export class ModuleLoader implements IModuleLoader {
  private cache: Map<string, Module> = new Map();
  private validator: IModuleValidator;
  private logger = createModuleLogger('module-loader');

  constructor() {
    this.validator = new ModuleValidator();
  }

  async load(path: string): Promise<Module> {
    const resolvedPath = resolve(path);

    if (this.cache.has(resolvedPath)) {
      return this.cache.get(resolvedPath)!;
    }

    try {
      let module: Module;

      const ext = extname(resolvedPath);
      if (ext === '.json') {
        module = await this.loadJsonModule(resolvedPath);
      } else if (['.js', '.mjs', '.ts'].includes(ext)) {
        module = await this.loadJsModule(resolvedPath);
      } else {
        throw new Error(`Unsupported module extension: ${ext}`);
      }

      const valid = await this.validate(module);
      if (!valid) {
        throw new Error('Module validation failed');
      }

      this.cache.set(resolvedPath, module);
      return module;
    } catch (error) {
      throw new Error(`Failed to load module from ${path}: ${error}`);
    }
  }

  async validate(module: Module): Promise<boolean> {
    const result = await this.validator.validateModule(module);

    if (!result.valid) {
      this.logger.error('Module validation errors', { errors: result.errors });
    }

    if (result.warnings.length > 0) {
      this.logger.warn('Module validation warnings', { warnings: result.warnings });
    }

    return result.valid;
  }

  async resolveModule(specifier: string, parentPath?: string): Promise<string> {
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      const basePath = parentPath ? dirname(parentPath) : process.cwd();
      return resolve(basePath, specifier);
    }

    if (specifier.startsWith('/')) {
      return specifier;
    }

    // Try to resolve as node module
    try {
      return require.resolve(specifier, {
        paths: parentPath ? [dirname(parentPath)] : undefined,
      });
    } catch {
      // Try common module locations
      const commonPaths = [
        join(process.cwd(), 'modules', specifier),
        join(process.cwd(), 'node_modules', '@xec', specifier),
        join(process.cwd(), 'node_modules', specifier),
      ];

      for (const path of commonPaths) {
        try {
          await readFile(path);
          return path;
        } catch {
          continue;
        }
      }

      throw new Error(`Module '${specifier}' not found`);
    }
  }

  clearCache(path?: string): void {
    if (path) {
      const resolvedPath = resolve(path);
      this.cache.delete(resolvedPath);
      delete require.cache[resolvedPath];
    } else {
      this.cache.clear();
      Object.keys(require.cache).forEach(key => {
        delete require.cache[key];
      });
    }
  }

  private async loadJsonModule(path: string): Promise<Module> {
    const content = await readFile(path, 'utf-8');
    const data = JSON.parse(content);

    if (!data.metadata) {
      throw new Error('Module must have metadata');
    }

    return data as Module;
  }

  private async loadJsModule(path: string): Promise<Module> {
    // Clear require cache for hot reload
    delete require.cache[path];

    let moduleExports: any;

    try {
      // Try CommonJS first
      moduleExports = require(path);
    } catch {
      // Try ES modules
      const moduleUrl = pathToFileURL(path).href;
      moduleExports = await import(moduleUrl);
    }

    // Support both default and named exports
    const module = moduleExports.default || moduleExports;

    if (typeof module === 'function') {
      // Module factory function
      return await module();
    }

    if (!module.metadata) {
      throw new Error('Module must have metadata');
    }

    return module as Module;
  }
}

class ModuleValidator implements IModuleValidator {
  validateMetadata(metadata: any): boolean {
    try {
      ModuleMetadataSchema.parse(metadata);
      return true;
    } catch {
      return false;
    }
  }

  validateExports(exports: any): boolean {
    if (!exports || typeof exports !== 'object') {
      return true; // Exports are optional
    }

    // Check that all exports are valid
    for (const [key, value] of Object.entries(exports)) {
      if (typeof key !== 'string') {
        return false;
      }
      // Value can be anything
    }

    return true;
  }

  async validateDependencies(dependencies: Record<string, string>): Promise<boolean> {
    if (!dependencies || Object.keys(dependencies).length === 0) {
      return true;
    }

    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof name !== 'string' || typeof version !== 'string') {
        return false;
      }

      // Check version format
      if (!this.isValidVersionSpecifier(version)) {
        return false;
      }
    }

    return true;
  }

  validatePermissions(permissions: string[]): boolean {
    if (!Array.isArray(permissions)) {
      return false;
    }

    const validPermissions = [
      'state:read',
      'state:write',
      'config:read',
      'config:write',
      'module:install',
      'module:uninstall',
      'task:execute',
      'pattern:use',
      'integration:connect',
      'system:admin',
    ];

    return permissions.every(p => validPermissions.includes(p));
  }

  async validateModule(module: Module): Promise<ValidationResult> {
    const errors: any[] = [];
    const warnings: any[] = [];

    // Validate metadata
    if (!module.metadata) {
      errors.push({
        field: 'metadata',
        message: 'Module must have metadata',
        code: 'MISSING_METADATA',
      });
    } else {
      if (!this.validateMetadata(module.metadata)) {
        errors.push({
          field: 'metadata',
          message: 'Invalid metadata format',
          code: 'INVALID_METADATA',
        });
      }

      if (!module.metadata.version) {
        errors.push({
          field: 'metadata.version',
          message: 'Module must have a version',
          code: 'MISSING_VERSION',
        });
      }
    }

    // Validate exports
    if (module.exports && !this.validateExports(module.exports)) {
      errors.push({
        field: 'exports',
        message: 'Invalid exports format',
        code: 'INVALID_EXPORTS',
      });
    }

    // Validate dependencies
    if (module.metadata?.dependencies) {
      const validDeps = await this.validateDependencies(module.metadata.dependencies);
      if (!validDeps) {
        errors.push({
          field: 'metadata.dependencies',
          message: 'Invalid dependencies format',
          code: 'INVALID_DEPENDENCIES',
        });
      }
    }

    // Validate permissions
    if (module.metadata?.requiredPermissions) {
      if (!this.validatePermissions(module.metadata.requiredPermissions)) {
        errors.push({
          field: 'metadata.requiredPermissions',
          message: 'Invalid or unknown permissions',
          code: 'INVALID_PERMISSIONS',
        });
      }
    }

    // Validate lifecycle methods
    const lifecycleMethods = [
      'onInstall',
      'onUninstall',
      'onEnable',
      'onDisable',
      'onStart',
      'onStop',
      'onHealthCheck',
    ];

    for (const method of lifecycleMethods) {
      const moduleAny = module as any;
      if (moduleAny[method] && typeof moduleAny[method] !== 'function') {
        errors.push({
          field: method,
          message: `${method} must be a function`,
          code: 'INVALID_LIFECYCLE_METHOD',
        });
      }
    }

    // Warnings
    if (!module.metadata?.description) {
      warnings.push({
        field: 'metadata.description',
        message: 'Module should have a description',
        code: 'MISSING_DESCRIPTION',
      });
    }

    if (!module.metadata?.author) {
      warnings.push({
        field: 'metadata.author',
        message: 'Module should have an author',
        code: 'MISSING_AUTHOR',
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private isValidVersionSpecifier(version: string): boolean {
    // Simple version validation
    const patterns = [
      /^\d+\.\d+\.\d+$/,           // 1.2.3
      /^\^\d+\.\d+\.\d+$/,         // ^1.2.3
      /^~\d+\.\d+\.\d+$/,          // ~1.2.3
      /^>=?\d+\.\d+\.\d+$/,        // >=1.2.3 or >1.2.3
      /^<=?\d+\.\d+\.\d+$/,        // <=1.2.3 or <1.2.3
      /^\d+\.\d+\.x$/,             // 1.2.x
      /^\*$/,                      // *
      /^latest$/,                  // latest
    ];

    return patterns.some(pattern => pattern.test(version));
  }
}