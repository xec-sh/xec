import {
  log,
  prism,
  select,
  confirm,
  taskLog,
  spinner,
  isCancel,
  multiselect,
  tasks as runKitTasks,
  type Task as KitTask,
} from '@xec-sh/kit';

import { TaskManager } from '../config/task-manager.js';
import { ConfigurationManager } from '../config/configuration-manager.js';


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

    console.log(prism.bold('📋 Available Tasks'));
    console.log();

    const taskList = await this.taskManager.list();

    for (const taskInfo of taskList) {
      const name = prism.cyan(taskInfo.name);
      const desc = taskInfo.description ? prism.dim(` - ${taskInfo.description}`) : '';
      const isPrivate = taskInfo.isPrivate ? prism.yellow(' [private]') : '';

      console.log(`  ${name}${desc}${isPrivate}`);

      if (options.verbose) {
        if (taskInfo.hasCommand) {
          console.log(prism.gray(`    Type: Command`));
        } else if (taskInfo.hasSteps) {
          console.log(prism.gray(`    Type: Multi-step task`));
        } else if (taskInfo.hasScript) {
          console.log(prism.gray(`    Type: Script`));
        }

        if (taskInfo.target || taskInfo.targets) {
          const targets = taskInfo.targets || [taskInfo.target!];
          console.log(prism.gray(`    Targets: ${targets.join(', ')}`));
        }
      }
    }
  }

  /**
   * Run specific tasks using Kit's task runner
   */
  private async runTasks(taskNames: string[], options: TasksCommandOptions): Promise<void> {
    const config = this.configManager.getConfig();

    if (!config.tasks) {
      log.error('No tasks configured');
      return;
    }

    // Validate task names
    const invalidTasks: string[] = [];
    for (const name of taskNames) {
      if (!(await this.taskManager.exists(name))) {
        invalidTasks.push(name);
      }
    }

    if (invalidTasks.length > 0) {
      log.error(`Unknown tasks: ${invalidTasks.join(', ')}`);
      return;
    }

    // Build task list with dependencies
    const tasksToRun = await this.buildTaskList(taskNames);

    if (options.visualization === 'tree' || options.visualization === 'graph') {
      await this.runWithVisualization(tasksToRun, options);
    } else {
      await this.runWithKitRunner(tasksToRun, options);
    }
  }

  /**
   * Build task list resolving dependencies
   */
  private async buildTaskList(taskNames: string[]): Promise<KitTask[]> {
    const tasks: KitTask[] = [];
    const visited = new Set<string>();

    for (const name of taskNames) {
      await this.buildTaskTree(name, tasks, visited);
    }

    return tasks;
  }

  /**
   * Build task dependency tree recursively
   */
  private async buildTaskTree(
    taskName: string,
    result: KitTask[],
    visited: Set<string>
  ): Promise<void> {
    if (visited.has(taskName)) {
      return; // Already processed or circular dependency
    }

    visited.add(taskName);

    const taskDef = await this.taskManager.get(taskName);
    if (!taskDef) return;

    // Process task steps that might reference other tasks
    if (taskDef.steps) {
      for (const step of taskDef.steps) {
        if (step.task) {
          // This step references another task, process it as a dependency
          await this.buildTaskTree(step.task, result, visited);
        }
      }
    }

    // Create Kit task
    const kitTask: KitTask = {
      title: taskDef.description || taskName,
      task: async (message) => {
        try {
          const taskResult = await this.taskManager.run(taskName);
          return taskResult.success ? '✓ Completed' : `✗ Failed: ${taskResult.error}`;
        } catch (error) {
          throw new Error(error instanceof Error ? error.message : String(error));
        }
      },
      enabled: true,
    };

    result.push(kitTask);
  }

  /**
   * Run tasks using Kit's built-in task runner
   */
  private async runWithKitRunner(tasks: KitTask[], options: TasksCommandOptions): Promise<void> {
    if (options.parallel) {
      // Run tasks in parallel
      await Promise.all(
        tasks.map(task =>
          runKitTasks([task], { output: process.stdout })
        )
      );
    } else {
      // Run tasks sequentially using Kit's tasks function
      await runKitTasks(tasks, { output: process.stdout });
    }
  }

  /**
   * Run tasks with visualization using taskLog
   */
  private async runWithVisualization(
    tasks: KitTask[],
    options: TasksCommandOptions
  ): Promise<void> {
    const logger = taskLog({
      title: '🚀 Running Tasks',
      spacing: 1,
      retainLog: options.verbose,
    });

    let completedCount = 0;
    const totalCount = tasks.length;

    try {
      for (const task of tasks) {
        // Create a group for each task
        const taskGroup = logger.group(task.title);

        try {
          // Run the task
          const s = spinner({ output: process.stdout });
          s.start(task.title);

          const result = await task.task((msg: string) => {
            taskGroup.message(msg);
          });

          s.stop(result || task.title);

          completedCount++;
          taskGroup.success(`✓ ${task.title}`);

          if (totalCount > 1) {
            logger.message(prism.gray(`Progress: ${completedCount}/${totalCount} tasks completed`));
          }
        } catch (error) {
          taskGroup.error(`✗ ${task.title}: ${error}`);

          if (!options.parallel) {
            throw error;
          }
        }
      }

      logger.success(`✅ All tasks completed successfully (${completedCount}/${totalCount})`);
    } catch (error) {
      logger.error(`❌ Task execution failed: ${error}`, { showLog: true });
      throw error;
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

    // Get all available tasks
    const taskList = await this.taskManager.list();

    if (taskList.length === 0) {
      log.warning('No tasks available');
      return;
    }

    // Show task selection
    const selectedNames = await multiselect({
      message: 'Select tasks to run:',
      options: taskList.map(taskInfo => ({
        value: taskInfo.name,
        label: taskInfo.description || taskInfo.name,
        hint: taskInfo.isPrivate ? prism.yellow('private') : undefined,
      })),
    });

    if (isCancel(selectedNames) || selectedNames.length === 0) {
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
        { value: 'tree', label: '🌳 Tree - Show task execution with progress' },
        { value: 'list', label: '📋 List - Simple list view' },
        { value: 'none', label: '⚡ None - Minimal output' },
      ],
      initialValue: 'tree',
    });

    if (isCancel(visualization)) return;

    // Run selected tasks
    await this.runTasks(selectedNames, {
      ...options,
      parallel,
      visualization: visualization as 'tree' | 'graph' | 'list',
    });
  }
}

/**
 * Main entry point for tasks command
 */
export async function runTasksCommand(options: TasksCommandOptions): Promise<void> {
  const command = new TasksCommand();

  try {
    await command.execute(options);
  } catch (error) {
    log.error(`Task execution failed: ${error}`);
    process.exit(1);
  }
}