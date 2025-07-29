import vm from 'vm';
import os from 'os';
import path from 'path';
import chalk from 'chalk';
import crypto from 'crypto';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import { transform } from 'esbuild';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import * as clack from '@clack/prompts';
import { RuntimeDetector } from '@xec-sh/core';

export interface UniversalLoaderOptions {
  runtime?: 'auto' | 'node' | 'bun' | 'deno';
  typescript?: boolean;
  watch?: boolean;
  esm?: boolean;
  verbose?: boolean;
  env?: Record<string, string>;
  cache?: boolean;
  cacheDir?: string;
  cdnFallback?: boolean;
  preferredCDN?: 'jsr' | 'esm.sh' | 'unpkg' | 'skypack' | 'jsdelivr';
}

export interface ScriptContext {
  runtime: 'node' | 'bun' | 'deno';
  version: string;
  projectType: 'esm' | 'commonjs' | 'auto';
  features: {
    typescript: boolean;
    esm: boolean;
    workers: boolean;
    ffi: boolean;
  };
}

export interface ModuleCacheEntry {
  url: string;
  content: string;
  transformed?: string;
  timestamp: number;
  headers?: Record<string, string>;
}

const CDN_URLS = {
  'jsr': 'https://jsr.io',
  'esm.sh': 'https://esm.sh',
  'unpkg': 'https://unpkg.com',
  'skypack': 'https://cdn.skypack.dev',
  'jsdelivr': 'https://cdn.jsdelivr.net/npm'
} as const;

/**
 * Universal script loader with Bun, Deno and Node.js support
 * Enhanced with CDN loading and module caching
 */
export class UniversalScriptLoader {
  private runtime: 'node' | 'bun' | 'deno';
  private options: UniversalLoaderOptions;
  private cacheDir: string;
  private projectType: 'esm' | 'commonjs' | 'auto' = 'auto';
  private moduleCache = new Map<string, ModuleCacheEntry>();

  constructor(options: UniversalLoaderOptions = {}) {
    this.options = {
      cache: true,
      cdnFallback: true,
      preferredCDN: 'jsr',
      ...options
    };
    
    this.runtime = options.runtime === 'auto' || !options.runtime
      ? RuntimeDetector.detect()
      : options.runtime;
      
    // Set cache directory
    this.cacheDir = options.cacheDir || path.join(os.homedir(), '.xec', 'module-cache');
    
    // Detect project type
    this.detectProjectType();
  }

