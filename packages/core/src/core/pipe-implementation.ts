import { promisify } from 'node:util';
import { Readable, Writable, pipeline, Transform } from 'node:stream';

import type { Command } from '../types/command.js';
import type { ExecutionResult } from './result.js';
import type { ExecutionEngine } from './execution-engine.js';
import type { PipeTarget, PipeOptions, ProcessPromise } from '../types/process.js';

export { PipeTarget, PipeOptions } from '../types/process.js';

const pipelineAsync = promisify(pipeline);

/**
 * Enhanced pipe implementation for ProcessPromise
 */
export async function executePipe(
  source: ProcessPromise | Promise<ExecutionResult>,
  target: PipeTarget,
  engine: ExecutionEngine,
  options: PipeOptions = {},
  ...templateArgs: any[]
): Promise<any> {
  const {
    throwOnError = true,
    encoding = 'utf8',
    lineByLine = true,
    lineSeparator = '\n'
  } = options;

  // Wait for source result
  const sourceResult = await source;

  // Check for errors
  if (throwOnError && sourceResult.exitCode !== 0) {
    throw new Error(`Previous command failed with exit code ${sourceResult.exitCode}`);
  }

  // Handle different target types

  // 1. Template literal
  if (Array.isArray(target) && 'raw' in target) {
    const command = interpolateTemplate(target as TemplateStringsArray, ...templateArgs);
    return engine.execute({
      command,
      stdin: sourceResult.stdout,
      shell: true
    });
  }

  // 2. String command
  if (typeof target === 'string') {
    return engine.execute({
      command: target,
      stdin: sourceResult.stdout,
      shell: true
    });
  }

  // 3. Command object
  if (isCommand(target)) {
    return engine.execute({
      ...target,
      stdin: sourceResult.stdout
    });
  }

  // 4. Another ProcessPromise
  if (isProcessPromise(target)) {
    // Chain the promises
    return target.then(async (targetCmd: any) => {
      if (typeof targetCmd === 'object' && targetCmd.command) {
        return engine.execute({
          ...targetCmd,
          stdin: sourceResult.stdout
        });
      }
      throw new Error('Invalid ProcessPromise target');
    });
  }

  // 5. Transform stream
  if (target instanceof Transform) {
    return pipeToTransform(sourceResult, target, encoding);
  }

  // 6. Writable stream
  if (isWritableStream(target)) {
    return pipeToWritable(sourceResult, target as Writable);
  }

  // 7. Function (line processor or conditional)
  if (typeof target === 'function') {
    // For line-by-line processing, just process the lines
    if (lineByLine) {
      return processLineByLine(sourceResult, target as (line: string) => void | Promise<void>, lineSeparator);
    }

    // Otherwise, try to determine if it's a conditional function
    // Conditional functions take ExecutionResult and return Command|string|null
    try {
      const testResult = await (target as any)(sourceResult);
      if (testResult && (typeof testResult === 'string' || isCommand(testResult))) {
        // It's a conditional function that returned a command
        const nextCommand = typeof testResult === 'string'
          ? { command: testResult, shell: true, stdin: sourceResult.stdout }
          : { ...testResult, stdin: sourceResult.stdout };

        return engine.execute(nextCommand);
      }
    } catch (e) {
      // If it fails, it might be a line processor expecting a string
    }

    // Fallback: treat as whole-text processor
    await (target as (text: string) => void | Promise<void>)(sourceResult.stdout);
    return sourceResult;
  }

  throw new Error(`Unsupported pipe target type: ${typeof target}`);
}

/**
 * Helper to interpolate template strings
 */
function interpolateTemplate(strings: TemplateStringsArray, ...values: any[]): string {
  let result = strings[0] || '';
  for (let i = 0; i < values.length; i++) {
    result += String(values[i]) + (strings[i + 1] || '');
  }
  return result;
}

/**
 * Check if object is a Command
 */
function isCommand(obj: any): obj is Command {
  return obj && typeof obj === 'object' &&
    (typeof obj.command === 'string' || Array.isArray(obj.args));
}

/**
 * Check if object is a ProcessPromise
 */
function isProcessPromise(obj: any): obj is ProcessPromise {
  return obj && typeof obj.then === 'function' &&
    typeof obj.pipe === 'function' &&
    typeof obj.nothrow === 'function';
}

/**
 * Check if object is a Writable stream
 */
function isWritableStream(obj: any): obj is Writable {
  return obj &&
    typeof obj.write === 'function' &&
    typeof obj.end === 'function' &&
    typeof obj.on === 'function';
}

/**
 * Pipe to a Transform stream
 */
async function pipeToTransform(
  result: ExecutionResult,
  transform: Transform,
  encoding: BufferEncoding
): Promise<ExecutionResult> {
  const chunks: Buffer[] = [];
  const input = Readable.from(result.stdout);

  await pipelineAsync(
    input,
    transform,
    new Writable({
      write(chunk, _, callback) {
        chunks.push(chunk);
        callback();
      }
    })
  );

  const output = Buffer.concat(chunks).toString(encoding);
  return {
    ...result,
    stdout: output
  };
}

/**
 * Pipe to a Writable stream
 */
async function pipeToWritable(
  result: ExecutionResult,
  writable: Writable
): Promise<ExecutionResult> {
  const input = Readable.from(result.stdout);
  await pipelineAsync(input, writable);
  return result;
}

/**
 * Process output line by line
 */
async function processLineByLine(
  result: ExecutionResult,
  processor: (line: string) => void | Promise<void>,
  separator: string
): Promise<ExecutionResult> {
  const lines = result.stdout.split(separator);

  for (const line of lines) {
    if (line.length > 0) {
      await processor(line);
    }
  }

  return result;
}

/**
 * Additional pipe utilities
 */
export const pipeUtils = {
  /**
   * Create a transform that converts to uppercase
   */
  toUpperCase(): Transform {
    return new Transform({
      transform(chunk, encoding, callback) {
        callback(null, chunk.toString().toUpperCase());
      }
    });
  },

  /**
   * Create a transform that filters lines
   */
  grep(pattern: string | RegExp): Transform {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    return new Transform({
      transform(chunk, encoding, callback) {
        const text = chunk.toString();
        const lines = text.split('\n');
        const filtered = lines.filter((line: string) => line && regex.test(line));
        const result = filtered.length > 0 ? filtered.join('\n') + '\n' : '';
        callback(null, result);
      }
    });
  },

  /**
   * Create a transform that replaces text
   */
  replace(search: string | RegExp, replacement: string): Transform {
    return new Transform({
      transform(chunk, encoding, callback) {
        const text = chunk.toString();
        const result = text.replace(search, replacement);
        callback(null, result);
      }
    });
  },

  /**
   * Tee - split output to multiple destinations
   */
  tee(...destinations: Writable[]): Transform {
    return new Transform({
      transform(chunk, encoding, callback) {
        // Write to all destinations
        for (const dest of destinations) {
          dest.write(chunk);
        }
        // Pass through
        callback(null, chunk);
      }
    });
  }
};