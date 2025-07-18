import { glob } from 'glob';
import * as path from 'path';
import * as fs from 'fs/promises';
import { TaskRegistry, ModuleRegistry, PatternRegistry } from '@xec-js/core';

import { BaseCommand } from '../../utils/command-base.js';

interface ListOptions {
  recipes?: boolean;
  tasks?: boolean;
  modules?: boolean;
  patterns?: boolean;
  helpers?: boolean;
  detailed?: boolean;
  format?: 'table' | 'json' | 'yaml';
  filter?: string;
}

export class ListCommand extends BaseCommand {
  private moduleRegistry: ModuleRegistry;
  private taskRegistry: TaskRegistry;
  private patternRegistry: PatternRegistry;

  constructor() {
    super({
      name: 'list',
      description: 'List project components',
      options: [
        {
          flags: '--recipes',
          description: 'List recipes',
        },
        {
          flags: '--tasks',
          description: 'List tasks',
        },
        {
          flags: '--modules',
          description: 'List modules',
        },
        {
          flags: '--patterns',
          description: 'List patterns',
        },
        {
          flags: '--helpers',
          description: 'List helpers',
        },
        {
          flags: '--detailed',
          description: 'Show detailed information',
        },
        {
          flags: '--format <format>',
          description: 'Output format (table|json|yaml)',
          defaultValue: 'table',
        },
        {
          flags: '--filter <pattern>',
          description: 'Filter results by pattern',
        },
      ],
      examples: [
        {
          command: 'xec dev list',
          description: 'List all components',
        },
        {
          command: 'xec dev list --recipes',
          description: 'List only recipes',
        },
        {
          command: 'xec dev list --tasks --filter "deploy*"',
          description: 'List deploy tasks',
        },
      ],
    });

    this.moduleRegistry = new ModuleRegistry();
    this.taskRegistry = new TaskRegistry();
    this.patternRegistry = new PatternRegistry();
  }

  async execute(args: any[]): Promise<void> {
    const options = args[args.length - 1] as ListOptions;

    this.intro('Project Components');

    const showAll = !options.recipes && !options.tasks && !options.modules && !options.patterns && !options.helpers;

    if (showAll || options.recipes) {
      await this.listRecipes(options);
    }

    if (showAll || options.tasks) {
      await this.listTasks(options);
    }

    if (showAll || options.modules) {
      await this.listModules(options);
    }

    if (showAll || options.patterns) {
      await this.listPatterns(options);
    }

    if (showAll || options.helpers) {
      await this.listHelpers(options);
    }

    this.outro('Component listing completed');
  }

  private async listRecipes(options: ListOptions): Promise<void> {
    const recipes = await this.findRecipes();
    let filteredRecipes = recipes;

    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      filteredRecipes = recipes.filter(recipe => pattern.test(recipe.name));
    }

    if (options.format === 'table') {
      const tableData = {
        columns: [
          { header: 'Name', width: 25 },
          { header: 'Description', width: 40 },
          { header: 'Version', width: 10 },
          { header: 'Tasks', width: 10 },
          { header: 'File', width: 35 },
        ],
        rows: filteredRecipes.map(recipe => [
          recipe.name,
          recipe.description || 'No description',
          recipe.version || '1.0.0',
          recipe.taskCount?.toString() || '0',
          recipe.file,
        ]),
      };

      this.formatter.table(tableData);
    } else {
      this.output(filteredRecipes, 'Recipes');
    }

