import fs from 'node:fs';
import process from 'node:process';
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';
import { join, dirname, delimiter } from 'node:path';
import { dispose, checkForCommandTypo , installCleanupHandlers } from '@xec-sh/core';
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
import { parseTaskArgs } from './utils/task-params.js';
import { registerSelfResolution } from './utils/self-resolution.js';
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
    // Root options bind only before the command word. Without this, the
    // root's -v/-q/-e swallowed identically spelled flags that belong to a
    // subcommand: `xec secrets set KEY -v VALUE` parsed -v as --verbose and
    // died on arity, and every documented `-e <key=value>` of on/in was
    // unreachable.
    .enablePositionalOptions()
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

/** Root flags that take no value. */
const ROOT_BOOLEAN_FLAGS = new Set(['-v', '--verbose', '-q', '--quiet', '--no-color', '--repl', '-V', '--version']);
/** Root flags whose next token is their value. */
const ROOT_VALUE_FLAGS = new Set(['--cwd', '-e', '--eval']);

/**
 * Index of the command word: the first token that is neither a root-level
 * flag nor the value of one. Root shorthands (-e, --repl) only act as such
 * before this point — after it, the same spelling belongs to the command,
 * so `xec on host cmd -e KEY=VALUE` reaches on's --env instead of the
 * root eval.
 */
function findCommandWordIndex(args: string[]): number {
  let i = 0;
  while (i < args.length) {
    const token = args[i]!;
    if (token === '--') return i;
    if (!token.startsWith('-')) return i;
    if (ROOT_VALUE_FLAGS.has(token)) {
      i += 2;
      continue;
    }
    const eq = token.indexOf('=');
    const name = eq === -1 ? token : token.slice(0, eq);
    if (ROOT_VALUE_FLAGS.has(name) || ROOT_BOOLEAN_FLAGS.has(name)) {
      i += 1;
      continue;
    }
    // An unrecognised flag is left for commander to judge.
    return i;
  }
  return args.length;
}

/** Whether an executable of this name is reachable, so a typo of a built-in
 * command is suggested instead of handed to the shell for an opaque 127. */
