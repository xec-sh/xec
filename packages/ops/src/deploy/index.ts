/**
 * Deployment engine — strategies, rollback, health verification.
 *
 * @example
 * ```typescript
 * import { Deployer } from '@xec-sh/ops/deploy';
 * import { $ } from '@xec-sh/core';
 *
 * const deployer = Deployer.create({
 *   name: 'api-service',
 *   targets: ['web-1', 'web-2', 'web-3'],
 *
 *   strategy: 'rolling',       // 'rolling' | 'blue-green' | 'canary' | 'all-at-once'
 *   maxConcurrent: 1,          // rolling: one at a time
 *   healthCheck: {
 *     url: 'http://{{target}}:8080/health',
 *     timeout: 10_000,
 *     retries: 3,
 *   },
 *
 *   hooks: {
 *     beforeDeploy: async (ctx) => { await ctx.exec`git tag v${ctx.version}`; },
 *     deploy: async (ctx) => { await ctx.exec`docker pull myapp:${ctx.version} && docker-compose up -d`; },
 *     afterDeploy: async (ctx) => { await ctx.exec`curl -X POST https://slack.webhook/deployed`; },
 *     rollback: async (ctx) => { await ctx.exec`docker-compose rollback`; },
 *     verify: async (ctx) => { return ctx.healthCheck(); },
 *   },
 * });
 *
 * const result = await deployer.deploy('v1.2.3');
 * if (!result.success) await deployer.rollback();
 * ```
 *
 * @module @xec-sh/ops/deploy
 */

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
  exec: (strings: TemplateStringsArray, ...values: unknown[]) => Promise<{ stdout: string; exitCode: number }>;
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
  timeout?: number;
  abortOnFirstFailure?: boolean;
}

export interface DeployTargetResult {
  target: string;
  success: boolean;
  duration: number;
  error?: string;
  rolledBack?: boolean;
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
  private previousVersion?: string;
  private lastResult?: DeployResult;

  private constructor(private config: DeployConfig) {}

  static create(config: DeployConfig): Deployer {
    return new Deployer(config);
  }

  async deploy(version: string): Promise<DeployResult> {
    const startTime = Date.now();
    const results: DeployTargetResult[] = [];

    const createContext = (target: string, attempt: number): DeployContext => ({
      target,
      version,
      previousVersion: this.previousVersion,
      attempt,
      exec: async (strings, ...values) => {
        const cmd = String.raw(strings, ...values);
        const { execSync } = await import('node:child_process');
        try {
          const stdout = execSync(cmd, { encoding: 'utf-8', timeout: this.config.timeout ?? 300_000 });
          return { stdout, exitCode: 0 };
        } catch (err: unknown) {
          return { stdout: '', exitCode: (err as { status?: number }).status ?? 1 };
        }
      },
      healthCheck: () => this.checkHealth(target),
      log: (msg) => console.log(`[${this.config.name}][${target}] ${msg}`),
    });

    switch (this.config.strategy) {
      case 'all-at-once':
        await this.deployAllAtOnce(version, results, createContext);
        break;
      case 'rolling':
        await this.deployRolling(version, results, createContext);
        break;
      case 'canary':
        await this.deployCanary(version, results, createContext);
        break;
      case 'blue-green':
        await this.deployBlueGreen(version, results, createContext);
        break;
    }

    const result: DeployResult = {
      success: results.every((r) => r.success),
      version,
      strategy: this.config.strategy,
      duration: Date.now() - startTime,
      targets: results,
      summary: {
        total: results.length,
        succeeded: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        rolledBack: results.filter((r) => r.rolledBack).length,
      },
    };

    this.previousVersion = version;
    this.lastResult = result;
    return result;
  }

  async rollback(): Promise<DeployResult> {
    if (!this.lastResult || !this.previousVersion) {
      throw new Error('No previous deployment to rollback');
    }
    if (!this.config.hooks.rollback) {
      throw new Error('No rollback hook configured');
    }

    return this.deploy(this.previousVersion);
  }

