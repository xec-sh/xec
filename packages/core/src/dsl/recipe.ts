
import { TaskBuilder } from './task.js';
import { ValidationError, DependencyError } from '../core/errors.js';

import type {
  Task,
  Hook,
  Phase,
  Recipe,
  Module,
  Variables,
  JSONSchema,
  RecipeHooks,
  RecipeMetadata
} from '../core/types.js';

export interface RecipeBuilderOptions {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  vars?: Variables;
  tasks?: Map<string, Task>;
  phases?: Map<string, Phase>;
  hooks?: RecipeHooks;
  metadata?: RecipeMetadata;
}

export class RecipeBuilder {
  private recipe: Partial<Recipe>;
  private taskBuilders: Map<string, TaskBuilder> = new Map();
  private moduleList: Module[] = [];

  constructor(name: string) {
    this.recipe = {
      id: name,  // Use name as default id instead of UUID
      name,
      version: '1.0.0',
      tasks: new Map<string, Task>(),
      phases: new Map<string, Phase>(),
      vars: {},
      hooks: {
        before: [],
        after: [],
        onError: [],
        finally: []
      }
    };
  }

  static create(name: string): RecipeBuilder {
    return new RecipeBuilder(name);
  }

  id(id: string): RecipeBuilder {
    this.recipe.id = id;
    return this;
  }

  setName(name: string): RecipeBuilder {
    this.recipe.name = name;
    return this;
  }

  // Alias for backward compatibility
  name(name: string): RecipeBuilder {
    return this.setName(name);
  }

  description(description: string): RecipeBuilder {
    this.recipe.description = description;
    return this;
  }

  version(version: string): RecipeBuilder {
    this.recipe.version = version;
    return this;
  }

