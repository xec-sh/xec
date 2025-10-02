import path from 'path';
import fs from 'fs/promises';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import { log, prism } from '@xec-sh/kit';

import { TaskManager } from '../config/task-manager.js';
import { ConfigurationManager } from '../config/configuration-manager.js';
import { BaseCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { ScriptLoader, type ExecutionOptions } from '../adapters/loader-adapter.js';

interface RunOptions extends ConfigAwareOptions {
  eval?: string;
  repl?: boolean;
  typescript?: boolean;
  watch?: boolean;
  runtime?: string;
  universal?: boolean;
  param?: string[];
}

export class RunCommand extends BaseCommand {
  private scriptLoader: ScriptLoader;

  constructor() {
    super({
      name: 'run',
      description: 'Run an Xec script or task',
      arguments: '[fileOrTask]',
      aliases: ['r'],
      options: [
        {
          flags: '-e, --eval <code>',
          description: 'Evaluate code'
        },
        {
          flags: '--repl',
          description: 'Start interactive REPL'
        },
        {
          flags: '--typescript',
          description: 'Enable TypeScript support'
        },
        {
          flags: '--watch',
          description: 'Watch for file changes'
        },
        {
          flags: '--runtime <runtime>',
          description: 'Specify runtime: auto, node, bun, deno (default: auto)'
        },
        {
          flags: '--no-universal',
          description: 'Disable universal loader (legacy mode)'
        }
      ],
      examples: [
        {
          command: 'xec run script.js',
          description: 'Run a JavaScript file'
        },
        {
          command: 'xec run script.ts',
          description: 'Run a TypeScript file'
        },
        {
          command: 'xec run build',
          description: 'Run a task named "build"'
        },
        {
          command: 'xec run -e "console.log(\'Hello\')"',
          description: 'Evaluate inline code'
        },
        {
          command: 'xec run --repl',
          description: 'Start interactive REPL'
        }
      ]
    });

    this.scriptLoader = new ScriptLoader({
      verbose: process.env['XEC_DEBUG'] === 'true',
      cache: true,
      preferredCDN: 'esm.sh'
    });
  }

  /**
   * Override create to handle special option parsing for params
   */
  override create(): Command {
    const command = super.create();

    // Override the param option to accumulate values
    // Simply add a new option handler that will override the default behavior
    command.option(
      '-p, --param <key=value...>',
      'Task parameters (can be used multiple times)',
      (value, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      []
    );

    // Allow unknown options for script arguments
    command.allowUnknownOption(true);

    return command;
  }

  /**
   * Execute the run command
   */
  public async execute(args: any[]): Promise<void> {
    const fileOrTask = args[0];
    const options = args[args.length - 1] as RunOptions;

    // Get script arguments (everything after the fileOrTask)
    const scriptArgs = args.slice(1, args.length - 1);

    if (options.repl) {
      await this.startRepl(options);
    } else if (options.eval) {
      await this.evalCode(options.eval, scriptArgs, options);
    } else if (fileOrTask) {
      // Check if it's a file or task
      const isFile = fileOrTask.includes('.') || fileOrTask.includes('/') || fileOrTask.includes('\\');

      if (isFile) {
        await this.runScript(fileOrTask, scriptArgs, options);
      } else {
        // Try to run as task
        await this.runTask(fileOrTask, options);
      }
    } else {
      log.error('No script file or task specified');
      log.info('Usage: xec run <file> [args...]');
      log.info('       xec run <task> [options]');
      log.info('       xec run -e <code>');
      log.info('       xec run --repl');
      throw new Error('No script file or task specified');
    }
  }

  /**
   * Run script using unified loader
   */
  private async runScript(scriptPath: string, args: string[], options: RunOptions): Promise<void> {
    // Build execution options
    const execOptions: ExecutionOptions = {
      verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: this.options.quiet,
      typescript: options.typescript,
      watch: options.watch,
      context: {
        args,
        argv: [process.argv[0] || 'node', scriptPath, ...args],
        __filename: path.resolve(scriptPath),
        __dirname: path.dirname(path.resolve(scriptPath)),
      },
      // Add local target for compatibility
      target: {
        type: 'local',
        name: 'local',
        config: {}
      } as any,
      targetEngine: $
    };

    // Execute the script
    const result = await this.scriptLoader.executeScript(scriptPath, execOptions);

    if (!result.success && result.error) {
      // If runtime not available, provide helpful message
      if (result.error.message.includes('runtime requested but not available')) {
        log.error(result.error.message);

        const runtime = options.runtime || 'auto';
        if (runtime !== 'auto') {
          log.info('\nTo use a specific runtime, ensure it is installed and run xec with it:');
          log.info(`  ${prism.cyan(`${runtime} xec run ${scriptPath}`)}`);
        }
      } else {
        throw result.error;
      }
    }
  }


  /**
   * Evaluate code using unified loader
   */
  private async evalCode(code: string, args: string[], options: RunOptions): Promise<void> {
    // Build execution options
    const execOptions: ExecutionOptions = {
      verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: this.options.quiet,
      typescript: options.typescript,
      context: {
        args,
        argv: ['xec', '<eval>', ...args],
        __filename: '<eval>',
        __dirname: process.cwd(),
      },
      // Add local target for compatibility
      target: {
        type: 'local',
        name: 'local',
        config: {}
      } as any,
      targetEngine: $
    };

    // Evaluate the code
    const result = await this.scriptLoader.evaluateCode(code, execOptions);

    if (!result.success && result.error) {
      throw result.error;
    }
  }

  /**
   * Start REPL using unified loader
   */
  private async startRepl(options: RunOptions): Promise<void> {
    // Build execution options
    const execOptions: ExecutionOptions = {
      verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: this.options.quiet,
      typescript: options.typescript,
      // Add local target for compatibility
      target: {
        type: 'local',
        name: 'local',
        config: {}
      } as any,
      targetEngine: $
    };

    // Start REPL
    await this.scriptLoader.startRepl(execOptions);
  }

  /**
   * Run a task from configuration
   */
  private async runTask(taskName: string, options: RunOptions): Promise<void> {
    // Initialize configuration
    const configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
    });

    // Initialize task manager
    const taskManager = new TaskManager({
      configManager,
      debug: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
      dryRun: false,
    });

    // Load tasks
    await taskManager.load();

    // Check if task exists
    if (!await taskManager.exists(taskName)) {
      // Try as script file if task doesn't exist
      try {
        await fs.access(taskName);
        // It's a file without extension
        return await this.runScript(taskName, [], options);
      } catch {
        // Not a file either
        log.error(`Task '${taskName}' not found`);
        log.info(prism.dim('\nRun "xec tasks" to see available tasks'));
        throw new Error(`Task '${taskName}' not found`);
      }
    }

    // Parse parameters
    const params: Record<string, any> = {};
    if (options.param) {
      for (const param of options.param) {
        const [key, ...valueParts] = param.split('=');
        const value = valueParts.join('=');

        if (!key || !value) {
          log.error(`Invalid parameter format: ${param}`);
          log.info(prism.dim('Use --param key=value'));
          throw new Error(`Invalid parameter format: ${param}`);
        }

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

        params[key] = parsedValue;
      }
    }

    // Display task info
    if (!this.options.quiet) {
      log.info(`Running task: ${prism.cyan(taskName)}`);
      if (Object.keys(params).length > 0) {
        log.info(prism.dim('Parameters:'));
        for (const [key, value] of Object.entries(params)) {
          log.info(prism.dim(`  ${key}: ${JSON.stringify(value)}`));
        }
      }
    }

    // Run task
    const result = await taskManager.run(taskName, params);

    if (!result.success) {
      log.error(`Task '${taskName}' failed`);
      if (result.error) {
        log.error(result.error.message);
      }
      throw new Error(`Task '${taskName}' failed`);
    }

    if (!this.options.quiet) {
      log.success(`Task '${taskName}' completed successfully`);
    }

  }
}

// Export for backward compatibility
export async function runScript(scriptPath: string, args: string[], options: any) {
  const command = new RunCommand();
  return command['runScript'](scriptPath, args, options);
}

export async function evalCode(code: string, args: string[], options: any) {
  const command = new RunCommand();
  return command['evalCode'](code, args, options);
}

export async function startRepl(options: any) {
  const command = new RunCommand();
  return command['startRepl'](options);
}

export async function runTask(taskName: string, options: any) {
  const command = new RunCommand();
  return command['runTask'](taskName, options);
}

export default function command(program: Command): void {
  const cmd = new RunCommand();
  program.addCommand(cmd.create());
}