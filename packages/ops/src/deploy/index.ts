/** Deployment hooks and strategies using Xec's ordinary execution lifecycle. */
import { setTimeout as delay } from 'node:timers/promises';
import { dialectFor, quoteForShell, getExecutionSignal, withoutCancellation } from '@xec-sh/core';

import { HealthChecker } from '../health/index.js';
import { runOperation, type OperationExec } from '../utils/operation-scope.js';

export type DeployStrategy = 'rolling' | 'blue-green' | 'canary' | 'all-at-once';
export interface DeployHealthCheck {
  url?: string;
  command?: string;
  timeout?: number;
  retries?: number;
  interval?: number;
}
export interface DeployContext {
  target: string;
  version: string;
  previousVersion?: string;
  attempt: number;
  signal: AbortSignal;
  exec: OperationExec;
  healthCheck: () => Promise<boolean>;
  log: (message: string) => void;
}
export interface DeployHooks {
  beforeDeploy?: (ctx: DeployContext) => Promise<void>;
  deploy: (ctx: DeployContext) => Promise<void>;
  afterDeploy?: (ctx: DeployContext) => Promise<void>;
  verify?: (ctx: DeployContext) => Promise<boolean>;
  rollback?: (ctx: DeployContext) => Promise<void>;
  onError?: (ctx: DeployContext, error: Error) => Promise<void>;
}
export interface DeployConfig {
  name: string;
  targets: string[];
  strategy: DeployStrategy;
  maxConcurrent?: number;
  healthCheck?: DeployHealthCheck;
  hooks: DeployHooks;
  /** Per-target operation and recovery deadline. */
  timeout?: number;
  env?: Record<string, string>;
  cwd?: string;
  abortOnFirstFailure?: boolean;
}
export interface DeployTargetResult {
  target: string;
  success: boolean;
  duration: number;
  error?: string;
  rolledBack?: boolean;
  rollbackError?: string;
  handlerError?: string;
  skipped?: boolean;
}
export interface DeployResult {
  success: boolean;
  version: string;
  strategy: DeployStrategy;
  duration: number;
  targets: DeployTargetResult[];
  summary: { total: number; succeeded: number; failed: number; rolledBack: number };
}

export class Deployer {
  private currentVersion?: string;
  private previousVersion?: string;
  private lastResult?: DeployResult;
  private running = false;
  private constructor(private config: DeployConfig) {}

  static create(config: DeployConfig): Deployer {
    if (!config.targets?.length) throw new Error('Deployment needs at least one target');
    if (new Set(config.targets).size !== config.targets.length) throw new Error('Deployment targets must be unique');
    if (typeof config.hooks?.deploy !== 'function') throw new Error('Deployment needs a deploy hook');
    if (!['rolling', 'blue-green', 'canary', 'all-at-once'].includes(config.strategy))
      throw new Error(`Unknown deployment strategy: ${String(config.strategy)}`);
    if (config.maxConcurrent !== undefined && (!Number.isSafeInteger(config.maxConcurrent) || config.maxConcurrent < 1))
      throw new Error('Deployment concurrency must be a positive integer');
    if (config.timeout !== undefined && (!Number.isFinite(config.timeout) || config.timeout <= 0))
      throw new Error('Deployment timeout must be positive');
    const health = config.healthCheck;
    if (health && !health.url && !health.command) throw new Error('Health check needs a URL or command');
    if (health?.retries !== undefined && (!Number.isSafeInteger(health.retries) || health.retries < 1))
      throw new Error('Health check retries must be a positive integer');
    return new Deployer(config);
  }

