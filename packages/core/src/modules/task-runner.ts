import { createModuleLogger } from '../utils/logger.js';
import { XecModule } from '../types/environment-types.js';
import { Task, TaskDefinition } from '../types/task-types.js';
import { EnvironmentManager } from './environment-manager.js';

export interface TaskRunOptions {
  params?: Record<string, any>;
  environment?: string;
  timeout?: number;
  retries?: number;
}

export class TaskRunner {
  private logger = createModuleLogger('task-runner');
  private environmentManager: EnvironmentManager;
  private taskRegistry = new Map<string, Task>();
  private moduleRegistry = new Map<string, XecModule>();

  constructor(environmentManager?: EnvironmentManager) {
    this.environmentManager = environmentManager || new EnvironmentManager();
  }

  registerModule(module: XecModule): void {
    this.moduleRegistry.set(module.name, module);
    
    // Register module tasks from exports (new format) or direct tasks (backward compatibility)
    const tasks = module.exports?.tasks || (module as any).tasks;
    if (tasks) {
      for (const [taskName, task] of Object.entries(tasks)) {
        const fullName = `${module.name}:${taskName}`;
        const fullTask = this.ensureTask(task as Task | TaskDefinition, fullName);
        this.taskRegistry.set(fullName, fullTask);
        // Also register without module prefix for convenience
        if (!this.taskRegistry.has(taskName)) {
          this.taskRegistry.set(taskName, fullTask);
        }
      }
    }

    // Run setup hook if provided
    if (module.setup) {
      this.runSetupHook(module).catch(err => {
        this.logger.error(`Failed to run setup hook for module ${module.name}`, err);
      });
    }
  }

  private ensureTask(task: Task | TaskDefinition, id: string): Task {
    // If it's already a Task with all required properties, return it as-is
    if ('id' in task && 'handler' in task && 'options' in task) {
      return task as Task;
    }
    
    // If it's a test task with 'run' method, return it as-is if it has the shape we expect
    if ('run' in task && 'name' in task && !('handler' in task)) {
      return task as Task;
    }
    
    const taskDef = task as TaskDefinition;
    // Support both 'handler' and 'run' methods
    const handler = taskDef.handler || (taskDef as any).run;
    return {
      id,
      name: taskDef.name,
      description: taskDef.description,
      handler,
      options: taskDef.options || {},
      dependencies: (taskDef as any).dependencies || [],
      tags: (taskDef as any).tags || [],
      metadata: (taskDef as any).metadata || {},
      hints: (taskDef as any).hints // Preserve hints for environment checks
    };
  }

  unregisterModule(moduleName: string): void {
    const module = this.moduleRegistry.get(moduleName);
    if (!module) {
      return;
    }

    // Run teardown hook if provided
    if (module.teardown) {
      this.runTeardownHook(module).catch(err => {
        this.logger.error(`Failed to run teardown hook for module ${moduleName}`, err);
      });
    }

    // Remove module tasks - support both direct tasks and exports.tasks
    const tasks = module.exports?.tasks || (module as any).tasks;
    if (tasks) {
      for (const taskName of Object.keys(tasks)) {
        const fullName = `${moduleName}:${taskName}`;
        this.taskRegistry.delete(fullName);
        // Only remove short name if it belongs to this module
        const shortTask = this.taskRegistry.get(taskName);
        if (shortTask && tasks[taskName] === shortTask) {
          this.taskRegistry.delete(taskName);
        }
      }
    }

    this.moduleRegistry.delete(moduleName);
  }

  listTasks(): Map<string, Task> {
    return this.taskRegistry;
  }

  listModules(): Map<string, XecModule> {
    return this.moduleRegistry;
  }

