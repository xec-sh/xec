import { Readable, Writable, Transform } from 'node:stream';

import type { Command } from '../core/command.js';
import type { ExecutionResult } from '../core/result.js';
import type { CallableExecutionEngine } from '../types/engine.js';
import type { ExecutionEngine } from '../core/execution-engine.js';

export interface PipeOptions {
  encoding?: BufferEncoding;
  throwOnError?: boolean;
}

export class PipeableResult implements Promise<ExecutionResult> {
  private result: Promise<ExecutionResult>;
  private engine: ExecutionEngine | CallableExecutionEngine;

  constructor(result: Promise<ExecutionResult>, engine: ExecutionEngine | CallableExecutionEngine) {
    this.result = result;
    this.engine = engine;
  }

  // Promise implementation
  then<TResult1 = ExecutionResult, TResult2 = never>(
    onfulfilled?: ((value: ExecutionResult) => TResult1 | PromiseLike<TResult1>) | undefined | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | undefined | null
  ): Promise<TResult1 | TResult2> {
    return this.result.then(onfulfilled, onrejected);
  }

  catch<TResult = never>(
    onrejected?: ((reason: any) => TResult | PromiseLike<TResult>) | undefined | null
  ): Promise<ExecutionResult | TResult> {
    return this.result.catch(onrejected);
  }

  finally(onfinally?: (() => void) | undefined | null): Promise<ExecutionResult> {
    return this.result.finally(onfinally);
  }

  get [Symbol.toStringTag]() {
    return 'PipeableResult';
  }

  pipe(command: string | Command | Transform, options: PipeOptions = {}): PipeableResult {
    const nextResult = this.result.then(async (prevResult) => {
      if (prevResult.exitCode !== 0 && options.throwOnError !== false) {
        throw new Error(`Previous command failed with exit code ${prevResult.exitCode}`);
      }

      if (command instanceof Transform) {
        return this.pipeToTransform(prevResult, command, options);
      }

      const nextCommand: Command = typeof command === 'string'
        ? { command, stdin: prevResult.stdout }
        : { ...command, stdin: prevResult.stdout };

      return this.engine.execute(nextCommand);
    });

    return new PipeableResult(nextResult, this.engine);
  }

  private async pipeToTransform(
    result: ExecutionResult,
    transform: Transform,
    options: PipeOptions
  ): Promise<ExecutionResult> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];

      transform.on('data', (chunk) => chunks.push(chunk));
      transform.on('error', reject);
      transform.on('end', () => {
        const output = Buffer.concat(chunks).toString(options.encoding || 'utf8');
        resolve({
          ...result,
          stdout: output,
          stderr: '',
        });
      });

      const input = Readable.from(result.stdout);
      input.pipe(transform);
    });
  }

  async toStream(stream: Writable, options: PipeOptions = {}): Promise<ExecutionResult> {
    const result = await this.result;

    if (result.exitCode !== 0 && options.throwOnError !== false) {
      throw new Error(`Command failed with exit code ${result.exitCode}`);
    }

    return new Promise((resolve, reject) => {
      const input = Readable.from(result.stdout);

      stream.on('error', reject);
      stream.on('finish', () => resolve(result));

      input.pipe(stream);
    });
  }

  async text(): Promise<string> {
    const result = await this.result;
    return result.stdout.trim();
  }

  async json<T = any>(): Promise<T> {
    const text = await this.text();
    return JSON.parse(text);
  }

  async lines(): Promise<string[]> {
    const text = await this.text();
    return text.split('\n').filter(line => line.length > 0);
  }

  async buffer(): Promise<Buffer> {
    const result = await this.result;
    return Buffer.from(result.stdout);
  }
}


export function pipe(
  commands: Array<string | Command | Transform>,
  engine: ExecutionEngine | CallableExecutionEngine,
  options: PipeOptions = {}
): PipeableResult {
  if (commands.length === 0) {
    throw new Error('At least one command is required for pipe');
  }

  const [first, ...rest] = commands;

  let result: PipeableResult;

  if (first instanceof Transform) {
    throw new Error('First element in pipe cannot be a Transform');
  }

  if (typeof first === 'string') {
    const firstCommand: Command = { command: first };
    result = new PipeableResult(engine.execute(firstCommand), engine);
  } else {
    const firstCommand: Command = first as Command;
    result = new PipeableResult(engine.execute(firstCommand), engine);
  }

  for (const cmd of rest) {
    result = result.pipe(cmd, options);
  }

  return result;
}