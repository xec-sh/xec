import type { TargetOutcome } from '../utils/fleet-run.js';
import type { ResolvedTarget, ExecutionOptions } from '@xec-sh/ops';

import { z } from 'zod';
import fs from 'node:fs';
import path from 'node:path';
import { prism } from '@xec-sh/kit';
import { Command } from 'commander';
import { parseTarget } from '@xec-sh/core';
import { ScriptLoader, parseTimeout, validateOptions } from '@xec-sh/ops';

import { runFleet } from '../utils/fleet-run.js';
import { resolveEnvPairs } from '../utils/secret-env.js';
import { variadicParts, positionalString } from '../utils/variadic.js';
import { ConfigAwareCommand, ConfigAwareOptions } from '../utils/command-base.js';
import { reportFleet, fleetFailure, fleetDocument } from '../utils/fleet-report.js';
import { InteractiveHelpers, InteractiveOptions } from '../utils/interactive-helpers.js';

interface OnOptions extends ConfigAwareOptions, InteractiveOptions {
  task?: string;
  repl?: boolean;
  timeout?: string;
  env?: string[];
  cwd?: string;
  user?: string;
  parallel?: boolean;
  maxConcurrent?: number;
  failFast?: boolean;
  maxFailures?: string;
}

/**
 * Split `host[:port]`, leaving IPv6 forms intact: `[::1]:2222` names a port,
 * a bare `::1` does not.
 */
export function parseHostPort(spec: string): { host: string; port?: number } {
  // Kept for callers elsewhere; the rules now live in core, so "what is a
  // host and what is a port" is decided in exactly one place.
  const parsed = parseTarget(spec.includes('@') ? spec : `ssh://${spec}`);
  if (parsed.ok && parsed.target.kind === 'ssh') {
    const { host, port } = parsed.target;
    return port === undefined ? { host } : { host, port };
  }
  return { host: spec };
}

