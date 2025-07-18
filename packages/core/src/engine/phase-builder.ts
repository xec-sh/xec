
import type { Task, Recipe } from '../core/types.js';

export interface PhaseDefinition {
  name: string;
  description?: string;
  parallel?: boolean;
  continueOnError?: boolean;
  tasks: Task[];
}

export interface PhaseExecutionPlan {
  phases: PhaseDefinition[];
  totalTasks: number;
  estimatedTime?: number;
}

export class PhaseBuilder {
  private phases: Map<string, PhaseDefinition> = new Map();
  private phaseOrder: string[] = [];

  constructor(private recipe: Recipe) { }

  static fromRecipe(recipe: Recipe): PhaseBuilder {
    const builder = new PhaseBuilder(recipe);
    builder.buildPhases();
    return builder;
  }

  private buildPhases(): void {
    // Group tasks by phase
    const phaseMap = new Map<string, Task[]>();

    for (const task of this.recipe.tasks.values()) {
      // Check both metadata.phase and direct phase property
      const phaseName = task.metadata?.['phase'] || (task as any).phase || 'default';

      if (!phaseMap.has(phaseName)) {
        phaseMap.set(phaseName, []);
      }
      phaseMap.get(phaseName)!.push(task);
    }

    // If recipe has explicit phases, use their order
    if (this.recipe.phases && this.recipe.phases.size > 0) {
      for (const [phaseName, phase] of this.recipe.phases) {
        const tasksInPhase = phaseMap.get(phaseName) || [];

        const phaseDefinition: PhaseDefinition = {
          name: phaseName,
          description: phase.description,
          parallel: phase.parallel || false,
          continueOnError: phase.continueOnError || false,
          tasks: tasksInPhase
        };

        this.phases.set(phaseName, phaseDefinition);
        this.phaseOrder.push(phaseName);
      }
    } else {
      // Otherwise, extract phases from tasks
      const phaseNames = Array.from(phaseMap.keys());

      // Sort phases based on task dependencies
      const sortedPhases = this.sortPhasesByDependencies(phaseNames, phaseMap);

      for (const phaseName of sortedPhases) {
        const tasksInPhase = phaseMap.get(phaseName) || [];

        const phaseDefinition: PhaseDefinition = {
          name: phaseName,
          description: `Phase: ${phaseName}`,
          parallel: this.recipe.metadata?.['parallel'] || false,
          continueOnError: this.recipe.metadata?.['continueOnError'] || false,
          tasks: tasksInPhase
        };

        this.phases.set(phaseName, phaseDefinition);
        this.phaseOrder.push(phaseName);
      }
    }
  }

  private sortPhasesByDependencies(phaseNames: string[], phaseMap: Map<string, Task[]>): string[] {
    // Create a dependency graph between phases
    const phaseDeps = new Map<string, Set<string>>();

    for (const phaseName of phaseNames) {
      phaseDeps.set(phaseName, new Set());
      const tasksInPhase = phaseMap.get(phaseName) || [];

      for (const task of tasksInPhase) {
        for (const depId of task.dependencies || []) {
          // Find which phase the dependency is in
          for (const [otherPhaseName, otherTasks] of phaseMap) {
            if (otherPhaseName !== phaseName && otherTasks.some(t => t.id === depId)) {
              phaseDeps.get(phaseName)!.add(otherPhaseName);
            }
          }
        }
      }
    }

    // Topological sort
    const sorted: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (phase: string) => {
      if (visited.has(phase)) return;
      if (visiting.has(phase)) return; // Skip cycles

      visiting.add(phase);

      for (const dep of phaseDeps.get(phase) || []) {
        visit(dep);
      }

      visiting.delete(phase);
      visited.add(phase);
      sorted.push(phase);
    };

    for (const phase of phaseNames) {
      visit(phase);
    }

    return sorted;
  }

  private getPhaseNameFromTasks(tasks: Task[]): string {
    const phaseNames = new Set(tasks.map(t => t.metadata?.['phase'] || 'default'));

    if (phaseNames.size === 1) {
      return Array.from(phaseNames)[0];
    }

    return `mixed-${this.phaseOrder.length}`;
  }

