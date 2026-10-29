/** Asynchronous, observable pipelines built on the Xec execution engine. */
import { Writable } from 'node:stream';
import { finished } from 'node:stream/promises';
import { StringDecoder } from 'node:string_decoder';
import { setTimeout as delay } from 'node:timers/promises';
import { type Command, ExecutionEngine, type ExecutionResult } from '@xec-sh/core';

export type PipelineCommandResult = Pick<ExecutionResult, 'exitCode' | 'stdout' | 'stderr'>;
export interface StepConfig {
  run: string | Command | ((ctx: PipelineContext) => Promise<void | PipelineCommandResult>);
  dependsOn?: string[];
  condition?: (ctx: PipelineContext) => boolean;
  /** Commands are terminated on timeout. Function steps must cooperate with context.signal. */
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
  cancelled?: boolean;
  continued?: boolean;
  attempts?: number;
  outputTruncated?: boolean;
}
export interface PipelineContext {
  branch?: string;
  commit?: string;
  env: Record<string, string>;
  outputs: Record<string, string>;
  /** Function steps must cooperate with this signal; script processes are isolated by their runner. */
  signal?: AbortSignal;
  [key: string]: unknown;
}
export interface PipelineResult {
  name: string;
  success: boolean;
  status: 'success' | 'failed' | 'cancelled';
  duration: number;
  steps: StepResult[];
  summary: { total: number; passed: number; failed: number; skipped: number };
}
export type PipelineEvent =
  | { type: 'step-start'; step: string; at: number; attempt: number }
  | { type: 'step-output'; step: string; at: number; attempt: number; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'step-complete'; step: string; at: number; result: StepResult };
export interface PipelineRunOptions {
  signal?: AbortSignal;
  /** Maximum simultaneously running step groups. Matrix variants share their group's slot. */
  concurrency?: number;
  /** Retained bytes per output stream. Streaming observers still receive every chunk. */
  outputLimit?: number;
  /** Called with backpressure. A failed observer cancels the run and rejects it. */
  onEvent?: (event: PipelineEvent) => void | Promise<void>;
  /** Embed an existing Xec engine with the host's adapters, credentials and telemetry. */
  execute?: (command: Command) => Promise<PipelineCommandResult>;
}
interface InternalStep { name: string; config: StepConfig }

class OutputTail {
  private decoder = new StringDecoder('utf8');
  text = '';
  truncated = false;
  constructor(private readonly limit: number) {}
  append(chunk: Buffer | string): string {
    const decoded = this.decoder.write(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    this.text += decoded;
    if (Buffer.byteLength(this.text) > this.limit) {
      this.text = Buffer.from(this.text).subarray(-this.limit).toString('utf8').replace(/^\uFFFD/, '');
      this.truncated = true;
    }
    return decoded;
  }
}

export class Pipeline {
  private steps: InternalStep[] = [];
  private globalEnv: Record<string, string> = {};
  private constructor(private readonly pipelineName: string) {}
  static create(name: string): Pipeline { return new Pipeline(name); }
  env(vars: Record<string, string>): this { Object.assign(this.globalEnv, vars); return this; }
  step(name: string, config: StepConfig): this { this.steps.push({ name, config }); return this; }

  /** Reject invalid graphs before any command or callback can execute. */
  validate(): void {
    const names = new Set<string>();
    for (const { name, config } of this.steps) {
      if (!name.trim() || names.has(name)) throw new Error(`Invalid or duplicate pipeline step: ${name}`);
      names.add(name);
      if (config.timeout !== undefined && (!Number.isFinite(config.timeout) || config.timeout <= 0))
        throw new Error(`Invalid timeout for step ${name}`);
      if (config.retry && (!Number.isInteger(config.retry.maxAttempts) || config.retry.maxAttempts < 1 ||
          (config.retry.delay !== undefined && (!Number.isFinite(config.retry.delay) || config.retry.delay < 0))))
        throw new Error(`Invalid retry policy for step ${name}`);
      let variants = 1;
      for (const values of Object.values(config.matrix ?? {})) {
        if (!Array.isArray(values) || !values.length || values.some(v => typeof v !== 'string'))
          throw new Error(`Invalid matrix for step ${name}`);
        variants *= values.length;
      }
      if (variants > 10_000) throw new Error(`Matrix for step ${name} exceeds 10000 variants`);
    }
    const pending = new Set(names);
    for (const { name, config } of this.steps)
      for (const dependency of config.dependsOn ?? [])
        if (!names.has(dependency)) throw new Error(`Step ${name} depends on unknown step ${dependency}`);
    while (pending.size) {
      const ready = this.steps.filter(s => pending.has(s.name) &&
        (s.config.dependsOn ?? []).every(d => !pending.has(d)));
      if (!ready.length) throw new Error(`Circular pipeline dependency: ${[...pending].join(', ')}`);
      for (const step of ready) pending.delete(step.name);
    }
  }

