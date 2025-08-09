// Type imports from @xec-sh/kit
type LiveOutputResult = any; // TODO: Fix type import from @xec-sh/kit

import path from 'path';
import { $ } from '@xec-sh/core';
import { kit } from '@xec-sh/kit';
import { spawn } from 'child_process';

import { TaskManager } from '../config/task-manager.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { ScriptLoader, type ExecutionOptions } from '../utils/script-loader.js';

interface RunOptions {
  eval?: string;
  repl?: boolean;
  typescript?: boolean;
  watch?: boolean;
  runtime?: string;
  universal?: boolean;
  param?: string[];
  verbose?: boolean;
  quiet?: boolean;
}

/**
 * Enhanced run command with live output streaming using @xec-sh/kit
 */
export class EnhancedRunCommand {
  private scriptLoader: ScriptLoader;

  constructor() {
    this.scriptLoader = new ScriptLoader({
      verbose: process.env['XEC_DEBUG'] === 'true',
      cache: true,
      preferredCDN: 'esm.sh'
    });
  }

  /**
   * Execute script with live output streaming
   */
  async runScriptWithLiveOutput(scriptPath: string, args: string[], options: RunOptions): Promise<void> {
    // Live output is always enabled with kit

    // Create live output display
    const output = kit.liveOutput({
      title: `Executing: ${path.basename(scriptPath)}`,
      height: 20,
      follow: true, // Auto-scroll
      highlight: {
        error: /error|fail|exception|fatal/i,
        warning: /warn|warning|caution/i,
        success: /success|done|complete|finished/i,
        info: /info|debug/i,
      },
      controls: {
        pause: 'p',
        clear: 'c',
        filter: 'f',
        quit: 'q',
      }
    }) as LiveOutputResult;

    // Determine the command to run
    const resolvedPath = path.resolve(scriptPath);
    const runtime = options.runtime || this.detectRuntime(scriptPath);

    let command: string;
    let commandArgs: string[];

    if (runtime === 'node' || runtime === 'auto') {
      command = process.execPath;
      commandArgs = [resolvedPath, ...args];
    } else if (runtime === 'bun') {
      command = 'bun';
      commandArgs = ['run', resolvedPath, ...args];
    } else if (runtime === 'deno') {
      command = 'deno';
      commandArgs = ['run', '--allow-all', resolvedPath, ...args];
    } else {
      command = runtime;
      commandArgs = [resolvedPath, ...args];
    }

    // Spawn the process
    const child = spawn(command, commandArgs, {
      cwd: process.cwd(),
      env: {
        ...process.env,
        XEC_LIVE_OUTPUT: 'true',
      },
      shell: false,
    });

    // Track execution metrics
    const startTime = Date.now();
    let lineCount = 0;
    let errorCount = 0;
    let warningCount = 0;

    // Handle stdout
    child.stdout?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          lineCount++;

          // Detect line type
          let lineType: 'info' | 'error' | 'warning' | 'success' = 'info';
          if (/error|fail|exception|fatal/i.test(line)) {
            lineType = 'error';
            errorCount++;
          } else if (/warn|warning|caution/i.test(line)) {
            lineType = 'warning';
            warningCount++;
          } else if (/success|done|complete|finished/i.test(line)) {
            lineType = 'success';
          }

          // Append to live output
          output.append(line, lineType);
        }
      }
    });

    // Handle stderr
    child.stderr?.on('data', (data: Buffer) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          lineCount++;
          errorCount++;
          // Append error output
          output.append(line, 'error');
        }
      }
    });

    // Handle process exit
    return new Promise((resolve, reject) => {
      child.on('exit', (code, signal) => {
        const elapsed = Date.now() - startTime;
        const elapsedStr = elapsed > 1000
          ? `${(elapsed / 1000).toFixed(2)}s`
          : `${elapsed}ms`;

        if (code === 0) {
          output.success(`Script completed successfully in ${elapsedStr}`);
          if (!options.quiet) {
            kit.log.info(`Lines: ${lineCount} | Errors: ${errorCount} | Warnings: ${warningCount}`);
          }
          output.destroy();
          resolve();
        } else {
          output.error(`Script failed with code ${code}${signal ? ` (signal: ${signal})` : ''}`);
          output.destroy();
          reject(new Error(`Script exited with code ${code}`));
        }
      });

      child.on('error', (error) => {
        output.error(`Failed to execute script: ${error.message}`);
        output.destroy();
        reject(error);
      });
    });
  }

  /**
   * Normal script execution without live output
   */
  private async runScriptNormal(scriptPath: string, args: string[], options: RunOptions): Promise<void> {
    const execOptions: ExecutionOptions = {
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: options.quiet,
      typescript: options.typescript,
      watch: options.watch,
      context: {
        args,
        argv: [process.argv[0] || 'node', scriptPath, ...args],
        __filename: path.resolve(scriptPath),
        __dirname: path.dirname(path.resolve(scriptPath)),
      },
      target: {
        type: 'local',
        name: 'local',
        config: {}
      } as any,
      targetEngine: $
    };

    const result = await this.scriptLoader.executeScript(scriptPath, execOptions);

    if (!result.success && result.error) {
      throw result.error;
    }
  }

  /**
   * Detect runtime based on file extension
   */
  private detectRuntime(scriptPath: string): string {
    const ext = path.extname(scriptPath);

    switch (ext) {
      case '.ts':
      case '.tsx':
        // Check which runtime is available
        if (process.env['BUN_VERSION']) return 'bun';
        if (process.env['DENO']) return 'deno';
        return 'node'; // Will need tsx or ts-node

      case '.mjs':
      case '.js':
      case '.cjs':
        if (process.env['BUN_VERSION']) return 'bun';
        if (process.env['DENO']) return 'deno';
        return 'node';

      default:
        return 'auto';
    }
  }

  /**
   * Run task with enhanced task runner interface
   */
  async runTaskWithRunner(taskName: string, options: RunOptions): Promise<void> {
    // Task runner is always enabled with kit

    // Initialize configuration
    const configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
    });

    // Initialize task manager
    const taskManager = new TaskManager({
      configManager,
      debug: options.verbose || process.env['XEC_DEBUG'] === 'true',
      dryRun: false,
    });

    // Load tasks
    await taskManager.load();

    // Get all tasks
    const allTasks = await taskManager.list();

    // Find the target task and its dependencies
    const targetTask = allTasks.find((t: any) => t.name === taskName);
    if (!targetTask) {
      kit.log.error(`Task '${taskName}' not found`);
      throw new Error(`Task '${taskName}' not found`);
    }

    // Build task graph
    const taskGraph = this.buildTaskGraph(targetTask, allTasks);

    // Create progress instance
    const progressBar = kit.progress({
      title: 'Running tasks',
      total: taskGraph.length
    });
    progressBar.start();

    // Use kit's task runner interface
    const runner = await kit.taskRunner({
      tasks: taskGraph.map(t => ({
        id: t.name,
        title: t.description || t.name,
        dependencies: t.dependsOn || [],
        run: async (context) => {
          const params = options.param ? this.parseParams(options.param) : {};
          const result = await taskManager.run(t.name, params);
          if (!result.success) {
            throw new Error(result.error?.message || 'Task failed');
          }
          return result;
        }
      })),
      visualization: 'tree', // Show dependency tree
      parallel: true, // Run independent tasks in parallel
      onTaskStart: (task) => {
        if (!options.quiet) {
          kit.log.info(`Starting: ${task.title}`);
        }
      },
      onTaskComplete: (task, result) => {
        if (!options.quiet) {
          if (result.success) {
            kit.log.success(`✓ ${task.title}`);
          } else {
            kit.log.error(`✗ ${task.title}: ${result.error}`);
          }
        }
      },
      onProgress: (completed, total) => {
        progressBar.update(completed);
      }
    });

    // Run the tasks
    const results = await runner.run();

    // Complete progress
    progressBar.complete();

    // Show summary
    this.showTaskSummary(Array.from(results.values()));
  }

  /**
   * Normal task execution without task runner interface
   */
  private async runTaskNormal(taskName: string, options: RunOptions): Promise<void> {
    const configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
    });

    const taskManager = new TaskManager({
      configManager,
      debug: options.verbose || process.env['XEC_DEBUG'] === 'true',
      dryRun: false,
    });

    await taskManager.load();

    if (!await taskManager.exists(taskName)) {
      throw new Error(`Task '${taskName}' not found`);
    }

    const params = options.param ? this.parseParams(options.param) : {};
    const result = await taskManager.run(taskName, params);

    if (!result.success) {
      throw new Error(`Task '${taskName}' failed`);
    }
  }

  /**
   * Build task dependency graph
   */
  private buildTaskGraph(targetTask: any, allTasks: any[]): any[] {
    const visited = new Set<string>();
    const graph: any[] = [];

    const visit = (task: any) => {
      if (visited.has(task.name)) return;
      visited.add(task.name);

      // Add dependencies first
      if (task.dependsOn) {
        for (const depName of task.dependsOn) {
          const dep = allTasks.find((t: any) => t.name === depName);
          if (dep) {
            visit(dep);
          }
        }
      }

      graph.push(task);
    };

    visit(targetTask);
    return graph;
  }

  /**
   * Parse task parameters
   */
  private parseParams(params: string[]): Record<string, any> {
    const result: Record<string, any> = {};

    for (const param of params) {
      const [key, ...valueParts] = param.split('=');
      const value = valueParts.join('=');

      if (!key || !value) continue;

      // Try to parse value
      let parsedValue: any = value;
      if (value === 'true') parsedValue = true;
      else if (value === 'false') parsedValue = false;
      else if (!isNaN(Number(value))) parsedValue = Number(value);
      else if (value.startsWith('[') || value.startsWith('{')) {
        try {
          parsedValue = JSON.parse(value);
        } catch {
          // Keep as string
        }
      }

      result[key] = parsedValue;
    }

    return result;
  }

  /**
   * Show task execution summary
   */
  private showTaskSummary(results: any[]): void {
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const total = results.length;

    kit.log.info('\n📊 Task Execution Summary:');
    kit.log.info(`  Total: ${total}`);
    if (successful > 0) {
      kit.log.success(`  ✓ Successful: ${successful}`);
    }
    if (failed > 0) {
      kit.log.error(`  ✗ Failed: ${failed}`);
    }

    if (failed > 0) {
      kit.log.error('\nFailed tasks:');
      for (const result of results.filter(r => !r.success)) {
        kit.log.error(`  - ${result.task}: ${result.error}`);
      }
    }
  }
}

// Export singleton instance
export const enhancedRunCommand = new EnhancedRunCommand();