  async runTask(taskName: string, options: TaskRunOptions = {}): Promise<any> {
    const task = this.taskRegistry.get(taskName);
    if (!task) {
      throw new Error(`Task '${taskName}' not found`);
    }

    // Check environment hints
    const env = await this.environmentManager.detectEnvironment();
    if (task.hints?.unsupportedEnvironments?.includes(env.type)) {
      throw new Error(`Task '${taskName}' is not supported in ${env.type} environment`);
    }

    // Create task context
    const context = await this.environmentManager.createTaskContext(options.params || {});

    // Log task execution
    this.logger.info(`Running task: ${taskName}`, {
      environment: env.type,
      params: options.params,
    });

    try {
      // Execute task with retries - support both 'handler' and 'run' methods
      const executor = task.handler || (task as any).run;
      const result = await this.executeWithRetries(
        () => executor(context),
        options.retries || 0,
        taskName
      );

      this.logger.info(`Task completed: ${taskName}`);
      return result;
    } catch (error) {
      this.logger.error(`Task failed: ${taskName}`, error);
      throw error;
    }
  }

  async runModuleTask(moduleName: string, taskName: string, options: TaskRunOptions = {}): Promise<any> {
    const fullTaskName = `${moduleName}:${taskName}`;
    return this.runTask(fullTaskName, options);
  }

  async getAvailableTasks(): Promise<Array<{ name: string; description?: string; module?: string }>> {
    const tasks: Array<{ name: string; description?: string; module?: string }> = [];
    
    for (const [name, task] of this.taskRegistry.entries()) {
      const [moduleName, taskName] = name.includes(':') ? name.split(':') : [undefined, name];
      tasks.push({
        name,
        description: task.description,
        module: moduleName,
      });
    }

    return tasks;
  }

  async getModuleTasks(moduleName: string): Promise<Task[]> {
    const module = this.moduleRegistry.get(moduleName);
    const tasks = module?.exports?.tasks || (module as any)?.tasks;
    if (!tasks) {
      return [];
    }

    return Object.entries(tasks).map(([taskName, task]) =>
      this.ensureTask(task as Task | TaskDefinition, `${moduleName}:${taskName}`)
    );
  }

  hasTask(taskName: string): boolean {
    return this.taskRegistry.has(taskName);
  }

  getTask(taskName: string): Task | undefined {
    return this.taskRegistry.get(taskName);
  }

  getModule(moduleName: string): XecModule | undefined {
    return this.moduleRegistry.get(moduleName);
  }

  getModules(): XecModule[] {
    return Array.from(this.moduleRegistry.values());
  }

  private async runSetupHook(module: XecModule): Promise<void> {
    if (!module.setup) {
      return;
    }

    const context = await this.environmentManager.createTaskContext();
    await module.setup(context);
  }

  private async runTeardownHook(module: XecModule): Promise<void> {
    if (!module.teardown) {
      return;
    }

    const context = await this.environmentManager.createTaskContext();
    await module.teardown(context);
  }

  private async executeWithRetries(
    fn: () => Promise<any>,
    retries: number,
    taskName: string
  ): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          this.logger.warn(`Task ${taskName} failed, retrying (${attempt + 1}/${retries})...`, error);
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
        }
      }
    }

    throw lastError;
  }

  // Helper method to create a task executor function
  createTaskExecutor(taskName: string): (params?: Record<string, any>) => Promise<any> {
    return async (params?: Record<string, any>) => this.runTask(taskName, { params });
  }

  // Batch task execution
  async runTasks(
    tasks: Array<{ name: string; params?: Record<string, any> }>,
    options: { parallel?: boolean } = {}
  ): Promise<any[]> {
    if (options.parallel) {
      return Promise.all(
        tasks.map(task => this.runTask(task.name, { params: task.params }))
      );
    } else {
      const results: any[] = [];
      for (const task of tasks) {
        results.push(await this.runTask(task.name, { params: task.params }));
      }
      return results;
    }
  }

  async cleanup(): Promise<void> {
    // Run teardown hooks for all modules
    for (const module of this.moduleRegistry.values()) {
      if (module.teardown) {
        try {
          await this.runTeardownHook(module);
        } catch (error) {
          this.logger.error(`Failed to run teardown for module ${module.name}`, error);
        }
      }
    }

    await this.environmentManager.cleanup();
  }
}