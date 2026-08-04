import fs from 'fs';
import process from 'process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { checkForCommandTypo , installCleanupHandlers } from '@xec-sh/core';
/**
 * Loaded on demand rather than at import time.
 *
 * `@xec-sh/ops` pulls in the whole configuration, task and secrets
 * machinery — measured at 110ms of a 272ms `xec --help`. Printing help or a
 * version needs none of it, so it is imported at the first point that
 * genuinely does.
 */
const loadOps = () => import('@xec-sh/ops');

import { customizeHelp } from './utils/help-customizer.js';
import { loadDynamicCommands, registerCliCommands } from './utils/cli-command-manager.js';
import { findCommand, COMMAND_MANIFEST, type CommandManifestEntry } from './utils/command-manifest.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// A CLI owns its process, so it is the right place to release connections and
// temp files on SIGINT/SIGTERM. The library no longer does this on import.
installCleanupHandlers();

export function createProgram(): Command {
  const program = new Command();
  const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));

  program
    .name('xec')
    .description('Xec - universal execution shell')
    .version(pkg.version)
    .option('-v, --verbose', 'Enable verbose output')
    .option('-q, --quiet', 'Suppress output')
    .option('--cwd <path>', 'Set current working directory')
    .option('--no-color', 'Disable colored output')
    .option('-e, --eval <code>', 'Evaluate code')
    .option('--repl', 'Start interactive REPL')
    .hook('preAction', (thisCommand) => {
      const opts = thisCommand.opts();
      if (opts['cwd']) {
        process.chdir(opts['cwd']);
      }
      if (opts['noColor']) {
        process.env['NO_COLOR'] = '1';
      }
    });

  return program;
}

/**
 * Register built-in commands, importing only what this invocation needs.
 *
 * Importing all twelve modules to discover their names cost ~140ms on every
 * run — each one statically imports `@xec-sh/ops`. Listing them in `--help`
 * needs a name and a description, which the manifest already has; the
 * implementation is only needed for the command actually being run.
 *
 * @param program - The commander program to register onto.
 * @param requested - The command the user typed, if any.
 */
async function registerBuiltInCommands(program: Command, requested?: string): Promise<void> {
  const commandsDir = join(__dirname, './commands');
  if (!fs.existsSync(commandsDir)) return;

  const wanted = findCommand(requested);

  /** Import a module and let it register itself fully. */
  const loadModule = async (moduleName: string): Promise<void> => {
    const module = await import(join(commandsDir, `${moduleName}.js`));
    if (typeof module.default === 'function') {
      module.default(program);
    }
  };

  if (wanted) {
    await loadModule(wanted.module);
    // The rest are described from the manifest, so `xec run --help` still
    // lists its siblings without paying to load them.
    for (const entry of COMMAND_MANIFEST) {
      if (entry.module === wanted.module) continue;
      describeCommand(program, entry);
    }
    return;
  }

  for (const entry of COMMAND_MANIFEST) {
    describeCommand(program, entry);
  }
}

/**
 * Add a command that exists only to be listed and, if invoked, to load itself.
 *
 * @param program - The commander program.
 * @param entry - Manifest entry describing the command.
 */
function describeCommand(program: Command, entry: CommandManifestEntry): void {
  const stub = program
    .command(entry.name)
    .description(entry.description)
    .allowUnknownOption()
    .allowExcessArguments();

  for (const alias of entry.aliases) {
    stub.alias(alias);
  }

  // Reached only if argv did not name this command up front — for instance
  // `xec --some-flag config …`. Load the real one and re-run the parse.
  stub.action(async () => {
    const module = await import(join(__dirname, './commands', `${entry.module}.js`));
    const fresh = createProgram();
    if (typeof module.default === 'function') {
      module.default(fresh);
    }
    await fresh.parseAsync(process.argv);
  });
}

