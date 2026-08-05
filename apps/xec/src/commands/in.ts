import type { ResolvedTarget, ExecutionOptions } from '@xec-sh/ops';

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';
import { ScriptLoader , parseTimeout , validateOptions } from '@xec-sh/ops';

import { ConfigAwareCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { InteractiveHelpers, InteractiveOptions } from '../utils/interactive-helpers.js';

interface InOptions extends ConfigAwareOptions, InteractiveOptions {
  task?: string;
  repl?: boolean;
  timeout?: string;
  env?: string[];
  cwd?: string;
  user?: string;
  parallel?: boolean;
}

export class InCommand extends ConfigAwareCommand {
  constructor() {
    super({
      name: 'in',
      description: 'Execute commands in containers or Kubernetes pods',
      arguments: '<target> [command...]',
      options: [
        {
          flags: '-p, --profile <profile>',
          description: 'Configuration profile to use',
        },
        {
          flags: '--task <task>',
          description: 'Execute a configured task in the target',
        },
        {
          flags: '--repl',
          description: 'Start a REPL session with $target available',
        },
        {
          flags: '-t, --timeout <duration>',
          description: 'Command timeout (e.g., 30s, 5m)',
        },
        {
          flags: '-d, --cwd <path>',
          description: 'Working directory in container',
        },
        {
          flags: '-u, --user <user>',
          description: 'User to run command as',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive mode (attach to container)',
        },
        {
          flags: '--parallel',
          description: 'Execute on multiple targets in parallel',
        },
      ],
      examples: [
        {
          command: 'xec in containers.app "npm test"',
          description: 'Execute in configured Docker container',
        },
        {
          command: 'xec in pods.webapp "date"',
          description: 'Execute in configured Kubernetes pod',
        },
        {
          command: 'xec in mycontainer ./scripts/deploy.ts',
          description: 'Execute script with $target context',
        },
        {
          command: 'xec in containers.* --task test --parallel',
          description: 'Run test task on all containers',
        },
        {
          command: 'xec in app --repl',
          description: 'Start REPL with $target available',
        },
      ],
      validateOptions: (options) => {
        const schema = z.object({
          profile: z.string().optional(),
          task: z.string().optional(),
          repl: z.boolean().optional(),
          timeout: z.string().optional(),
          env: z.array(z.string()).optional(),
          cwd: z.string().optional(),
          user: z.string().optional(),
          interactive: z.boolean().optional(),
          parallel: z.boolean().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'in';
  }

  override create(): Command {
    const command = super.create();

    // Declared here, not in the config options list: that path cannot carry a
    // parser, so a repeated -e kept only the last value and a single -e
    // arrived as a bare string where an array is validated.
    command.option(
      '-e, --env <key=value>',
      'Environment variables (can be used multiple times)',
      (value, previous: string[] = []) => {
        previous.push(value);
        return previous;
      },
      []
    );

    return command;
  }

  override async execute(args: any[]): Promise<void> {
    // The variadic positional arrives as one array, not spread — see on.ts.
    const targetPattern = args[0];
    const commandParts: string[] = Array.isArray(args[1]) ? args[1] : [];
    const options = args[args.length - 1] as InOptions;

    if (!targetPattern) {
      throw new Error('Target specification is required');
    }

    // Initialize configuration
    await this.initializeConfig(options);

    // Apply command defaults from config
    const defaults = this.getCommandDefaults();
    const mergedOptions = this.applyDefaults(options, defaults);

    // Resolve targets. A bare name refers to a configured container or pod
    // first — `on` accepts `web-1` for hosts.web-1, and `in alpine` must
    // accept containers.alpine the same way instead of failing while the
    // undeclared raw Docker name works.
    let pattern = targetPattern;
    if (!/[.*{@]/.test(pattern)) {
      const configuredTargets = this.xecConfig?.targets;
      if (configuredTargets?.containers?.[pattern]) {
        pattern = `containers.${pattern}`;
      } else if (configuredTargets?.pods?.[pattern]) {
        pattern = `pods.${pattern}`;
      }
    }

    let targets: ResolvedTarget[];
    if (pattern.includes('*') || pattern.includes('{')) {
      targets = await this.findTargets(pattern);
      if (targets.length === 0) {
        throw new Error(`No targets found matching pattern: ${pattern}`);
      }
    } else {
      const target = await this.resolveTarget(pattern);
      targets = [target];
    }

    // -u overrides the configured user. Merged into the target itself because
    // engines are constructed from target config alone. kubectl exec cannot
    // switch users, so for pods this is a hard error, not a silent default.
    if (mergedOptions.user) {
      const podTargets = targets.filter(t => t.type === 'kubernetes');
      if (podTargets.length > 0) {
        throw new Error(
          `--user is not supported for Kubernetes targets (kubectl exec has no user switch): ${podTargets.map(t => t.name).join(', ')}`
        );
      }
      targets = targets.map(t => ({
        ...t,
        config: { ...(t.config as any), user: mergedOptions.user }
      }));
    }

    // Handle different execution modes
    if (mergedOptions.task) {
      await this.executeTask(targets, mergedOptions.task, mergedOptions);
    } else if (mergedOptions.repl) {
      if (targets.length === 0) {
        throw new Error('No targets found');
      }
      if (targets.length > 1) {
        throw new Error('REPL mode is only supported for single targets');
      }
      await this.startRepl(targets[0]!, mergedOptions);
    } else if (commandParts.length > 0) {
      // Same contract as `on`: a script is a local file handed to the loader
      // with $target bound; anything else is text for the container shell.
      const first = commandParts[0]!;
      const isScriptPath = /\.(ts|js|mjs)$/.test(first) && !/[\s*?$|&;<>(){}\\]/.test(first);
      if (isScriptPath && fs.existsSync(first)) {
        await this.executeScript(targets, first, commandParts.slice(1), mergedOptions);
      } else if (isScriptPath) {
        throw new Error(`Script file not found: ${first}`);
      } else {
        await this.executeCommand(targets, commandParts.join(' '), mergedOptions);
      }
    } else {
      // No command, default to interactive
      if (targets.length === 0) {
        throw new Error('No targets found');
      }
      if (targets.length > 1) {
        throw new Error('Interactive mode is only supported for single targets');
      }
      await this.executeInteractive(targets[0]!, mergedOptions);
    }
  }

  private async executeCommand(
    targets: ResolvedTarget[],
    command: string,
    options: InOptions
  ): Promise<void> {
    if (options.dryRun) {
      for (const target of targets) {
        this.log(`[DRY RUN] Would execute in ${this.formatTargetDisplay(target)}: ${prism.yellow(command)}`, 'info');
      }
      return;
    }

    if (options.parallel && targets.length > 1) {
      await this.executeParallel(targets, command, options);
    } else {
      for (const target of targets) {
        await this.executeSingle(target, command, options);
      }
    }
  }

  private async executeSingle(
    target: ResolvedTarget,
    command: string,
    options: InOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);

    if (!options.quiet) {
      this.startSpinner(`Executing in ${targetDisplay}...`);
    }

    try {
      const engine = await this.createTargetEngine(target);

      if (options.verbose) {
        console.log(`[DEBUG] Created engine for target type: ${target.type}`);
      }

      // Apply options
      let execEngine = engine;

      if (options.env && options.env.length > 0) {
        const envVars: Record<string, string> = {};
        for (const envVar of options.env) {
          const [key, value] = envVar.split('=');
          if (key && value !== undefined) {
            envVars[key] = value;
          }
        }
        execEngine = execEngine.env(envVars);
      }

      if (options.cwd) {
        execEngine = execEngine.cd(options.cwd);
      }

      if (options.timeout) {
        const timeoutMs = parseTimeout(options.timeout);
        execEngine = execEngine.timeout(timeoutMs);
      }

      // Execute command using raw template literal (no escaping)
      if (options.verbose) {
        console.log(`[DEBUG] Executing command: "${command}"`);
      }
      const result = await execEngine.raw`${command}`;

      if (!options.quiet) {
        this.stopSpinner();
        this.log(`${prism.green('✓')} ${targetDisplay}`, 'success');

        if (result.stdout) {
          console.log(result.stdout.trim());
        }

        if (result.stderr && options.verbose) {
          console.error(prism.yellow(result.stderr.trim()));
        }
      }
    } catch (error) {
      if (!options.quiet) {
        this.stopSpinner();
      }

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${prism.red('✗')} ${targetDisplay}: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async executeParallel(
    targets: ResolvedTarget[],
    command: string,
    options: InOptions
  ): Promise<void> {
    this.log(`Executing on ${targets.length} targets in parallel...`, 'info');

    const promises = targets.map(async (target) => {
      try {
        await this.executeSingle(target, command, { ...options, quiet: true });
        return { target, success: true, error: null };
      } catch (error) {
        return { target, success: false, error };
      }
    });

    const results = await Promise.all(promises);

    // Display results
    const successful = results.filter(r => r.success);
    const failed = results.filter(r => !r.success);

    if (successful.length > 0) {
      this.log(`${prism.green('✓')} Succeeded on ${successful.length} targets:`, 'success');
      for (const result of successful) {
        this.log(`  - ${this.formatTargetDisplay(result.target)}`, 'info');
      }
    }

    if (failed.length > 0) {
      this.log(`${prism.red('✗')} Failed on ${failed.length} targets:`, 'error');
      for (const result of failed) {
        const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
        this.log(`  - ${this.formatTargetDisplay(result.target)}: ${errorMessage}`, 'error');
      }
      throw new Error(`Command failed on ${failed.length} targets`);
    }
  }

  private async executeTask(
    targets: ResolvedTarget[],
    taskName: string,
    options: InOptions
  ): Promise<void> {
    if (!this.taskManager) {
      throw new Error('Task manager not initialized');
    }

    for (const target of targets) {
      const targetDisplay = this.formatTargetDisplay(target);
      this.log(`Running task '${taskName}' on ${targetDisplay}...`, 'info');

      try {
        const result = await this.taskManager.run(taskName, {}, {
          target: target.id
        });

        if (result.success) {
          this.log(`${prism.green('✓')} Task completed on ${targetDisplay}`, 'success');
        } else {
          throw new Error(result.error?.message || 'Task failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`${prism.red('✗')} Task failed on ${targetDisplay}: ${errorMessage}`, 'error');
        throw error;
      }
    }
  }

  private async executeScript(
    targets: ResolvedTarget[],
    scriptPath: string,
    scriptArgs: string[],
    options: InOptions
  ): Promise<void> {
    const scriptLoader = new ScriptLoader({
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: options.quiet,
      cache: true,
      preferredCDN: 'esm.sh'
    });

    for (const target of targets) {
      const targetDisplay = this.formatTargetDisplay(target);
      this.log(`Running script '${scriptPath}' on ${targetDisplay}...`, 'info');

      try {
        const engine = await this.createTargetEngine(target);
        const execOptions: ExecutionOptions = {
          target,
          targetEngine: engine,
          // The script's arguments are the tokens after its path — not
          // process.argv.slice(3), which began with the target pattern and
          // the script's own name.
          context: {
            args: scriptArgs,
            argv: [process.argv[0] || 'node', scriptPath, ...scriptArgs],
            __filename: path.resolve(scriptPath),
            __dirname: path.dirname(path.resolve(scriptPath))
          },
          verbose: options.verbose,
          quiet: options.quiet
        };

        const result = await scriptLoader.executeScript(scriptPath, execOptions);

        if (result.success) {
          this.log(`${prism.green('✓')} Script completed on ${targetDisplay}`, 'success');
        } else {
          throw result.error || new Error('Script execution failed');
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log(`${prism.red('✗')} Script failed on ${targetDisplay}: ${errorMessage}`, 'error');
        throw error;
      }
    }
  }

  private async startRepl(
    target: ResolvedTarget,
    options: InOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);
    this.log(`Starting REPL with $target configured for ${targetDisplay}...`, 'info');

    const scriptLoader = new ScriptLoader({
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: options.quiet,
      cache: true,
      preferredCDN: 'esm.sh'
    });

    const engine = await this.createTargetEngine(target);

    const execOptions: ExecutionOptions = {
      target,
      targetEngine: engine,
      verbose: options.verbose,
      quiet: options.quiet
    };

    await scriptLoader.startRepl(execOptions);
  }

  private async executeInteractive(
    target: ResolvedTarget,
    options: InOptions
  ): Promise<void> {
    const targetDisplay = this.formatTargetDisplay(target);

    if (options.dryRun) {
      this.log(`[DRY RUN] Would start interactive session in ${targetDisplay}`, 'info');
      return;
    }

    this.log(`Starting interactive session in ${targetDisplay}...`, 'info');

    try {
      let command: string[];

      if (target.type === 'docker') {
        const config = target.config as any;
        command = ['docker', 'exec', '-it'];

        if (options.user || config.user) {
          command.push('-u', options.user || config.user);
        }

        if (options.cwd || config.workdir) {
          command.push('-w', options.cwd || config.workdir);
        }

        if (options.env) {
          for (const envVar of options.env) {
            command.push('-e', envVar);
          }
        }

        command.push(config.container || target.name || '');
        command.push(config.shell || '/bin/sh');
      } else if (target.type === 'kubernetes') {
        const config = target.config as any;
        command = ['kubectl', 'exec', '-it'];

        command.push('-n', config.namespace || 'default');

        if (config.container) {
          command.push('-c', config.container);
        }

        command.push(config.pod || target.name || '');
        command.push('--');
        command.push(config.shell || '/bin/sh');
      } else {
        throw new Error(`Interactive mode not supported for target type: ${target.type}`);
      }

      // Use local execution for interactive mode
      const result = await $.local().raw`${command.join(' ')}`.interactive();

      if (result.exitCode !== 0 && result.exitCode !== 130) { // 130 is Ctrl+C
        throw new Error(`Interactive session ended with exit code ${result.exitCode}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`${prism.red('✗')} Failed to start interactive session: ${errorMessage}`, 'error');
      throw error;
    }
  }

  private async runInteractiveMode(options: InOptions): Promise<{
    targetPattern: string;
    commandParts: string[];
    options: Partial<InOptions>;
  } | null> {
    InteractiveHelpers.startInteractiveMode('Interactive Container/Pod Execution');

    try {
      // Select execution type
      const execType = await InteractiveHelpers.selectFromList(
        'What do you want to do?',
        [
          { value: 'command', label: 'Execute a command' },
          { value: 'script', label: 'Run a script file' },
          { value: 'task', label: 'Run a configured task' },
          { value: 'repl', label: 'Start REPL session' },
          { value: 'shell', label: 'Interactive shell' },
        ],
        (item) => item.label
      );

      if (!execType) return null;

      // Select target(s)
      const allowMultiple = execType.value !== 'repl' && execType.value !== 'shell';
      const targets = await InteractiveHelpers.selectTarget({
        message: allowMultiple ? 'Select target(s):' : 'Select target:',
        type: 'all',
        allowMultiple,
        allowCustom: true,
      });

      if (!targets) return null;

      const targetPattern = Array.isArray(targets)
        ? targets.map(t => t.id).join(' ')
        : targets.id;

      const inOptions: Partial<InOptions> = {};
      let commandParts: string[] = [];

      // eslint-disable-next-line default-case
      switch (execType.value) {
        case 'command': {
          const command = await InteractiveHelpers.inputText('Enter command to execute:', {
            placeholder: 'ls -la, npm test, date, etc.',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Command cannot be empty';
              }
              return undefined;
            },
          });
          if (!command) return null;
          commandParts = [command];

          // Command-specific options
          if (Array.isArray(targets) && targets.length > 1) {
            inOptions.parallel = await InteractiveHelpers.confirmAction(
              'Execute in parallel?',
              false
            );
          }

          const configureEnv = await InteractiveHelpers.confirmAction(
            'Set environment variables?',
            false
          );

          if (configureEnv) {
            const envVars: string[] = [];
            let addMore = true;
            while (addMore) {
              const envVar = await InteractiveHelpers.inputText('Enter environment variable:', {
                placeholder: 'KEY=value',
                validate: (value) => {
                  if (value && !value.includes('=')) {
                    return 'Format must be KEY=value';
                  }
                  return undefined;
                },
              });
              if (envVar) {
                envVars.push(envVar);
              }
              addMore = envVar ? await InteractiveHelpers.confirmAction('Add another variable?', false) : false;
            }
            if (envVars.length > 0) {
              inOptions.env = envVars;
            }
          }

          const configureCwd = await InteractiveHelpers.confirmAction(
            'Set working directory?',
            false
          );

          if (configureCwd) {
            const cwd = await InteractiveHelpers.inputText('Enter working directory:', {
              placeholder: '/app, /home/user, etc.',
            });
            if (cwd) {
              inOptions.cwd = cwd;
            }
          }

          const configureTimeout = await InteractiveHelpers.confirmAction(
            'Set command timeout?',
            false
          );

          if (configureTimeout) {
            const timeout = await InteractiveHelpers.inputText('Enter timeout:', {
              placeholder: '30s, 5m, 1h',
              validate: (value) => {
                try {
                  if (value) parseTimeout(value);
                  return undefined;
                } catch {
                  return 'Invalid timeout format (use 30s, 5m, etc.)';
                }
              },
            });
            if (timeout) {
              inOptions.timeout = timeout;
            }
          }
          break;
        }

        case 'script': {
          const scriptPath = await InteractiveHelpers.inputText('Enter script path:', {
            placeholder: './deploy.js, /scripts/test.ts',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Script path cannot be empty';
              }
              if (!value.endsWith('.js') && !value.endsWith('.ts')) {
                return 'Script must be a .js or .ts file';
              }
              return undefined;
            },
          });
          if (!scriptPath) return null;
          commandParts = [scriptPath];
          break;
        }

        case 'task': {
          const taskName = await InteractiveHelpers.inputText('Enter task name:', {
            placeholder: 'test, build, deploy',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Task name cannot be empty';
              }
              return undefined;
            },
          });
          if (!taskName) return null;
          inOptions.task = taskName;
          break;
        }

        case 'repl': {
          inOptions.repl = true;
          break;
        }

        case 'shell': {
          // For shell, we use the interactive flag
          inOptions.interactive = true;
          commandParts = [];
          break;
        }
      }

      // Show summary
      InteractiveHelpers.showInfo('\nExecution Summary:');
      console.log(`  Target(s): ${prism.cyan(targetPattern)}`);
      if (commandParts.length > 0) {
        console.log(`  Command: ${prism.cyan(commandParts.join(' '))}`);
      }
      if (inOptions.task) {
        console.log(`  Task: ${prism.cyan(inOptions.task)}`);
      }
      if (inOptions.repl) {
        console.log(`  Mode: ${prism.gray('REPL session')}`);
      }
      if (inOptions.interactive && execType.value === 'shell') {
        console.log(`  Mode: ${prism.gray('Interactive shell')}`);
      }
      if (inOptions.parallel) {
        console.log(`  Execution: ${prism.gray('parallel')}`);
      }
      if (inOptions.env) {
        console.log(`  Environment: ${prism.gray(inOptions.env.join(', '))}`);
      }
      if (inOptions.cwd) {
        console.log(`  Working directory: ${prism.gray(inOptions.cwd)}`);
      }
      if (inOptions.timeout) {
        console.log(`  Timeout: ${prism.gray(inOptions.timeout)}`);
      }

      const confirm = await InteractiveHelpers.confirmAction(
        '\nProceed with execution?',
        true
      );

      if (!confirm) {
        InteractiveHelpers.endInteractiveMode('Execution cancelled');
        return null;
      }

      return {
        targetPattern,
        commandParts,
        options: inOptions,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('cancelled')) {
        InteractiveHelpers.endInteractiveMode('Execution cancelled');
      } else {
        InteractiveHelpers.showError(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }
}

export default function registerCommand(program: Command): void {
  const cmd = new InCommand();
  program.addCommand(cmd.create());
}