  async deploy(version: string, options: { signal?: AbortSignal } = {}): Promise<DeployResult> {
    if (this.running) throw new Error('A deployment is already running');
    this.running = true;
    const start = Date.now();
    const signal = getExecutionSignal(options.signal);
    const results = new Map<string, DeployTargetResult>();
    const replacing = this.currentVersion;
    const deploy = async (target: string) => {
      const result = await this.deployTarget(target, version, replacing, signal);
      results.set(target, result);
    };
    const rolling = async (targets: string[]) => {
      let next = 0;
      await Promise.all(Array.from({ length: Math.min(this.config.maxConcurrent ?? 1, targets.length) }, async () => {
        while (next < targets.length && !signal?.aborted &&
          !(this.config.abortOnFirstFailure && [...results.values()].some(result => !result.success))) {
          const target = targets[next++]!;
          await deploy(target);
        }
      }));
    };
    try {
      if (this.config.strategy === 'canary') {
        if (!signal?.aborted) await deploy(this.config.targets[0]!);
        if (results.get(this.config.targets[0]!)?.success) await rolling(this.config.targets.slice(1));
      } else if (this.config.strategy === 'rolling') {
        await rolling(this.config.targets);
      } else {
        await Promise.all(this.config.targets.map(deploy));
      }
      const targets = this.config.targets.map(target => results.get(target) ?? {
        target, success: false, duration: 0, skipped: true,
        error: signal?.aborted ? 'Deployment cancelled' : 'Skipped after deployment failure',
      });
      const result: DeployResult = {
        success: !signal?.aborted && targets.every(target => target.success), version, strategy: this.config.strategy,
        duration: Date.now() - start, targets,
        summary: { total: targets.length, succeeded: targets.filter(target => target.success).length,
          failed: targets.filter(target => !target.success).length, rolledBack: targets.filter(target => target.rolledBack).length },
      };
      if (result.success) { this.previousVersion = replacing; this.currentVersion = version; }
      this.lastResult = result;
      return result;
    } finally { this.running = false; }
  }

  async rollback(options: { signal?: AbortSignal } = {}): Promise<DeployResult> {
    if (!this.lastResult) throw new Error('No previous deployment to rollback');
    if (!this.config.hooks.rollback) throw new Error('No rollback hook configured');
    const version = this.lastResult.success ? this.previousVersion : this.currentVersion;
    if (!version) throw new Error('No known-good version to roll back to');
    return this.deploy(version, options);
  }

  private async deployTarget(target: string, version: string, previousVersion?: string, signal?: AbortSignal): Promise<DeployTargetResult> {
    const start = Date.now();
    if (signal?.aborted) return { target, success: false, skipped: true, duration: 0, error: 'Deployment cancelled' };
    const operation = <T>(fn: (context: DeployContext) => Promise<T>, operationSignal?: AbortSignal) =>
      runOperation({ timeout: this.config.timeout, env: this.config.env, cwd: this.config.cwd, signal: operationSignal }, scope => fn({
        ...scope, target, version, previousVersion, attempt: 1,
        healthCheck: () => this.checkHealth(target, scope.signal),
        log: message => console.log(`[${this.config.name}][${target}] ${message}`),
      }));
    try {
      await operation(async context => {
        await this.config.hooks.beforeDeploy?.(context);
        await this.config.hooks.deploy(context);
        const healthy = this.config.hooks.verify ? await this.config.hooks.verify(context) : await context.healthCheck();
        if (!healthy) throw new Error('Health verification failed');
        await this.config.hooks.afterDeploy?.(context);
      }, signal);
      return { target, success: true, duration: Date.now() - start };
    } catch (error) {
      const result: DeployTargetResult = { target, success: false, duration: 0,
        error: error instanceof Error ? error.message : String(error) };
      if (this.config.hooks.rollback) {
        try {
          await withoutCancellation(() => operation(context => this.config.hooks.rollback!(context)));
          result.rolledBack = true;
        } catch (rollbackError) {
          result.rolledBack = false;
          result.rollbackError = rollbackError instanceof Error ? rollbackError.message : String(rollbackError);
        }
      }
      if (this.config.hooks.onError) {
        try {
          await withoutCancellation(() => operation(context => this.config.hooks.onError!(context,
            error instanceof Error ? error : new Error(String(error)))));
        } catch (handlerError) { result.handlerError = handlerError instanceof Error ? handlerError.message : String(handlerError); }
      }
      result.duration = Date.now() - start;
      return result;
    }
  }

  private async checkHealth(target: string, signal: AbortSignal): Promise<boolean> {
    const health = this.config.healthCheck;
    if (!health) return true;
    for (let attempt = 0; attempt < (health.retries ?? 3); attempt++) {
      signal.throwIfAborted();
      const checker = HealthChecker.create();
      if (health.url) checker.http(health.url.replaceAll('{{target}}', target), { timeout: health.timeout });
      if (health.command) checker.command(health.command.replaceAll('{{target}}', quoteForShell(target, dialectFor(true))), {
        timeout: health.timeout, env: this.config.env, cwd: this.config.cwd,
      });
      if ((await checker.run({ signal })).healthy) return true;
      if (attempt + 1 < (health.retries ?? 3)) await delay(health.interval ?? 2000, undefined, { signal });
    }
    return false;
  }
}
