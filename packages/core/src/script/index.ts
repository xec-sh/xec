/**
 * Xec Script Runtime
 * 
 * This module provides the runtime for Xec scripts, which are
 * enhanced JavaScript/TypeScript scripts that leverage @xec/ush
 * for powerful command execution and automation.
 */

import os from 'os';
import chalk from 'chalk';
import which from 'which';
import { glob } from 'glob';
import * as path from 'path';
import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import { $ as ush } from '@xec/ush';

import { task, Task } from '../dsl/task.js';
import { Logger } from '../utils/logger.js';
import { recipe, Recipe } from '../dsl/recipe.js';
import { executeRecipe } from '../engine/executor.js';
import { createExecutionContext } from '../context/builder.js';

// Re-export ush $ with enhanced features
export const $ = ush;

// Script metadata
export interface ScriptMetadata {
  name?: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  requirements?: string[];
  exports?: ScriptExports;
}

// Script exports for integration
export interface ScriptExports {
  tasks?: Record<string, Task>;
  recipes?: Record<string, Recipe>;
  commands?: Record<string, CommandDefinition>;
  hooks?: ScriptHooks;
}

// Command definition for dynamic CLI
export interface CommandDefinition {
  name: string;
  description: string;
  usage?: string;
  options?: CommandOption[];
  action: (args: any, options: any) => Promise<void>;
}

export interface CommandOption {
  flags: string;
  description: string;
  defaultValue?: any;
}

// Script hooks for lifecycle events
export interface ScriptHooks {
  beforeLoad?: () => Promise<void>;
  afterLoad?: () => Promise<void>;
  beforeExecute?: () => Promise<void>;
  afterExecute?: () => Promise<void>;
  onError?: (error: Error) => Promise<void>;
}

// Script context
export interface ScriptContext {
  metadata: ScriptMetadata;
  logger: Logger;
  vars: Record<string, any>;
  env: Record<string, string>;
  cwd: string;
  argv: string[];
  runTask: (name: string, vars?: Record<string, any>) => Promise<any>;
  runRecipe: (name: string, vars?: Record<string, any>) => Promise<any>;
}

// Create a script context
export function createScriptContext(options: {
  metadata?: ScriptMetadata;
  vars?: Record<string, any>;
  argv?: string[];
  cwd?: string;
}): ScriptContext {
  const logger = new Logger({ name: options.metadata?.name || 'script' });

  return {
    metadata: options.metadata || {},
    logger,
    vars: options.vars || {},
    env: process.env as Record<string, string>,
    cwd: options.cwd || process.cwd(),
    argv: options.argv || [],
    runTask: async (name: string, vars?: Record<string, any>) => {
      const context = createExecutionContext({
        vars: { ...options.vars, ...vars },
        logger,
      });
      const taskInstance = task(name).handler(async () => {
        throw new Error(`Task ${name} not implemented`);
      }).build();
      return taskInstance.handler(context);
    },
    runRecipe: async (name: string, vars?: Record<string, any>) => {
      const recipeInstance = recipe(name).build();
      return executeRecipe(recipeInstance, {
        vars: { ...options.vars, ...vars },
      });
    },
  };
}

// Script builder for creating script definitions
export class ScriptBuilder {
  private metadata: ScriptMetadata = {};
  private exports: ScriptExports = {};

  name(name: string): this {
    this.metadata.name = name;
    return this;
  }

  description(description: string): this {
    this.metadata.description = description;
    return this;
  }

  version(version: string): this {
    this.metadata.version = version;
    return this;
  }

  author(author: string): this {
    this.metadata.author = author;
    return this;
  }

  tags(...tags: string[]): this {
    this.metadata.tags = tags;
    return this;
  }

  requires(...requirements: string[]): this {
    this.metadata.requirements = requirements;
    return this;
  }