  async run(context: Partial<PipelineContext> = {}, options: PipelineRunOptions = {}): Promise<PipelineResult> {
    this.validate();
    const concurrency = options.concurrency ?? 1;
    const outputLimit = options.outputLimit ?? 1024 * 1024;
    if (!Number.isInteger(concurrency) || concurrency < 1) throw new Error('Concurrency must be a positive integer');
    if (!Number.isSafeInteger(outputLimit) || outputLimit < 1) throw new Error('Output limit must be a positive integer');
    const started = Date.now();
    const observerAbort = new AbortController();
    const signal = options.signal ? AbortSignal.any([options.signal, observerAbort.signal]) : observerAbort.signal;
    let observerError: unknown;
    const emit = async (event: PipelineEvent) => {
      try { await options.onEvent?.(event); }
      catch (error) { observerError = error; observerAbort.abort(error); throw error; }
    };
    const ctx: PipelineContext = {
      ...context,
      env: { ...process.env as Record<string, string>, ...this.globalEnv, ...context.env },
      outputs: { ...context.outputs }, signal,
    };
    const groups = this.steps.map(s => ({ name: s.name, config: { ...s.config } }));
    const pending = new Set(groups.map(s => s.name));
    const results = new Map<string, StepResult[]>();
    const running = new Map<string, Promise<void>>();
    let engine: ExecutionEngine | undefined;
    const execute = options.execute ?? ((command: Command) => {
      engine ??= new ExecutionEngine();
      return engine.execute(command);
    });
    const skipped = (name: string, error: string, cancelled = false): StepResult => ({
      name, success: false, duration: 0, exitCode: -1, stdout: '', stderr: '', skipped: true,
      error, ...(cancelled ? { cancelled: true } : {}),
    });
    const finishGroup = async (name: string, value: StepResult[]) => {
      for (const result of value) await emit({ type: 'step-complete', step: result.name, at: Date.now(), result });
      results.set(name, value);
      ctx.outputs[name] = value.map(r => r.stdout).join('');
    };
    try {
      while (pending.size || running.size) {
        for (const step of groups) {
          if (!pending.has(step.name) || running.size >= concurrency || signal.aborted) continue;
          const dependencies = step.config.dependsOn ?? [];
          if (!dependencies.every(d => results.has(d))) continue;
          pending.delete(step.name);
          const dependencyFailed = dependencies.some(d => results.get(d)!.some(r => !r.success));
          if (dependencyFailed && !step.config.continueOnError) {
            await finishGroup(step.name, [skipped(step.name, 'Skipped due to dependency failure')]);
            continue;
          }
          const task = (async () => {
            let value: StepResult[];
            try {
              if (step.config.condition && !step.config.condition(ctx)) {
                value = [{ ...skipped(step.name, 'Condition not met'), success: true, exitCode: 0 }];
              } else {
                const variants = Object.entries(step.config.matrix ?? {}).reduce<Array<Record<string, string>>>(
                  (rows, [key, values]) => rows.flatMap(row => values.map(v => ({ ...row, [key]: v }))), [{}]);
                value = [];
                for (const variables of variants) {
                  const matrixKey = Object.entries(variables).map(([k, v]) => `${k}=${v}`).join(', ');
                  const name = matrixKey ? `${step.name} [${matrixKey}]` : step.name;
                  const result = signal.aborted ? skipped(name, 'Execution aborted', true) :
                    await this.runStep(name, step.config, { ...ctx, env: { ...ctx.env, ...variables } },
                      signal, outputLimit, execute, emit);
                  value.push({ ...result, ...(matrixKey ? { matrixKey } : {}) });
                }
              }
            } catch (error) {
              value = [{ ...skipped(step.name, error instanceof Error ? error.message : String(error)), skipped: false }];
            }
            await finishGroup(step.name, value);
          })();
          // Register a rejection handler immediately, even when another task wins Promise.race.
          const tracked = task.catch(error => { observerError ??= error; observerAbort.abort(error); })
            .finally(() => { running.delete(step.name); });
          running.set(step.name, tracked);
        }
        if (running.size) await Promise.race(running.values());
        else if (signal.aborted) break;
        else if (pending.size) throw new Error('Pipeline graph could not make progress');
      }
      await Promise.all(running.values());
      if (observerError !== undefined) throw observerError;
      for (const name of pending) await finishGroup(name, [skipped(name, 'Execution aborted', true)]);
      const steps = groups.flatMap(s => results.get(s.name) ?? []);
      const status = signal.aborted ? 'cancelled' : steps.every(r => r.success) ? 'success' : 'failed';
      return {
        name: this.pipelineName, success: status === 'success', status, duration: Date.now() - started, steps,
        summary: { total: steps.length, passed: steps.filter(r => r.success && !r.skipped).length,
          failed: steps.filter(r => !r.success && !r.skipped).length, skipped: steps.filter(r => r.skipped).length },
      };
    } finally {
      observerAbort.abort();
      await Promise.allSettled(running.values());
      await engine?.dispose();
    }
  }

