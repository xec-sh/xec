import { Logger, createLogger } from '../utils/logger.js';
import { Variables, ExecutionContext as IExecutionContext } from '../core/types.js';

export interface ExecutionContextOptions {
  dryRun?: boolean;
  variables?: Map<string, any>;
  secrets?: Map<string, any>;
  recipeId?: string;
  runId?: string;
  parallel?: boolean;
  maxRetries?: number;
}

export class ExecutionContext implements IExecutionContext {
  recipeId: string;
  runId: string;
  taskId: string;
  path: string[];
  variables: Map<string, any>;
  globalVars: Record<string, any>;
  secrets: Record<string, any>;
  state: Map<string, any>;
  dryRun: boolean;
  startTime: Date;
  parallel?: boolean;
  maxRetries?: number;
  vars: Variables;
  logger: Logger;

  constructor(options: ExecutionContextOptions = {}) {
    this.recipeId = options.recipeId || 'default';
    this.runId = options.runId || Date.now().toString();
    this.taskId = '';
    this.path = [];
    this.variables = options.variables || new Map();
    this.globalVars = {};
    this.secrets = this.mapToObject(options.secrets || new Map());
    this.state = new Map();
    this.dryRun = options.dryRun || false;
    this.startTime = new Date();
    this.parallel = options.parallel;
    this.maxRetries = options.maxRetries;

    // Initialize vars from variables map
    this.vars = this.mapToObject(this.variables);

    // Initialize logger with proper configuration
    this.logger = createLogger({
      name: `context:${this.recipeId}:${this.runId}`,
      base: {
        recipeId: this.recipeId,
        runId: this.runId
      }
    });
  }

  private mapToObject(map: Map<string, any>): Record<string, any> {
    const obj: Record<string, any> = {};
    map.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  getVariable(key: string): any {
    return this.variables.get(key) || this.globalVars[key];
  }

  setVariable(key: string, value: any): void {
    this.variables.set(key, value);
  }

  getGlobalVariable(key: string): any {
    return this.globalVars[key];
  }

  setGlobalVariable(key: string, value: any): void {
    this.globalVars[key] = value;
  }

  getSecret(key: string): any {
    return this.secrets[key];
  }

  getState(key: string): any {
    return this.state.get(key);
  }

  setState(key: string, value: any): void {
    this.state.set(key, value);
  }

  createChildContext(taskId: string): ExecutionContext {
    const child = new ExecutionContext({
      dryRun: this.dryRun,
      variables: new Map(this.variables),
      secrets: new Map(Object.entries(this.secrets)),
      recipeId: this.recipeId,
      runId: this.runId,
      parallel: this.parallel,
      maxRetries: this.maxRetries,
    });

    child.taskId = taskId;
    child.path = [...this.path, taskId];
    child.globalVars = { ...this.globalVars };
    child.state = this.state; // Share state across contexts
    child.logger = this.logger.child({
      taskId,
      path: child.path.join('.')
    }); // Child logger with task context

    return child;
  }

  toJSON(): any {
    return {
      recipeId: this.recipeId,
      runId: this.runId,
      taskId: this.taskId,
      path: this.path,
      variables: Object.fromEntries(this.variables),
      globalVars: this.globalVars,
      secrets: '[REDACTED]',
      dryRun: this.dryRun,
      startTime: this.startTime,
      parallel: this.parallel,
      maxRetries: this.maxRetries,
    };
  }
}