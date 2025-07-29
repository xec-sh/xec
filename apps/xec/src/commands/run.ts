import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { handleError } from '../utils/error-handler.js';
import { createUniversalLoader } from '../utils/universal-loader.js';

export default function (program: Command) {
  program
    .command('run [file]')
    .alias('r')
    .description('Run an Xec script')
    .option('-e, --eval <code>', 'Evaluate code')
    .option('--repl', 'Start interactive REPL')
    .option('--typescript', 'Enable TypeScript support')
    .option('--watch', 'Watch for file changes')
    .option('--runtime <runtime>', 'Specify runtime: auto, node, bun, deno (default: auto)')
    .option('--no-universal', 'Disable universal loader (legacy mode)')
    .allowUnknownOption(true)
    .helpOption('-h, --help', 'Display help for command')
    .action(async (file, options, command) => {
      try {
        // Get script arguments (everything after --)
        const scriptArgs = command.args.slice(command.args.indexOf(file) + 1);

        if (options.repl) {
          await startRepl(options);
        } else if (options.eval) {
          await evalCode(options.eval, scriptArgs, options);
        } else if (file) {
          await runScript(file, scriptArgs, options);
        } else {
          clack.log.error('No script file specified');
          clack.log.info('Usage: xec <file> [args...]');
          clack.log.info('       xec -e <code>');
          clack.log.info('       xec --repl');
          process.exit(1);
        }
      } catch (error) {
        handleError(error, {
          verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
          quiet: options.parent?.opts()?.quiet,
          output: 'text'
        });
      }
    });
}

/**
 * Run script using universal loader
 */
export async function runScript(scriptPath: string, args: string[], options: any) {
  const loader = createUniversalLoader({
    runtime: options.runtime || 'auto',
    typescript: options.typescript,
    watch: options.watch,
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
  });

  // Display runtime info
  const context = loader.getScriptContext();
  if (!options.parent?.opts()?.quiet) {
    clack.log.info(`Running with ${chalk.cyan(context.runtime)} ${chalk.dim(context.version)}`);
    
    if (context.features.typescript && (scriptPath.endsWith('.ts') || scriptPath.endsWith('.tsx'))) {
      clack.log.info(chalk.dim('TypeScript support: ') + chalk.green('✓'));
    }
  }

  try {
    if (options.watch) {
      const { watch } = await import('chokidar');
      
      const runAndLog = async () => {
        try {
          clack.log.info(chalk.dim(`Running ${scriptPath}...`));
          await loader.loadScript(scriptPath, args);
        } catch (error) {
          handleError(error, {
            verbose: false,
            quiet: false,
            output: 'text'
          });
        }
      };

      await runAndLog();

      const watcher = watch(scriptPath, { ignoreInitial: true });
      watcher.on('change', async () => {
        console.clear();
        clack.log.info(chalk.dim('File changed, rerunning...'));
        await runAndLog();
      });

      // Keep process alive
      process.stdin.resume();
    } else {
      await loader.loadScript(scriptPath, args);
    }
  } catch (error) {
    // If runtime not available, provide helpful message
    if (error instanceof Error && error.message.includes('runtime requested but not available')) {
      clack.log.error(error.message);
      
      const runtime = options.runtime || 'auto';
      if (runtime !== 'auto') {
        clack.log.info('\nTo use a specific runtime, ensure it is installed and run xec with it:');
        clack.log.info(`  ${chalk.cyan(`${runtime} xec run ${scriptPath}`)}`);
      }
    } else {
      throw error;
    }
  }
}

/**
 * Evaluate code using universal loader
 */
export async function evalCode(code: string, args: string[], options: any) {
  const loader = createUniversalLoader({
    runtime: options.runtime || 'auto',
    typescript: options.typescript,
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
  });

  // Display runtime info
  const context = loader.getScriptContext();
  if (!options.parent?.opts()?.quiet) {
    clack.log.info(`Evaluating with ${chalk.cyan(context.runtime)} ${chalk.dim(context.version)}`);
  }

  try {
    await loader.evalCode(code, args);
  } catch (error) {
    // If runtime not available, provide helpful message
    if (error instanceof Error && error.message.includes('runtime requested but not available')) {
      clack.log.error(error.message);
      
      const runtime = options.runtime || 'auto';
      if (runtime !== 'auto') {
        clack.log.info('\nTo use a specific runtime, ensure it is installed and run xec with it:');
        clack.log.info(`  ${chalk.cyan(`${runtime} xec -e "${code}"`)}`);
      }
    } else {
      throw error;
    }
  }
}


/**
 * Start REPL using universal loader
 */
export async function startRepl(options: any) {
  const loader = createUniversalLoader({
    runtime: options.runtime || 'auto',
    typescript: true, // Always enable TypeScript in REPL
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
  });

  // Display runtime info
  const context = loader.getScriptContext();
  clack.log.info(chalk.bold('Xec Interactive Shell'));
  clack.log.info(`Using ${chalk.cyan(context.runtime)} ${chalk.dim(context.version)}`);
  clack.log.info(chalk.dim('Type .help for commands'));

  const repl = await import('repl');
  const replServer = repl.start({
    prompt: chalk.cyan('xec> '),
    useGlobal: false,
    breakEvalOnSigint: true
  });

  // Add context from loader
  const scriptContext = await loader.createContext('<repl>', []);
  Object.assign(replServer.context, scriptContext);

  // Add custom commands
  replServer.defineCommand('load', {
    help: 'Load and run a script file',
    action(filename: string) {
      runScript(filename.trim(), [], options)
        .then(() => {
          this.displayPrompt();
        })
        .catch((error) => {
          handleError(error, {
            verbose: false,
            quiet: false,
            output: 'text'
          });
          this.displayPrompt();
        });
    }
  });

  replServer.defineCommand('clear', {
    help: 'Clear the console',
    action() {
      console.clear();
      this.displayPrompt();
    }
  });

  replServer.defineCommand('runtime', {
    help: 'Show current runtime information',
    action() {
      const ctx = loader.getScriptContext();
      console.log(`Runtime: ${chalk.cyan(ctx.runtime)} ${chalk.dim(ctx.version)}`);
      console.log(`Features:`);
      Object.entries(ctx.features).forEach(([feature, enabled]) => {
        console.log(`  ${feature}: ${enabled ? chalk.green('✓') : chalk.red('✗')}`);
      });
      this.displayPrompt();
    }
  });
}

