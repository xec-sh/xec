import { Command } from '../core/command.js';
import { ExecutionResult } from '../core/result.js';
import { ExecutionEngine } from '../core/execution-engine.js';

export type PipelineStage = Command | ((result: ExecutionResult) => Command | null);
export type PipelineTransform = (result: ExecutionResult) => any;

export interface PipelineOptions {
  /**
   * Whether to stop the pipeline on first error
   */
  stopOnError?: boolean;
  
  /**
   * Whether to collect all results or just the last one
   */
  collectResults?: boolean;
  
  /**
   * Progress reporting for pipeline stages
   */
  progress?: {
    enabled?: boolean;
    onStageStart?: (stage: number, total: number, description?: string) => void;
    onStageComplete?: (stage: number, total: number, result: ExecutionResult) => void;
    onPipelineComplete?: (results: ExecutionResult[]) => void;
  };
  
  /**
   * Concurrency limit for parallel stages
   */
  concurrency?: number;
}

export class Pipeline {
  private stages: PipelineStage[] = [];
  private transforms: Map<number, PipelineTransform> = new Map();
  
  constructor(
    private engine: ExecutionEngine,
    private options: PipelineOptions = {}
  ) {
    this.options = {
      stopOnError: true,
      collectResults: false,
      concurrency: 1,
      ...options
    };
  }
  
  /**
   * Add a command stage to the pipeline
   */
  add(command: Command | string): Pipeline {
    if (typeof command === 'string') {
      this.stages.push({ command, shell: true });
    } else {
      this.stages.push(command);
    }
    return this;
  }
  
  /**
   * Add a conditional stage that depends on previous result
   */
  addConditional(fn: (result: ExecutionResult) => Command | null): Pipeline {
    this.stages.push(fn);
    return this;
  }
  
  /**
   * Add a transform to process the result of a specific stage
   */
  transform(stageIndex: number, fn: PipelineTransform): Pipeline {
    this.transforms.set(stageIndex, fn);
    return this;
  }
  
  /**
   * Execute the pipeline
   */
  async execute(): Promise<ExecutionResult | ExecutionResult[]> {
    const results: ExecutionResult[] = [];
    let lastResult: ExecutionResult | null = null;
    
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      
      // Report stage start
      if (this.options.progress?.onStageStart) {
        const description = typeof stage === 'function' ? 'Conditional stage' :
                          stage && typeof stage.command === 'string' ? stage.command : 'Command stage';
        this.options.progress.onStageStart(i + 1, this.stages.length, description);
      }
      
      try {
        // Determine the command to execute
        let command: Command | null;
        if (typeof stage === 'function') {
          command = lastResult ? stage(lastResult) : null;
          if (!command) continue; // Skip if conditional returns null
        } else {
          command = stage ?? null;
        }
        
        // Pass previous result as stdin if it's stdout
        if (lastResult && command && !command.stdin) {
          command = { ...command, stdin: lastResult.stdout };
        }
        
        // Execute the command
        if (!command) continue;
        const result = await this.engine.execute(command);
        lastResult = result;
        
        // Apply transform if defined
        const transform = this.transforms.get(i);
        if (transform) {
          transform(result);
        }
        
        // Collect result if needed
        if (this.options.collectResults) {
          results.push(result);
        }
        
        // Report stage completion
        if (this.options.progress?.onStageComplete) {
          this.options.progress.onStageComplete(i + 1, this.stages.length, result);
        }
      } catch (error) {
        if (this.options.stopOnError) {
          throw error;
        }
        // Continue to next stage if not stopping on error
      }
    }
    
    // Report pipeline completion
    if (this.options.progress?.onPipelineComplete) {
      this.options.progress.onPipelineComplete(results);
    }
    
    return this.options.collectResults ? results : lastResult!;
  }
  
  /**
   * Execute stages in parallel where possible
   */
  async executeParallel(): Promise<ExecutionResult[]> {
    const groups = this.groupParallelStages();
    const allResults: ExecutionResult[] = [];
    
    for (const group of groups) {
      const groupResults = await this.executeGroup(group, allResults);
      allResults.push(...groupResults);
    }
    
    return allResults;
  }
  
  private groupParallelStages(): number[][] {
    const groups: number[][] = [];
    let currentGroup: number[] = [];
    
    for (let i = 0; i < this.stages.length; i++) {
      const stage = this.stages[i];
      
      // Conditional stages always start a new group
      if (typeof stage === 'function') {
        if (currentGroup.length > 0) {
          groups.push(currentGroup);
          currentGroup = [];
        }
        groups.push([i]);
      } else {
        currentGroup.push(i);
      }
    }
    
    if (currentGroup.length > 0) {
      groups.push(currentGroup);
    }
    
    return groups;
  }
  
  private async executeGroup(indices: number[], previousResults: ExecutionResult[]): Promise<ExecutionResult[]> {
    const concurrency = Math.min(this.options.concurrency || 1, indices.length);
    const results: ExecutionResult[] = [];
    
    for (let i = 0; i < indices.length; i += concurrency) {
      const batch = indices.slice(i, i + concurrency);
      const batchPromises = batch.map(async (index) => {
        const stage = this.stages[index];
        
        if (typeof stage === 'function') {
          const lastResult = previousResults[previousResults.length - 1];
          const command = lastResult ? stage(lastResult) : null;
          if (!command) return null;
          return this.engine.execute(command);
        } else {
          return this.engine.execute(stage as Command);
        }
      });
      
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults.filter((r): r is ExecutionResult => r !== null));
    }
    
    return results;
  }
}

