/**
 * Adapter layer for @xec-sh/loader
 * Provides CLI-specific functionality and maintains backward compatibility
 */

import type { Command } from 'commander';

import * as path from 'path';
import { $ } from '@xec-sh/core';
import { log, prism } from '@xec-sh/kit';
import {
  REPLServer,
  ModuleLoader,
  CodeEvaluator,
  ScriptRuntime,
  ScriptExecutor,
  GlobalInjector,
  TypeScriptTransformer,
} from '@xec-sh/loader';

import type { ResolvedTarget } from '../config/types.js';

export interface ScriptContext {
  args: string[];
  argv: string[];
  __filename: string;
  __dirname: string;
}

export interface TargetInfo {
  type: 'local' | 'ssh' | 'docker' | 'kubernetes';
  name?: string;
  host?: string;
  container?: string;
  pod?: string;
  namespace?: string;
  config: any;
}

export interface LoaderOptions {
  verbose?: boolean;
  cache?: boolean;
  preferredCDN?: 'esm.sh' | 'jsr.io' | 'unpkg' | 'skypack' | 'jsdelivr';
  quiet?: boolean;
  typescript?: boolean;
}

export interface ExecutionOptions extends LoaderOptions {
  target?: ResolvedTarget;
  targetEngine?: any;
  context?: ScriptContext;
  watch?: boolean;
}

export interface ScriptExecutionResult {
  success: boolean;
  error?: Error;
  output?: string;
}

/**
 * ScriptLoader adapter - wraps @xec-sh/loader with CLI-specific functionality
 */
export class ScriptLoader {
  private executor: ScriptExecutor;
  private evaluator: CodeEvaluator;
  private moduleLoader: ModuleLoader;
  private options: LoaderOptions;
  private globalContextInitialized = false;

  constructor(options: LoaderOptions = {}) {
    this.options = {
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      cache: options.cache !== false,
      preferredCDN: (options.preferredCDN || 'esm.sh') as LoaderOptions['preferredCDN'],
      quiet: options.quiet || false,
      typescript: options.typescript || false,
    };

    this.executor = new ScriptExecutor();
    this.evaluator = new CodeEvaluator();
    this.moduleLoader = new ModuleLoader({
      preferredCDN: this.options.preferredCDN,
    });
  }

