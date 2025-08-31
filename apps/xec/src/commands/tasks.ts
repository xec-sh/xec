/**
 * Tasks command with advanced task runner interface
 * Uses @xec-sh/kit's task runner for dependency visualization and execution
 */

import chalk from 'chalk';
import { log, multiselect, isCancel, confirm, select } from '@xec-sh/kit';

import { getFeatures } from '../config/features.js';
import { TaskManager } from '../config/task-manager.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
// Type imports from @xec-sh/kit
type TaskRunnerTask = any; // TODO: Fix type import from @xec-sh/kit
type TaskRunnerOptions = any; // TODO: Fix type import from @xec-sh/kit

export interface TasksCommandOptions {
  list?: boolean;
  run?: string | string[];
  parallel?: boolean;
  visualization?: 'tree' | 'graph' | 'list';
  watch?: boolean;
  verbose?: boolean;
}

export class TasksCommand {
  private configManager: ConfigurationManager;
  private taskManager: TaskManager;
  
  constructor() {
    this.configManager = new ConfigurationManager();
    this.taskManager = new TaskManager({ configManager: this.configManager });
  }
  
  async execute(options: TasksCommandOptions = {}): Promise<void> {
    // Load configuration
    await this.configManager.load();
    
    if (options.list) {
      await this.listTasks(options);
      return;
    }
    
    if (options.run) {
      const taskNames = Array.isArray(options.run) ? options.run : [options.run];
      await this.runTasks(taskNames, options);
      return;
    }
    
    // Interactive task selection
    await this.interactiveTaskRunner(options);
  }
  
  /**
   * List all available tasks
   */
  private async listTasks(options: TasksCommandOptions = {}): Promise<void> {
    const config = this.configManager.getConfig();
    
    if (!config.tasks || Object.keys(config.tasks).length === 0) {
      log.warning('No tasks configured in xec.yaml');
      return;
    }
    
    console.log(chalk.bold('📋 Available Tasks'));
    
    for (const [name, task] of Object.entries(config.tasks)) {
      // Handle both string and TaskDefinition types
      if (typeof task === 'string') {
        log.info(`  ${chalk.cyan(name)} - ${chalk.gray(task)}`);
      } else {
        const desc = task.description ? chalk.dim(` - ${task.description}`) : '';
        
        log.info(`  ${chalk.cyan(name)}${desc}`);
        
        if (options.verbose && task.command) {
          log.info(chalk.gray(`    Command: ${task.command}`));
        }
      }
    }
  }
  
  /**
   * Run specific tasks
   */
  private async runTasks(taskNames: string[], options: TasksCommandOptions): Promise<void> {
    const config = this.configManager.getConfig();
    
    if (!config.tasks) {
      log.error('No tasks configured');
      return;
    }
    
    // Validate task names
    const invalidTasks = taskNames.filter(name => !config.tasks![name]);
    if (invalidTasks.length > 0) {
      log.error(`Unknown tasks: ${invalidTasks.join(', ')}`);
      return;
    }
    
    // Convert to task runner format
    const tasks: TaskRunnerTask[] = [];
    const taskMap = new Map<string, TaskRunnerTask>();
    
    // Build task list with dependencies
    for (const name of taskNames) {
      await this.buildTaskTree(name, config.tasks, tasks, taskMap, new Set());
    }
    
    // Use kit task runner if enabled
    if (getFeatures().useKitTaskRunner) {
      await this.runWithKitTaskRunner(tasks, options);
    } else {
      // Fallback to simple execution
      await this.runTasksSimple(tasks, options);
    }
  }
  
  /**
   * Build task dependency tree
   */
  private async buildTaskTree(
    taskName: string,
    tasks: Record<string, any>,
    result: TaskRunnerTask[],
    taskMap: Map<string, TaskRunnerTask>,
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(taskName)) {
      return; // Already processed or circular dependency
    }
    
    visited.add(taskName);
    
    const taskConfig = tasks[taskName];
    if (!taskConfig) return;
    
    // Process dependencies first
    if (taskConfig.deps) {
      for (const dep of taskConfig.deps) {
        await this.buildTaskTree(dep, tasks, result, taskMap, visited);
      }
    }
    
