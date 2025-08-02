/**
 * Script executor with target context injection
 * Provides $target and $targetInfo to scripts
 */

import * as vm from 'vm';
import chalk from 'chalk';
import * as path from 'path';
import * as repl from 'repl';
import { $ } from '@xec-sh/core';
import * as fs from 'fs/promises';

import type { ResolvedTarget } from '../config/types.js';

export interface ScriptExecutionResult {
  success: boolean;
  error?: Error;
  output?: string;
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

export class ScriptExecutor {
  /**
   * Execute a script with target context
   */
  async executeWithTarget(
    scriptPath: string,
    target: ResolvedTarget,
    targetEngine: any,
    args: string[] = []
  ): Promise<ScriptExecutionResult> {
    try {
      // Resolve script path
      const absolutePath = path.resolve(scriptPath);
      
      // Check if script exists
      try {
        await fs.access(absolutePath);
      } catch {
        throw new Error(`Script file not found: ${scriptPath}`);
      }
      
      // Read script content
      const scriptContent = await fs.readFile(absolutePath, 'utf-8');
      
      // Create target info
      const targetInfo: TargetInfo = {
        type: target.type,
        name: target.name,
        config: target.config,
      };
      
      // Add type-specific info
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
      
      // Create script context
      const context = this.createScriptContext(targetEngine, targetInfo, args, absolutePath);
      
      // Execute script
      const result = await this.runScript(scriptContent, absolutePath, context);
      
      return {
        success: true,
        output: result,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
      };
    }
  }
  
  /**
   * Start a REPL session with target context
   */
  async startRepl(target: ResolvedTarget, targetEngine: any): Promise<void> {
    // Create target info
    const targetInfo: TargetInfo = {
      type: target.type,
      name: target.name,
      config: target.config,
    };
    
    // Create REPL server
    const replServer = repl.start({
      prompt: `xec:${target.name}> `,
      useColors: true,
      useGlobal: false,
    });
    
    // Add context to REPL
    Object.assign(replServer.context, {
      $target: targetEngine,
      $targetInfo: targetInfo,
      $,
      chalk,
      console,
      process,
      // Note: require is available in REPL but not in VM context
    });
    
    // Add helpful message
    console.log(chalk.gray('Available globals:'));
    console.log(chalk.gray('  $target    - Execute commands on the target'));
    console.log(chalk.gray('  $targetInfo - Information about the current target'));
    console.log(chalk.gray('  $          - Execute commands locally'));
    console.log(chalk.gray('  chalk      - Terminal colors'));
    console.log(chalk.gray(''));
    console.log(chalk.gray('Example: await $target`ls -la`'));
    console.log(chalk.gray(''));
  }
  
  /**
   * Create script execution context
   */
  private createScriptContext(
    targetEngine: any,
    targetInfo: TargetInfo,
    args: string[],
    scriptPath: string
  ): vm.Context {
    // Core globals
    const context = {
      // Target context
      $target: targetEngine,
      $targetInfo: targetInfo,
      $,
      
      // Script metadata
      __filename: scriptPath,
      __dirname: path.dirname(scriptPath),
      
      // Node.js globals
      console,
      process: {
        ...process,
        argv: ['node', scriptPath, ...args],
      },
      // Skip require in VM context as it's not available
      // require,
      Buffer,
      setTimeout,
      setInterval,
      setImmediate,
      clearTimeout,
      clearInterval,
      clearImmediate,
      
      // Utilities
      chalk,
      fetch: globalThis.fetch,
      Promise,
      
      // Global constructors
      Array,
      Object,
      String,
      Number,
      Boolean,
      Date,
      RegExp,
      Error,
      Map,
      Set,
      
      // Async utilities
      queueMicrotask,
    };
    
    return vm.createContext(context);
  }
  
  /**
   * Run script in VM
   */
  private async runScript(
    scriptContent: string,
    scriptPath: string,
    context: vm.Context
  ): Promise<string> {
    // Wrap script to support top-level await
    const wrappedScript = `
      (async () => {
        ${scriptContent}
      })().catch(err => {
        console.error('Script error:', err);
        process.exit(1);
      });
    `;
    
    // Create and run script
    const script = new vm.Script(wrappedScript, {
      filename: scriptPath,
      lineOffset: -1,
    });
    
    // Capture output
    let output = '';
    const originalLog = console.log;
    const originalError = console.error;
    
    context['console'] = {
      ...console,
      log: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        output += message + '\n';
        originalLog(...args);
      },
      error: (...args: any[]) => {
        const message = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ');
        output += message + '\n';
        originalError(...args);
      },
    };
    
    // Run script
    await script.runInContext(context);
    
    // Wait a bit for async operations to complete
    await new Promise(resolve => setTimeout(resolve, 100));
    
    return output;
  }
  
  /**
   * Check if a file is a script
   */
  static isScript(filepath: string): boolean {
    return filepath.endsWith('.js') || filepath.endsWith('.ts');
  }
}