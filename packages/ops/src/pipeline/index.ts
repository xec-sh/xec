/**
 * Pipeline engine — define and execute multi-step CI/CD pipelines
 * with matrix builds, caching, conditional execution, and artifacts.
 *
 * @example
 * ```typescript
 * import { Pipeline } from '@xec-sh/ops/pipeline';
 *
 * const pipeline = Pipeline.create('ci')
 *   .env({ NODE_ENV: 'test' })
 *   .step('install', { run: 'pnpm install', cache: 'node_modules' })
 *   .step('lint', { run: 'pnpm lint', dependsOn: ['install'] })
 *   .step('test', {
 *     run: 'pnpm test',
 *     dependsOn: ['install'],
 *     matrix: { node: ['18', '20', '22'] },
 *     retry: { maxAttempts: 2 },
 *   })
 *   .step('build', { run: 'pnpm build', dependsOn: ['lint', 'test'] })
 *   .step('deploy', {
 *     run: 'pnpm deploy',
 *     dependsOn: ['build'],
 *     condition: (ctx) => ctx.branch === 'main',
 *   });
 *
 * const result = await pipeline.run({ branch: 'main' });
 * ```
 *
 * @module @xec-sh/ops/pipeline
 */

import { execSync } from 'node:child_process';

export interface StepConfig {
  run: string | ((ctx: PipelineContext) => Promise<void>);
  dependsOn?: string[];
  condition?: (ctx: PipelineContext) => boolean;
  timeout?: number;
  retry?: { maxAttempts: number; delay?: number };
  matrix?: Record<string, string[]>;
  cache?: string;
  env?: Record<string, string>;
  continueOnError?: boolean;
  workingDirectory?: string;
}

export interface StepResult {
  name: string;
  success: boolean;
  duration: number;
  exitCode: number;
  stdout: string;
  stderr: string;
  error?: string;
  matrixKey?: string;
  skipped?: boolean;
  cached?: boolean;
}

export interface PipelineContext {
  branch?: string;
  commit?: string;
  env: Record<string, string>;
  outputs: Record<string, string>;
  [key: string]: unknown;
}

export interface PipelineResult {
  name: string;
  success: boolean;
  duration: number;
  steps: StepResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
}

interface InternalStep {
  name: string;
  config: StepConfig;
}

export class Pipeline {
  private steps: InternalStep[] = [];
  private globalEnv: Record<string, string> = {};
  private pipelineName: string;

  private constructor(name: string) {
    this.pipelineName = name;
  }

  static create(name: string): Pipeline {
    return new Pipeline(name);
  }

  /** Set global environment variables */
  env(vars: Record<string, string>): this {
    Object.assign(this.globalEnv, vars);
    return this;
  }

  /** Add a step to the pipeline */
  step(name: string, config: StepConfig): this {
    this.steps.push({ name, config });
    return this;
  }

