import fs from 'fs';
import process from 'process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import * as clack from '@clack/prompts';

import { loadConfig } from './utils/config.js';
import { loadDynamicCommands } from './utils/dynamic-commands.js';

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

    await loadCommands(program);
    await program.parseAsync(argv);
  } catch (error) {
    if (error instanceof Error) {
      if (!program.opts()['quiet']) {
        clack.log.error(error.message);
      }
      process.exit(1);
    }
    throw error;
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