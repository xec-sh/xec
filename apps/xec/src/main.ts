import fs from 'fs';
import process from 'process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { checkForCommandTypo } from '@xec-sh/core';

import { loadConfig } from './utils/config.js';
import { handleError } from './utils/error-handler.js';
import { loadDynamicCommands } from './utils/dynamic-commands.js';
import { registerCliCommands } from './utils/command-registry.js';
import { isDirectCommand, executeDirectCommand } from './utils/direct-execution.js';

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

export async function loadCommands(program: Command): Promise<void> {
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
  await loadDynamicCommands(program);
}

export async function run(argv: string[] = process.argv): Promise<void> {
  const program = createProgram();

  // Load configuration
  await loadConfig();

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
      if (potentialFile.endsWith('.js') || potentialFile.endsWith('.ts') ||
        potentialFile.endsWith('.mjs') || fs.existsSync(potentialFile)) {
        // Run as script
        const scriptArgs = args.slice(1);
        await runScriptDirectly(potentialFile, scriptArgs, {});
        return;
      }
    }

    // Check if this is a direct command execution
    if (args.length > 0 && isDirectCommand(args)) {
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

    await loadCommands(program);
    
    // Build command registry for suggestions
    const commandRegistry = registerCliCommands(program);
    
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
    
    await program.parseAsync(argv);
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
  const scriptModule = await import('./commands/run.js');
  const { runScript } = scriptModule;
  await runScript(scriptPath, args, options);
}

async function evalCodeDirectly(code: string, args: string[], options: any) {
  const scriptModule = await import('./commands/run.js');
  const { evalCode } = scriptModule;
  await evalCode(code, args);
}

async function startReplDirectly(options: any) {
  const scriptModule = await import('./commands/run.js');
  const { startRepl } = scriptModule;
  await startRepl();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run();
}