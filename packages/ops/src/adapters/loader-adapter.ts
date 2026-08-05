/**
 * Adapter layer for @xec-sh/loader
 * Provides CLI-specific functionality and maintains backward compatibility
 */

/** CLI program interface (e.g., commander.Command). Library users pass their own. */
interface CLIProgram { command(name: string, description?: string): unknown; }

import type { ResolvedTarget } from '../config/types.js';

import * as path from 'node:path';
import { $ } from '@xec-sh/core';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
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
 * Build the URL a command module is imported by.
 *
 * String-built `file://${p}` URLs corrupt any path containing '#', '%' or
 * spaces — everything after '#' parses as a fragment — and Windows paths
 * never start with '/', so they used to be passed to import() as bare
 * specifiers. Relative paths resolve against the working directory, matching
 * how command paths are configured.
 */
export function commandFileUrl(filePath: string): string {
  return pathToFileURL(path.resolve(filePath)).href;
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
      cache: this.options.cache,
      verbose: this.options.verbose,
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
    const { FileWatcher } = await import('@xec-sh/loader');

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

    // Watch for changes using @xec-sh/loader's FileWatcher
    const dir = path.dirname(scriptPath);
    const ext = path.extname(scriptPath);
    const watcher = new FileWatcher(dir, { extensions: [ext || '.ts', '.js'], debounce: 300 });
    watcher.on('change', async () => {
      console.clear();
      log.info(prism.dim('File changed, rerunning...'));
      await runAndLog();
    });
    watcher.start();

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

      // The evaluator imports the code as a data: URL, which no runtime
      // type-strips, so TypeScript syntax has to be compiled away here.
      let evaluated = code;
      if (options.typescript ?? this.options.typescript) {
        evaluated = await this.tsTransformer.transformWithOptions(code, 'xec-eval.ts', {
          platform: 'node',
        });
      }

      // Evaluate code. The invocation context travels too — this call used
      // to drop it on the floor, so the evaluator fell back to its default
      // and `xec -e` reported empty args no matter what followed the code.
      const result = await this.evaluator.evaluateCode(evaluated, {
        context: options.context,
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

    // The REPL runs with `useGlobal: false`, so it sees only what this
    // context carries. It previously carried its own eleven-name subset —
    // same drift, fourth copy.
    const replContext: any = {
      ...(await this.buildDeclaredGlobals()),
      console,
      process,
      $runtime: scriptRuntime,
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
    program: CLIProgram,
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
        const fs = await import('node:fs');

        const code = await fs.promises.readFile(filePath, 'utf-8');

        // Use TypeScriptTransformer with Node.js platform options
        const transformedCode = await this.tsTransformer.transformWithOptions(code, filePath, {
          platform: 'node',
        });

        // Apply CLI-specific post-processing
        const fullCode = this.applyCliTransformations(transformedCode);

        const tmpDir = path.join(process.cwd(), '.xec', '.tmp');
        await fs.promises.mkdir(tmpDir, { recursive: true });
        // The name must be unique per load: ESM caches by URL, so a reused
        // name would hand a second command the first one's exports — and a
        // predictable name in a shared directory is writable by others.
        const tmpFile = path.join(tmpDir, `xec-cmd-${randomBytes(8).toString('hex')}.js`);

        await fs.promises.writeFile(tmpFile, fullCode);

        try {
          const fileUrl = commandFileUrl(tmpFile);

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
        moduleExports = await import(commandFileUrl(filePath));
      }

      // Check if the module exports a default function, setup, or command function
      const setupFn = moduleExports['default'] || moduleExports['setup'] || moduleExports['command'];
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
    // Fix esbuild's incorrect .mjs extensions for node: imports
    // esbuild sometimes generates: import process from "node:process.mjs"
    // Node.js expects: import process from "node:process"
    //
    // This used to also rewrite user code that declared its own `prism`
    // constant — a workaround for the global preamble this module no longer
    // emits. The preamble aliased `$`, `kit`, `prism` and friends as module
    // constants, so any command that imported the same names explicitly —
    // the documented, typed style — died at parse with "Identifier '$' has
    // already been declared", which the CLI then reported as "command not
    // found". Globals are injected on `globalThis` before the module loads;
    // aliases on top of them bought nothing and broke real commands.
    return code.replace(/from\s+["']node:([^"']+)\.mjs["']/g, 'from "node:$1"');
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

    const injector = new GlobalInjector({
      globals: await this.buildDeclaredGlobals(),
    });

    // Execute without restoring (we want these to stay global)
    injector.inject();

    // Mark as initialized
    this.globalContextInitialized = true;
  }

  /**
   * Everything globals.d.ts declares, sourced from the same aggregate the
   * package exports — plus the module-loading pair that only exists here.
   *
   * One builder feeds every entry point: script execution, code evaluation,
   * dynamic commands and the REPL. It replaced three hand-typed lists that
   * had drifted to different subsets of the declared thirty-two — the widest
   * held seven names — so retry, sleep, within, glob and the rest were
   * phantoms: visible to the type checker, undefined at run time. A release
   * died on `retry is not defined` as the first script ever to reach one.
   */
  private declaredGlobals: Record<string, unknown> | null = null;

  private async buildDeclaredGlobals(): Promise<Record<string, unknown>> {
    if (this.declaredGlobals) {
      return this.declaredGlobals;
    }

    const { default: scriptUtils } = await import('../utils/script-utils.js');
    const { retry } = await import('../retry/index.js');

    // The aggregate carries two members the declaration does not: `runtime`
    // (advanced API, imported explicitly where needed) and `fetch` (already
    // a platform global). An undeclared global is the same defect mirrored,
    // so both stay out.
    const declaredUtils = Object.fromEntries(
      Object.entries(scriptUtils).filter(([name]) => name !== 'runtime' && name !== 'fetch')
    );

    this.declaredGlobals = {
      ...declaredUtils,

      // The declaration binds `retry` to the retry engine, not to the
      // small script-utils helper the aggregate carries under that name.
      retry,

      // Module loading — the two names that exist only through the loader.
      use: async (spec: string) => await this.moduleLoader.import(spec),
      x: async (spec: string) => await this.moduleLoader.import(spec),
    };

    return this.declaredGlobals;
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
      // The target's own configuration — not the whole ResolvedTarget, which
      // itself has a config field and turned $targetInfo.config into a
      // matryoshka of {type, name, config: {type, name, config: {}}}.
      config: target.config,
    };
  }
}

/**
 * Get a shared ScriptLoader instance.
 *
 * Instances are cached per option set. A single cached instance would hand
 * every later caller the first caller's options — `xec watch --quiet` stayed
 * loud because the command manager had already created the loader without
 * `quiet`. Callers passing identical options still share one instance, which
 * is what keeps the injected global context and module cache shared.
 */
const cachedLoaders = new Map<string, ScriptLoader>();

export function getScriptLoader(options: LoaderOptions = {}): ScriptLoader {
  const key = JSON.stringify([
    options.verbose ?? null,
    options.cache ?? null,
    options.preferredCDN ?? null,
    options.quiet ?? null,
    options.typescript ?? null,
  ]);

  let loader = cachedLoaders.get(key);
  if (!loader) {
    loader = new ScriptLoader(options);
    cachedLoaders.set(key, loader);
  }
  return loader;
}
