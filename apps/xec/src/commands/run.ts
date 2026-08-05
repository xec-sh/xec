import path from 'node:path';
import { $ } from '@xec-sh/core';
import fs from 'node:fs/promises';
import { Command } from 'commander';
import { log, prism } from '@xec-sh/kit';
import { TaskManager , ConfigurationManager } from '@xec-sh/ops';
import { ScriptLoader, type ExecutionOptions } from '@xec-sh/ops';

import { BaseCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { parseTaskArgs, coerceParamValue } from '../utils/task-params.js';

interface RunOptions extends ConfigAwareOptions {
  eval?: string;
  repl?: boolean;
  typescript?: boolean;
  watch?: boolean;
  param?: string[];
}

export class RunCommand extends BaseCommand {
  private scriptLoader: ScriptLoader;

  constructor() {
    super({
      name: 'run',
      description: 'Run an Xec script or task',
      arguments: '[fileOrTask] [args...]',
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
          command: 'xec run deploy.ts staging --tag v2',
          description: 'Run a script with arguments (visible as `args` in the script)'
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

    // The variadic positional arrives as one array. The old registration
    // declared no variadic at all, so `xec run script.ts anything` died on
    // commander's arity check while the usage line printed right below it
    // promised [args...].
    const scriptArgs: string[] = Array.isArray(args[1]) ? args[1] : [];

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
        await this.runTask(fileOrTask, options, scriptArgs);
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
      throw result.error;
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
  private async runTask(taskName: string, options: RunOptions, taskArgs: string[] = []): Promise<void> {
    // Initialize configuration. The file named by -c replaces discovery
    // entirely: reading tasks from the conventional location while the
    // caller pointed at another file answers from a configuration they
    // never meant. A named file that does not exist is refused rather than
    // shrugged at, for the same reason.
    const configFilePath = await this.requireConfigFile(options as ConfigAwareOptions);
    const configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
      configFilePath,
    });

    // Initialize task manager
    const taskManager = new TaskManager({
      configManager,
      debug: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
      // `options` carries the flag on the direct-call path (the exported
      // runTask wrapper never runs the action handler that fills this.options).
      dryRun: options.dryRun ?? this.options.dryRun ?? false,
    });

    // Load tasks
    await taskManager.load();

    // Check if task exists
    if (!await taskManager.exists(taskName)) {
      // Try as script file if task doesn't exist
      try {
        await fs.access(taskName);
        // It's a file without extension
        await this.runScript(taskName, taskArgs, options);
        return;
      } catch {
        // Not a file either
        log.error(`Task '${taskName}' not found`);
        log.info(prism.dim('\nRun "xec inspect tasks" to see available tasks'));
        throw new Error(`Task '${taskName}' not found`);
      }
    }

    // Parse parameters: the tokens after the task name first (--key value,
    // --key=value, --key), then explicit -p pairs on top. One grammar with
    // the root dispatcher, so `xec run deploy --env prod` and
    // `xec deploy --env prod` name the same parameter.
    const { params, rest } = parseTaskArgs(taskArgs);
    if (rest.length > 0) {
      throw new Error(
        `Unexpected argument${rest.length > 1 ? 's' : ''} for task '${taskName}': ${rest.join(' ')}\n` +
        `Task parameters are named: use --key value or -p key=value`
      );
    }
    for (const param of options.param ?? []) {
      const eq = param.indexOf('=');
      if (eq <= 0 || eq === param.length - 1) {
        log.error(`Invalid parameter format: ${param}`);
        log.info(prism.dim('Use --param key=value'));
        throw new Error(`Invalid parameter format: ${param}`);
      }
      params[param.slice(0, eq)] = coerceParamValue(param.slice(eq + 1));
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
      // Rethrowing the original preserves the exit code the task chose;
      // a fresh error here collapsed every failure to 1, so a script
      // could tell that a task failed but never why.
      throw result.error ?? new Error(`Task '${taskName}' failed`);
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

export default function registerCommand(program: Command): void {
  const cmd = new RunCommand();
  program.addCommand(cmd.create());
}