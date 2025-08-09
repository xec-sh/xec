// Task runner component for executing and visualizing task dependencies

export interface TaskRunnerTask {
  id: string;
  title: string;
  dependencies?: string[];
  run: (context: any) => Promise<any>;
}

export interface TaskRunnerOptions {
  tasks: TaskRunnerTask[];
  visualization?: 'tree' | 'graph' | 'list';
  parallel?: boolean;
  onTaskStart?: (task: TaskRunnerTask) => void;
  onTaskComplete?: (task: TaskRunnerTask, result: any) => void;
  onProgress?: (completed: number, total: number) => void;
}

export interface TaskRunnerResult {
  run: () => Promise<Map<string, any>>;
  tasks: TaskRunnerTask[];
}

export class TaskRunner {
  private completed = new Map<string, any>();
  private running = new Set<string>();
  private failed = new Set<string>();
  
  constructor(private options: TaskRunnerOptions) {}
  
  async run(): Promise<Map<string, any>> {
    const { tasks, parallel = false, onTaskStart, onTaskComplete, onProgress } = this.options;
    const totalTasks = tasks.length;
    let completedCount = 0;
    
    // Build dependency graph
    const graph = this.buildDependencyGraph(tasks);
    
    // Execute tasks
    if (parallel) {
      await this.runParallel(graph, async (task) => {
        if (onTaskStart) onTaskStart(task);
        
        try {
          const result = await task.run({});
          this.completed.set(task.id, result);
          completedCount++;
          
          if (onTaskComplete) onTaskComplete(task, result);
          if (onProgress) onProgress(completedCount, totalTasks);
          
          return result;
        } catch (error) {
          this.failed.add(task.id);
          const errorResult = { success: false, error: error instanceof Error ? error.message : String(error) };
          
          if (onTaskComplete) onTaskComplete(task, errorResult);
          if (onProgress) onProgress(completedCount, totalTasks);
          
          throw error;
        }
      });
    } else {
      await this.runSequential(tasks, async (task) => {
        if (onTaskStart) onTaskStart(task);
        
        try {
          const result = await task.run({});
          this.completed.set(task.id, result);
          completedCount++;
          
          if (onTaskComplete) onTaskComplete(task, result);
          if (onProgress) onProgress(completedCount, totalTasks);
          
          return result;
        } catch (error) {
          this.failed.add(task.id);
          const errorResult = { success: false, error: error instanceof Error ? error.message : String(error) };
          
          if (onTaskComplete) onTaskComplete(task, errorResult);
          if (onProgress) onProgress(completedCount, totalTasks);
          
          throw error;
        }
      });
    }
    
    return this.completed;
  }
  
  private buildDependencyGraph(tasks: TaskRunnerTask[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();
    
    for (const task of tasks) {
      if (!graph.has(task.id)) {
        graph.set(task.id, new Set());
      }
      
      if (task.dependencies) {
        for (const dep of task.dependencies) {
          graph.get(task.id)!.add(dep);
        }
      }
    }
    
    return graph;
  }
  
  private async runSequential(
    tasks: TaskRunnerTask[],
    executor: (task: TaskRunnerTask) => Promise<any>
  ): Promise<void> {
    for (const task of tasks) {
      await this.waitForDependencies(task);
      await executor(task);
    }
  }
  
  private async runParallel(
    graph: Map<string, Set<string>>,
    executor: (task: TaskRunnerTask) => Promise<any>
  ): Promise<void> {
    const tasks = Array.from(graph.keys()).map(id => 
      this.options.tasks.find(t => t.id === id)!
    );
    
    const promises = tasks.map(async (task) => {
      await this.waitForDependencies(task);
      return executor(task);
    });
    
    await Promise.all(promises);
  }
  
  private async waitForDependencies(task: TaskRunnerTask): Promise<void> {
    if (!task.dependencies) return;
    
    for (const dep of task.dependencies) {
      // Wait for dependency to complete
      while (!this.completed.has(dep) && !this.failed.has(dep)) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      // If dependency failed, throw error
      if (this.failed.has(dep)) {
        throw new Error(`Dependency '${dep}' failed for task '${task.id}'`);
      }
    }
  }
}

/**
 * Create and run a task runner
 */
export async function taskRunner(options: TaskRunnerOptions): Promise<TaskRunnerResult> {
  const runner = new TaskRunner(options);
  
  return {
    run: () => runner.run(),
    tasks: options.tasks
  };
}