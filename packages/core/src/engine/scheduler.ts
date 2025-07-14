import { DependencyError } from '../core/errors.js';

import type { Task, Recipe } from '../core/types.js';

export interface ScheduledTask {
  task: Task;
  phase: number;
  dependencies: string[];
  dependents: string[];
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed' | 'skipped';
}

export interface ExecutionPhase {
  phase: number;
  tasks: ScheduledTask[];
  parallel: boolean;
  continueOnError?: boolean;
}

export interface SchedulerOptions {
  respectPhases?: boolean;
  maxParallel?: number;
  continueOnError?: boolean;
}

export class TaskScheduler {
  private tasks: Map<string, ScheduledTask> = new Map();
  private completed: Set<string> = new Set();
  private failed: Set<string> = new Set();
  private skipped: Set<string> = new Set();
  private running: Set<string> = new Set();

  constructor(
    private recipe: Recipe,
    private options: SchedulerOptions = {}
  ) {
    this.initializeTasks();
  }

  private initializeTasks(): void {
    for (const task of this.recipe.tasks.values()) {
      const scheduled: ScheduledTask = {
        task,
        phase: 0,
        dependencies: [...(task.dependencies || [])],
        dependents: [],
        status: 'pending'
      };
      this.tasks.set(task.id, scheduled);
    }

    for (const [taskId, scheduled] of this.tasks) {
      for (const depId of scheduled.dependencies) {
        const dependency = this.tasks.get(depId);
        if (!dependency) {
          throw new DependencyError(
            `Task ${taskId} depends on non-existent task ${depId}`,
            taskId,
            [depId]
          );
        }
        dependency.dependents.push(taskId);
      }
    }
  }

  getPhases(): ExecutionPhase[] {
    if (this.options.respectPhases) {
      return this.buildPhasesByDeclaration();
    }
    return this.buildPhasesByDependencies();
  }

  private buildPhasesByDeclaration(): ExecutionPhase[] {
    const phaseMap = new Map<string, ScheduledTask[]>();
    
    for (const scheduled of this.tasks.values()) {
      const phase = scheduled.task.metadata?.phase || 'default';
      if (!phaseMap.has(phase)) {
        phaseMap.set(phase, []);
      }
      phaseMap.get(phase)!.push(scheduled);
    }

    const phases: ExecutionPhase[] = [];
    let phaseNumber = 0;

    const phaseOrder = this.getPhaseOrder();
    for (const phaseName of phaseOrder) {
      const tasks = phaseMap.get(phaseName) || [];
      if (tasks.length > 0) {
        // Set phase number on tasks
        for (const scheduled of tasks) {
          if (!scheduled.task.metadata) scheduled.task.metadata = {};
          scheduled.task.metadata.phase = phaseNumber;
        }
        phases.push({
          phase: phaseNumber++,
          tasks,
          parallel: true
        });
      }
    }

    return phases;
  }

  private getPhaseOrder(): string[] {
    const phases = new Set<string>();
    const phaseDepends = new Map<string, Set<string>>();

    for (const scheduled of this.tasks.values()) {
      const phase = scheduled.task.metadata?.phase || 'default';
      phases.add(phase);
      
      if (!phaseDepends.has(phase)) {
        phaseDepends.set(phase, new Set());
      }

      for (const depId of scheduled.dependencies) {
        const depTask = this.tasks.get(depId);
        if (depTask) {
          const depPhase = depTask.task.metadata?.phase || 'default';
          if (depPhase !== phase) {
            phaseDepends.get(phase)!.add(depPhase);
          }
        }
      }
    }

    const ordered: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (phase: string): void => {
      if (visiting.has(phase)) {
        throw new DependencyError(
          `Circular phase dependency detected involving ${phase}`,
          phase,
          []
        );
      }
      if (visited.has(phase)) return;

      visiting.add(phase);
      const deps = phaseDepends.get(phase) || new Set();
      for (const dep of deps) {
        visit(dep);
      }
      visiting.delete(phase);
      visited.add(phase);
      ordered.push(phase);
    };

    for (const phase of phases) {
      visit(phase);
    }

    return ordered;
  }

