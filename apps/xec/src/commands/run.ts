import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { handleError } from '../utils/error-handler.js';
import { getModuleLoader, initializeGlobalModuleContext } from '../utils/unified-module-loader.js';

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
  // Initialize global module context
  await initializeGlobalModuleContext({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    preferredCDN: 'esm.sh'
  });
  
  // Get module loader
  const loader = getModuleLoader({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    cache: true,
    preferredCDN: 'esm.sh'
  });

  // Display runtime info
  if (!options.parent?.opts()?.quiet) {
    clack.log.info(`Running script: ${chalk.cyan(scriptPath)}`);
    
    if (scriptPath.endsWith('.ts') || scriptPath.endsWith('.tsx')) {
      clack.log.info(chalk.dim('TypeScript support: ') + chalk.green('✓'));
    }
  }

  try {
    if (options.watch) {
      const { watch } = await import('chokidar');
      
      const runAndLog = async () => {
        try {
          clack.log.info(chalk.dim(`Running ${scriptPath}...`));
          // Create a temporary context for the script
        (globalThis as any).__xecScriptContext = {
          args,
          argv: [process.argv[0], scriptPath, ...args],
          __filename: scriptPath,
          __dirname: path.dirname(scriptPath),
        };
        
        try {
          const content = await fs.readFile(scriptPath, 'utf-8');
          const ext = path.extname(scriptPath);
          let transformedCode = content;
          
          if (ext === '.ts' || ext === '.tsx') {
            transformedCode = await loader.transformTypeScript(content, scriptPath);
          }
          const dataUrl = `data:text/javascript;base64,${Buffer.from(transformedCode).toString('base64')}`;
          await import(dataUrl);
        } finally {
          delete (globalThis as any).__xecScriptContext;
        }
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
      // Create a temporary context for the script
      (globalThis as any).__xecScriptContext = {
        args,
        argv: [process.argv[0], scriptPath, ...args],
        __filename: scriptPath,
        __dirname: path.dirname(scriptPath),
      };
      
      try {
        const content = await fs.readFile(scriptPath, 'utf-8');
        const ext = path.extname(scriptPath);
        let transformedCode = content;
        
        if (ext === '.ts' || ext === '.tsx') {
          transformedCode = await loader.transformTypeScript(content, scriptPath);
        }
        
        const dataUrl = `data:text/javascript;base64,${Buffer.from(transformedCode).toString('base64')}`;
        await import(dataUrl);
      } finally {
        delete (globalThis as any).__xecScriptContext;
      }
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
  // Initialize global module context
  await initializeGlobalModuleContext({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    preferredCDN: 'esm.sh'
  });
  
  // Get module loader
  const loader = getModuleLoader({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    cache: true,
    preferredCDN: 'esm.sh'
  });

  // Display runtime info
  if (!options.parent?.opts()?.quiet) {
    clack.log.info(`Evaluating code...`);
  }

  try {
    // Transform TypeScript if needed and evaluate
    const transformedCode = code.includes('interface') || code.includes('type ') || options.typescript
      ? await loader.transformTypeScript(code, '<eval>')
      : code;
    
    // Create a temporary script context
    (globalThis as any).__xecScriptContext = {
      args,
      argv: ['xec', '<eval>', ...args],
      __filename: '<eval>',
      __dirname: process.cwd(),
    };
    
    try {
      const dataUrl = `data:text/javascript;base64,${Buffer.from(transformedCode).toString('base64')}`;
      await import(dataUrl);
    } finally {
      delete (globalThis as any).__xecScriptContext;
    }
  } catch (error) {
    throw error;
  }
}


/**
 * Start REPL using universal loader
 */
export async function startRepl(options: any) {
  // Initialize global module context
  await initializeGlobalModuleContext({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    preferredCDN: 'esm.sh'
  });
  
  // Get module loader
  const loader = getModuleLoader({
    verbose: process.env['XEC_DEBUG'] === 'true' || options.parent?.opts()?.verbose,
    cache: true,
    preferredCDN: 'esm.sh'
  });

  // Display runtime info
  clack.log.info(chalk.bold('Xec Interactive Shell'));
  clack.log.info(chalk.dim('Type .help for commands'));

  const repl = await import('repl');
  const replServer = repl.start({
    prompt: chalk.cyan('xec> '),
    useGlobal: false,
    breakEvalOnSigint: true
  });

  // Add xec utilities and module context
  const { $ } = await import('@xec-sh/core');
  const scriptUtils = await import('../script-utils.js');
  
  Object.assign(replServer.context, {
    $,
    ...scriptUtils.default,
    console,
    process,
    import: (spec: string) => (globalThis as any).__xecModuleContext.import(spec),
    importNPM: (pkg: string) => (globalThis as any).__xecModuleContext.importNPM(pkg),
    importJSR: (pkg: string) => (globalThis as any).__xecModuleContext.importJSR(pkg)
  });

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
      console.log(`Runtime: ${chalk.cyan('Node.js')} ${chalk.dim(process.version)}`);
      console.log(`Features:`);
      console.log(`  TypeScript: ${chalk.green('✓')}`);
      console.log(`  ESM: ${chalk.green('✓')}`);
      console.log(`  Workers: ${chalk.green('✓')}`);
      this.displayPrompt();
    }
  });
}