export class OnCommand extends ConfigAwareCommand {
  constructor() {
    super({
      name: 'on',
      description: 'Execute commands on SSH hosts',
      arguments: '<hosts> [command...]',
      options: [
        {
          flags: '-p, --profile <profile>',
          description: 'Configuration profile to use',
        },
        {
          flags: '--task <task>',
          description: 'Execute a configured task on the hosts',
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
          description: 'Working directory on remote host',
        },
        {
          flags: '-u, --user <user>',
          description: 'User to run command as (overrides config)',
        },
        {
          flags: '--parallel',
          description: 'Execute on multiple hosts in parallel',
        },
        {
          flags: '--max-concurrent <n>',
          description: 'Maximum concurrent executions',
          defaultValue: '10',
        },
        {
          flags: '--max-failures <n>',
          description: 'Stop after n failures, or a share of the fleet (e.g. 3, 20%%)',
        },
        {
          flags: '--fail-fast',
          description: 'Stop on first failure in parallel mode',
        },
        {
          flags: '-i, --interactive',
          description: 'Interactive mode for selecting SSH hosts and execution options',
        },
      ],
      examples: [
        {
          command: 'xec on hosts.web-1 "uptime"',
          description: 'Execute on configured SSH host',
        },
        {
          command: 'xec on hosts.web-* "systemctl status nginx" --parallel',
          description: 'Execute on multiple hosts in parallel',
        },
        {
          command: 'xec on deploy@server.com "date"',
          description: 'Execute on direct SSH target',
        },
        {
          command: 'xec on hosts.db-master ./scripts/backup.ts',
          description: 'Execute script with $target context',
        },
        {
          command: 'xec on hosts.* --task deploy --parallel',
          description: 'Run deploy task on all hosts',
        },
        {
          command: 'xec on --interactive',
          description: 'Interactive mode for selecting hosts and commands',
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
          parallel: z.boolean().optional(),
          maxConcurrent: z.string().optional(),
          failFast: z.boolean().optional(),
          maxFailures: z.string().optional(),
          interactive: z.boolean().optional(),
          verbose: z.boolean().optional(),
          quiet: z.boolean().optional(),
          dryRun: z.boolean().optional(),
        });
        validateOptions(options, schema);
      },
    });
  }

  protected override getCommandConfigKey(): string {
    return 'on';
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
    // The variadic positional arrives as one array, not spread: destructuring
    // it with rest turned `on host echo hello world` into ["echo hello world"]
    // nested once more, and the join below produced "echo,hello,world".
    let hostPattern = positionalString(args[0]);
    let commandParts: string[] = variadicParts(args[1]);
    const options = args[args.length - 1] as OnOptions;

    // Handle interactive mode
    if (options.interactive) {
      const interactiveResult = await this.runInteractiveMode(options);
      if (!interactiveResult) return;

      hostPattern = interactiveResult.hostPattern;
      commandParts = interactiveResult.commandParts || [];
      Object.assign(options, interactiveResult.options);
    }

    if (!hostPattern) {
      throw new Error('Host specification is required');
    }

    // Initialize configuration
    await this.initializeConfig(options);

    // Apply command defaults from config
    const defaults = this.getCommandDefaults();
    const mergedOptions = this.applyDefaults(options, defaults);

    // Resolve hosts
    let targets: ResolvedTarget[];

    // Check if it's a pattern (wildcards or braces) first
    if (hostPattern.includes('*') || hostPattern.includes('{')) {
      // Pattern matching
      const pattern = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
      targets = await this.findTargets(pattern);
      if (targets.length === 0) {
        throw new Error(`No hosts found matching pattern: ${hostPattern}`);
      }
    }
    // Check if it's a comma-separated list from interactive mode
    else if (hostPattern.includes(',')) {
      const hostIds = hostPattern.split(',');
      targets = [];
      for (const hostId of hostIds) {
        try {
          const target = await this.resolveTarget(hostId);
          targets.push(target);
        } catch {
          // If not found in config, treat as direct host
          targets.push({
            id: `ssh:${hostId}`,
            type: 'ssh',
            name: hostId,
            config: {
              type: 'ssh',
              host: hostId,
              user: mergedOptions.user || process.env['USER'] || 'root',
            },
            source: 'detected'
          });
        }
      }
    }
    // A single host: what the configuration says, and only failing that,
    // what the string itself implies.
    //
    // The order is the point. Inference used to run first for anything
    // containing '@', so `hosts.deploy@server.example.com` — an explicit
    // reference to a configured target — was read as the user
    // `hosts.deploy` on the host `server.example.com`, quietly ignoring the
    // port and credentials the configuration held for it. Configuration is
    // what the operator wrote down; a guess never outranks it.
    else {
      const targetSpec = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
      let resolved: ResolvedTarget | null;
      try {
        resolved = await this.resolveTarget(targetSpec);
      } catch {
        resolved = null;
      }

      if (resolved) {
        targets = [resolved];
      } else {
        // Whatever the configuration does not know is read by the one
        // parser in core: `user@host`, `host:port`, an IPv6 literal in
        // brackets, or a full ssh:// URI, all under the same rules.
        const parsed = parseTarget(hostPattern);
        const spec = parsed.ok && parsed.target.kind === 'ssh'
          ? parsed.target
          : ({ host: hostPattern } as { host: string; user?: string; port?: number });

        targets = [{
          id: `ssh:${hostPattern}`,
          type: 'ssh',
          name: spec.host,
          config: {
            type: 'ssh',
            host: spec.host,
            user: spec.user ?? mergedOptions.user ?? process.env['USER'] ?? 'root',
            ...(spec.port !== undefined ? { port: spec.port } : {}),
          },
          source: 'detected'
        }];
      }
    }

    // Validate all targets are SSH
    const nonSshTargets = targets.filter(t => t.type !== 'ssh');
    if (nonSshTargets.length > 0) {
      throw new Error(`'on' command only supports SSH hosts. Found: ${nonSshTargets.map(t => t.type).join(', ')}`);
    }

    // -u overrides the configured user for every path that builds an engine
    // from the target (command, task, script, REPL). Merged into the target
    // itself because engines are constructed from target config alone.
    if (mergedOptions.user) {
      targets = targets.map(t => ({
        ...t,
        config: { ...(t.config as any), user: mergedOptions.user, username: mergedOptions.user }
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
        throw new Error('REPL mode is only supported for single hosts');
      }
      await this.startRepl(targets[0]!, mergedOptions);
    } else if (commandParts.length > 0) {
      // A script is a local file handed to the loader with $target bound; a
      // command is text for the remote shell. The old test was
      // `cmd.endsWith('.ts')` over the joined string, which sent
      // `on web "ls *.ts"` to the script loader and made
      // `on web ./deploy.ts staging` unrecognisable.
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
      throw new Error('No command, task, or REPL mode specified');
    }
  }

  private async executeCommand(
    targets: ResolvedTarget[],
    cmd: string,
    options: OnOptions
  ): Promise<void> {
    if (options.dryRun) {
      // A rehearsal is a plan, and a plan is data: a caller asking for
      // json gets the targets and the command it would have run, which is
      // what makes a dry run usable from a script rather than only from a
      // pair of eyes.
      this.emitResult(
        targets.map(target => ({
          target: target.id ?? target.name,
          command: cmd,
          dryRun: true,
        })),
        () => {
          // The plan is what this invocation produces, so it goes where
          // its json form goes: `emitResult` writes to stdout, and the
          // same information must not change channel with the format.
          for (const target of targets) {
            process.stdout.write(
              `[DRY RUN] Would execute on ${this.formatTargetDisplay(target)}: ${prism.yellow(cmd)}\n`
            );
          }
        }
      );
      return;
    }

    const { result, skipped } = await runFleet(
      targets,
      cmd,
      target => this.runOnTarget(target, cmd, options),
      {
        parallel: options.parallel,
        maxConcurrent: Number(options.maxConcurrent ?? 10),
        failFast: options.failFast,
        maxFailures: options.maxFailures,
      }
    );

    const skippedNames = skipped.map(target => this.formatTargetDisplay(target));

    this.emitResult(fleetDocument(result, skippedNames), () => {
      if (!options.quiet) reportFleet(result, skippedNames);
    });

    if (!result.ok) {
      throw fleetFailure(result);
    }
  }

  /**
   * Run the command on one target, reporting failure as a value.
   *
   * Nothing is printed here: the fan-out decides what is worth showing
   * once every target has answered.
   *
   * @param target - Where to run.
   * @param cmd - What to run.
   * @param options - Environment, working directory and timeout.
   * @returns What the target produced.
   */
  private async runOnTarget(
    target: ResolvedTarget,
    cmd: string,
    options: OnOptions
  ): Promise<TargetOutcome> {
    try {
      const engine = await this.createTargetEngine(target);

      // Apply options
      let execEngine = engine;

      if (options.env && options.env.length > 0) {
        const resolved = await resolveEnvPairs(options.env, () =>
          Promise.resolve(this.configManager.getSecretManager())
        );

        for (const key of resolved.unprotected) {
          this.log(
            `${key} holds a value too short to redact; it will appear in output if the command prints it`,
            'warn'
          );
        }

        execEngine = execEngine.env(resolved.env);
      }

      if (options.cwd) {
        execEngine = execEngine.cd(options.cwd);
      }

      if (options.timeout) {
        const timeoutMs = parseTimeout(options.timeout);
        execEngine = execEngine.timeout(timeoutMs);
      }

      const result = await execEngine.raw`${cmd}`;

      return {
        exitCode: result.exitCode,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    } catch (error) {
      // A command that ran and exited non-zero carries its code and both
      // streams on the error. That is one target's answer, not the
      // fan-out's failure: letting it propagate cost the results of every
      // target that had already succeeded.
      const failure = error as { exitCode?: unknown; stdout?: unknown; stderr?: unknown };
      if (typeof failure.exitCode === 'number' && failure.exitCode !== 0) {
        return {
          exitCode: failure.exitCode,
          stdout: typeof failure.stdout === 'string' ? failure.stdout : '',
          stderr: typeof failure.stderr === 'string' ? failure.stderr : '',
        };
      }

      // Reaching here means the command never ran: no route, refused
      // connection, an adapter that could not start.
      return {
        exitCode: -1,
        stdout: '',
        stderr: '',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async executeTask(
    targets: ResolvedTarget[],
    taskName: string,
    options: OnOptions
  ): Promise<void> {
    if (!this.taskManager) {
      throw new Error('Task manager not initialized');
    }

    const executeTaskOnTarget = async (target: ResolvedTarget) => {
      const targetDisplay = this.formatTargetDisplay(target);

      if (!options.quiet) {
        this.log(`Running task '${taskName}' on ${targetDisplay}...`, 'info');
      }

      const result = await this.taskManager!.run(taskName, {}, {
        target: target.id
      });

      if (result.success) {
        if (!options.quiet) {
          this.log(`${prism.green('✓')} Task completed on ${targetDisplay}`, 'success');
        }
      } else {
        throw new Error(result.error?.message || 'Task failed');
      }
    };

    if (options.parallel && targets.length > 1) {
      const promises = targets.map(target =>
        executeTaskOnTarget(target)
          .then(() => ({ target, success: true } as const))
          .catch(error => ({ target, error, success: false } as const))
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => 'error' in r);

      if (errors.length > 0) {
        for (const { target, error } of errors as any[]) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`${prism.red('✗')} Task failed on ${this.formatTargetDisplay(target)}: ${errorMessage}`, 'error');
        }
        throw new Error(`Task failed on ${errors.length} hosts`);
      }
    } else {
      for (const target of targets) {
        await executeTaskOnTarget(target);
      }
    }
  }

  private async executeScript(
    targets: ResolvedTarget[],
    scriptPath: string,
    scriptArgs: string[],
    options: OnOptions
  ): Promise<void> {
    const scriptLoader = new ScriptLoader({
      verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
      quiet: options.quiet,
      cache: true,
      preferredCDN: 'esm.sh'
    });

    const executeScriptOnTarget = async (target: ResolvedTarget) => {
      const targetDisplay = this.formatTargetDisplay(target);

      if (!options.quiet) {
        this.log(`Running script '${scriptPath}' on ${targetDisplay}...`, 'info');
      }

      const engine = await this.createTargetEngine(target);
      const execOptions: ExecutionOptions = {
        target,
        targetEngine: engine,
        // The script's arguments are the tokens after its path — not
        // process.argv.slice(3), which began with the host pattern and the
        // script's own name.
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
        if (!options.quiet) {
          this.log(`${prism.green('✓')} Script completed on ${targetDisplay}`, 'success');
        }
      } else {
        throw result.error || new Error('Script execution failed');
      }
    };

    if (options.parallel && targets.length > 1) {
      const promises = targets.map(target =>
        executeScriptOnTarget(target)
          .then(() => ({ target, success: true } as const))
          .catch(error => ({ target, error, success: false } as const))
      );

      const results = await Promise.all(promises);
      const errors = results.filter(r => 'error' in r);

      if (errors.length > 0) {
        for (const { target, error } of errors as any[]) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log(`${prism.red('✗')} Script failed on ${this.formatTargetDisplay(target)}: ${errorMessage}`, 'error');
        }
        throw new Error(`Script failed on ${errors.length} hosts`);
      }
    } else {
      for (const target of targets) {
        await executeScriptOnTarget(target);
      }
    }
  }

  private async startRepl(
    target: ResolvedTarget,
    options: OnOptions
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

  private async runInteractiveMode(options: OnOptions): Promise<{
    hostPattern: string;
    commandParts?: string[];
    options: Partial<OnOptions>;
  } | null> {
    InteractiveHelpers.startInteractiveMode('Interactive SSH Execution Mode');

    try {
      // Select SSH hosts
      const hosts = await InteractiveHelpers.selectTarget({
        message: 'Select SSH hosts to execute on:',
        type: 'ssh',
        allowMultiple: true,
        allowCustom: true,
      });

      if (!hosts) return null;

      // Determine host pattern
      let hostPattern: string;
      if (Array.isArray(hosts)) {
        if (hosts.length === 1) {
          hostPattern = hosts[0]?.id || '';
        } else {
          // Create a pattern that matches multiple hosts
          const hostIds = hosts.map(h => h.id).filter(Boolean);
          hostPattern = hostIds.join(','); // We'll handle this in the main execution logic
        }
      } else {
        hostPattern = hosts.id;
      }

      // Select execution type
      const executionType = await InteractiveHelpers.selectFromList(
        'What do you want to execute?',
        [
          { value: 'command', label: '💻 Command' },
          { value: 'script', label: '📜 Script file' },
          { value: 'task', label: '⚙️  Configured task' },
          { value: 'repl', label: '🔧 REPL session' },
        ],
        (item) => item.label
      );

      if (!executionType) return null;

      const interactiveOptions: Partial<OnOptions> = {};
      let commandParts: string[] = [];

      // Configure based on execution type
      // eslint-disable-next-line default-case
      switch (executionType?.value) {
        case 'command': {
          const cmd = await InteractiveHelpers.inputText('Enter command to execute:', {
            placeholder: 'uptime',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Command cannot be empty';
              }
              return undefined;
            },
          });
          if (!cmd) return null;
          commandParts = [cmd];
          break;
        }

        case 'script': {
          const scriptPath = await InteractiveHelpers.inputText('Enter script file path:', {
            placeholder: './deploy.ts or /path/to/script.js',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Script path cannot be empty';
              }
              if (!value.endsWith('.ts') && !value.endsWith('.js')) {
                return 'Script must be a .ts or .js file';
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
            placeholder: 'deploy, backup, etc.',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Task name cannot be empty';
              }
              return undefined;
            },
          });
          if (!taskName) return null;
          interactiveOptions.task = taskName;
          break;
        }

        case 'repl': {
          if (Array.isArray(hosts) && hosts.length > 1) {
            InteractiveHelpers.showWarning('REPL mode only supports single hosts. Using the first selected host.');
            hostPattern = hosts[0]?.id || '';
          }
          interactiveOptions.repl = true;
          break;
        }
      }

      // Configure execution options
      if (Array.isArray(hosts) && hosts.length > 1 && executionType.value !== 'repl') {
        const useParallel = await InteractiveHelpers.confirmAction(
          'Execute on hosts in parallel?',
          true
        );
        if (useParallel) {
          interactiveOptions.parallel = true;

          const maxConcurrent = await InteractiveHelpers.selectFromList(
            'Maximum concurrent executions:',
            [
              { value: '5', label: '5 hosts' },
              { value: '10', label: '10 hosts' },
              { value: '20', label: '20 hosts' },
              { value: 'custom', label: 'Custom amount...' },
            ],
            (item) => item.label
          );

          if (maxConcurrent) {
            if (maxConcurrent?.value === 'custom') {
              const customCount = await InteractiveHelpers.inputText('Enter max concurrent executions:', {
                placeholder: '10',
                validate: (value) => {
                  if (!value) return 'Number is required';
                  const num = parseInt(value, 10);
                  if (isNaN(num) || num <= 0) {
                    return 'Please enter a positive number';
                  }
                  return undefined;
                },
              });
              if (customCount) {
                interactiveOptions.maxConcurrent = parseInt(customCount, 10);
              }
            } else {
              interactiveOptions.maxConcurrent = parseInt(maxConcurrent?.value || '10', 10);
            }
          }

          const useFailFast = await InteractiveHelpers.confirmAction(
            'Stop on first failure?',
            false
          );
          if (useFailFast) {
            interactiveOptions.failFast = true;
          }
        }
      }

      // Configure timeout
      const useTimeout = await InteractiveHelpers.confirmAction(
        'Set command timeout?',
        false
      );

      if (useTimeout) {
        const timeout = await InteractiveHelpers.selectFromList(
          'Select timeout duration:',
          [
            { value: '30s', label: '30 seconds' },
            { value: '1m', label: '1 minute' },
            { value: '5m', label: '5 minutes' },
            { value: '15m', label: '15 minutes' },
            { value: 'custom', label: 'Custom duration...' },
          ],
          (item) => item.label
        );

        if (timeout) {
          if (timeout?.value === 'custom') {
            const customTimeout = await InteractiveHelpers.inputText('Enter timeout duration:', {
              placeholder: '10m (10 minutes) or 30s (30 seconds)',
              validate: (value) => {
                if (!value || value.trim().length === 0) {
                  return 'Timeout cannot be empty';
                }
                // Basic validation for duration format
                if (!/^\d+[smh]$/.test(value)) {
                  return 'Please use format like 30s, 5m, or 1h';
                }
                return undefined;
              },
            });
            if (customTimeout) {
              interactiveOptions.timeout = customTimeout;
            }
          } else {
            interactiveOptions.timeout = timeout?.value || '30s';
          }
        }
      }

      // Configure environment variables
      const useEnvVars = await InteractiveHelpers.confirmAction(
        'Set environment variables?',
        false
      );

      if (useEnvVars) {
        const envVars: string[] = [];
        let addingVars = true;

        while (addingVars) {
          const envVar = await InteractiveHelpers.inputText('Enter environment variable (KEY=value):', {
            placeholder: 'NODE_ENV=production',
            validate: (value) => {
              if (!value || value.trim().length === 0) {
                return 'Environment variable cannot be empty';
              }
              if (!value.includes('=')) {
                return 'Please use KEY=value format';
              }
              return undefined;
            },
          });

          if (envVar) {
            envVars.push(envVar);
          }

          addingVars = await InteractiveHelpers.confirmAction(
            'Add another environment variable?',
            false
          );
        }

        if (envVars.length > 0) {
          interactiveOptions.env = envVars;
        }
      }

      // Configure working directory
      const useCwd = await InteractiveHelpers.confirmAction(
        'Set working directory on remote hosts?',
        false
      );

      if (useCwd) {
        const cwd = await InteractiveHelpers.inputText('Enter working directory:', {
          placeholder: '/app, /home/user, etc.',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Working directory cannot be empty';
            }
            return undefined;
          },
        });
        if (cwd) {
          interactiveOptions.cwd = cwd;
        }
      }

      // Configure SSH user override
      const useCustomUser = await InteractiveHelpers.confirmAction(
        'Override SSH user for execution?',
        false
      );

      if (useCustomUser) {
        const user = await InteractiveHelpers.inputText('Enter SSH user:', {
          placeholder: 'root, deploy, www-data, etc.',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'User cannot be empty';
            }
            return undefined;
          },
        });
        if (user) {
          interactiveOptions.user = user;
        }
      }

      InteractiveHelpers.endInteractiveMode('SSH execution configuration complete!');

      return {
        hostPattern,
        commandParts: commandParts.length > 0 ? commandParts : undefined,
        options: interactiveOptions,
      };
    } catch (error) {
      InteractiveHelpers.showError(`Interactive mode failed: ${error}`);
      return null;
    }
  }
}

export default function registerCommand(program: Command): void {
  const cmd = new OnCommand();
  program.addCommand(cmd.create());
}