  /** Execute the pipeline */
  async run(context: Partial<PipelineContext> = {}): Promise<PipelineResult> {
    const startTime = Date.now();
    const ctx: PipelineContext = {
      env: { ...process.env as Record<string, string>, ...this.globalEnv },
      outputs: {},
      ...context,
    };

    const results: StepResult[] = [];
    const completed = new Set<string>();

    // Topological execution respecting dependencies
    const remaining = [...this.steps];
    let progress = true;

    while (remaining.length > 0 && progress) {
      progress = false;

      for (let i = 0; i < remaining.length; i++) {
        const step = remaining[i]!;
        const deps = step.config.dependsOn ?? [];
        const depsReady = deps.every((d) => completed.has(d));
        if (!depsReady) continue;

        // Check if any dependency failed (skip unless continueOnError)
        const depFailed = deps.some((d) => results.find((r) => r.name === d && !r.success && !r.skipped));
        if (depFailed && !step.config.continueOnError) {
          results.push({
            name: step.name,
            success: false,
            duration: 0,
            exitCode: -1,
            stdout: '',
            stderr: '',
            skipped: true,
            error: 'Skipped due to dependency failure',
          });
          completed.add(step.name);
          remaining.splice(i, 1);
          i--;
          progress = true;
          continue;
        }

        // Check condition
        if (step.config.condition && !step.config.condition(ctx)) {
          results.push({
            name: step.name,
            success: true,
            duration: 0,
            exitCode: 0,
            stdout: '',
            stderr: '',
            skipped: true,
          });
          completed.add(step.name);
          remaining.splice(i, 1);
          i--;
          progress = true;
          continue;
        }

        // Matrix expansion
        if (step.config.matrix) {
          const matrixResults = await this.runMatrix(step, ctx);
          results.push(...matrixResults);
        } else {
          const result = await this.runStep(step, ctx);
          results.push(result);
        }

        completed.add(step.name);
        remaining.splice(i, 1);
        i--;
        progress = true;
      }
    }

    // Mark unprocessed steps (circular deps) as failed
    for (const step of remaining) {
      results.push({
        name: step.name,
        success: false,
        duration: 0,
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: 'Circular dependency or unresolvable dependency',
      });
    }

    const success = results.every((r) => r.success || r.skipped);
    return {
      name: this.pipelineName,
      success,
      duration: Date.now() - startTime,
      steps: results,
      summary: {
        total: results.length,
        passed: results.filter((r) => r.success && !r.skipped).length,
        failed: results.filter((r) => !r.success && !r.skipped).length,
        skipped: results.filter((r) => r.skipped).length,
      },
    };
  }

  private async runMatrix(step: InternalStep, ctx: PipelineContext): Promise<StepResult[]> {
    const matrix = step.config.matrix!;
    const keys = Object.keys(matrix);
    const combinations = this.cartesian(keys.map((k) => matrix[k]!));

    const results: StepResult[] = [];
    for (const combo of combinations) {
      const matrixEnv: Record<string, string> = {};
      keys.forEach((k, i) => { matrixEnv[k] = combo[i]!; });
      const matrixKey = keys.map((k, i) => `${k}=${combo[i]}`).join(', ');

      const matrixCtx: PipelineContext = {
        ...ctx,
        env: { ...ctx.env, ...matrixEnv },
      };

      const result = await this.runStep(step, matrixCtx);
      result.matrixKey = matrixKey;
      result.name = `${step.name} [${matrixKey}]`;
      results.push(result);
    }
    return results;
  }

  private async runStep(step: InternalStep, ctx: PipelineContext): Promise<StepResult> {
    const startTime = Date.now();
    const maxAttempts = step.config.retry?.maxAttempts ?? 1;
    const retryDelay = step.config.retry?.delay ?? 1000;
    const env = { ...ctx.env, ...this.globalEnv, ...step.config.env };

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        if (typeof step.config.run === 'function') {
          await step.config.run(ctx);
          return { name: step.name, success: true, duration: Date.now() - startTime, exitCode: 0, stdout: '', stderr: '' };
        }

        const stdout = execSync(step.config.run, {
          encoding: 'utf-8',
          timeout: step.config.timeout ?? 600_000,
          env,
          cwd: step.config.workingDirectory,
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        return { name: step.name, success: true, duration: Date.now() - startTime, exitCode: 0, stdout, stderr: '' };
      } catch (err: unknown) {
        if (attempt === maxAttempts) {
          const error = err instanceof Error ? err.message : String(err);
          const exitCode = (err as { status?: number }).status ?? 1;
          const stderr = (err as { stderr?: string | Buffer }).stderr?.toString() ?? '';
          const stdout = (err as { stdout?: string | Buffer }).stdout?.toString() ?? '';

          if (step.config.continueOnError) {
            return { name: step.name, success: true, duration: Date.now() - startTime, exitCode, stdout, stderr, error };
          }
          return { name: step.name, success: false, duration: Date.now() - startTime, exitCode, stdout, stderr, error };
        }
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }

    return { name: step.name, success: false, duration: Date.now() - startTime, exitCode: -1, stdout: '', stderr: '', error: 'Exhausted retries' };
  }

  private cartesian(arrays: string[][]): string[][] {
    if (arrays.length === 0) return [[]];
    const [first, ...rest] = arrays;
    const restCartesian = this.cartesian(rest);
    return first!.flatMap((item) => restCartesian.map((combo) => [item, ...combo]));
  }
}