  /**
   * Execute a script file with optional target context
   */
  async executeScript(
    scriptPath: string,
    options: ExecutionOptions = {}
  ): Promise<ScriptExecutionResult> {
    try {
      // Handle watch mode
      if (options.watch) {
        return await this.executeWithWatch(scriptPath, options);
      }

      // Execute the script
      return await this.executeScriptInternal(scriptPath, options);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Internal script execution with context injection
   */
  private async executeScriptInternal(
    scriptPath: string,
    options: ExecutionOptions
  ): Promise<ScriptExecutionResult> {
    // Prepare script context
    const context: ScriptContext = options.context || {
      args: [],
      argv: [process.argv[0] || 'node', scriptPath],
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
    };

    // Initialize global module context
    await this.initializeGlobalModuleContext();

    // Prepare custom globals
    const customGlobals: Record<string, any> = {
      __xecScriptContext: context,
    };

    // Add target context if provided
    if (options.target && options.targetEngine) {
      const targetInfo = this.createTargetInfo(options.target);
      customGlobals['$target'] = options.targetEngine;
      customGlobals['$targetInfo'] = targetInfo;
    } else if (options.target || options.targetEngine) {
      // For compatibility: inject local target even for standalone scripts
      const localTarget = $;
      const localTargetInfo: TargetInfo = {
        type: 'local',
        name: 'local',
        config: {},
      };
      customGlobals['$target'] = localTarget;
      customGlobals['$targetInfo'] = localTargetInfo;
    }

    // Execute with ScriptExecutor
    const result = await this.executor.executeScript(scriptPath, {
      context,
      customGlobals,
      verbose: this.options.verbose,
      quiet: this.options.quiet,
    });

    return result;
  }

  /**
   * Execute script with file watching
   */
  private async executeWithWatch(
    scriptPath: string,
    options: ExecutionOptions
  ): Promise<ScriptExecutionResult> {
    const { watch } = await import('chokidar');

    const runAndLog = async () => {
      try {
        if (!this.options.quiet) {
          log.info(prism.dim(`Running ${scriptPath}...`));
        }
        const result = await this.executeScriptInternal(scriptPath, options);
        if (!result.success && result.error) {
          console.error(result.error);
        }
      } catch (error) {
        console.error(error);
      }
    };

    // Run initially
    await runAndLog();

    // Watch for changes
    const watcher = watch(scriptPath, { ignoreInitial: true });
    watcher.on('change', async () => {
      console.clear();
      log.info(prism.dim('File changed, rerunning...'));
      await runAndLog();
    });

    // Keep process alive
    process.stdin.resume();

    return {
      success: true,
    };
  }

  /**
   * Evaluate code string with optional target context
   */
  async evaluateCode(
    code: string,
    options: ExecutionOptions = {}
  ): Promise<ScriptExecutionResult> {
    try {
      // Initialize global module context
      await this.initializeGlobalModuleContext();

      // Display runtime info
      if (!this.options.quiet && !options.quiet) {
        log.info(`Evaluating code...`);
      }

      // Prepare custom globals
      const customGlobals: Record<string, any> = {};

      // Add target context if provided
      if (options.target && options.targetEngine) {
        const targetInfo = this.createTargetInfo(options.target);
        customGlobals['$target'] = options.targetEngine;
        customGlobals['$targetInfo'] = targetInfo;
      }

      // Evaluate code
      const result = await this.evaluator.evaluateCode(code, {
        customGlobals,
        verbose: this.options.verbose,
        quiet: this.options.quiet,
      });

      return result;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Start an interactive REPL session
   */
  async startRepl(options: ExecutionOptions = {}): Promise<void> {
    // Initialize global module context
    await this.initializeGlobalModuleContext();

    // Display runtime info
    const title = options.target
      ? `Xec Interactive Shell (${options.target.name})`
      : 'Xec Interactive Shell';

    log.info(prism.bold(title));
    log.info(prism.dim('Type .help for commands'));

    // Create REPL prompt
    const prompt = options.target
      ? prism.cyan(`xec:${options.target.name}> `)
      : prism.cyan('xec> ');

    // Import utilities
    const scriptRuntime = new ScriptRuntime();

    // Build REPL context
    const replContext: any = {
      $,
      ...this.getScriptUtilities(),
      prism,
      console,
      process,
      $runtime: scriptRuntime,
      use: (spec: string) => (globalThis as any).use?.(spec),
      x: (spec: string) => (globalThis as any).x?.(spec),
    };

    // Add target context if provided
    if (options.target && options.targetEngine) {
      const targetInfo = this.createTargetInfo(options.target);
      replContext.$target = options.targetEngine;
      replContext.$targetInfo = targetInfo;
    }

    // Create REPL server
    const replServer = new REPLServer({
      prompt,
      useGlobal: false,
      breakEvalOnSigint: true,
      useColors: true,
      context: replContext,
      includeBuiltins: true,
      showWelcome: false, // We already showed welcome message
    });

    // Start REPL
    replServer.start();

    // Show helpful message
    if (options.target && options.targetEngine) {
      console.log(prism.gray('Available globals:'));
      console.log(prism.gray('  $target     - Execute commands on the target'));
      console.log(prism.gray('  $targetInfo - Information about the current target'));
      console.log(prism.gray('  $           - Execute commands locally'));
      console.log(prism.gray('  prism       - Terminal colors'));
      console.log(prism.gray('  use()       - Import NPM packages or CDN modules'));
      console.log(prism.gray('  import()    - Import modules'));
      console.log(prism.gray(''));
      console.log(prism.gray('Example: await $target`ls -la`'));
      console.log(prism.gray('Example: const lodash = await use("lodash")'));
    } else {
      console.log(prism.gray('Type .runtime to see runtime information'));
    }
    console.log(prism.gray(''));
  }

  // TypeScript transformer instance for dynamic command loading
  // Uses TypeScriptTransformer from @xec-sh/loader
  private readonly tsTransformer = new TypeScriptTransformer(undefined, {
    target: 'esnext',
    format: 'esm',
  });

  /**
   * Load a dynamic command module
   * Uses TypeScriptTransformer from @xec-sh/loader for base transformation
   */
  async loadDynamicCommand(
    filePath: string,
    program: Command,
    _commandName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // CRITICAL: Initialize global module context BEFORE importing
      // This ensures kit, prism, log are available during module parsing
      await this.initializeGlobalModuleContext();

      // Load the module - use TypeScriptTransformer for TS files, dynamic import for JS
      let moduleExports;
      if (this.tsTransformer.needsTransformation(filePath)) {
        // TypeScript files: use TypeScriptTransformer from @xec-sh/loader
        const fs = await import('fs');
        const nodePath = await import('path');

        const code = await fs.promises.readFile(filePath, 'utf-8');

        // Use TypeScriptTransformer with Node.js platform options
        let transformedCode = await this.tsTransformer.transformWithOptions(code, filePath, {
          platform: 'node',
        });

        // Apply CLI-specific post-processing
        transformedCode = this.applyCliTransformations(transformedCode);

        // Add preamble with global context and write to temp file
        const fullCode = this.createGlobalPreamble() + transformedCode;
        const tmpDir = nodePath.join(process.cwd(), '.xec', '.tmp');
        await fs.promises.mkdir(tmpDir, { recursive: true });
        const tmpFile = nodePath.join(tmpDir, `xec-cmd-${Date.now()}.js`);

        await fs.promises.writeFile(tmpFile, fullCode);

        try {
          const fileUrl = new URL(`file://${tmpFile}`).href;

          if (process.env['XEC_DEBUG']) {
            console.log(`[loadDynamicCommand] Importing URL: ${fileUrl}`);
          }

          moduleExports = await import(fileUrl);
        } finally {
          // Clean up temp file (keep for debugging)
          if (!process.env['XEC_DEBUG']) {
            await fs.promises.unlink(tmpFile).catch(() => {});
          }
        }
      } else {
        // JavaScript files: use direct import
        const fileUrl = filePath.startsWith('/') ? `file://${filePath}` : filePath;
        moduleExports = await import(fileUrl);
      }

      // Check if the module exports a default function, setup, or command function
      const setupFn = moduleExports.default || moduleExports.setup || moduleExports.command;
      if (typeof setupFn === 'function') {
        await setupFn(program);
        return { success: true };
      } else {
        return {
          success: false,
          error: `Command file must export a default function, setup function, or command function`,
        };
      }
    } catch (error) {
      if (process.env['XEC_DEBUG']) {
        console.error('[loadDynamicCommand] Error details:', error);
        if (error instanceof Error && error.stack) {
          console.error('[loadDynamicCommand] Stack trace:', error.stack);
        }
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Apply CLI-specific transformations to transpiled code
   * Fixes esbuild quirks and patterns specific to xec commands
   */
  private applyCliTransformations(code: string): string {
    let result = code;

    // Fix esbuild's incorrect .mjs extensions for node: imports
    // esbuild sometimes generates: import process from "node:process.mjs"
    // Node.js expects: import process from "node:process"
    result = result.replace(/from\s+["']node:([^"']+)\.mjs["']/g, 'from "node:$1"');

    // Replace problematic declarations that conflict with globals
    result = result.replace(
      /const prism = globalThis\.prism \|\| kit\.prism;/g,
      '// prism is available from globalThis'
    );

    return result;
  }

  /**
   * Create preamble with global context for dynamic commands
   */
  private createGlobalPreamble(): string {
    return `
// Injected global context for dynamic commands
const process = globalThis.process;
const $ = globalThis.$;
const kit = globalThis.kit;
const prism = globalThis.prism;
const log = globalThis.log;
const use = globalThis.use;
const x = globalThis.x;
const Import = globalThis.Import;

`;
  }

  /**
   * Initialize global module context (use, x, Import functions + kit utilities)
   * Only initializes once per instance
   */
  private async initializeGlobalModuleContext(): Promise<void> {
    // Skip if already initialized
    if (this.globalContextInitialized) {
      return;
    }

    // Import kit for global utilities
    const kit = await import('@xec-sh/kit');

    // Inject global functions for module loading AND kit utilities
    const injector = new GlobalInjector({
      globals: {
        // Core execution function (CRITICAL for commands like release.ts)
        $,

        // Module loading functions
        use: async (spec: string) => await this.moduleLoader.import(spec),
        x: async (spec: string) => await this.moduleLoader.import(spec),
        Import: async (spec: string) => await this.moduleLoader.import(spec),

        // Kit utilities (needed for dynamic commands like release.ts)
        kit,
        prism: kit.prism,
        log: kit.log,
      },
    });

    // Execute without restoring (we want these to stay global)
    injector.inject();

    // Mark as initialized
    this.globalContextInitialized = true;
  }

  /**
   * Get script utilities (cd, pwd, env, etc.)
   */
  private getScriptUtilities(): Record<string, any> {
    const runtime = new ScriptRuntime();
    return {
      cd: runtime.cd.bind(runtime),
      pwd: runtime.pwd.bind(runtime),
      env: runtime.env.bind(runtime),
      setEnv: runtime.setEnv.bind(runtime),
      sleep: runtime.sleep.bind(runtime),
      retry: runtime.retry.bind(runtime),
      within: runtime.within.bind(runtime),
      quote: runtime.quote.bind(runtime),
      tmpdir: runtime.tmpdir.bind(runtime),
      tmpfile: runtime.tmpfile.bind(runtime),
      template: runtime.template.bind(runtime),
    };
  }

  /**
   * Create target info from resolved target
   */
  private createTargetInfo(target: ResolvedTarget): TargetInfo {
    return {
      type: target.type,
      name: target.name,
      host: 'host' in target ? (target as any).host : undefined,
      container: 'container' in target ? (target as any).container : undefined,
      pod: 'pod' in target ? (target as any).pod : undefined,
      namespace: 'namespace' in target ? (target as any).namespace : undefined,
      config: target,
    };
  }
}

/**
 * Get a singleton ScriptLoader instance
 */
let cachedLoader: ScriptLoader | null = null;

export function getScriptLoader(options: LoaderOptions = {}): ScriptLoader {
  if (!cachedLoader) {
    cachedLoader = new ScriptLoader(options);
  }
  return cachedLoader;
}