function commandExistsOnPath(name: string): boolean {
  if (name.includes('/')) return fs.existsSync(name);
  for (const dir of (process.env['PATH'] ?? '').split(delimiter)) {
    if (!dir) continue;
    try {
      fs.accessSync(join(dir, name), fs.constants.X_OK);
      return true;
    } catch {
      // keep looking
    }
  }
  return false;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  // `xec help <cmd>` reads as a request for that command's help. Left alone
  // it fell through to the shell, which ran the literal command `help on`.
  if (argv[2] === 'help') {
    argv = argv[3] ? [...argv.slice(0, 2), argv[3], '--help'] : [...argv.slice(0, 2), '--help'];
  }

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

  // From here on, user code may load — dynamic commands, scripts, eval,
  // REPL — and user code may import '@xec-sh/core' in a project that never
  // installed it. Registered once, before the first such import.
  registerSelfResolution();

  // Load all commands first (built-in and dynamic) BEFORE processing arguments
  // The command word tells us which command to actually load. Scanning past
  // root flags and their values matters: `xec --cwd /x config get k` names
  // config, not /x.
  const argsForScan = argv.slice(2);
  const scanIndex = findCommandWordIndex(argsForScan);
  const scannedToken = argsForScan[scanIndex];
  const requestedCommand =
    scannedToken === '--' || scannedToken?.startsWith('-') ? undefined : scannedToken;
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
    // Root shorthands live strictly before the command word; the same
    // spelling after it belongs to the command being run. Without this
    // boundary, `xec on host cmd -e KEY=VALUE` was evaluated as JavaScript
    // and `xec on host --repl` opened the local REPL without its target.
    const commandWordIndex = findCommandWordIndex(args);
    const rootRegion = args.slice(0, commandWordIndex);
    const commandWordToken = args[commandWordIndex];
    const commandWord =
      commandWordToken === '--' || commandWordToken?.startsWith('-') ? undefined : commandWordToken;

    // Root options act on every path from here on. The commander path
    // re-applies --cwd and --no-color in its preAction hook, which is
    // idempotent; before this block, an eval, a task or a direct command
    // silently kept the old directory and its colors.
    const rootOptions = {
      verbose: rootRegion.includes('-v') || rootRegion.includes('--verbose'),
      quiet: rootRegion.includes('-q') || rootRegion.includes('--quiet'),
      cwd: undefined as string | undefined,
    };
    const cwdFlagIndex = rootRegion.indexOf('--cwd');
    if (cwdFlagIndex !== -1) {
      rootOptions.cwd = rootRegion[cwdFlagIndex + 1];
    } else {
      const cwdInline = rootRegion.find(a => a.startsWith('--cwd='));
      if (cwdInline) rootOptions.cwd = cwdInline.slice('--cwd='.length);
    }
    if (rootOptions.cwd) {
      try {
        process.chdir(rootOptions.cwd);
      } catch {
        throw new Error(`Cannot change directory to '${rootOptions.cwd}': no such directory`);
      }
    }
    if (rootRegion.includes('--no-color')) {
      process.env['NO_COLOR'] = '1';
    }

    // Check for special flags first.
    //
    // Every shorthand routes through the run command rather than through a
    // private twin of it. The twins built a partial context ({ args } and
    // nothing else), which the loader half-injected — a direct
    // `xec script.ts one two` left argv undefined, the script threw on its
    // first line, and the failure was swallowed with exit 0. Root -e lost
    // its arguments entirely on the same road. One path, one context, one
    // failure contract.
    const evalIndex = rootRegion.findIndex(a => a === '-e' || a === '--eval' || a.startsWith('--eval='));
    if (evalIndex !== -1) {
      const inline = args[evalIndex]!.startsWith('--eval=');
      const code = inline ? args[evalIndex]!.slice('--eval='.length) : args[evalIndex + 1];
      if (!code) {
        throw new Error('Code is required for eval');
      }
      const scriptArgs = args.slice(evalIndex + (inline ? 1 : 2));
      await runViaRunCommand([undefined, scriptArgs], { eval: code }, rootOptions);
      return;
    }

    if (rootRegion.includes('--repl')) {
      await runViaRunCommand([undefined, []], { repl: true }, rootOptions);
      return;
    }

    // Check if running a script file
    if (commandWord) {
      // Check if first argument is a file
      const potentialFile = commandWord;
      const looksLikeScript = potentialFile.endsWith('.js') || potentialFile.endsWith('.ts') || potentialFile.endsWith('.mjs');
      const isExistingFile = !looksLikeScript && fs.existsSync(potentialFile) && fs.statSync(potentialFile).isFile();

      if (looksLikeScript || isExistingFile) {
        await runViaRunCommand([potentialFile, args.slice(commandWordIndex + 1)], {}, rootOptions);
        return;
      }
    }

    // A leading `--` is the explicit escape hatch: everything after it is a
    // shell command, never a task or a subcommand. `xec -- echo hello` used
    // to die on "Unknown command 'echo'".
    if (args[commandWordIndex] === '--') {
      const command = args.slice(commandWordIndex + 1);
      if (command.length > 0) {
        const { executeDirectCommand } = await loadOps();
        await executeDirectCommand(command, rootOptions);
        return;
      }
    }

    // Check if this is a task execution (but not a registered command)
    if (commandWord && !commandNames.includes(commandWord) && await (await tasks()).exists(commandWord)) {
      // This is a task
      const taskName = commandWord;
      const taskArgs = args.slice(commandWordIndex + 1);

      // Execute the task
      try {
        // One grammar with `xec run <task>`: --key=value, --key value,
        // --key as a switch, -p key=value. The old inline loop cut values
        // at their second '=' and silently discarded valueless flags.
        const { params, rest } = parseTaskArgs(taskArgs);
        if (rest.length > 0) {
          throw new Error(
            `Unexpected argument${rest.length > 1 ? 's' : ''} for task '${taskName}': ${rest.join(' ')}\n` +
            `Task parameters are named: use --key value or -p key=value`
          );
        }
        const result = await (await tasks()).run(taskName, params);

        if (!result.success) {
          console.error(`Task '${taskName}' failed`);
          process.exit(1);
        }
      } catch (error) {
        const { handleError } = await loadOps();
        handleError(error, {
          verbose: rootOptions.verbose,
          quiet: rootOptions.quiet,
          output: 'text'
        });
        process.exit(1);
      }

      return;
    }

    // A bare `--help`, `--version` or a known command needs neither the task
    // list nor the direct-execution machinery; loading them here made every
    // invocation pay for both.
    const mayBeDirect = commandWord !== undefined && !commandNames.includes(commandWord);

    if (mayBeDirect) {
      const taskList = await (await tasks()).list();
      const taskNames = taskList.map((t: any) => t.name);
      const { isDirectCommand, executeDirectCommand } = await loadOps();

      // The command is everything from the command word on. The old code
      // filtered -v/-q out of the whole argv, which silently rewrote user
      // commands: `xec grep -v pattern file` ran `grep pattern file` — an
      // inverted match presented as a successful one.
      const command = args.slice(commandWordIndex);

      if (isDirectCommand(command, commandNames, taskNames)) {
        // A name that is not on PATH but is one edit away from a built-in
        // reads as a typo of that built-in, not as a shell command: running
        // it anyway buried `xec confg` under a shell 127 with the advice to
        // check whether confg is installed.
        if (!commandExistsOnPath(commandWord)) {
          const suggestion = checkForCommandTypo(commandWord, commandRegistry);
          if (suggestion) {
            console.error(`✖ Unknown command '${commandWord}'`);
            console.error('');
            console.error(suggestion);
            console.error('');
            console.error(`Run 'xec --help' for a list of available commands`);
            process.exit(127);
          }
        }

        await executeDirectCommand(command, rootOptions);
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

/**
 * Route a root-level shorthand (`xec file.ts`, `xec -e`, `xec --repl`)
 * through the run command it abbreviates.
 *
 * The command is executed directly rather than re-parsed: its options are
 * set the way its own action handler would, so the shorthand and
 * `xec run ...` are the same code path with the same context, the same
 * local target, and the same exit-on-failure behaviour.
 */
async function runViaRunCommand(
  positionals: [string | undefined, string[]],
  options: Record<string, unknown>,
  rootOptions: { verbose: boolean; quiet: boolean }
): Promise<void> {
  const { RunCommand } = await import('./commands/run.js');
  const command = new RunCommand() as unknown as {
    options: Record<string, unknown>;
    execute(args: unknown[]): Promise<void>;
  };

  // Only flags before the command word are the root's. Scanning the whole
  // argv here made `xec script.mjs -q` silence the run command because the
  // script's own -q argument was mistaken for the root flag.
  const fullOptions = {
    verbose: rootOptions.verbose,
    quiet: rootOptions.quiet,
    ...options,
  };

  command.options = fullOptions;
  await command.execute([...positionals, fullOptions]);
}

/** Upper bound on how long releasing resources may delay the exit. */
const FORCED_SHUTDOWN_AFTER_MS = 2000;

/**
 * Exit deliberately once the work is done.
 *
 * Pooled SSH connections and keep-alive timers hold the event loop open, so
 * a completed `xec on host cmd` never exited on its own; and because the
 * library's signal handlers release resources without exiting, the process
 * survived SIGTERM and Ctrl+C too — only SIGKILL removed it. Dispose the
 * engine, then end the process; the timer caps a dispose that itself hangs.
 */
function shutdown(code: number): void {
  // `.unref()` on the returned timer is Node's spelling; Deno returns a
  // plain number and throws on it — the class of defect core already
  // solved for itself. The guard is inline because the shutdown path must
  // not depend on an import resolving.
  const forced = setTimeout(() => process.exit(code), FORCED_SHUTDOWN_AFTER_MS) as
    NodeJS.Timeout & { unref?: () => void };
  if (typeof forced.unref === 'function') {
    forced.unref();
  } else if (typeof (globalThis as { Deno?: { unrefTimer?: (id: number) => void } }).Deno?.unrefTimer === 'function') {
    (globalThis as unknown as { Deno: { unrefTimer: (id: number) => void } }).Deno.unrefTimer(forced as unknown as number);
  }
  void dispose()
    .catch(() => undefined)
    .then(() => process.exit(code));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.once('SIGINT', () => shutdown(130));
  process.once('SIGTERM', () => shutdown(143));

  // A REPL keeps serving after run() resolves — it is the one path where
  // returning from run() must not end the process.
  const wantsRepl = process.argv.includes('--repl');
  run().then(
    () => {
      if (!wantsRepl) shutdown(Number(process.exitCode ?? 0));
    },
    () => shutdown(1),
  );
}