  addPhase(name: string, definition: Omit<PhaseDefinition, 'name'>): PhaseBuilder {
    this.phases.set(name, { ...definition, name });
    if (!this.phaseOrder.includes(name)) {
      this.phaseOrder.push(name);
    }
    return this;
  }

  insertPhaseBefore(beforePhase: string, name: string, definition: Omit<PhaseDefinition, 'name'>): PhaseBuilder {
    const index = this.phaseOrder.indexOf(beforePhase);
    if (index === -1) {
      throw new Error(`Phase ${beforePhase} not found`);
    }

    this.phases.set(name, { ...definition, name });
    this.phaseOrder.splice(index, 0, name);
    return this;
  }

  insertPhaseAfter(afterPhase: string, name: string, definition: Omit<PhaseDefinition, 'name'>): PhaseBuilder {
    const index = this.phaseOrder.indexOf(afterPhase);
    if (index === -1) {
      throw new Error(`Phase ${afterPhase} not found`);
    }

    this.phases.set(name, { ...definition, name });
    this.phaseOrder.splice(index + 1, 0, name);
    return this;
  }

  removePhase(name: string): PhaseBuilder {
    this.phases.delete(name);
    this.phaseOrder = this.phaseOrder.filter(p => p !== name);
    return this;
  }

  mergePhases(phase1: string, phase2: string, newName?: string): PhaseBuilder {
    const p1 = this.phases.get(phase1);
    const p2 = this.phases.get(phase2);

    if (!p1 || !p2) {
      throw new Error(`One or both phases not found: ${phase1}, ${phase2}`);
    }

    const mergedName = newName || phase1;
    const mergedPhase: PhaseDefinition = {
      name: mergedName,
      description: `Merged: ${p1.description || phase1} + ${p2.description || phase2}`,
      parallel: p1.parallel && p2.parallel,
      continueOnError: p1.continueOnError || p2.continueOnError,
      tasks: [...p1.tasks, ...p2.tasks]
    };

    this.phases.set(mergedName, mergedPhase);
    this.phases.delete(phase1);
    this.phases.delete(phase2);

    const index1 = this.phaseOrder.indexOf(phase1);
    const index2 = this.phaseOrder.indexOf(phase2);
    const minIndex = Math.min(index1, index2);

    this.phaseOrder = this.phaseOrder.filter(p => p !== phase1 && p !== phase2);
    this.phaseOrder.splice(minIndex, 0, mergedName);

    return this;
  }

  splitPhase(phaseName: string, splitFn: (tasks: Task[]) => { phase1: Task[], phase2: Task[] }, names?: { phase1?: string, phase2?: string }): PhaseBuilder {
    const phase = this.phases.get(phaseName);
    if (!phase) {
      throw new Error(`Phase ${phaseName} not found`);
    }

    const { phase1: tasks1, phase2: tasks2 } = splitFn(phase.tasks);

    const phase1Name = names?.phase1 || `${phaseName}-1`;
    const phase2Name = names?.phase2 || `${phaseName}-2`;

    const phase1: PhaseDefinition = {
      name: phase1Name,
      description: `${phase.description || phaseName} (part 1)`,
      parallel: phase.parallel,
      continueOnError: phase.continueOnError,
      tasks: tasks1
    };

    const phase2: PhaseDefinition = {
      name: phase2Name,
      description: `${phase.description || phaseName} (part 2)`,
      parallel: phase.parallel,
      continueOnError: phase.continueOnError,
      tasks: tasks2
    };

    const index = this.phaseOrder.indexOf(phaseName);
    this.phases.delete(phaseName);
    this.phases.set(phase1Name, phase1);
    this.phases.set(phase2Name, phase2);

    this.phaseOrder.splice(index, 1, phase1Name, phase2Name);

    return this;
  }

  getPhase(name: string): PhaseDefinition | undefined {
    return this.phases.get(name);
  }

  getPhases(): PhaseDefinition[] {
    return this.phaseOrder.map(name => this.phases.get(name)!);
  }

  getPhaseNames(): string[] {
    return [...this.phaseOrder];
  }