    this.log(`Found ${filteredRecipes.length} recipe(s)`, 'info');
  }

  private async listTasks(options: ListOptions): Promise<void> {
    const tasksMap = this.taskRegistry.getAll();
    const tasks = Array.from(tasksMap.values());
    let filteredTasks = tasks;

    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      filteredTasks = tasks.filter((task: any) => pattern.test(task.name));
    }

    if (options.format === 'table') {
      const tableData = {
        columns: [
          { header: 'Name', width: 25 },
          { header: 'Description', width: 40 },
          { header: 'Module', width: 20 },
          { header: 'Type', width: 15 },
          { header: 'Tags', width: 20 },
        ],
        rows: filteredTasks.map((task: any) => [
          task.name,
          task.description || 'No description',
          task.module || 'core',
          task.type || 'generic',
          (task.tags || []).join(', '),
        ]),
      };

      this.formatter.table(tableData);
    } else {
      this.output(filteredTasks, 'Tasks');
    }

    this.log(`Found ${filteredTasks.length} task(s)`, 'info');
  }

  private async listModules(options: ListOptions): Promise<void> {
    const modules = this.moduleRegistry.getAll();
    let filteredModules = modules;

    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      filteredModules = modules.filter((module: any) => pattern.test(module.name));
    }

    if (options.format === 'table') {
      const tableData = {
        columns: [
          { header: 'Name', width: 20 },
          { header: 'Description', width: 35 },
          { header: 'Version', width: 10 },
          { header: 'Status', width: 15 },
          { header: 'Tasks', width: 10 },
          { header: 'Path', width: 30 },
        ],
        rows: filteredModules.map((module: any) => [
          module.name,
          module.description || 'No description',
          module.version || '1.0.0',
          module.status || 'loaded',
          module.tasks?.length?.toString() || '0',
          module.path || 'built-in',
        ]),
      };

      this.formatter.table(tableData);
    } else {
      this.output(filteredModules, 'Modules');
    }

    this.log(`Found ${filteredModules.length} module(s)`, 'info');
  }

  private async listPatterns(options: ListOptions): Promise<void> {
    const patternsMap = this.patternRegistry.getAll();
    const patterns = Array.from(patternsMap.values());
    let filteredPatterns = patterns;

    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      filteredPatterns = patterns.filter((p: any) => pattern.test(p.name));
    }

    if (options.format === 'table') {
      const tableData = {
        columns: [
          { header: 'Name', width: 25 },
          { header: 'Description', width: 40 },
          { header: 'Category', width: 15 },
          { header: 'Type', width: 15 },
          { header: 'Parameters', width: 15 },
        ],
        rows: filteredPatterns.map((pattern: any) => [
          pattern.name,
          pattern.description || 'No description',
          pattern.category || 'general',
          pattern.type || 'generic',
          pattern.parameters?.length?.toString() || '0',
        ]),
      };

      this.formatter.table(tableData);
    } else {
      this.output(filteredPatterns, 'Patterns');
    }

    this.log(`Found ${filteredPatterns.length} pattern(s)`, 'info');
  }

  private async listHelpers(options: ListOptions): Promise<void> {
    const helpers = await this.findHelpers();
    let filteredHelpers = helpers;

    if (options.filter) {
      const pattern = new RegExp(options.filter, 'i');
      filteredHelpers = helpers.filter(helper => pattern.test(helper.name));
    }

    if (options.format === 'table') {
      const tableData = {
        columns: [
          { header: 'Name', width: 25 },
          { header: 'Description', width: 40 },
          { header: 'Type', width: 15 },
          { header: 'Module', width: 20 },
          { header: 'Usage', width: 20 },
        ],
        rows: filteredHelpers.map(helper => [
          helper.name,
          helper.description || 'No description',
          helper.type || 'function',
          helper.module || 'core',
          helper.usage || 'Helper function',
        ]),
      };

      this.formatter.table(tableData);
    } else {
      this.output(filteredHelpers, 'Helpers');
    }

    this.log(`Found ${filteredHelpers.length} helper(s)`, 'info');
  }

  private async findRecipes(): Promise<any[]> {
    const recipes: any[] = [];

    const searchPaths = [
      './recipes/**/*.{ts,js}',
      './recipes/**/*.{yaml,yml}',
      './.xec/recipes/**/*.{ts,js}',
      './.xec/recipes/**/*.{yaml,yml}',
      './*.recipe.{ts,js}',
      './*.recipe.{yaml,yml}',
    ];

    for (const searchPath of searchPaths) {
      try {
        const files = await glob(searchPath);

        for (const file of files) {
          try {
            const recipe = await this.loadRecipe(file);
            if (recipe) {
              recipes.push({
                name: recipe.name || path.basename(file, path.extname(file)),
                description: recipe.description,
                version: recipe.version,
                taskCount: recipe.tasks?.length || 0,
                file,
                ...recipe,
              });
            }
          } catch (error) {
            // Skip invalid recipe files
          }
        }
      } catch (error) {
        // Skip search paths that don't exist
      }
    }

    return recipes;
  }

  private async findHelpers(): Promise<any[]> {
    const helpers: any[] = [];

    // Get helpers from modules
    const modules = this.moduleRegistry.getAll();
    for (const module of modules) {
      if ((module as any).helpers) {
        for (const helper of (module as any).helpers) {
          helpers.push({
            name: helper.name,
            description: helper.description,
            type: helper.type,
            module: module.name,
            usage: helper.usage,
          });
        }
      }
    }

    // Get built-in helpers
    const builtinHelpers = [
      { name: 'log', description: 'Log message', type: 'function', module: 'core', usage: 'log(message)' },
      { name: 'warn', description: 'Log warning', type: 'function', module: 'core', usage: 'warn(message)' },
      { name: 'error', description: 'Log error', type: 'function', module: 'core', usage: 'error(message)' },
      { name: 'info', description: 'Log info', type: 'function', module: 'core', usage: 'info(message)' },
      { name: 'debug', description: 'Log debug', type: 'function', module: 'core', usage: 'debug(message)' },
      { name: 'getVar', description: 'Get variable', type: 'function', module: 'core', usage: 'getVar(name)' },
      { name: 'setVar', description: 'Set variable', type: 'function', module: 'core', usage: 'setVar(name, value)' },
      { name: 'getHost', description: 'Get host info', type: 'function', module: 'core', usage: 'getHost()' },
      { name: 'getTags', description: 'Get host tags', type: 'function', module: 'core', usage: 'getTags()' },
      { name: 'template', description: 'Render template', type: 'function', module: 'core', usage: 'template(text, vars)' },
    ];

    helpers.push(...builtinHelpers);

    return helpers;
  }

  private async loadRecipe(file: string): Promise<any> {
    const ext = path.extname(file).toLowerCase();

    if (ext === '.js' || ext === '.ts') {
      // Load JavaScript/TypeScript recipe
      const module = await import(path.resolve(file));
      return module.default || module;
    } else if (ext === '.yaml' || ext === '.yml') {
      // Load YAML recipe
      const content = await fs.readFile(file, 'utf8');
      const yaml = await import('js-yaml');
      return yaml.load(content);
    }

    return null;
  }
}