  author(author: string): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata.author = author;
    return this;
  }

  tags(...tags: string[]): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata.tags = [...(this.recipe.metadata.tags || []), ...tags];
    return this;
  }

  vars(vars: Variables): RecipeBuilder {
    this.recipe.vars = { ...this.recipe.vars, ...vars };
    return this;
  }

  var(name: string, value: any): RecipeBuilder {
    this.recipe.vars![name] = value;
    return this;
  }

  requires(...varNames: string[]): RecipeBuilder {
    // Store in metadata for now
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata.requiredVars = [...(this.recipe.metadata.requiredVars || []), ...varNames];
    return this;
  }

  schema(schema: JSONSchema): RecipeBuilder {
    // Store in metadata for now
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata.varsSchema = schema;
    return this;
  }

  task(nameOrTask: string | Task | TaskBuilder, taskOrBuilder?: Task | TaskBuilder): RecipeBuilder {
    if (typeof nameOrTask === 'string' && taskOrBuilder) {
      // task('name', taskInstance)
      if (taskOrBuilder instanceof TaskBuilder) {
        const task = taskOrBuilder.build();
        // Check for duplicate task ID
        for (const existingTask of this.recipe.tasks!.values()) {
          if (existingTask.id === task.id) {
            throw new ValidationError(`Duplicate task id: ${task.id}`, 'tasks', task.id);
          }
        }
        this.recipe.tasks!.set(nameOrTask, task);
        this.taskBuilders.set(task.id, taskOrBuilder);
      } else {
        // Check for duplicate task ID
        for (const existingTask of this.recipe.tasks!.values()) {
          if (existingTask.id === taskOrBuilder.id) {
            throw new ValidationError(`Duplicate task id: ${taskOrBuilder.id}`, 'tasks', taskOrBuilder.id);
          }
        }
        this.recipe.tasks!.set(nameOrTask, taskOrBuilder);
      }
    } else if (nameOrTask instanceof TaskBuilder) {
      // task(taskBuilder)
      const task = nameOrTask.build();
      // Check for duplicate task ID
      for (const existingTask of this.recipe.tasks!.values()) {
        if (existingTask.id === task.id) {
          throw new ValidationError(`Duplicate task id: ${task.id}`, 'tasks', task.id);
        }
      }
      this.recipe.tasks!.set(task.name, task);
      this.taskBuilders.set(task.id, nameOrTask);
    } else if (typeof nameOrTask === 'object') {
      // task(taskInstance)
      // Check for duplicate task ID
      for (const existingTask of this.recipe.tasks!.values()) {
        if (existingTask.id === nameOrTask.id) {
          throw new ValidationError(`Duplicate task id: ${nameOrTask.id}`, 'tasks', nameOrTask.id);
        }
      }
      this.recipe.tasks!.set(nameOrTask.name, nameOrTask);
    }
    return this;
  }

  tasks(...tasks: Array<Task | TaskBuilder>): RecipeBuilder {
    for (const task of tasks) {
      this.task(task);
    }
    return this;
  }

  addTask(name: string, handler?: (builder: TaskBuilder) => TaskBuilder): RecipeBuilder {
    const builder = new TaskBuilder(name);
    const configured = handler ? handler(builder) : builder;
    return this.task(configured);
  }

  phase(name: string, phase: Phase): RecipeBuilder {
    this.recipe.phases!.set(name, phase);
    return this;
  }

  addPhase(name: string, taskNames: string[], options?: { parallel?: boolean; continueOnError?: boolean }): RecipeBuilder {
    const phase: Phase = {
      name,
      tasks: taskNames,
      parallel: options?.parallel || false,
      continueOnError: options?.continueOnError
    };
    return this.phase(name, phase);
  }

  meta(key: string, value: any): RecipeBuilder;
  meta(data: RecipeMetadata): RecipeBuilder;
  meta(keyOrData: string | RecipeMetadata, value?: any): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    if (typeof keyOrData === 'string') {
      (this.recipe.metadata as any)[keyOrData] = value;
    } else {
      this.recipe.metadata = { ...this.recipe.metadata, ...keyOrData };
    }
    return this;
  }

  before(hook: Hook): RecipeBuilder {
    this.recipe.hooks!.before!.push(hook);
    return this;
  }

  after(hook: Hook): RecipeBuilder {
    this.recipe.hooks!.after!.push(hook);
    return this;
  }

  beforeEach(hook: (task: Task) => Promise<void> | void): RecipeBuilder {
    this.recipe.hooks!.beforeEach = hook;
    return this;
  }

  afterEach(hook: (task: Task, result: any) => Promise<void> | void): RecipeBuilder {
    this.recipe.hooks!.afterEach = hook;
    return this;
  }

  onError(hook: (error: Error, context: any) => Promise<void> | void): RecipeBuilder {
    this.recipe.hooks!.onError!.push(hook);
    return this;
  }

  finally(hook: Hook): RecipeBuilder {
    this.recipe.hooks!.finally!.push(hook);
    return this;
  }

  // Additional methods for backward compatibility
  module(module: Module): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    if (!this.recipe.metadata.modules) {
      this.recipe.metadata.modules = [];
    }
    // Check for duplicate module name
    const existing = this.moduleList.find((m: Module) => m.name === module.name);
    if (existing) {
      throw new ValidationError(`Duplicate module name: ${module.name}`, 'modules', module.name);
    }
    this.moduleList.push(module);
    this.recipe.metadata.modules.push(module.name);
    return this;
  }

  modules(...modules: Module[]): RecipeBuilder {
    modules.forEach(m => this.module(m));
    return this;
  }

  hosts(...hosts: string[]): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    if (!this.recipe.metadata['hosts']) {
      this.recipe.metadata['hosts'] = [];
    }
    this.recipe.metadata['hosts'].push(...hosts);
    return this;
  }

  parallel(value: boolean = true): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata['parallel'] = value;
    return this;
  }

  continueOnError(value: boolean = true): RecipeBuilder {
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata['continueOnError'] = value;
    return this;
  }

  timeout(ms: number): RecipeBuilder {
    if (ms <= 0) {
      throw new ValidationError('Timeout must be greater than 0', 'timeout', ms);
    }
    if (!this.recipe.metadata) {
      this.recipe.metadata = {
        name: this.recipe.name || '',
        version: this.recipe.version
      };
    }
    this.recipe.metadata['timeout'] = ms;
    return this;
  }

  beforeAll(hook: Hook): RecipeBuilder {
    return this.before(hook);
  }

  afterAll(hook: Hook): RecipeBuilder {
    return this.after(hook);
  }

  private validateDependencies(): void {
    const tasks = Array.from(this.recipe.tasks!.values());
    const taskIds = new Set(tasks.map(t => t.id));
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (taskId: string, path: string[] = []): void => {
      if (visiting.has(taskId)) {
        const cycle = [...path, taskId].join(' -> ');
        throw new DependencyError(
          `Circular dependency detected: ${cycle}`,
          taskId,
          []
        );
      }

      if (visited.has(taskId)) {
        return;
      }

      visiting.add(taskId);
      const task = tasks.find(t => t.id === taskId);

      if (!task) {
        throw new DependencyError(
          `Task ${taskId} not found in recipe`,
          taskId,
          []
        );
      }

      for (const depId of task.dependencies || []) {
        if (!taskIds.has(depId)) {
          throw new DependencyError(
            `Task ${taskId} depends on non-existent task ${depId}`,
            taskId,
            [depId]
          );
        }
        visit(depId, [...path, taskId]);
      }

      visiting.delete(taskId);
      visited.add(taskId);
    };

    for (const task of tasks) {
      if (!visited.has(task.id)) {
        visit(task.id);
      }
    }
  }

  validate(): void {
    if (!this.recipe.id) {
      throw new ValidationError('Recipe must have an id');
    }

    if (!this.recipe.name) {
      throw new ValidationError('Recipe must have a name');
    }

    if (!this.recipe.tasks || this.recipe.tasks.size === 0) {
      throw new ValidationError('Recipe must have at least one task', 'tasks');
    }

    const taskIds = new Set<string>();
    const taskNames = new Set<string>();

    for (const [name, task] of this.recipe.tasks) {
      if (taskIds.has(task.id)) {
        throw new ValidationError(
          `Duplicate task id: ${task.id}`,
          'tasks',
          task.id
        );
      }
      if (taskNames.has(name)) {
        throw new ValidationError(
          `Duplicate task name: ${name}`,
          'tasks',
          name
        );
      }
      taskIds.add(task.id);
      taskNames.add(name);
    }

    this.validateDependencies();

    // Validate phases reference existing tasks
    for (const [phaseName, phase] of this.recipe.phases || new Map()) {
      for (const taskName of phase.tasks) {
        if (!this.recipe.tasks.has(taskName)) {
          throw new ValidationError(
            `Phase ${phaseName} references non-existent task: ${taskName}`,
            'phases',
            taskName
          );
        }
      }
    }

    // Validate requiredVars against schema
    if (this.recipe.metadata?.requiredVars && this.recipe.metadata?.varsSchema) {
      const schema = this.recipe.metadata.varsSchema;
      const schemaProps = schema['properties'] || {};
      const requiredVars = this.recipe.metadata.requiredVars;

      const undefinedVars = requiredVars.filter((v: string) => !(v in schemaProps));
      if (undefinedVars.length > 0) {
        throw new ValidationError(`Required vars not defined in schema: ${undefinedVars.join(', ')}`, 'requiredVars', undefinedVars);
      }
    }
  }

  build(): Recipe {
    this.validate();

    const recipe: Recipe = {
      id: this.recipe.id!,
      name: this.recipe.name!,
      version: this.recipe.version || '1.0.0',
      description: this.recipe.description,
      tasks: this.recipe.tasks || new Map(),
      phases: this.recipe.phases || new Map(),
      vars: this.recipe.vars || {},
      hooks: this.recipe.hooks || {
        before: [],
        after: [],
        onError: [],
        finally: []
      },
      metadata: this.recipe.metadata
    };

    // Add legacy properties for backward compatibility
    const legacyRecipe = recipe as any;

    // Convert tasks Map to array for legacy tests
    legacyRecipe.tasks = Array.from(recipe.tasks.values());

    // Add legacy hook names only if they exist
    if (recipe.hooks) {
      if (recipe.hooks.before && recipe.hooks.before.length > 0) {
        legacyRecipe.hooks.beforeAll = recipe.hooks.before[0];
      }
      if (recipe.hooks.after && recipe.hooks.after.length > 0) {
        legacyRecipe.hooks.afterAll = recipe.hooks.after[0];
      }
      if (recipe.hooks.onError && recipe.hooks.onError.length > 0) {
        legacyRecipe.hooks.onError = recipe.hooks.onError[0];
      }
    }

    // Add metadata fields to root for legacy compatibility
    if (recipe.metadata) {
      legacyRecipe.author = recipe.metadata.author;
      legacyRecipe.tags = recipe.metadata.tags || [];
      legacyRecipe.requiredVars = recipe.metadata.requiredVars || [];
      legacyRecipe.varsSchema = recipe.metadata.varsSchema;
      legacyRecipe.modules = this.moduleList || [];
      legacyRecipe.hosts = recipe.metadata['hosts'];
      legacyRecipe.parallel = recipe.metadata['parallel'];
      legacyRecipe.continueOnError = recipe.metadata['continueOnError'];
      legacyRecipe.timeout = recipe.metadata['timeout'];
      // Filter out system fields for legacy meta
      const systemFields = ['name', 'version', 'author', 'tags', 'requiredVars', 'varsSchema', 'modules', 'hosts', 'parallel', 'continueOnError', 'timeout'];
      legacyRecipe.meta = {};
      Object.keys(recipe.metadata).forEach(key => {
        if (!systemFields.includes(key)) {
          legacyRecipe.meta[key] = recipe.metadata![key];
        }
      });
    } else {
      legacyRecipe.tags = [];
      legacyRecipe.requiredVars = [];
      legacyRecipe.modules = this.moduleList || [];
      legacyRecipe.meta = {};
    }

    // Also keep the Map for new API compatibility
    Object.defineProperty(legacyRecipe, '_tasksMap', {
      value: recipe.tasks,
      enumerable: false,
      configurable: true
    });

    return recipe;
  }
}