    // Create task runner task
    if (!taskMap.has(taskName)) {
      const taskDef = typeof taskConfig === 'string' ? { command: taskConfig } : taskConfig;
      const task: TaskRunnerTask = {
        id: taskName,
        title: taskDef.description || taskName,
        dependencies: [],
        run: async (context) => await this.taskManager.run(taskName)
      };
      
      taskMap.set(taskName, task);
      result.push(task);
    }
  }
  
  /**
   * Run tasks with @xec-sh/kit task runner
   */
  private async runWithKitTaskRunner(
    tasks: TaskRunnerTask[],
    options: TasksCommandOptions
  ): Promise<void> {
    const runnerOptions: TaskRunnerOptions = {
      tasks,
      visualization: options.visualization || 'tree',
      parallel: options.parallel || false,
      onTaskStart: (task) => {
        log.info(chalk.blue(`▶ Starting: ${task.title}`));
      },
      onTaskComplete: (task, result) => {
        if (result.success !== false) {
          log.success(chalk.green(`✓ ${task.title}`));
        } else {
          log.error(chalk.red(`✗ ${task.title}: ${result.error || 'Failed'}`));
        }
      },
      onProgress: (completed, total) => {
        if (total > 1) {
          log.info(chalk.gray(`Progress: ${completed}/${total} tasks completed`));
        }
      }
    };
    
    // Fallback: use simple task runner since kit.taskRunner is not available
    await this.runTasksSimple(tasks, options);
  }
  
  /**
   * Simple task execution without kit runner
   */
  private async runTasksSimple(
    tasks: TaskRunnerTask[],
    options: TasksCommandOptions
  ): Promise<void> {
    console.log(chalk.bold('🚀 Running Tasks'));
    
    for (const task of tasks) {
      log.info(`Running: ${task.title}`);
      
      try {
        const result = await task.run({});
        
        if (result.success !== false) {
          log.success(`✓ ${task.title}`);
        } else {
          log.error(`✗ ${task.title}: ${result.error || 'Failed'}`);
          if (!options.parallel) {
            throw new Error(`Task ${task.id} failed`);
          }
        }
      } catch (error) {
        log.error(`✗ ${task.title}: ${error}`);
        if (!options.parallel) {
          throw error;
        }
      }
    }
  }
  
  /**
   * Interactive task runner with visualization
   */
  private async interactiveTaskRunner(options: TasksCommandOptions): Promise<void> {
    const config = this.configManager.getConfig();
    
    if (!config.tasks || Object.keys(config.tasks).length === 0) {
      log.warning('No tasks configured. Add tasks to your xec.yaml file.');
      return;
    }
    
    // Convert all tasks to runner format
    const tasks: TaskRunnerTask[] = [];
    const taskMap = new Map<string, TaskRunnerTask>();
    
    for (const [name, taskConfig] of Object.entries(config.tasks)) {
      const taskDef = typeof taskConfig === 'string' ? { command: taskConfig } : taskConfig;
      const task: TaskRunnerTask = {
        id: name,
        title: taskDef.description || name,
        dependencies: [],
        run: async (context) => await this.taskManager.run(name)
      };
      
      tasks.push(task);
      taskMap.set(name, task);
    }
    
    // Show task selection
    const selectedTasks = await multiselect({
      message: 'Select tasks to run:',
      options: tasks.map(t => ({
        value: t,
        label: t.title,
        hint: t.dependencies && t.dependencies.length > 0 
          ? chalk.gray(`deps: ${t.dependencies.join(', ')}`)
          : undefined
      })),
    });
    
    if (isCancel(selectedTasks) || selectedTasks.length === 0) {
      log.info('No tasks selected');
      return;
    }
    
    // Ask for execution options
    const parallel = await confirm({
      message: 'Run tasks in parallel where possible?',
      initialValue: false,
    });
    
    if (isCancel(parallel)) return;
    
    const visualization = await select({
      message: 'Choose visualization style:',
      options: [
        { value: 'tree', label: '🌳 Tree - Show dependency tree' },
        { value: 'graph', label: '📊 Graph - Show dependency graph' },
        { value: 'list', label: '📋 List - Simple list view' },
      ],
      initialValue: 'tree',
    });
    
    if (isCancel(visualization)) return;
    
    // Run selected tasks
    await this.runWithKitTaskRunner(selectedTasks, {
      ...options,
      parallel,
      visualization: visualization as 'tree' | 'graph' | 'list',
    });
  }
  
  /**
   * Get runtime for task command
   */
  private detectRuntime(command: string): string {
    if (command.endsWith('.ts') || command.endsWith('.tsx')) {
      return 'tsx';
    }
    if (command.endsWith('.js') || command.endsWith('.mjs')) {
      return 'node';
    }
    return 'shell';
  }
}

/**
 * Main entry point for tasks command
 */
export async function runTasksCommand(options: TasksCommandOptions): Promise<void> {
  const command = new TasksCommand();
  await command.execute(options);
}