  task(name: string, taskDef: Task): this {
    if (!this.exports.tasks) {
      this.exports.tasks = {};
    }
    this.exports.tasks[name] = taskDef;
    return this;
  }

  recipe(name: string, recipeDef: Recipe): this {
    if (!this.exports.recipes) {
      this.exports.recipes = {};
    }
    this.exports.recipes[name] = recipeDef;
    return this;
  }

  command(def: CommandDefinition): this {
    if (!this.exports.commands) {
      this.exports.commands = {};
    }
    this.exports.commands[def.name] = def;
    return this;
  }

  hooks(hooks: ScriptHooks): this {
    this.exports.hooks = hooks;
    return this;
  }

  build(): { metadata: ScriptMetadata; exports: ScriptExports } {
    return {
      metadata: this.metadata,
      exports: this.exports,
    };
  }
}

// Create a new script definition
export function defineScript(): ScriptBuilder {
  return new ScriptBuilder();
}

// Script utilities
export const utils: Record<string, any> = {
  // File system
  fs,
  path,
  glob,

  // Network
  fetch,

  // System
  os,
  which,

  // Process
  sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  exit: (code: number = 0) => process.exit(code),
  env: (key: string, defaultValue?: string) => process.env[key] || defaultValue,
  setEnv: (key: string, value: string) => { process.env[key] = value; },

  // Logging
  log: {
    info: (msg: string) => console.log(chalk.blue('ℹ'), msg),
    success: (msg: string) => console.log(chalk.green('✓'), msg),
    warning: (msg: string) => console.log(chalk.yellow('⚠'), msg),
    error: (msg: string) => console.log(chalk.red('✗'), msg),
  },

  // Colors
  chalk,

  // Templates
  template: (strings: TemplateStringsArray, ...values: any[]) => strings.reduce((result, str, i) => {
    const value = values[i - 1];
    return result + (value !== undefined ? value : '') + str;
  }),

  // Shell
  quote: (arg: string) => {
    if (!/[\s"'$`\\]/.test(arg)) {
      return arg;
    }
    return "'" + arg.replace(/'/g, "'\"'\"'") + "'";
  },

  // Retry
  retry: async <T>(
    fn: () => Promise<T>,
    options: { retries?: number; delay?: number; backoff?: number } = {}
  ): Promise<T> => {
    const { retries = 3, delay = 1000, backoff = 2 } = options;
    let lastError: Error;

    for (let i = 0; i <= retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < retries) {
          await utils.sleep(delay * Math.pow(backoff, i));
        }
      }
    }

    throw lastError!;
  },

  // Temporary files
  tmpdir: () => os.tmpdir(),
  tmpfile: (prefix: string = 'xec-', suffix: string = '') => {
    const random = Math.random().toString(36).substring(2, 15);
    return path.join(os.tmpdir(), `${prefix}${random}${suffix}`);
  },
};

// Script runner for executing scripts
export class ScriptRunner {
  private context: ScriptContext;

  constructor(context: ScriptContext) {
    this.context = context;
  }

  async runFile(scriptPath: string): Promise<any> {
    const content = await fs.readFile(scriptPath, 'utf-8');
    return this.run(content, scriptPath);
  }

  async run(code: string, filename: string = '<script>'): Promise<any> {
    // Create extended context with script utilities
    const extendedContext = {
      ...this.context,
      $,
      utils,
      task,
      recipe,
      defineScript
    };

    // Create a module wrapper without dynamic imports
    const wrapper = `
(async function(__context) {
  const { $, utils, task, recipe, defineScript, metadata, logger, vars, env, cwd, argv, runTask, runRecipe } = __context;
  
  ${code}
})(__context);
`;

    // Execute the script
    const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
    const fn = new AsyncFunction('__context', wrapper);

    return fn(extendedContext);
  }
}

// Export all utilities
const scriptExports = {
  $,
  defineScript,
  createScriptContext,
  ScriptRunner,
  utils,
  task,
  recipe,
};

export default scriptExports;