  /**
   * Detect if the current project is ESM or CommonJS
   */
  private async detectProjectType() {
    try {
      // Look for package.json in current directory and parent directories
      let dir = process.cwd();
      let attempts = 0;
      
      while (attempts < 10) {
        const pkgPath = path.join(dir, 'package.json');
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf-8'));
          if (pkg.type === 'module') {
            this.projectType = 'esm';
            return;
          } else if (pkg.type === 'commonjs') {
            this.projectType = 'commonjs';
            return;
          }
          break;
        }
        
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
        attempts++;
      }
    } catch (error) {
      // Ignore errors, use auto detection
    }
  }

  /**
   * Initialize cache directory
   */
  private async initCache() {
    if (this.options.cache) {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.loadCacheIndex();
    }
  }

  /**
   * Load cache index
   */
  private async loadCacheIndex() {
    const indexPath = path.join(this.cacheDir, 'index.json');
    try {
      if (existsSync(indexPath)) {
        const index = JSON.parse(await fs.readFile(indexPath, 'utf-8'));
        for (const [key, entry] of Object.entries(index)) {
          this.moduleCache.set(key, entry as ModuleCacheEntry);
        }
      }
    } catch (error) {
      // Ignore cache errors
      if (this.options.verbose) {
        console.warn('Failed to load cache index:', error);
      }
    }
  }

  /**
   * Save cache index
   */
  private async saveCacheIndex() {
    if (!this.options.cache) return;
    
    const indexPath = path.join(this.cacheDir, 'index.json');
    const index: Record<string, ModuleCacheEntry> = {};
    
    for (const [key, entry] of this.moduleCache.entries()) {
      index[key] = entry;
    }
    
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }

  /**
   * Get cache key for a module
   */
  private getCacheKey(specifier: string): string {
    return crypto.createHash('sha256').update(specifier).digest('hex');
  }

  /**
   * Load module from cache
   */
  private async loadFromCache(specifier: string): Promise<string | null> {
    if (!this.options.cache) return null;
    
    const cacheKey = this.getCacheKey(specifier);
    const cached = this.moduleCache.get(cacheKey);
    
    if (cached) {
      // Check if cache is still valid (24 hours)
      if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
        if (this.options.verbose) {
          clack.log.info(`Loading ${chalk.cyan(specifier)} from cache`);
        }
        return cached.transformed || cached.content;
      }
    }
    
    // Check file cache
    const cachePath = path.join(this.cacheDir, `${cacheKey}.js`);
    if (existsSync(cachePath)) {
      const content = await fs.readFile(cachePath, 'utf-8');
      return content;
    }
    
    return null;
  }

  /**
   * Save module to cache
   */
  private async saveToCache(specifier: string, content: string, transformed?: string) {
    if (!this.options.cache) return;
    
    const cacheKey = this.getCacheKey(specifier);
    const entry: ModuleCacheEntry = {
      url: specifier,
      content,
      transformed,
      timestamp: Date.now()
    };
    
    this.moduleCache.set(cacheKey, entry);
    
    // Save to file
    const cachePath = path.join(this.cacheDir, `${cacheKey}.js`);
    await fs.writeFile(cachePath, transformed || content);
    
    // Update index
    await this.saveCacheIndex();
  }

  /**
   * Resolve module specifier to URL
   */
  private async resolveModuleURL(specifier: string): Promise<string> {
    // Handle relative paths
    if (specifier.startsWith('./') || specifier.startsWith('../')) {
      return pathToFileURL(path.resolve(specifier)).href;
    }
    
    // Handle absolute paths
    if (path.isAbsolute(specifier)) {
      return pathToFileURL(specifier).href;
    }
    
    // Handle URLs
    if (specifier.startsWith('http://') || specifier.startsWith('https://')) {
      return specifier;
    }
    
    // Handle CDN shortcuts
    if (specifier.startsWith('jsr:')) {
      return `https://jsr.io/${specifier.slice(4)}`;
    }
    
    if (specifier.startsWith('npm:')) {
      const pkg = specifier.slice(4);
      return `${CDN_URLS[this.options.preferredCDN!]}/${pkg}`;
    }
    
    // Handle bare specifiers with CDN fallback
    if (this.options.cdnFallback && !specifier.includes('/') && !existsSync(specifier)) {
      return `${CDN_URLS[this.options.preferredCDN!]}/${specifier}`;
    }
    
    return specifier;
  }

  /**
   * Fetch module from URL
   */
  private async fetchModule(url: string): Promise<string> {
    if (this.options.verbose) {
      clack.log.info(`Fetching module from ${chalk.cyan(url)}`);
    }
    
    // Check cache first
    const cached = await this.loadFromCache(url);
    if (cached) return cached;
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch module: ${response.statusText}`);
    }
    
    const content = await response.text();
    
    // Transform if needed
    const transformed = await this.transformModuleContent(content, url);
    
    // Save to cache
    await this.saveToCache(url, content, transformed);
    
    return transformed;
  }

  /**
   * Transform module content based on type
   */
  private async transformModuleContent(content: string, filename: string): Promise<string> {
    // Detect if transformation is needed
    const needsTransform = 
      filename.endsWith('.ts') || 
      filename.endsWith('.tsx') ||
      filename.endsWith('.mts') ||
      (this.projectType === 'commonjs' && await this.hasESModules(content));
    
    if (!needsTransform) return content;
    
    const result = await transform(content, {
      format: this.projectType === 'esm' ? 'esm' : 'cjs',
      target: this.runtime === 'node' ? 'node16' : 'esnext',
      loader: filename.endsWith('.tsx') ? 'tsx' : 
              filename.endsWith('.ts') || filename.endsWith('.mts') ? 'ts' : 'js',
      sourcemap: 'inline',
      sourcefile: filename
    });
    
    return result.code;
  }

  /**
   * Load and execute a script file or URL
   */
  async loadScript(scriptPath: string, args: string[] = []): Promise<any> {
    await this.initCache();
    
    const resolvedUrl = await this.resolveModuleURL(scriptPath);
    const isRemote = resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://');
    
    if (this.options.verbose) {
      clack.log.info(`Loading script with ${chalk.cyan(this.runtime)} runtime...`);
      if (isRemote) {
        clack.log.info(`Remote script: ${chalk.cyan(resolvedUrl)}`);
      }
    }

    // Handle remote modules
    if (isRemote) {
      const content = await this.fetchModule(resolvedUrl);
      return this.evalCode(content, args);
    }

    // Handle local files
    const fullPath = path.resolve(scriptPath);

    // Check if file exists
    try {
      await fs.access(fullPath);
    } catch {
      // Try with CDN fallback
      if (this.options.cdnFallback) {
        const cdnUrl = await this.resolveModuleURL(scriptPath);
        if (cdnUrl !== scriptPath) {
          const content = await this.fetchModule(cdnUrl);
          return this.evalCode(content, args);
        }
      }
      throw new Error(`Script not found: ${scriptPath}`);
    }

    switch (this.runtime) {
      case 'bun':
        return this.loadWithBun(fullPath, args);
      case 'deno':
        return this.loadWithDeno(fullPath, args);
      case 'node':
      default:
        return this.loadWithNode(fullPath, args);
    }
  }

  /**
   * Evaluate code string
   */
  async evalCode(code: string, args: string[] = []): Promise<any> {
    if (this.options.verbose) {
      clack.log.info(`Evaluating code with ${chalk.cyan(this.runtime)} runtime...`);
    }

    switch (this.runtime) {
      case 'bun':
        return this.evalWithBun(code, args);
      case 'deno':
        return this.evalWithDeno(code, args);
      case 'node':
      default:
        return this.evalWithNode(code, args);
    }
  }

  /**
   * Load script with Bun runtime
   */
  private async loadWithBun(scriptPath: string, args: string[]): Promise<any> {
    // Check if we're actually running in Bun
    if (!RuntimeDetector.isBun()) {
      throw new Error('Bun runtime requested but not available. Please run with: bun xec <script>');
    }

    const Bun = (globalThis as any).Bun;

    // Read and prepare script
    let content = await fs.readFile(scriptPath, 'utf-8');
    const ext = path.extname(scriptPath);

    // Bun natively supports TypeScript
    if (ext === '.md') {
      content = this.extractCodeFromMarkdown(content);
    }

    // Create module context
    const module = {
      exports: {},
      require: createRequire(scriptPath),
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
    };

    // Import utilities
    const scriptUtils = await import('../script-utils.js');
    const { $ } = await import('@xec-sh/core');

    // Create context
    const context = {
      ...globalThis,
      module,
      exports: module.exports,
      require: module.require,
      __filename: module.__filename,
      __dirname: module.__dirname,
      args,
      argv: ['bun', scriptPath, ...args],
      $,
      ...scriptUtils.default,
      console,
      process,
    };

    // Use Bun's transpiler
    const transpiler = new Bun.Transpiler({
      loader: ext === '.tsx' ? 'tsx' : ext === '.ts' ? 'ts' : 'js',
      target: 'bun',
    });

    const transpiledCode = await transpiler.transform(content);

    // Execute with Bun's VM
    const fn = new Function(...Object.keys(context), transpiledCode);
    return fn(...Object.values(context));
  }

  /**
   * Load script with Deno runtime  
   */
  private async loadWithDeno(scriptPath: string, args: string[]): Promise<any> {
    // Check if we're actually running in Deno
    if (!RuntimeDetector.isDeno()) {
      throw new Error('Deno runtime requested but not available. Please run with: deno run --allow-all xec <script>');
    }

    const Deno = (globalThis as any).Deno;

    // Read script content
    const content = await Deno.readTextFile(scriptPath);
    const ext = path.extname(scriptPath);

    // Extract code from markdown if needed
    const code = ext === '.md' ? this.extractCodeFromMarkdown(content) : content;

    // Import utilities
    const scriptUtils = await import('../script-utils.js');
    const { $ } = await import('@xec-sh/core');

    // Create a temporary module file with proper context
    const tempFile = await Deno.makeTempFile({ suffix: '.js' });

    try {
      // Wrap the code with context
      const wrappedCode = `
        import { $ } from '@xec-sh/core';
        ${Object.entries(scriptUtils.default).map(([key, _]) =>
        `import { ${key} } from '${new URL('../script-utils.js', import.meta.url).href}';`
      ).join('\n')}
        
        const args = ${JSON.stringify(args)};
        const argv = ['deno', '${scriptPath}', ...args];
        
        ${code}
      `;

      await Deno.writeTextFile(tempFile, wrappedCode);

      // Dynamic import the temporary module
      const module = await import(pathToFileURL(tempFile).href);
      return module;
    } finally {
      // Clean up temp file
      await Deno.remove(tempFile);
    }
  }

  /**
   * Load script with Node.js runtime
   */
  private async loadWithNode(scriptPath: string, args: string[]): Promise<any> {
    // Read script content
    let content = await fs.readFile(scriptPath, 'utf-8');
    const ext = path.extname(scriptPath);

    // Handle different file types
    if (ext === '.ts' || ext === '.tsx' || ext === '.mts' || this.options.typescript) {
      content = await this.transpileTypeScript(content, scriptPath);
    } else if (ext === '.md') {
      content = this.extractCodeFromMarkdown(content);
      if (this.options.typescript || await this.hasTypeScript(content)) {
        content = await this.transpileTypeScript(content, scriptPath);
      }
    } else if (ext === '.js' || ext === '.mjs' || ext === '.cjs') {
      // Check if transformation is needed
      if (this.projectType === 'commonjs' && await this.hasESModules(content)) {
        content = await this.transpileTypeScript(content, scriptPath);
      } else if (this.projectType === 'esm' && await this.hasCommonJS(content)) {
        // For ESM projects, we might need to handle CommonJS requires
        content = await this.wrapCommonJS(content);
      }
    }

    // Create script context
    const context = await this.createNodeContext(scriptPath, args);

    // Remove shebang if present
    if (content.startsWith('#!')) {
      content = content.split('\n').slice(1).join('\n');
    }

    // Wrap in appropriate module format
    const wrappedCode = this.wrapCode(content, scriptPath);

    // Execute script
    const script = new vm.Script(wrappedCode, {
      filename: scriptPath,
      importModuleDynamically: this.createImportHandler(scriptPath)
    });

    return script.runInContext(context);
  }

  /**
   * Create dynamic import handler
   */
  private createImportHandler(basePath: string) {
    return async (specifier: string, referrer: vm.Script, importAssertions: any) => {
      const resolved = await this.resolveModuleURL(specifier);
      
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        const content = await this.fetchModule(resolved);
        // Create a synthetic module
        const module = new vm.SyntheticModule(
          ['default'],
          function() {
            this.setExport('default', eval(content));
          },
          { identifier: resolved }
        );
        await module.link(() => 
          // Return undefined for modules with no dependencies
           undefined as any
        );
        await module.evaluate();
        return module;
      }
      
      // For local modules, throw error - they should be handled by Node's loader
      throw new Error(`Cannot dynamically import local module: ${specifier}`);
    };
  }

  /**
   * Wrap code based on project type
   */
  private wrapCode(content: string, filename: string): string {
    if (this.projectType === 'esm' || filename.endsWith('.mjs')) {
      return `
        (async () => {
          ${content}
        })();
      `;
    } else {
      return `
        (function(exports, require, module, __filename, __dirname) {
          ${content}
        })(exports, require, module, __filename, __dirname);
      `;
    }
  }

  /**
   * Wrap CommonJS code for ESM context
   */
  private async wrapCommonJS(content: string): Promise<string> {
    return `
      import { createRequire } from 'module';
      const require = createRequire(import.meta.url);
      ${content}
    `;
  }

  /**
   * Evaluate code with Bun runtime
   */
  private async evalWithBun(code: string, args: string[]): Promise<any> {
    if (!RuntimeDetector.isBun()) {
      throw new Error('Bun runtime requested but not available');
    }

    const Bun = (globalThis as any).Bun;
    const scriptUtils = await import('../script-utils.js');
    const { $ } = await import('@xec-sh/core');

    const context = {
      args,
      argv: ['bun', '<eval>', ...args],
      $,
      ...scriptUtils.default,
      console,
      process,
    };

    const transpiler = new Bun.Transpiler({ loader: 'js', target: 'bun' });
    const transpiledCode = await transpiler.transform(code);

    const fn = new Function(...Object.keys(context), transpiledCode);
    return fn(...Object.values(context));
  }

  /**
   * Evaluate code with Deno runtime
   */
  private async evalWithDeno(code: string, args: string[]): Promise<any> {
    if (!RuntimeDetector.isDeno()) {
      throw new Error('Deno runtime requested but not available');
    }

    const result = await (globalThis as any).Deno.eval(code);
    return result;
  }

  /**
   * Evaluate code with Node.js runtime
   */
  private async evalWithNode(code: string, args: string[]): Promise<any> {
    const context = await this.createNodeContext('<eval>', args);

    // Check if code needs transformation
    if (await this.hasESModules(code) || await this.hasTypeScript(code)) {
      code = await this.transpileTypeScript(code, '<eval>');
    }

    const wrappedCode = this.wrapCode(code, '<eval>');

    const script = new vm.Script(wrappedCode, {
      filename: '<eval>',
      importModuleDynamically: this.createImportHandler('<eval>')
    });

    return script.runInContext(context);
  }

  /**
   * Create Node.js VM context
   */
  private async createNodeContext(scriptPath: string, args: string[]) {
    const require = createRequire(
      scriptPath === '<eval>' || scriptPath === '<repl>'
        ? import.meta.url
        : scriptPath
    );

    // Import utilities
    const { $ } = await import('@xec-sh/core');
    const scriptUtils = await import('../script-utils.js');

    // Create enhanced require that supports CDN
    const enhancedRequire = (id: string) => {
      try {
        return require(id);
      } catch (error) {
        // Try CDN fallback for missing modules
        if (this.options.cdnFallback) {
          // This would need to be implemented with sync HTTP fetch
          // For now, just throw the original error
          throw error;
        }
        throw error;
      }
    };

    // Create context
    const context = vm.createContext({
      // Node.js globals
      console,
      process,
      Buffer,
      URL,
      URLSearchParams,
      TextEncoder,
      TextDecoder,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      fetch: globalThis.fetch,
      AbortController,
      AbortSignal,

      // Module system
      require: enhancedRequire,
      module: { exports: {} },
      exports: {},
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),

      // Arguments
      args,
      argv: [process.argv[0], scriptPath, ...args],

      // Core utilities
      $,
      ...scriptUtils.default,

      // Helper functions
      log: console.log,
      print: console.log,
      echo: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug,

      // Global namespace
      global: {}
    });

    // Import function for dynamic imports
    context['import'] = async (specifier: string) => {
      const resolved = await this.resolveModuleURL(specifier);
      
      if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
        const content = await this.fetchModule(resolved);
        return eval(`(${content})`);
      }
      
      try {
        const resolvedPath = require.resolve(specifier);
        return import(pathToFileURL(resolvedPath).href);
      } catch {
        // Try CDN fallback
        if (this.options.cdnFallback) {
          const cdnUrl = await this.resolveModuleURL(specifier);
          const content = await this.fetchModule(cdnUrl);
          return eval(`(${content})`);
        }
        throw new Error(`Cannot find module '${specifier}'`);
      }
    };

    return context;
  }

  /**
   * Transpile TypeScript to JavaScript
   */
  private async transpileTypeScript(code: string, filename: string): Promise<string> {
    const result = await transform(code, {
      format: this.projectType === 'esm' ? 'esm' : 'cjs',
      target: this.runtime === 'node' ? 'node16' : 'esnext',
      loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
      sourcemap: 'inline',
      sourcefile: filename
    });
    return result.code;
  }

  /**
   * Extract code blocks from Markdown
   */
  private extractCodeFromMarkdown(content: string): string {
    const codeBlocks: string[] = [];
    const regex = /```(?:javascript|js|typescript|ts|xec)?\n([\s\S]*?)```/g;
    let match;

    while ((match = regex.exec(content)) !== null) {
      if (typeof match[1] === 'string') {
        codeBlocks.push(match[1]);
      }
    }

    return codeBlocks.join('\n\n');
  }

  /**
   * Check if code contains ES modules
   */
  private async hasESModules(code: string): Promise<boolean> {
    return /\b(import|export)\b/.test(code);
  }

  /**
   * Check if code contains CommonJS
   */
  private async hasCommonJS(code: string): Promise<boolean> {
    return /\b(require|module\.exports|exports\.)\b/.test(code);
  }

  /**
   * Check if code contains TypeScript
   */
  private async hasTypeScript(code: string): Promise<boolean> {
    return /\b(interface|type|enum|namespace|declare|implements|private|public|protected|readonly)\b/.test(code);
  }

  /**
   * Get current runtime info
   */
  getScriptContext(): ScriptContext {
    const runtime = this.runtime;
    let version = '';
    const features = {
      typescript: false,
      esm: false,
      workers: false,
      ffi: false,
    };

    switch (runtime) {
      case 'bun':
        version = RuntimeDetector.getBunVersion() || 'unknown';
        features.typescript = true;
        features.esm = true;
        features.workers = true;
        features.ffi = true;
        break;

      case 'deno':
        if ((globalThis as any).Deno) {
          version = (globalThis as any).Deno.version.deno;
          features.typescript = true;
          features.esm = true;
          features.workers = true;
          features.ffi = true;
        }
        break;

      case 'node':
        version = process.version;
        features.typescript = false;
        features.esm = true;
        features.workers = true;
        features.ffi = false;
        break;
    }

    return { runtime, version, projectType: this.projectType, features };
  }

  /**
   * Check if runtime supports a feature
   */
  supportsFeature(feature: keyof ScriptContext['features']): boolean {
    const context = this.getScriptContext();
    return context.features[feature];
  }

  /**
   * Create execution context for scripts
   * Public method for REPL and other uses
   */
  async createContext(scriptPath: string, args: string[] = []): Promise<any> {
    switch (this.runtime) {
      case 'node':
        return this.createNodeContext(scriptPath, args);
      case 'bun':
      case 'deno':
        // For Bun and Deno, return a simple context object
        // They don't use VM contexts like Node.js
        const { $ } = await import('@xec-sh/core');
        const scriptUtils = await import('../script-utils.js');
        
        return {
          // Basic globals
          console,
          process,
          args,
          argv: [process.argv[0], scriptPath, ...args],
          
          // Core utilities
          $,
          ...scriptUtils.default,
          
          // Helper functions
          log: console.log,
          print: console.log,
          echo: console.log,
          error: console.error,
          warn: console.warn,
          info: console.info,
          debug: console.debug,
        };
      default:
        throw new Error(`Unsupported runtime: ${this.runtime}`);
    }
  }

  /**
   * Clear module cache
   */
  async clearCache(): Promise<void> {
    this.moduleCache.clear();
    
    if (existsSync(this.cacheDir)) {
      const files = await fs.readdir(this.cacheDir);
      await Promise.all(
        files.map(file => fs.unlink(path.join(this.cacheDir, file)))
      );
    }
    
    if (this.options.verbose) {
      clack.log.success('Module cache cleared');
    }
  }

  /**
   * Get cache statistics
   */
  async getCacheStats(): Promise<{
    entries: number;
    size: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
  }> {
    const stats = {
      entries: this.moduleCache.size,
      size: 0,
      oldestEntry: null as Date | null,
      newestEntry: null as Date | null
    };
    
    let oldest = Infinity;
    let newest = 0;
    
    for (const entry of this.moduleCache.values()) {
      if (entry.timestamp < oldest) oldest = entry.timestamp;
      if (entry.timestamp > newest) newest = entry.timestamp;
      stats.size += (entry.content?.length || 0) + (entry.transformed?.length || 0);
    }
    
    if (oldest !== Infinity) stats.oldestEntry = new Date(oldest);
    if (newest !== 0) stats.newestEntry = new Date(newest);
    
    return stats;
  }
}

/**
 * Create a universal loader instance
 */
export function createUniversalLoader(options?: UniversalLoaderOptions): UniversalScriptLoader {
  return new UniversalScriptLoader(options);
}

/**
 * Load and run a script with auto-detected runtime
 */
export async function runUniversalScript(
  scriptPath: string,
  args: string[] = [],
  options?: UniversalLoaderOptions
): Promise<any> {
  const loader = createUniversalLoader(options);
  return loader.loadScript(scriptPath, args);
}

/**
 * Evaluate code with auto-detected runtime
 */
export async function evalUniversalCode(
  code: string,
  args: string[] = [],
  options?: UniversalLoaderOptions
): Promise<any> {
  const loader = createUniversalLoader(options);
  return loader.evalCode(code, args);
}

/**
 * Load module from CDN or local with caching
 */
export async function loadModule(
  specifier: string,
  options?: UniversalLoaderOptions
): Promise<any> {
  const loader = createUniversalLoader(options);
  const url = await loader['resolveModuleURL'](specifier);
  
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const content = await loader['fetchModule'](url);
    return eval(`(${content})`);
  }
  
  return import(url);
}