  getExecutionPlan(): PhaseExecutionPlan {
    const phases = this.getPhases();
    const totalTasks = phases.reduce((sum, phase) => sum + phase.tasks.length, 0);

    let estimatedTime: number | undefined;
    if (phases.every(phase => phase.tasks.every(task => task.options?.timeout !== undefined))) {
      estimatedTime = phases.reduce((sum, phase) => {
        if (phase.parallel) {
          return sum + Math.max(...phase.tasks.map(t => t.options?.timeout || 0));
        } else {
          return sum + phase.tasks.reduce((phaseSum, task) => phaseSum + (task.options?.timeout || 0), 0);
        }
      }, 0);
    }

    return {
      phases,
      totalTasks,
      estimatedTime
    };
  }

  optimizePhases(): PhaseBuilder {
    for (let i = 0; i < this.phaseOrder.length - 1; i++) {
      const currentPhaseName = this.phaseOrder[i];
      const nextPhaseName = this.phaseOrder[i + 1];
      if (!currentPhaseName || !nextPhaseName) {
        continue;
      }
      const currentPhase = this.phases.get(currentPhaseName)!;
      const nextPhase = this.phases.get(nextPhaseName)!;

      if (currentPhase.parallel === nextPhase.parallel &&
        currentPhase.continueOnError === nextPhase.continueOnError &&
        this.canMergePhases(currentPhase, nextPhase)) {
        this.mergePhases(currentPhase.name, nextPhase.name);
        i--;
      }
    }

    return this;
  }

  private canMergePhases(phase1: PhaseDefinition, phase2: PhaseDefinition): boolean {
    const phase1TaskIds = new Set(phase1.tasks.map(t => t.id));

    for (const task of phase2.tasks) {
      for (const dep of task.dependencies || []) {
        if (phase1TaskIds.has(dep)) {
          return false;
        }
      }
    }

    return true;
  }

  validate(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (this.phaseOrder.length === 0) {
      errors.push('No phases defined');
    }

    for (const phaseName of this.phaseOrder) {
      const phase = this.phases.get(phaseName);
      if (!phase) {
        errors.push(`Phase ${phaseName} is in order but not defined`);
        continue;
      }

      if (phase.tasks.length === 0) {
        errors.push(`Phase ${phaseName} has no tasks`);
      }
    }

    const allTasks = new Set<string>();
    for (const phase of this.phases.values()) {
      for (const task of phase.tasks) {
        if (allTasks.has(task.id)) {
          errors.push(`Task ${task.id} appears in multiple phases`);
        }
        allTasks.add(task.id);
      }
    }

    const recipeTasks = new Set(Array.from(this.recipe.tasks.values()).map(t => t.id));
    for (const taskId of recipeTasks) {
      if (!allTasks.has(taskId)) {
        errors.push(`Recipe task ${taskId} is not assigned to any phase`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  toDOT(): string {
    const lines = ['digraph ExecutionPhases {'];
    lines.push('  rankdir=TB;');
    lines.push('  node [shape=box];');

    for (let i = 0; i < this.phaseOrder.length; i++) {
      const phaseName = this.phaseOrder[i];
      if (!phaseName) {
        continue;
      }
      const phase = this.phases.get(phaseName)!;

      lines.push(`  subgraph cluster_${i} {`);
      lines.push(`    label="${phaseName}";`);
      lines.push(`    style=filled;`);
      lines.push(`    color=lightgrey;`);

      for (const task of phase.tasks) {
        lines.push(`    "${task.id}" [label="${task.id}\\n${task.description || ''}"];`);
      }

      lines.push('  }');
    }

    for (const phase of this.phases.values()) {
      for (const task of phase.tasks) {
        for (const dep of task.dependencies || []) {
          lines.push(`  "${dep}" -> "${task.id}";`);
        }
      }
    }

    lines.push('}');
    return lines.join('\n');
  }
}

export function buildPhases(recipe: Recipe): PhaseExecutionPlan {
  return PhaseBuilder.fromRecipe(recipe).getExecutionPlan();
}

export function optimizePhases(recipe: Recipe): PhaseExecutionPlan {
  return PhaseBuilder.fromRecipe(recipe).optimizePhases().getExecutionPlan();
}