import type { Command } from 'commander';

import chalk from 'chalk';
import * as path from 'path';
import * as repl from 'repl';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';
import { pathToFileURL } from 'url';
import * as clack from '@clack/prompts';

import { getModuleLoader, initializeGlobalModuleContext } from './module-loader.js';

import type { ResolvedTarget } from '../config/types.js';

export interface ScriptContext {
  args?: string[];
  argv?: string[];
  __filename?: string;
  __dirname?: string;
}

export interface TargetInfo {
  type: 'local' | 'ssh' | 'docker' | 'k8s';
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
 * Script Loader class
 * Handles all script loading and execution scenarios
 */
export class ScriptLoader {
  private moduleLoader: any;
  private options: LoaderOptions;

  constructor(options: LoaderOptions = {}) {
    this.options = {
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      cache: options.cache !== false,
      preferredCDN: (options.preferredCDN || 'esm.sh') as LoaderOptions['preferredCDN'],
      quiet: options.quiet || false,
      typescript: options.typescript || false,
    };

    this.moduleLoader = getModuleLoader({
      verbose: this.options.verbose,
      cache: this.options.cache,
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
      // Initialize global module context
      await initializeGlobalModuleContext({
        verbose: this.options.verbose,
        preferredCDN: this.options.preferredCDN || 'esm.sh',
      });

      // Resolve script path
      const absolutePath = path.resolve(scriptPath);

      // Check if script exists
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`Script file not found: ${scriptPath}`);
      }

      // Handle watch mode
      if (options.watch) {
        return await this.executeWithWatch(absolutePath, options);
      }

      // Execute the script
      return await this.executeScriptInternal(absolutePath, options);
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
    const context = options.context || {
      args: [],
      argv: [process.argv[0], scriptPath],
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
    };

    // Store original global values
    const originalValues: Map<string, any> = new Map();
    const globalsToInject: Map<string, any> = new Map();

    // Add script context
    globalsToInject.set('__xecScriptContext', context);

    // Add target context if provided
    if (options.target && options.targetEngine) {
      const targetInfo = this.createTargetInfo(options.target);
      globalsToInject.set('$target', options.targetEngine);
      globalsToInject.set('$targetInfo', targetInfo);
    } else if (options.target || options.targetEngine) {
      // For compatibility: inject local target even for standalone scripts
      // This ensures scripts work both in target and standalone contexts
      const localTarget = $;
      const localTargetInfo: TargetInfo = {
        type: 'local',
        name: 'local',
        config: {},
      };
      globalsToInject.set('$target', localTarget);
      globalsToInject.set('$targetInfo', localTargetInfo);
    }

    // Save original values and inject new ones
    for (const [key, value] of globalsToInject) {
      if (key in globalThis) {
        originalValues.set(key, (globalThis as any)[key]);
      }
      (globalThis as any)[key] = value;
    }

    try {
      // Load and execute the script
      await this.moduleLoader.loadScript(scriptPath, context.args || []);

      return {
        success: true,
      };
    } finally {
      // Restore original global values
      for (const [key] of globalsToInject) {
        if (originalValues.has(key)) {
          (globalThis as any)[key] = originalValues.get(key);
        } else {
          delete (globalThis as any)[key];
        }
      }
    }
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
          clack.log.info(chalk.dim(`Running ${scriptPath}...`));
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
      clack.log.info(chalk.dim('File changed, rerunning...'));
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
      await initializeGlobalModuleContext({
        verbose: this.options.verbose,
        preferredCDN: this.options.preferredCDN || 'esm.sh',
      });

      // Display runtime info
      if (!this.options.quiet && !options.quiet) {
        clack.log.info(`Evaluating code...`);
      }

      // Transform TypeScript if needed
      const needsTransform =
        code.includes('interface') ||
        code.includes('type ') ||
        options.typescript ||
        this.options.typescript;

      const transformedCode = needsTransform
        ? await this.moduleLoader.transformTypeScript(code, '<eval>')
        : code;

      // Prepare context
      const context = options.context || {
        args: [],
        argv: ['xec', '<eval>'],
        __filename: '<eval>',
        __dirname: process.cwd(),
      };

      // Store original global values
      const originalValues: Map<string, any> = new Map();
      const globalsToInject: Map<string, any> = new Map();

      // Add script context
      globalsToInject.set('__xecScriptContext', context);

      // Add target context if provided
      if (options.target && options.targetEngine) {
        const targetInfo = this.createTargetInfo(options.target);
        globalsToInject.set('$target', options.targetEngine);
        globalsToInject.set('$targetInfo', targetInfo);
      }

      // Save and inject globals
      for (const [key, value] of globalsToInject) {
        if (key in globalThis) {
          originalValues.set(key, (globalThis as any)[key]);
        }
        (globalThis as any)[key] = value;
      }

      try {
        // Execute the code
        const dataUrl = `data:text/javascript;base64,${Buffer.from(transformedCode).toString('base64')}`;
        await import(dataUrl);

        return {
          success: true,
        };
      } finally {
        // Restore original values
        for (const [key] of globalsToInject) {
          if (originalValues.has(key)) {
            (globalThis as any)[key] = originalValues.get(key);
          } else {
            delete (globalThis as any)[key];
          }
        }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }

  /**
   * Start REPL with optional target context
   */
  async startRepl(options: ExecutionOptions = {}): Promise<void> {
    // Initialize global module context
    await initializeGlobalModuleContext({
      verbose: this.options.verbose,
      preferredCDN: this.options.preferredCDN || 'esm.sh',
    });

    // Display runtime info
    const title = options.target
      ? `Xec Interactive Shell (${options.target.name})`
      : 'Xec Interactive Shell';

    clack.log.info(chalk.bold(title));
    clack.log.info(chalk.dim('Type .help for commands'));

    // Create REPL prompt
    const prompt = options.target
      ? chalk.cyan(`xec:${options.target.name}> `)
      : chalk.cyan('xec> ');

    // Start REPL server
    const replServer = repl.start({
      prompt,
      useGlobal: false,
      breakEvalOnSigint: true,
      useColors: true,
    });

    // Import utilities
    const scriptUtils = await import('./script-utils.js');

    // Build REPL context
    const replContext: any = {
      $,
      ...scriptUtils.default,
      chalk,
      console,
      process,
      use: (spec: string) => (globalThis as any).use?.(spec),
      x: (spec: string) => (globalThis as any).x?.(spec),
    };

    // Add target context if provided
    if (options.target && options.targetEngine) {
      const targetInfo = this.createTargetInfo(options.target);
      replContext.$target = options.targetEngine;
      replContext.$targetInfo = targetInfo;
    }

    // Assign context to REPL
    Object.assign(replServer.context, replContext);

    // Add custom commands
    this.addReplCommands(replServer, options);

    // Show helpful message
    if (options.target && options.targetEngine) {
      console.log(chalk.gray('Available globals:'));
      console.log(chalk.gray('  $target     - Execute commands on the target'));
      console.log(chalk.gray('  $targetInfo - Information about the current target'));
      console.log(chalk.gray('  $           - Execute commands locally'));
      console.log(chalk.gray('  chalk       - Terminal colors'));
      console.log(chalk.gray('  use()       - Import NPM packages or CDN modules'));
      console.log(chalk.gray('  import()    - Import modules'));
      console.log(chalk.gray(''));
      console.log(chalk.gray('Example: await $target`ls -la`'));
      console.log(chalk.gray('Example: const lodash = await use("lodash")'));
    } else {
      console.log(chalk.gray('Type .runtime to see runtime information'));
      console.log(chalk.gray('Type .load <file> to load and run a script'));
    }
    console.log(chalk.gray(''));
  }

  /**
   * Load a dynamic command module
   */
  async loadDynamicCommand(
    filePath: string,
    program: Command,
    commandName: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Initialize global module context
      await initializeGlobalModuleContext({
        verbose: this.options.verbose,
        preferredCDN: this.options.preferredCDN || 'esm.sh',
      });

      const ext = path.extname(filePath);
      let moduleExports: any;

      // Read file content
      const content = await fs.readFile(filePath, 'utf-8');

      // Transform import() calls with prefixes to use `use`
      const processedContent = content.replace(
        /import\s*\(\s*['"`]((npm|jsr|esm|unpkg|skypack|jsdelivr):[^'"`]*?)['"`]\s*\)/g,
        "globalThis.use('$1')"
      );

      // Transform TypeScript if needed
      const transformedCode = (ext === '.ts' || ext === '.tsx')
        ? await this.moduleLoader.transformTypeScript(processedContent, filePath)
        : processedContent;

      // Find appropriate temp directory
      const tempDir = await this.findTempDirectory(filePath);
      const tempDirPath = path.join(tempDir, '.xec-temp');
      await fs.mkdir(tempDirPath, { recursive: true });

      // Write temporary file
      const tempFileName = `${commandName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.mjs`;
      const tempPath = path.join(tempDirPath, tempFileName);
      await fs.writeFile(tempPath, transformedCode);

      try {
        // Import the module
        moduleExports = await import(pathToFileURL(tempPath).href);
      } finally {
        // Clean up
        await fs.unlink(tempPath).catch(() => { });
      }

      if (!moduleExports) {
        throw new Error('Module did not export anything');
      }

      // Register command
      if (moduleExports.command && typeof moduleExports.command === 'function') {
        moduleExports.command(program);
      } else if (typeof moduleExports === 'function') {
        moduleExports(program);
      } else if (moduleExports.default && typeof moduleExports.default === 'function') {
        moduleExports.default(program);
      } else {
        throw new Error('Command file must export a "command" function or default function');
      }

      if (this.options.verbose) {
        clack.log.info(`Loaded dynamic command: ${commandName}`);
      }

      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (this.options.verbose) {
        console.error(`Failed to load command ${commandName}:`, error);
        if (error instanceof Error && error.stack) {
          console.error('Stack trace:', error.stack);
        }
      } else {
        clack.log.error(`Failed to load command '${commandName}': ${errorMessage}`);
      }

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Create TargetInfo from ResolvedTarget
   */
  private createTargetInfo(target: ResolvedTarget): TargetInfo {
    const targetInfo: TargetInfo = {
      type: target.type,
      name: target.name,
      config: target.config,
    };

    // Add type-specific info
    // eslint-disable-next-line default-case
    switch (target.type) {
      case 'ssh':
        targetInfo.host = (target.config as any).host;
        break;
      case 'docker':
        targetInfo.container = (target.config as any).container || target.name;
        break;
      case 'k8s':
        targetInfo.pod = (target.config as any).pod || target.name;
        targetInfo.namespace = (target.config as any).namespace;
        break;
    }

    return targetInfo;
  }

  /**
   * Find appropriate temp directory for module loading
   */
  private async findTempDirectory(scriptPath: string): Promise<string> {
    // Try to find node_modules directory
    let searchDir = path.dirname(scriptPath);

    for (let i = 0; i < 10; i++) {
      try {
        await fs.access(path.join(searchDir, 'node_modules'));
        return searchDir;
      } catch {
        // Continue searching
      }

      const parentDir = path.dirname(searchDir);
      if (parentDir === searchDir) break;
      searchDir = parentDir;
    }

    // Fall back to current directory
    return process.cwd();
  }

  /**
   * Add custom REPL commands
   */
  private addReplCommands(replServer: any, options: ExecutionOptions): void {
    const self = this;

    replServer.defineCommand('load', {
      help: 'Load and run a script file',
      action(filename: string) {
        const trimmed = filename.trim();
        self.executeScript(trimmed, options)
          .then((result) => {
            if (!result.success && result.error) {
              console.error(result.error);
            }
            this.displayPrompt();
          })
          .catch((error) => {
            console.error(error);
            this.displayPrompt();
          });
      }
    });

    replServer.defineCommand('clear', {
      help: 'Clear the console',
      action() {
        console.clear();
        this.displayPrompt();
      }
    });

    replServer.defineCommand('runtime', {
      help: 'Show current runtime information',
      action() {
        console.log(`Runtime: ${chalk.cyan('Node.js')} ${chalk.dim(process.version)}`);
        console.log(`Features:`);
        console.log(`  TypeScript: ${chalk.green('✓')}`);
        console.log(`  ESM: ${chalk.green('✓')}`);
        console.log(`  Workers: ${chalk.green('✓')}`);
        if (options.target) {
          console.log(`Target: ${chalk.cyan(options.target.type)} (${options.target.name})`);
        }
        this.displayPrompt();
      }
    });
  }

  /**
   * Check if a file is a script
   */
  static isScript(filepath: string): boolean {
    const ext = path.extname(filepath);
    return ['.js', '.mjs', '.ts', '.tsx'].includes(ext);
  }
}

// Singleton instance for backward compatibility
let defaultLoader: ScriptLoader;

/**
 * Get default loader instance
 */
export function getUnifiedScriptLoader(options?: LoaderOptions): ScriptLoader {
  if (!defaultLoader) {
    defaultLoader = new ScriptLoader(options);
  }
  return defaultLoader;
}

/**
 * Convenience function to execute a script
 */
export async function executeScript(
  scriptPath: string,
  options?: ExecutionOptions
): Promise<ScriptExecutionResult> {
  const loader = getUnifiedScriptLoader(options);
  return loader.executeScript(scriptPath, options);
}

/**
 * Convenience function to evaluate code
 */
export async function evaluateCode(
  code: string,
  options?: ExecutionOptions
): Promise<ScriptExecutionResult> {
  const loader = getUnifiedScriptLoader(options);
  return loader.evaluateCode(code, options);
}

/**
 * Convenience function to start REPL
 */
export async function startRepl(options?: ExecutionOptions): Promise<void> {
  const loader = getUnifiedScriptLoader(options);
  return loader.startRepl(options);
}