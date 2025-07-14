import { AsyncLocalStorage } from 'async_hooks';

import { ContextError } from '../core/errors.js';

import type { Logger, Variables, TaskContext } from '../core/types.js';

export interface ExecutionContext extends TaskContext {
  recipeId: string;
  runId: string;
  dryRun: boolean;
  verbose: boolean;
  parallel: boolean;
  maxRetries: number;
  timeout: number;
  startTime: Date;
  endTime?: Date;
  logger: Logger;
  globalVars: Variables;
  secrets: Variables;
  state: Map<string, any>;
  hosts?: string[];
  tags?: string[];
  helpers?: Record<string, (...args: any[]) => any>;
}

export class ContextProvider {
  private static instance: ContextProvider;
  private asyncLocalStorage: AsyncLocalStorage<ExecutionContext>;

  private constructor() {
    this.asyncLocalStorage = new AsyncLocalStorage();
  }

  static getInstance(): ContextProvider {
    if (!ContextProvider.instance) {
      ContextProvider.instance = new ContextProvider();
    }
    return ContextProvider.instance;
  }

  getStore(): ExecutionContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  getStoreOrThrow(): ExecutionContext {
    const store = this.getStore();
    if (!store) {
      throw new ContextError('No execution context found. Make sure to run within a context.');
    }
    return store;
  }

  run<T>(context: ExecutionContext, fn: () => T | Promise<T>): T | Promise<T> {
    return this.asyncLocalStorage.run(context, fn);
  }

  async runAsync<T>(context: ExecutionContext, fn: () => Promise<T>): Promise<T> {
    return this.asyncLocalStorage.run(context, fn);
  }

  enterWith(context: ExecutionContext): void {
    this.asyncLocalStorage.enterWith(context);
  }

  exit(): void {
    this.asyncLocalStorage.disable();
  }

  updateContext(updates: Partial<ExecutionContext>): void {
    const current = this.getStoreOrThrow();
    const updated = { ...current, ...updates };
    this.enterWith(updated);
  }

  getTaskContext(): TaskContext {
    const context = this.getStoreOrThrow();
    return {
      taskId: context.taskId,
      vars: context.vars,
      host: context.host,
      phase: context.phase,
      attempt: context.attempt,
      logger: context.logger
    };
  }

  withTaskContext<T>(
    taskContext: Partial<TaskContext>,
    fn: () => T | Promise<T>
  ): T | Promise<T> {
    const current = this.getStoreOrThrow();
    const merged: ExecutionContext = {
      ...current,
      ...taskContext
    };
    return this.run(merged, fn);
  }

  createChildContext(overrides: Partial<ExecutionContext>): ExecutionContext {
    const parent = this.getStoreOrThrow();
    return {
      ...parent,
      ...overrides,
      vars: {
        ...parent.vars,
        ...(overrides.vars || {})
      },
      globalVars: {
        ...parent.globalVars,
        ...(overrides.globalVars || {})
      }
    };
  }

  getVariable(name: string): any {
    const context = this.getStoreOrThrow();
    
    if (name in context.vars) {
      return context.vars[name];
    }
    
    if (name in context.globalVars) {
      return context.globalVars[name];
    }
    
    if (name in context.secrets) {
      return context.secrets[name];
    }
    
    return undefined;
  }

  setVariable(name: string, value: any, scope: 'local' | 'global' = 'local'): void {
    const context = this.getStoreOrThrow();
    
    if (scope === 'global') {
      context.globalVars[name] = value;
    } else {
      context.vars[name] = value;
    }
  }

  getAllVariables(): Variables {
    const context = this.getStoreOrThrow();
    return {
      ...context.globalVars,
      ...context.vars
    };
  }

  getContext(): ExecutionContext {
    return this.getStoreOrThrow();
  }

  getLogger(): Logger {
    return this.getStoreOrThrow().logger;
  }

  isDryRun(): boolean {
    return this.getStoreOrThrow().dryRun;
  }

  isVerbose(): boolean {
    return this.getStoreOrThrow().verbose;
  }

  getRunId(): string {
    return this.getStoreOrThrow().runId;
  }

  getRecipeId(): string {
    return this.getStoreOrThrow().recipeId;
  }

  getState<T = any>(key: string): T | undefined {
    return this.getStoreOrThrow().state.get(key);
  }

  setState<T = any>(key: string, value: T): void {
    this.getStoreOrThrow().state.set(key, value);
  }

  hasState(key: string): boolean {
    return this.getStoreOrThrow().state.has(key);
  }

  deleteState(key: string): boolean {
    return this.getStoreOrThrow().state.delete(key);
  }

  clearState(): void {
    this.getStoreOrThrow().state.clear();
  }

  getHosts(): string[] | undefined {
    return this.getStoreOrThrow().hosts;
  }

  getTags(): string[] | undefined {
    return this.getStoreOrThrow().tags;
  }

  matchesHost(hostname: string): boolean {
    const hosts = this.getHosts();
    if (!hosts || hosts.length === 0) {
      return true;
    }
    return hosts.includes(hostname);
  }

  matchesTags(tags: string[]): boolean {
    const contextTags = this.getTags();
    if (!contextTags || contextTags.length === 0) {
      return true;
    }
    return tags.some(tag => contextTags.includes(tag));
  }
}

export const contextProvider = ContextProvider.getInstance();