export { Recipe } from '../core/types.js';

export function recipe(name: string): RecipeBuilder {
  return RecipeBuilder.create(name);
}

export function simpleRecipe(
  name: string,
  tasks: Array<Task | TaskBuilder>,
  options?: {
    name?: string;
    description?: string;
    vars?: Variables;
    parallel?: boolean;
  }
): Recipe {
  const builder = recipe(name);

  if (options?.name) builder.setName(options.name);
  if (options?.description) builder.description(options.description);
  if (options?.vars) builder.vars(options.vars);
  if (options?.parallel !== undefined) builder.parallel(options.parallel);

  builder.tasks(...tasks);

  return builder.build();
}

export function phaseRecipe(
  name: string,
  phases: Record<string, Array<Task | TaskBuilder>>,
  options?: {
    name?: string;
    description?: string;
    vars?: Variables;
  }
): Recipe {
  const builder = recipe(name);

  if (options?.name) builder.setName(options.name);
  if (options?.description) builder.description(options.description);
  if (options?.vars) builder.vars(options.vars);

  // Collect tasks by phase and set dependencies
  const phaseNames = Object.keys(phases);
  const phaseTasks: Map<string, Task[]> = new Map();

  // Build all tasks and assign phases
  for (const [phaseName, taskBuilders] of Object.entries(phases)) {
    const tasksInPhase: Task[] = [];
    for (const taskOrBuilder of taskBuilders) {
      const task = taskOrBuilder instanceof TaskBuilder ? taskOrBuilder.build() : taskOrBuilder;

      // Add phase to task metadata
      if (!task.metadata) {
        task.metadata = {};
      }
      task.metadata['phase'] = phaseName;

      // Add legacy phase property
      (task as any).phase = phaseName;

      tasksInPhase.push(task);
      builder.task(task);
    }
    phaseTasks.set(phaseName, tasksInPhase);
  }

  // Set dependencies between phases
  for (let i = 1; i < phaseNames.length; i++) {
    const currentPhaseName = phaseNames[i];
    const previousPhaseName = phaseNames[i - 1];
    if (!currentPhaseName || !previousPhaseName) {
      continue;
    }
    const currentPhaseTasks = phaseTasks.get(currentPhaseName) || [];
    const previousPhaseTasks = phaseTasks.get(previousPhaseName) || [];

    // Each task in current phase depends on all tasks from previous phase
    for (const currentTask of currentPhaseTasks) {
      const previousTaskIds = previousPhaseTasks.map(t => t.id);
      currentTask.dependencies = [...currentTask.dependencies, ...previousTaskIds];
      // Also update legacy property
      (currentTask as any).depends = currentTask.dependencies;
    }
  }

  // Create phases
  for (const [phaseName, phaseTasks] of Object.entries(phases)) {
    const taskNames = phaseTasks.map(t => {
      const task = t instanceof TaskBuilder ? t.build() : t;
      return task.name;
    });
    builder.addPhase(phaseName, taskNames);
  }

  return builder.build();
}

export function moduleRecipe(
  name: string,
  modules: Module[],
  options?: {
    name?: string;
    description?: string;
    vars?: Variables;
  }
): Recipe {
  const builder = recipe(name);

  if (options?.name) builder.setName(options.name);
  if (options?.description) builder.description(options.description);
  if (options?.vars) builder.vars(options.vars);

  // Add modules
  for (const module of modules) {
    builder.module(module);
  }

  // Add initialization task for modules
  const initTask = new TaskBuilder('init-modules')
    .description('Initialize modules')
    .handler(async (context) =>
    // Module initialization logic would go here
    ({
      message: 'Modules initialized',
      modules: modules.map(m => m.name)
    })
    )
    .build();

  builder.task(initTask);

  return builder.build();
}