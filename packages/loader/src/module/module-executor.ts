/**
 * Module execution in different formats
 * @module @xec-sh/loader/module/module-executor
 */

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { ModuleType } from '../types/index.js';

export interface ModuleExecutionOptions {
  specifier: string;
  content: string;
  type?: ModuleType;
  headers?: Record<string, string>;
}

/**
 * ModuleExecutor handles execution of modules in different formats
 */
export class ModuleExecutor {
  private tempDir: string;

  constructor(tempDir?: string) {
    this.tempDir = tempDir || '/tmp/xec-loader-modules';
  }

  /**
   * Execute module and return exports
   */
  async execute(options: ModuleExecutionOptions): Promise<any> {
    const { content, specifier, headers } = options;

    // Detect module type if not provided
    const moduleType = options.type || this.detectModuleType(content, headers);

    switch (moduleType) {
      case 'esm':
        return this.executeESM(content, specifier);
      case 'cjs':
        return this.executeCJS(content);
      case 'umd':
        return this.executeUMD(content);
      default:
        // Try ESM first, fallback to CJS
        try {
          return await this.executeESM(content, specifier);
        } catch {
          return this.executeCJS(content);
        }
    }
  }

  /**
   * Detect module type from content and headers
   */
  private detectModuleType(content: string, headers?: Record<string, string>): ModuleType {
    // Check content-type header
    const contentType = headers?.['content-type'] || '';
    if (contentType.includes('application/javascript')) {
      // ESM if has import/export
      if (content.includes('import ') || content.includes('export ')) {
        return 'esm';
      }
    }

    // Check for UMD pattern
    if (content.includes('typeof define') && content.includes('typeof module')) {
      return 'umd';
    }

    // Check for CommonJS
    if (content.includes('module.exports') || content.includes('exports.')) {
      return 'cjs';
    }

    // Check for ESM
    if (content.includes('import ') || content.includes('export ')) {
      return 'esm';
    }

    return 'unknown';
  }

  /**
   * Execute ESM module
   */
  private async executeESM(content: string, specifier: string): Promise<any> {
    // Create temp file for ESM module
    await fs.mkdir(this.tempDir, { recursive: true });

    const hash = crypto.createHash('sha256').update(specifier).digest('hex').substring(0, 8);
    const tempFile = path.join(this.tempDir, `module-${hash}-${Date.now()}.mjs`);

    try {
      await fs.writeFile(tempFile, content);
      const fileURL = pathToFileURL(tempFile).href;

      // Dynamic import
      const module = await import(fileURL);

      // Clean up
      await fs.unlink(tempFile).catch(() => {});

      return module;
    } catch (error) {
      // Clean up on error
      await fs.unlink(tempFile).catch(() => {});
      throw error;
    }
  }

  /**
   * Execute CommonJS module
   */
  private executeCJS(content: string): any {
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };

    // Create stub require
    const requireStub = (id: string) => {
      throw new Error(`require('${id}') not supported in CDN modules`);
    };

    try {
      // Execute in function scope
      const func = new Function('exports', 'module', 'require', '__dirname', '__filename', content);
      func(moduleExports, moduleObj, requireStub, '/', '/module.js');
    } catch (error) {
      // Try simpler version without __dirname/__filename
      const func = new Function('exports', 'module', 'require', content);
      func(moduleExports, moduleObj, requireStub);
    }

    const result = moduleObj.exports;

    // Normalize exports
    if (typeof result === 'function') {
      return { default: result, ...result };
    }

    if (result && typeof result === 'object' && 'default' in result) {
      return result;
    }

    return { default: result, ...result };
  }

  /**
   * Execute UMD module
   */
  private executeUMD(content: string): any {
    const moduleExports = {};
    const moduleObj = { exports: moduleExports };

    // Create AMD define stub
    const define = ((deps: any, factory: any) => {
      if (typeof deps === 'function') {
        factory = deps;
        deps = [];
      }
      if (factory) {
        const result = factory();
        if (result !== undefined) {
          moduleObj.exports = result;
        }
      }
    }) as any;
    define.amd = true;

    // Execute with UMD context
    const func = new Function(
      'exports',
      'module',
      'define',
      'global',
      'globalThis',
      'window',
      'self',
      content
    );

    const globalObj = globalThis;
    func(
      moduleExports,
      moduleObj,
      define,
      globalObj,
      globalObj,
      globalObj,
      globalObj
    );

    const result = moduleObj.exports;

    // Normalize exports
    if (typeof result === 'function') {
      return { default: result, ...result };
    }

    if (result && typeof result === 'object' && 'default' in result) {
      return result;
    }

    return { default: result, ...result };
  }

  /**
   * Clean up temp directory
   */
  async cleanup(): Promise<void> {
    try {
      await fs.rm(this.tempDir, { recursive: true, force: true });
      await fs.mkdir(this.tempDir, { recursive: true });
    } catch {
      // Ignore errors
    }
  }
}
