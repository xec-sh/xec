import { contextProvider } from './provider.js';

import type { Variables } from '../core/types.js';

export function getVar(name: string): any {
  return contextProvider.getVariable(name);
}

export function setVar(name: string, value: any, scope: 'local' | 'global' = 'local'): void {
  contextProvider.setVariable(name, value, scope);
}

export function getVars(): Variables {
  return contextProvider.getAllVariables();
}

export function log(message: string, level: 'debug' | 'info' | 'warn' | 'error' = 'info'): void {
  const logger = contextProvider.getLogger();
  logger[level](message);
}

export function debug(message: string): void {
  log(message, 'debug');
}

export function info(message: string): void {
  log(message, 'info');
}

export function warn(message: string): void {
  log(message, 'warn');
}

export function error(message: string): void {
  log(message, 'error');
}

export function isDryRun(): boolean {
  return contextProvider.isDryRun();
}

export function isVerbose(): boolean {
  return contextProvider.isVerbose();
}

export function getRunId(): string {
  return contextProvider.getRunId();
}

export function getRecipeId(): string {
  return contextProvider.getRecipeId();
}

export function getTaskId(): string {
  return contextProvider.getTaskContext().taskId;
}

export function getPhase(): string | undefined {
  return contextProvider.getTaskContext().phase;
}

export function getAttempt(): number {
  return contextProvider.getTaskContext().attempt || 1;
}

export function getHost(): string | undefined {
  return contextProvider.getTaskContext().host;
}

export function getState<T = any>(key: string): T | undefined {
  return contextProvider.getState<T>(key);
}

export function setState<T = any>(key: string, value: T): void {
  contextProvider.setState(key, value);
}

export function hasState(key: string): boolean {
  return contextProvider.hasState(key);
}

export function deleteState(key: string): boolean {
  return contextProvider.deleteState(key);
}

export function clearState(): void {
  contextProvider.clearState();
}

export function getHosts(): string[] | undefined {
  return contextProvider.getHosts();
}

export function getTags(): string[] | undefined {
  return contextProvider.getTags();
}

export function matchesHost(hostname: string): boolean {
  return contextProvider.matchesHost(hostname);
}

export function matchesTags(tags: string[]): boolean {
  return contextProvider.matchesTags(tags);
}

export function env(name: string, defaultValue?: string): string | undefined {
  return process.env[name] || getVar(`env.${name}`) || defaultValue;
}

export function secret(name: string): string | undefined {
  const secrets = contextProvider.getStoreOrThrow().secrets;
  return secrets[name];
}

export function fail(message: string): never {
  error(message);
  throw new Error(message);
}

export function skip(reason?: string): void {
  if (reason) {
    info(`Skipping: ${reason}`);
  }
  throw new SkipTaskError(reason);
}

export class SkipTaskError extends Error {
  constructor(reason?: string) {
    super(reason || 'Task skipped');
    this.name = 'SkipTaskError';
  }
}

export function registerHelper(name: string, fn: (...args: any[]) => any): void {
  const context = contextProvider.getStoreOrThrow();
  if (!context.helpers) {
    context.helpers = {};
  }
  context.helpers[name] = fn;
}

export function getHelper(name: string): ((...args: any[]) => any) | undefined {
  const context = contextProvider.getStoreOrThrow();
  return context.helpers?.[name];
}

export function template(template: string, data?: Variables): string {
  const vars = data || getVars();
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] !== undefined ? String(vars[key]) : match);
}

export function when(condition: boolean | (() => boolean)): boolean {
  if (typeof condition === 'function') {
    return condition();
  }
  return condition;
}

export function unless(condition: boolean | (() => boolean)): boolean {
  return !when(condition);
}

export function retry<T>(
  fn: () => T | Promise<T>,
  options?: {
    maxAttempts?: number;
    delay?: number;
    backoff?: number;
    onError?: (error: Error, attempt: number) => void;
  }
): Promise<T> {
  const {
    maxAttempts = 3,
    delay = 1000,
    backoff = 2,
    onError
  } = options || {};

  return new Promise<T>((resolve, reject) => {
    let lastError: Error;
    
    const attemptExecution = async () => {
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const result = await fn();
          resolve(result);
          return;
        } catch (error) {
          lastError = error as Error;
          
          if (onError) {
            onError(lastError, attempt);
          }
          
          if (attempt < maxAttempts) {
            const waitTime = delay * Math.pow(backoff, attempt - 1);
            debug(`Retry attempt ${attempt}/${maxAttempts} failed, waiting ${waitTime}ms`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
          }
        }
      }
      
      reject(lastError!);
    };
    
    attemptExecution().catch(reject);
  });
}

export function parallel<T>(
  tasks: Array<() => T | Promise<T>>,
  options?: {
    concurrency?: number;
    stopOnError?: boolean;
  }
): Promise<T[]> {
  const { concurrency = Infinity, stopOnError = true } = options || {};
  
  return new Promise<T[]>((resolve, reject) => {
    const results: T[] = [];
    const errors: Error[] = [];
    let completed = 0;
    let running = 0;
    let index = 0;
    let stopped = false;
    
    const runNext = async () => {
      if (stopped || index >= tasks.length) {
        return;
      }
      
      const taskIndex = index++;
      running++;
      
      try {
        const result = await tasks[taskIndex]();
        results[taskIndex] = result;
      } catch (error) {
        errors[taskIndex] = error as Error;
        if (stopOnError) {
          stopped = true;
          reject(error);
          return;
        }
      } finally {
        running--;
        completed++;
        
        if (completed === tasks.length) {
          if (errors.length > 0 && !stopOnError) {
            reject(new AggregateError(errors, 'Some tasks failed'));
          } else {
            resolve(results);
          }
        } else {
          runNext().catch(reject);
        }
      }
    };
    
    if (tasks.length === 0) {
      resolve([]);
      return;
    }
    
    const initialRuns = Math.min(concurrency, tasks.length);
    for (let i = 0; i < initialRuns; i++) {
      runNext().catch(reject);
    }
  });
}

class AggregateError extends Error {
  constructor(public errors: Error[], message?: string) {
    super(message);
    this.name = 'AggregateError';
  }
}