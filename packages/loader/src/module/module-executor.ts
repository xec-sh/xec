/**
 * Module execution in different formats
 * @module @xec-sh/loader/module/module-executor
 */

import * as path from 'node:path';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import type { ModuleType, ModuleExports } from '../types/index.js';

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
  async execute(options: ModuleExecutionOptions): Promise<ModuleExports> {
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
   * Uses regex patterns to avoid false positives from comments and strings
   */
  private detectModuleType(content: string, headers?: Record<string, string>): ModuleType {
    // Check content-type header for ESM hint
    const contentType = headers?.['content-type'] || '';
    const hasEsmContentType = contentType.includes('application/javascript');

    // Check for UMD pattern first (most specific)
    // UMD modules typically have factory function checks for AMD and CommonJS
    if (this.hasUmdPattern(content)) {
      return 'umd';
    }

    // Check for ESM syntax using regex patterns
    // These patterns match actual code, not comments or strings
    if (this.hasEsmSyntax(content)) {
      return 'esm';
    }

    // Check for CommonJS patterns
    if (this.hasCjsSyntax(content)) {
      return 'cjs';
    }

    // If content-type suggests JavaScript but no clear pattern, assume ESM
    if (hasEsmContentType) {
      return 'esm';
    }

    return 'unknown';
  }

  /**
   * Check for ESM import/export syntax
   * Uses regex to match actual statements, not string content
   */
  private hasEsmSyntax(content: string): boolean {
    // Match import statements at start of line or after semicolon/brace
    // Avoids matching 'import' inside strings or comments
    const importPattern = /(?:^|[;\s{}])import\s+(?:[\w*{},\s]+from\s+)?['"`]/m;

    // Match export statements at start of line or after semicolon/brace
    const exportPattern = /(?:^|[;\s{}])export\s+(?:default\s+|const\s+|let\s+|var\s+|function\s+|class\s+|async\s+|\{)/m;

    // Match export from statements
    const exportFromPattern = /(?:^|[;\s{}])export\s+\*?\s*(?:\{[^}]*\})?\s*from\s+['"`]/m;

    return importPattern.test(content) ||
           exportPattern.test(content) ||
           exportFromPattern.test(content);
  }

  /**
   * Check for CommonJS require/exports syntax
   */
  private hasCjsSyntax(content: string): boolean {
    // Match module.exports or exports. at start of line
    const moduleExportsPattern = /(?:^|[;\s])module\.exports\s*[=\[.]/m;
    const exportsPattern = /(?:^|[;\s])exports\.\w+\s*=/m;

    // Match require() calls (but not import.meta.require or similar)
    const requirePattern = /(?:^|[=\s(,])require\s*\(\s*['"`]/m;

    return moduleExportsPattern.test(content) ||
           exportsPattern.test(content) ||
           requirePattern.test(content);
  }

  /**
   * Check for UMD wrapper pattern
   */
  private hasUmdPattern(content: string): boolean {
    // UMD typically has both AMD and CommonJS checks
    // Pattern: function wrapper with typeof define and typeof exports/module
    const umdPattern = /\(function\s*\([^)]*\)\s*\{[\s\S]*typeof\s+define[\s\S]*typeof\s+(?:exports|module)/;
    const umdAltPattern = /typeof\s+define\s*[!=]==?\s*['"]function['"][\s\S]*typeof\s+(?:exports|module)/;

    return umdPattern.test(content) || umdAltPattern.test(content);
  }

  /**
   * Execute ESM module
   */
  private async executeESM(content: string, specifier: string): Promise<ModuleExports> {
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
  private executeCJS(content: string): ModuleExports {
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
  private executeUMD(content: string): ModuleExports {
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