  private async deployAllAtOnce(
    version: string,
    results: DeployTargetResult[],
    createCtx: (target: string, attempt: number) => DeployContext
  ): Promise<void> {
    await Promise.all(
      this.config.targets.map((target) =>
        this.deployTarget(target, version, results, createCtx)
      )
    );
  }

  private async deployRolling(
    version: string,
    results: DeployTargetResult[],
    createCtx: (target: string, attempt: number) => DeployContext
  ): Promise<void> {
    const maxConcurrent = this.config.maxConcurrent ?? 1;
    const queue = [...this.config.targets];
    const running: Promise<void>[] = [];

    while (queue.length > 0 || running.length > 0) {
      while (running.length < maxConcurrent && queue.length > 0) {
        const target = queue.shift()!;
        const promise = this.deployTarget(target, version, results, createCtx).then(() => {
          running.splice(running.indexOf(promise), 1);
        });
        running.push(promise);
      }

      if (running.length > 0) {
        await Promise.race(running);
      }

      // Abort on first failure if configured
      if (this.config.abortOnFirstFailure && results.some((r) => !r.success)) {
        break;
      }
    }
  }

  private async deployCanary(
    version: string,
    results: DeployTargetResult[],
    createCtx: (target: string, attempt: number) => DeployContext
  ): Promise<void> {
    // Deploy to first target as canary
    const [canary, ...rest] = this.config.targets;
    if (!canary) return;

    await this.deployTarget(canary, version, results, createCtx);

    // If canary failed, don't proceed
    if (results.some((r) => !r.success)) return;

    // Deploy to remaining targets
    await this.deployRolling(version, results, (target, attempt) =>
      createCtx(target, attempt)
    );
  }

  private async deployBlueGreen(
    version: string,
    results: DeployTargetResult[],
    createCtx: (target: string, attempt: number) => DeployContext
  ): Promise<void> {
    // Deploy to all targets simultaneously (the "green" side)
    await this.deployAllAtOnce(version, results, createCtx);
    // Actual traffic switch would be in the deploy hook
  }

  private async deployTarget(
    target: string,
    version: string,
    results: DeployTargetResult[],
    createCtx: (target: string, attempt: number) => DeployContext
  ): Promise<void> {
    const start = Date.now();
    const ctx = createCtx(target, 1);

    try {
      if (this.config.hooks.beforeDeploy) {
        await this.config.hooks.beforeDeploy(ctx);
      }

      await this.config.hooks.deploy(ctx);

      if (this.config.hooks.verify) {
        const healthy = await this.config.hooks.verify(ctx);
        if (!healthy) throw new Error('Health verification failed');
      }

      if (this.config.hooks.afterDeploy) {
        await this.config.hooks.afterDeploy(ctx);
      }

      results.push({ target, success: true, duration: Date.now() - start });
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      let rolledBack = false;

      if (this.config.hooks.rollback) {
        try {
          await this.config.hooks.rollback(ctx);
          rolledBack = true;
        } catch {
          // Rollback failed — log but don't throw
        }
      }

      if (this.config.hooks.onError) {
        await this.config.hooks.onError(ctx, err instanceof Error ? err : new Error(error));
      }

      results.push({ target, success: false, duration: Date.now() - start, error, rolledBack });
    }
  }

  private async checkHealth(target: string): Promise<boolean> {
    const hc = this.config.healthCheck;
    if (!hc) return true;

    const retries = hc.retries ?? 3;
    const interval = hc.interval ?? 2000;

    for (let i = 0; i < retries; i++) {
      try {
        if (hc.url) {
          const url = hc.url.replace('{{target}}', target);
          const controller = new AbortController();
          const timeout = setTimeout(() => controller.abort(), hc.timeout ?? 10_000);
          const resp = await fetch(url, { signal: controller.signal });
          clearTimeout(timeout);
          if (resp.ok) return true;
        }

        if (hc.command) {
          const { execSync } = await import('node:child_process');
          execSync(hc.command.replace('{{target}}', target), {
            timeout: hc.timeout ?? 10_000,
            stdio: 'pipe',
          });
          return true;
        }
      } catch {
        if (i < retries - 1) await new Promise((r) => setTimeout(r, interval));
      }
    }

    return false;
  }
}