  private buildPhasesByDependencies(): ExecutionPhase[] {
    const phases: ExecutionPhase[] = [];
    const assigned = new Set<string>();
    let currentPhase = 0;

    while (assigned.size < this.tasks.size) {
      const phaseTasks: ScheduledTask[] = [];

      for (const [taskId, scheduled] of this.tasks) {
        if (assigned.has(taskId)) continue;

        const allDepsAssigned = scheduled.dependencies.every(dep => 
          assigned.has(dep)
        );

        if (allDepsAssigned) {
          scheduled.phase = currentPhase;
          phaseTasks.push(scheduled);
        }
      }

      if (phaseTasks.length === 0) {
        const remaining = Array.from(this.tasks.keys()).filter(id => !assigned.has(id));
        throw new DependencyError(
          'Circular dependency detected or unresolvable dependencies',
          remaining[0],
          remaining
        );
      }

      phases.push({
        phase: currentPhase,
        tasks: phaseTasks,
        parallel: true
      });

      for (const task of phaseTasks) {
        assigned.add(task.task.id);
      }

      currentPhase++;
    }

    return phases;
  }

  getReadyTasks(): ScheduledTask[] {
    const ready: ScheduledTask[] = [];

    for (const scheduled of this.tasks.values()) {
      if (scheduled.status === 'pending' && this.isTaskReady(scheduled)) {
        ready.push(scheduled);
      }
    }

    return ready;
  }

  private isTaskReady(scheduled: ScheduledTask): boolean {
    if (this.running.has(scheduled.task.id)) {
      return false;
    }

    for (const depId of scheduled.dependencies) {
      if (!this.completed.has(depId)) {
        if (this.failed.has(depId) && !this.options.continueOnError) {
          return false;
        }
        if (!this.skipped.has(depId)) {
          return false;
        }
      }
    }

    return true;
  }

  markTaskStarted(taskId: string): void {
    const scheduled = this.tasks.get(taskId);
    if (!scheduled) {
      throw new Error(`Task ${taskId} not found`);
    }
    scheduled.status = 'running';
    this.running.add(taskId);
  }

  markTaskCompleted(taskId: string): void {
    const scheduled = this.tasks.get(taskId);
    if (!scheduled) {
      throw new Error(`Task ${taskId} not found`);
    }
    scheduled.status = 'completed';
    this.running.delete(taskId);
    this.completed.add(taskId);
  }

  markTaskFailed(taskId: string): void {
    const scheduled = this.tasks.get(taskId);
    if (!scheduled) {
      throw new Error(`Task ${taskId} not found`);
    }
    scheduled.status = 'failed';
    this.running.delete(taskId);
    this.failed.add(taskId);

    if (!this.options.continueOnError) {
      this.propagateFailure(taskId);
    }
  }

  markTaskSkipped(taskId: string): void {
    const scheduled = this.tasks.get(taskId);
    if (!scheduled) {
      throw new Error(`Task ${taskId} not found`);
    }
    scheduled.status = 'skipped';
    this.running.delete(taskId);
    this.skipped.add(taskId);
  }

  private propagateFailure(failedTaskId: string): void {
    const scheduled = this.tasks.get(failedTaskId);
    if (!scheduled) return;

    for (const dependentId of scheduled.dependents) {
      if (!this.failed.has(dependentId) && !this.completed.has(dependentId)) {
        this.markTaskSkipped(dependentId);
      }
    }
  }

  isComplete(): boolean {
    return this.completed.size + this.failed.size + this.skipped.size === this.tasks.size;
  }

  hasFailures(): boolean {
    return this.failed.size > 0;
  }

  getStatus(): {
    total: number;
    completed: number;
    failed: number;
    skipped: number;
    running: number;
    pending: number;
  } {
    const total = this.tasks.size;
    const completed = this.completed.size;
    const failed = this.failed.size;
    const skipped = this.skipped.size;
    const running = this.running.size;
    const pending = total - completed - failed - skipped - running;

    return { total, completed, failed, skipped, running, pending };
  }

  getTaskStatus(taskId: string): ScheduledTask['status'] | undefined {
    return this.tasks.get(taskId)?.status;
  }

  getDependencyGraph(): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    
    for (const [taskId, scheduled] of this.tasks) {
      graph.set(taskId, [...scheduled.dependencies]);
    }
    
    return graph;
  }

  getExecutionOrder(): string[] {
    const phases = this.getPhases();
    const order: string[] = [];
    
    for (const phase of phases) {
      order.push(...phase.tasks.map(t => t.task.id));
    }
    
    return order;
  }

  reset(): void {
    this.completed.clear();
    this.failed.clear();
    this.skipped.clear();
    this.running.clear();
    
    for (const scheduled of this.tasks.values()) {
      scheduled.status = 'pending';
    }
  }
}

export function createScheduler(
  recipe: Recipe,
  options?: SchedulerOptions
): TaskScheduler {
  return new TaskScheduler(recipe, options);
}