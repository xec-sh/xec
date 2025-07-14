/**
 * Script Task Integration
 * 
 * This module provides integration between Xec scripts and the task system,
 * allowing scripts to be used as tasks within recipes.
 */

import * as path from 'path';
import * as fs from 'fs/promises';

import { Task, task, TaskBuilder } from '../dsl/task.js';
import { ScriptRunner, ScriptMetadata, createScriptContext } from './index.js';

export interface ScriptTaskOptions {
  path?: string;
  code?: string;
  metadata?: ScriptMetadata;
  vars?: Record<string, any>;
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Create a task that runs an Xec script
 */
export function scriptTask(name: string, options: ScriptTaskOptions): Task {
  if (!options.path && !options.code) {
    throw new Error('Script task requires either path or code option');
  }

  return task(name)
    .description(options.metadata?.description || `Run script: ${name}`)
    .handler(async (context) => {
      // Create script context
      const scriptContext = createScriptContext({
        metadata: options.metadata || { name },
        vars: { ...context.vars, ...options.vars },
        argv: [],
        cwd: options.cwd || process.cwd(),
      });

      // Override environment if specified
      if (options.env) {
        Object.assign(scriptContext.env, options.env);
      }

      // Add recipe integration
      scriptContext.runTask = async (taskName: string, vars?: Record<string, any>) => {
        // This would need to be implemented to find and run tasks
        throw new Error('runTask not implemented in script context');
      };

      scriptContext.runRecipe = async (recipeName: string, vars?: Record<string, any>) => {
        // This would need to be implemented to find and run recipes
        throw new Error('runRecipe not implemented in script context');
      };

      // Create runner
      const runner = new ScriptRunner(scriptContext);

      // Run script
      let result;
      if (options.path) {
        const scriptPath = path.resolve(options.cwd || process.cwd(), options.path);
        context.logger.info(`Running script: ${scriptPath}`);
        result = await runner.runFile(scriptPath);
      } else if (options.code) {
        context.logger.info(`Running inline script`);
        result = await runner.run(options.code);
      }

      return result;
    })
    .build();
}

/**
 * Create a task builder for script tasks
 */
export class ScriptTaskBuilder extends TaskBuilder {
  private scriptOptions: ScriptTaskOptions = {};
  private _name: string;

  constructor(name: string) {
    super(name);
    this._name = name;
  }

  fromFile(path: string): this {
    this.scriptOptions.path = path;
    return this;
  }

  fromCode(code: string): this {
    this.scriptOptions.code = code;
    return this;
  }

  withVars(vars: Record<string, any>): this {
    this.scriptOptions.vars = vars;
    return this;
  }

  withEnv(env: Record<string, string>): this {
    this.scriptOptions.env = env;
    return this;
  }

  inDirectory(cwd: string): this {
    this.scriptOptions.cwd = cwd;
    return this;
  }

  build(): Task {
    // Set the handler to run the script
    this.handler(async (context) => {
      const scriptTask = scriptTaskModule(this._name, this.scriptOptions);
      return scriptTask.handler(context);
    });

    return super.build();
  }
}

/**
 * Create a script task builder
 */
export function scriptTaskModule(name: string, options?: ScriptTaskOptions): Task {
  if (options) {
    return scriptTask(name, options);
  }

  // Return a builder if no options provided
  const builder = new ScriptTaskBuilder(name);
  return builder as any; // Type hack to allow builder pattern
}

/**
 * Load script tasks from a directory
 */
export async function loadScriptTasks(directory: string): Promise<Record<string, Task>> {
  const tasks: Record<string, Task> = {};

  try {
    const files = await fs.readdir(directory);

    for (const file of files) {
      if (file.endsWith('.xec') || file.endsWith('.js') || file.endsWith('.mjs')) {
        const filePath = path.join(directory, file);
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const taskName = path.basename(file, path.extname(file));
          tasks[taskName] = scriptTask(taskName, { path: filePath });
        }
      }
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
  }

  return tasks;
}

/**
 * Create a task that dynamically loads and runs scripts
 */
export function dynamicScriptTask(name: string): Task {
  return task(name)
    .description('Run a dynamic script')
    .handler(async (context) => {
      const scriptPath = context.vars.script as string;

      if (!scriptPath) {
        throw new Error('No script path provided in vars.script');
      }

      const scriptTaskInstance = scriptTask(name, { path: scriptPath });
      return scriptTaskInstance.handler(context);
    })
    .build();
}