export async function loadCommands(program: Command, requested?: string): Promise<string[]> {
  await registerBuiltInCommands(program, requested);

  // Load dynamic commands using the new loader
  const dynamicCommandNames = await loadDynamicCommands(program);

  // Return dynamic command names for later use
  return dynamicCommandNames;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  /**
   * The task manager, built and loaded on first use.
   *
   * Constructing it eagerly meant every invocation — including `--help` and
   * `--version` — paid for the ops import plus a config-file read. Only the
   * paths that actually consult tasks need it.
   */
  let taskManagerPromise: ReturnType<typeof buildTaskManager> | null = null;
  const buildTaskManager = async () => {
    const { TaskManager, ConfigurationManager } = await loadOps();
    const manager = new TaskManager({ configManager: new ConfigurationManager() });
    await manager.load();
    return manager;
  };
  const tasks = () => (taskManagerPromise ??= buildTaskManager());

  // The command palette's history is deliberately not loaded here. Nothing
  // in the CLI displays the palette — `CommandPalette.show()` has no caller —
  // so reading and writing that history cost every invocation ~50ms (the
  // module statically imports @xec-sh/ops) to serve a feature that never
  // renders. The module stays; wire these back in at the point the palette is
  // actually shown.

  // Module loader is initialized lazily when needed by commands

  // `--version` prints a string from package.json and needs no command to be
  // registered. Falling through to loadCommands() made it discover — and, for
  // any project with a .xec/commands directory, transform and execute — every
  // dynamic command first, which pulls in the script loader and esbuild.
  const flags = argv.slice(2);
  if (flags.length === 1 && (flags[0] === '--version' || flags[0] === '-V')) {
    program.outputHelp = () => '';
    process.stdout.write(`${program.version()}\n`);
    return;
  }

  // Load all commands first (built-in and dynamic) BEFORE processing arguments
  // The first non-flag argument tells us which command to actually load.
  const requestedCommand = argv.slice(2).find(arg => !arg.startsWith('-'));
  const dynamicCommandNames = await loadCommands(program, requestedCommand);

  // Customize help output with dynamic commands info
  customizeHelp(program, dynamicCommandNames);

  // Build command registry for validation
  const commandRegistry = registerCliCommands(program);
  // Include dynamic command names in the command list
  const commandNames = program.commands.map(cmd => cmd.name())
    .concat(program.commands.flatMap(cmd => cmd.aliases() || []))
    .concat(dynamicCommandNames);

  try {
    // Check if this is a script execution
    const args = argv.slice(2);
    const firstArg = args[0];

    // Check for special flags first
    if (args.includes('-e') || args.includes('--eval')) {
      const evalIndex = args.indexOf('-e') !== -1 ? args.indexOf('-e') : args.indexOf('--eval');
      const code = args[evalIndex + 1];
      if (!code) {
        throw new Error('Code is required for eval');
      }
      const scriptArgs = args.slice(evalIndex + 2);
      await evalCodeDirectly(code, scriptArgs, {});
      return;
    }

    if (args.includes('--repl')) {
      await startReplDirectly({});
      return;
    }

    // Check if running a script file
    if (firstArg && !firstArg.startsWith('-') && firstArg !== 'help') {
      // Check if first argument is a file
      const potentialFile = firstArg;
      if (potentialFile.endsWith('.js') || potentialFile.endsWith('.ts') || potentialFile.endsWith('.mjs')) {
        // Run as script
        const scriptArgs = args.slice(1);
        await runScriptDirectly(potentialFile, scriptArgs, {});
        return;
      }
      // Also check if it's an existing file (not a directory)
      if (fs.existsSync(potentialFile)) {
        const stats = fs.statSync(potentialFile);
        if (stats.isFile()) {
          // Run as script
          const scriptArgs = args.slice(1);
          await runScriptDirectly(potentialFile, scriptArgs, {});
          return;
        }
      }
    }

    // Check if this is a task execution (but not a registered command)
    if (firstArg && !firstArg.startsWith('-') && !commandNames.includes(firstArg) && await (await tasks()).exists(firstArg)) {
      // This is a task
      const taskName = firstArg;
      const taskArgs = args.slice(1);

      // Parse task parameters from arguments
      const params: Record<string, any> = {};
      const remainingArgs: string[] = [];

      for (let i = 0; i < taskArgs.length; i++) {
        const arg = taskArgs[i];
        if (!arg) continue;

        if (arg.startsWith('--') && arg.includes('=')) {
          // --param=value format
          const [key, value] = arg.substring(2).split('=', 2);
          if (key) {
            params[key] = value || '';
          }
        } else if (arg.startsWith('--') && i + 1 < taskArgs.length) {
          const nextArg = taskArgs[i + 1];
          if (nextArg && !nextArg.startsWith('-')) {
            // --param value format
            const key = arg.substring(2);
            params[key] = nextArg;
            i++;
          } else {
            remainingArgs.push(arg);
          }
        } else {
          remainingArgs.push(arg);
        }
      }

      // Execute the task
      try {
        const result = await (await tasks()).run(taskName, params);

        if (!result.success) {
          console.error(`Task '${taskName}' failed`);
          process.exit(1);
        }
      } catch (error) {
        const { handleError } = await loadOps();
        handleError(error, {
          verbose: args.includes('-v') || args.includes('--verbose'),
          quiet: args.includes('-q') || args.includes('--quiet'),
          output: 'text'
        });
        process.exit(1);
      }

      return;
    }

    // A bare `--help`, `--version` or a known command needs neither the task
    // list nor the direct-execution machinery; loading them here made every
    // invocation pay for both.
    const mayBeDirect =
      args.length > 0 &&
      !args.every(arg => arg.startsWith('-')) &&
      !commandNames.includes(args[0]!);

    if (mayBeDirect) {
      const taskList = await (await tasks()).list();
      const taskNames = taskList.map((t: any) => t.name);
      const { isDirectCommand, executeDirectCommand } = await loadOps();

      if (isDirectCommand(args, commandNames, taskNames)) {
      const options = {
        verbose: args.includes('-v') || args.includes('--verbose'),
        quiet: args.includes('-q') || args.includes('--quiet'),
        cwd: undefined as string | undefined,
      };

      // Extract --cwd if present
      const cwdIndex = args.indexOf('--cwd');
      if (cwdIndex !== -1 && args[cwdIndex + 1]) {
        options.cwd = args[cwdIndex + 1];
        // Remove --cwd and its value from args
        args.splice(cwdIndex, 2);
      }

      // Remove other flags from args
      const cleanArgs = args.filter(arg =>
        !arg.startsWith('-') ||
        (arg.startsWith('-') && !['--verbose', '-v', '--quiet', '-q'].includes(arg))
      );

        await executeDirectCommand(cleanArgs, options);
        return;
      }
    }

    // Commands already loaded above

    // Set up command not found handler
    program.on('command:*', () => {
      const unknownCommand = program.args[0];
      console.error(`✖ Unknown command '${unknownCommand}'`);

      // Check for typos and suggest similar commands
      if (unknownCommand) {
        const suggestion = checkForCommandTypo(unknownCommand, commandRegistry);
        if (suggestion) {
          console.error('');
          console.error(suggestion);
        }
      }

      console.error('');
      console.error(`Run 'xec --help' for a list of available commands`);
      process.exit(1);
    });

    // If no arguments provided, show help by triggering help handler
    if (argv.length === 2) {
      argv.push('--help');
    }
    await program.parseAsync(argv);

    // Save command history on exit
  } catch (error) {
    // Use enhanced error handler
    const { handleError } = await loadOps();
    handleError(error, {
      verbose: program.opts()['verbose'],
      quiet: program.opts()['quiet'],
      output: 'text'
    });
  }
}

// Helper functions for direct script execution
async function runScriptDirectly(scriptPath: string, args: string[], options: any) {
  const { executeScript } = await import('@xec-sh/ops');
  await executeScript(scriptPath, { ...options, context: { args } });
}

async function evalCodeDirectly(code: string, args: string[], options: any) {
  const { evaluateCode } = await import('@xec-sh/ops');

  // evaluateCode reports failure in its return value rather than throwing, and
  // ignoring that made `xec -e` exit 0 whatever the code did — so in CI a
  // failed step was a green step and the pipeline went on to deploy.
  // `xec run script.ts` already exited 1 on the same failure; the two ways of
  // running code disagreed about what failure means.
  const result = await evaluateCode(code, { ...options, context: { args } }) as
    { success?: boolean; error?: unknown } | undefined;

  if (result?.success === false) {
    throw result.error ?? new Error('Evaluation failed');
  }
}

async function startReplDirectly(options: any) {
  const { startRepl } = await import('@xec-sh/ops');
  await startRepl(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}