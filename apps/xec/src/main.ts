import fs from 'fs';
import process from 'process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { checkForCommandTypo } from '@xec-sh/core';

import { handleError } from './utils/error-handler.js';
import { customizeHelp } from './utils/help-customizer.js';
import { TaskManager, ConfigurationManager } from './config/index.js';
import { isDirectCommand, executeDirectCommand } from './utils/direct-execution.js';
import { loadDynamicCommands, registerCliCommands } from './utils/cli-command-manager.js';
import { saveCommandHistory, initializeCommandPalette } from './utils/command-palette.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

export async function loadCommands(program: Command): Promise<string[]> {
  const commandsDir = join(__dirname, './commands');

  // Load built-in commands
  if (fs.existsSync(commandsDir)) {
    const files = fs.readdirSync(commandsDir);
    for (const file of files) {
      if (file.endsWith('.js')) {
        const commandPath = join(commandsDir, file);
        const module = await import(commandPath);
        if (module.default && typeof module.default === 'function') {
          module.default(program);
        }
      }
    }
  }

  // Load dynamic commands using the new loader
  const dynamicCommandNames = await loadDynamicCommands(program);

  // Return dynamic command names for later use
  return dynamicCommandNames;
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  // Initialize v2.0 configuration system
  const configManager = new ConfigurationManager();
  const taskManager = new TaskManager({ configManager });
  await taskManager.load();

  // Initialize command palette
  await initializeCommandPalette();

  // Module loader is initialized lazily when needed by commands

  // Load all commands first (built-in and dynamic) BEFORE processing arguments
  const dynamicCommandNames = await loadCommands(program);

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
    if (firstArg && !firstArg.startsWith('-') && !commandNames.includes(firstArg) && await taskManager.exists(firstArg)) {
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
        const result = await taskManager.run(taskName, params);

        if (!result.success) {
          console.error(`Task '${taskName}' failed`);
          process.exit(1);
        }
      } catch (error) {
        handleError(error, {
          verbose: args.includes('-v') || args.includes('--verbose'),
          quiet: args.includes('-q') || args.includes('--quiet'),
          output: 'text'
        });
        process.exit(1);
      }

      return;
    }

    // Get task names for command detection
    const taskList = await taskManager.list();
    const taskNames = taskList.map((t: any) => t.name);

    // Check if this is a direct command execution
    if (args.length > 0 && isDirectCommand(args, commandNames, taskNames)) {
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
    await saveCommandHistory();
  } catch (error) {
    // Use enhanced error handler
    handleError(error, {
      verbose: program.opts()['verbose'],
      quiet: program.opts()['quiet'],
      output: 'text'
    });
  }
}

// Helper functions for direct script execution
async function runScriptDirectly(scriptPath: string, args: string[], options: any) {
  const { executeScript } = await import('./utils/script-loader.js');
  await executeScript(scriptPath, { ...options, context: { args } });
}

async function evalCodeDirectly(code: string, args: string[], options: any) {
  const { evaluateCode } = await import('./utils/script-loader.js');
  await evaluateCode(code, { ...options, context: { args } });
}

async function startReplDirectly(options: any) {
  const { startRepl } = await import('./utils/script-loader.js');
  await startRepl(options);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}