/**
 * Pipe operator - chains commands together passing stdout to stdin
 */
export function pipeOperator(...commands: (Command | string)[]): Pipeline {
  const engine = new ExecutionEngine();
  const pipeline = new Pipeline(engine);
  
  for (const cmd of commands) {
    pipeline.add(cmd);
  }
  
  return pipeline;
}

/**
 * Tee operator - splits output to multiple destinations
 */
export async function teeOperator(
  command: Command | string,
  ...destinations: ((data: string) => void)[]
): Promise<ExecutionResult> {
  const engine = new ExecutionEngine();
  const cmd = typeof command === 'string' ? { command, shell: true } : command;
  
  // Create a custom command with output handlers
  const teeCommand: Command = {
    ...cmd,
    progress: {
      enabled: true,
      onProgress: (event) => {
        if (event.type === 'progress' && event.data) {
          const data = event.data.toString();
          destinations.forEach(dest => dest(data));
        }
      }
    }
  };
  
  const result = await engine.execute(teeCommand);
  
  // Also send the final output to destinations
  if (result.stdout) {
    destinations.forEach(dest => dest(result.stdout));
  }
  
  return result;
}

/**
 * Conditional operator - executes command based on condition
 */
export async function conditionalOperator(
  condition: boolean | (() => boolean | Promise<boolean>),
  trueCommand: Command | string,
  falseCommand?: Command | string
): Promise<ExecutionResult | null> {
  const engine = new ExecutionEngine();
  
  const shouldExecute = typeof condition === 'function' ? await condition() : condition;
  
  if (shouldExecute) {
    const cmd = typeof trueCommand === 'string' ? { command: trueCommand, shell: true } : trueCommand;
    return engine.execute(cmd);
  } else if (falseCommand) {
    const cmd = typeof falseCommand === 'string' ? { command: falseCommand, shell: true } : falseCommand;
    return engine.execute(cmd);
  }
  
  return null;
}

/**
 * Map operator - applies a command to each line of input
 */
export async function mapOperator(
  input: string | string[],
  command: (line: string) => Command | string,
  options?: { concurrency?: number }
): Promise<ExecutionResult[]> {
  const engine = new ExecutionEngine();
  const lines = Array.isArray(input) ? input : input.split('\n').filter((l): l is string => l.trim() !== '');
  const concurrency = options?.concurrency || 1;
  
  const results: ExecutionResult[] = [];
  
  for (let i = 0; i < lines.length; i += concurrency) {
    const batch = lines.slice(i, i + concurrency);
    const batchPromises = batch.map(async (line) => {
      const cmd = command(line);
      const execCmd = typeof cmd === 'string' ? { command: cmd, shell: true } : cmd;
      return engine.execute(execCmd);
    });
    
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
  }
  
  return results;
}

/**
 * Filter operator - filters lines based on a command's exit code
 */
export async function filterOperator(
  input: string | string[],
  filterCommand: (line: string) => Command | string
): Promise<string[]> {
  const engine = new ExecutionEngine();
  const lines = Array.isArray(input) ? input : input.split('\n').filter((l): l is string => l.trim() !== '');
  const filtered: string[] = [];
  
  for (const line of lines) {
    try {
      const cmd = filterCommand(line);
      const execCmd = typeof cmd === 'string' ? { command: cmd, shell: true } : cmd;
      // Use engine with throwOnNonZeroExit config
      const tempEngine = new ExecutionEngine({ throwOnNonZeroExit: false });
      const result = await tempEngine.execute(execCmd);
      
      if (result.exitCode === 0) {
        filtered.push(line);
      }
    } catch {
      // Skip lines that cause errors
    }
  }
  
  return filtered;
}

/**
 * Reduce operator - reduces input lines to a single value
 */
export async function reduceOperator<T>(
  input: string | string[],
  initialValue: T,
  reducer: (acc: T, line: string, index: number) => T | Promise<T>
): Promise<T> {
  const lines = Array.isArray(input) ? input : input.split('\n').filter((l): l is string => l.trim() !== '');
  let accumulator = initialValue;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line !== undefined) {
      accumulator = await reducer(accumulator, line, i);
    }
  }
  
  return accumulator;
}