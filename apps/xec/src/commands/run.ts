import { z } from 'zod';
import chalk from 'chalk';
import * as path from 'path';
import { watch } from 'chokidar';
import { Command } from 'commander';
import { Recipe, executeRecipe, createExecutionContext } from '@xec/core';

import { BaseCommand } from '../utils/command-base.js';
import { errorMessages } from '../utils/error-handler.js';
import { validateOptions, validateTimeout, validateVariables } from '../utils/validation.js';

interface RunOptions {
  vars?: string;
  var?: string[];
  file?: string;
  phase?: string;
  hosts?: string;
  tags?: string;
  timeout?: string;
  watch?: boolean;
  parallel?: boolean;
  skipTags?: string;
  limit?: number;
  environment?: string;
  interactive?: boolean;
  continueOnError?: boolean;
  showProgress?: boolean;
}

class RunCommand extends BaseCommand {
  private watcher: any;
  private isWatching = false;
  private lastExecution: Date | null = null;

  constructor() {
    super({
      name: 'run',
      description: 'Run a recipe with advanced execution options',
      arguments: '<recipe>',
      options: [
        {
          flags: '--vars <json>',
          description: 'Variables in JSON format',
        },
        {
          flags: '--var <key=value>',
          description: 'Set variable (can be used multiple times)',
        },
        {
          flags: '-f, --file <path>',
          description: 'Recipe file to load',
        },
        {
          flags: '-p, --phase <phase>',
          description: 'Execute specific phase only',
        },
        {
          flags: '-h, --hosts <pattern>',
          description: 'Target specific hosts (comma-separated or glob pattern)',
        },
        {
          flags: '-t, --tags <tags>',
          description: 'Target hosts with specific tags (comma-separated)',
        },
        {
          flags: '--skip-tags <tags>',
          description: 'Skip hosts with specific tags (comma-separated)',
        },
        {
          flags: '--timeout <duration>',
          description: 'Execution timeout (e.g., 30s, 5m, 1h)',
          defaultValue: '30m',
        },
        {
          flags: '-w, --watch',
          description: 'Watch for file changes and re-run',
        },
        {
          flags: '--parallel',
          description: 'Run tasks in parallel when possible',
        },
        {
          flags: '--limit <number>',
          description: 'Limit number of parallel executions',
        },
        {
          flags: '-e, --environment <env>',
          description: 'Target environment',
        },
        {
          flags: '--interactive',
          description: 'Interactive mode for confirmations',
        },
        {
          flags: '--continue-on-error',
          description: 'Continue execution on task failures',
        },
        {
          flags: '--show-progress',
          description: 'Show detailed progress information',
        },
      ],
      examples: [
        {
          command: 'xec run deploy',
          description: 'Run deploy recipe',
        },
        {
          command: 'xec run deploy --vars \'{"version": "1.2.3"}\'',
          description: 'Run with JSON variables',
        },
        {
          command: 'xec run deploy --var version=1.2.3 --var env=prod',
          description: 'Run with key-value variables',
        },
        {
          command: 'xec run deploy --hosts web*,db* --tags production',
          description: 'Run on specific hosts and tags',
        },
        {
          command: 'xec run deploy --phase deploy --environment production',
          description: 'Run specific phase in production',
        },
        {
          command: 'xec run deploy --watch',
          description: 'Watch for changes and re-run',
        },
        {
          command: 'xec run deploy --parallel --limit 5',
          description: 'Run with parallel execution',
        },
        {
          command: 'xec run deploy --file ./custom/deploy.ts',
          description: 'Run recipe from specific file',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          vars: z.string().optional(),
          var: z.array(z.string()).optional(),
          file: z.string().optional(),
          phase: z.string().optional(),
          hosts: z.string().optional(),
          tags: z.string().optional(),
          skipTags: z.string().optional(),
          timeout: z.string().optional(),
          watch: z.boolean().optional(),
          parallel: z.boolean().optional(),
          limit: z.number().positive().optional(),
          environment: z.string().optional(),
          interactive: z.boolean().optional(),
          continueOnError: z.boolean().optional(),
          showProgress: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  async execute(args: any[]): Promise<void> {
    const [recipeName] = args;
    const options = args[args.length - 1] as RunOptions;

    if (!recipeName) {
      throw errorMessages.configurationInvalid('recipe', 'Recipe name is required');
    }

    // Setup signal handlers for graceful shutdown
    this.setupSignalHandlers();

    // Parse and validate options
    const parsedVars = this.parseVariables(options);
    const timeoutMs = options.timeout ? validateTimeout(options.timeout) : 30 * 60 * 1000;

    this.intro(chalk.bgBlue(' Recipe Execution '));

    if (options.watch) {
      await this.runWithWatch(recipeName, options, parsedVars, timeoutMs);
    } else {
      await this.runOnce(recipeName, options, parsedVars, timeoutMs);
    }

    this.outro(chalk.green('✓ Recipe execution completed'));
  }

  private async runOnce(
    recipeName: string,
    options: RunOptions,
    vars: Record<string, any>,
    timeoutMs: number
  ): Promise<void> {
    const recipe = await this.loadRecipe(recipeName, options.file);
    const context = await this.createContext(options, vars);

    if (this.isDryRun()) {
      this.log('Running in dry-run mode', 'info');
    }

    if (options.showProgress) {
      this.log(`Starting execution with timeout: ${timeoutMs}ms`, 'info');
    }

    const executionOptions = {
      vars,
      dryRun: this.isDryRun(),
      phase: options.phase,
      hosts: options.hosts?.split(','),
      tags: options.tags?.split(','),
      skipTags: options.skipTags?.split(','),
      timeout: timeoutMs,
      parallel: options.parallel,
      limit: options.limit,
      environment: options.environment,
      interactive: options.interactive,
      continueOnError: options.continueOnError,
      showProgress: options.showProgress,
    };

    this.startSpinner(`Executing recipe: ${recipeName}`);

    try {
      const result = await Promise.race([
        executeRecipe(recipe, executionOptions),
        this.createTimeoutPromise(timeoutMs),
      ]);

      this.stopSpinner();
      await this.handleResult(result, recipeName, options);
    } catch (error) {
      this.stopSpinner();
      if (error instanceof Error && error.message === 'EXECUTION_TIMEOUT') {
        throw errorMessages.networkTimeout(`Recipe execution after ${timeoutMs}ms`);
      }
      throw error;
    }
  }

  private async runWithWatch(
    recipeName: string,
    options: RunOptions,
    vars: Record<string, any>,
    timeoutMs: number
  ): Promise<void> {
    this.log('Starting watch mode...', 'info');
    this.isWatching = true;

    // Initial run
    await this.runOnce(recipeName, options, vars, timeoutMs);

    // Setup file watcher
    const watchPaths = [
      './recipes/**/*.{ts,js}',
      './scripts/**/*.{ts,js}',
      './modules/**/*.{ts,js}',
      './src/**/*.{ts,js}',
      './xec.config.yaml',
      './xec.config.yml',
      './xec.config.json',
    ];

    if (options.file) {
      watchPaths.push(options.file);
    }

    this.watcher = watch(watchPaths, {
      ignored: ['node_modules', '.git', 'dist', 'build'],
      ignoreInitial: true,
      persistent: true,
    });

    this.watcher.on('change', async (filePath: string) => {
      if (!this.isWatching) return;

      const now = new Date();
      if (this.lastExecution && now.getTime() - this.lastExecution.getTime() < 1000) {
        return; // Debounce rapid changes
      }

      this.lastExecution = now;
      this.log(`File changed: ${filePath}`, 'info');
      this.log('Re-running recipe...', 'info');

      try {
        await this.runOnce(recipeName, options, vars, timeoutMs);
      } catch (error) {
        this.log(`Watch execution failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      }
    });

    this.watcher.on('error', (error: Error) => {
      this.log(`Watch error: ${error.message}`, 'error');
    });

    this.log('Watching for file changes... (Press Ctrl+C to stop)', 'info');

    // Keep the process alive
    await new Promise((resolve) => {
      process.on('SIGINT', () => {
        this.isWatching = false;
        if (this.watcher) {
          this.watcher.close();
        }
        resolve(undefined);
      });
    });
  }

  private async loadRecipe(recipeName: string, filePath?: string): Promise<Recipe> {
    this.startSpinner(`Loading recipe: ${recipeName}`);

    let recipe: Recipe | undefined;

    if (filePath) {
      // Load from specific file
      const resolvedPath = path.resolve(filePath);
      
      try {
        const module = await import(resolvedPath);
        recipe = module[recipeName] || module.default;
      } catch (error) {
        throw errorMessages.fileNotFound(resolvedPath);
      }

      if (!recipe) {
        throw errorMessages.recipeNotFound(`${recipeName} in ${filePath}`);
      }
    } else {
      // Search in common locations
      const searchPaths = [
        `./recipes/${recipeName}.ts`,
        `./recipes/${recipeName}.js`,
        `./recipes/${recipeName}/index.ts`,
        `./recipes/${recipeName}/index.js`,
        `./${recipeName}.recipe.ts`,
        `./${recipeName}.recipe.js`,
        `./.xec/recipes/${recipeName}.ts`,
        `./.xec/recipes/${recipeName}.js`,
        `./.xec/recipes/${recipeName}/index.ts`,
        `./.xec/recipes/${recipeName}/index.js`,
      ];

      for (const searchPath of searchPaths) {
        try {
          const resolvedPath = path.resolve(searchPath);
          const module = await import(resolvedPath);
          recipe = module[recipeName] || module.default;
          if (recipe) {
            this.log(`Found recipe at: ${searchPath}`, 'success');
            break;
          }
        } catch {
          // Continue searching
        }
      }

      if (!recipe) {
        throw errorMessages.recipeNotFound(recipeName);
      }
    }

    this.stopSpinner(`✓ Recipe loaded: ${recipeName}`);
    return recipe;
  }

  private parseVariables(options: RunOptions): Record<string, any> {
    let vars: Record<string, any> = {};

    // Parse JSON variables
    if (options.vars) {
      vars = validateVariables(options.vars);
    }

    // Parse key-value variables
    if (options.var && options.var.length > 0) {
      for (const varStr of options.var) {
        const [key, ...valueParts] = varStr.split('=');
        if (!key || valueParts.length === 0) {
          throw errorMessages.configurationInvalid('variable', `Invalid format: ${varStr}`);
        }

        const value = valueParts.join('=');
        try {
          vars[key.trim()] = JSON.parse(value);
        } catch {
          vars[key.trim()] = value;
        }
      }
    }

    return vars;
  }

  private async createContext(options: RunOptions, vars: Record<string, any>): Promise<any> {
    const contextOptions = {
      vars,
      dryRun: this.isDryRun(),
      verbose: this.isVerbose(),
      environment: options.environment,
      interactive: options.interactive,
      continueOnError: options.continueOnError,
    };

    return createExecutionContext(contextOptions);
  }

  private async handleResult(result: any, recipeName: string, options: RunOptions): Promise<void> {
    const duration = result.duration || 0;

    if (result.success) {
      this.log(`Recipe '${recipeName}' completed successfully in ${duration}ms`, 'success');

      // Show detailed results
      if (this.isVerbose() && result.taskResults) {
        this.output(result.taskResults, 'Task Results');
      }

      if (options.showProgress && result.phases) {
        this.output(result.phases, 'Phase Results');
      }

      // Show summary
      if (result.summary) {
        this.formatter.keyValue(result.summary, 'Execution Summary');
      }
    } else {
      const error = result.error;
      const errorMessage = error?.message ||
        (result.errors && result.errors.size > 0 
          ? (() => {
              const firstError = Array.from(result.errors.values())[0];
              return (firstError && typeof firstError === 'object' && 'message' in firstError) 
                ? firstError.message 
                : 'Unknown error';
            })()
          : 'Unknown error');

      this.log(`Recipe '${recipeName}' failed: ${errorMessage}`, 'error');

      if (this.isVerbose() && result.errors) {
        this.output(Array.from(result.errors.entries()), 'Error Details');
      }

      throw new Error(errorMessage);
    }
  }

  private createTimeoutPromise(timeoutMs: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error('EXECUTION_TIMEOUT'));
      }, timeoutMs);
    });
  }

  private setupSignalHandlers(): void {
    const cleanup = () => {
      if (this.watcher) {
        this.watcher.close();
      }
      this.isWatching = false;
    };

    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
}

export default function runCommand(program: Command): void {
  const runCmd = new RunCommand();
  program.addCommand(runCmd.create());
}