  private async runStep(
    name: string, config: StepConfig, ctx: PipelineContext, signal: AbortSignal, outputLimit: number,
    execute: (command: Command) => Promise<PipelineCommandResult>,
    emit: (event: PipelineEvent) => Promise<void>,
  ): Promise<StepResult> {
    const started = Date.now();
    const maxAttempts = config.retry?.maxAttempts ?? 1;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const stdout = new OutputTail(outputLimit);
      const stderr = new OutputTail(outputLimit);
      let exitCode = -1;
      let failure: unknown;
      try {
        signal.throwIfAborted();
        await emit({ type: 'step-start', step: name, at: Date.now(), attempt });
        let answer: void | PipelineCommandResult;
        if (typeof config.run === 'function') {
          const functionSignal = config.timeout === undefined ? signal : AbortSignal.any([signal, AbortSignal.timeout(config.timeout)]);
          answer = await config.run({ ...ctx, env: { ...ctx.env, ...config.env }, signal: functionSignal });
          functionSignal.throwIfAborted();
        } else {
          const command: Command = typeof config.run === 'string' ? { command: config.run, shell: true } : config.run;
          const commandSignal = command.signal ? AbortSignal.any([signal, command.signal]) : signal;
          const streams = (['stdout', 'stderr'] as const).map(stream => {
            const tail = stream === 'stdout' ? stdout : stderr;
            return new Writable({ write(chunk: Buffer, _encoding, callback) {
              const text = tail.append(chunk);
              emit({ type: 'step-output', step: name, at: Date.now(), attempt, stream, text })
                .then(() => callback(), error => callback(error instanceof Error ? error : new Error(String(error))));
            } });
          });
          // Attach error handlers before handing the streams to an adapter.
          const drained = Promise.all(streams.map(s => finished(s, { cleanup: true })));
          void drained.catch(() => undefined);
          try {
            answer = await execute({ ...command, shell: command.shell ?? false, env: { ...ctx.env, ...config.env, ...command.env },
              cwd: command.cwd ?? config.workingDirectory, timeout: command.timeout ?? config.timeout ?? 600_000,
              signal: commandSignal, stdout: streams[0]!, stderr: streams[1]!, throwOnNonZeroExit: false, nothrow: true });
          } finally {
            for (const stream of streams) if (!stream.writableEnded && !stream.destroyed) stream.end();
            await drained;
          }
        }
        if (answer?.stdout && !stdout.text) stdout.append(answer.stdout);
        if (answer?.stderr && !stderr.text) stderr.append(answer.stderr);
        exitCode = answer?.exitCode ?? 0;
        signal.throwIfAborted();
        if (exitCode !== 0) throw new Error(`Command exited with code ${exitCode}`);
        return { name, success: true, duration: Date.now() - started, exitCode, stdout: stdout.text, stderr: stderr.text,
          attempts: attempt, outputTruncated: stdout.truncated || stderr.truncated };
      } catch (error) { failure = error; }
      if (attempt === maxAttempts || signal.aborted) {
        return { name, success: !signal.aborted && config.continueOnError === true, duration: Date.now() - started,
          exitCode, stdout: stdout.text, stderr: stderr.text,
          error: failure instanceof Error ? failure.message : String(failure), attempts: attempt,
          outputTruncated: stdout.truncated || stderr.truncated,
          ...(signal.aborted ? { cancelled: true } : {}), ...(config.continueOnError ? { continued: true } : {}) };
      }
      try { await delay(config.retry?.delay ?? 1000, undefined, { signal }); }
      catch { return { name, success: false, duration: Date.now() - started, exitCode, stdout: stdout.text,
        stderr: stderr.text, error: 'Execution aborted', cancelled: true, attempts: attempt }; }
    }
    throw new Error(`Step ${name} exhausted its retry policy`);
  }
}
