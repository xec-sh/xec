import vm from 'vm';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { Command } from 'commander';
import { transform } from 'esbuild';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import * as clack from '@clack/prompts';

import { handleError } from '../utils/error-handler.js';

export default function (program: Command) {
  program
    .command('run [file]')
    .alias('r')
    .description('Run an Xec script')
    .option('-e, --eval <code>', 'Evaluate code')
    .option('--repl', 'Start interactive REPL')
    .option('--typescript', 'Enable TypeScript support')
    .option('--watch', 'Watch for file changes')
    .allowUnknownOption(true)
    .helpOption('-h, --help', 'Display help for command')
    .action(async (file, options, command) => {
      try {
        // Get script arguments (everything after --)
        const scriptArgs = command.args.slice(command.args.indexOf(file) + 1);

        if (options.repl) {
          await startRepl();
        } else if (options.eval) {
          await evalCode(options.eval, scriptArgs);
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

export async function runScript(scriptPath: string, args: string[], options: any) {
  const fullPath = path.resolve(scriptPath);

  // Check if file exists
  try {
    await fs.access(fullPath);
  } catch {
    throw new Error(`Script not found: ${scriptPath}`);
  }

  // Read script content
  let content = await fs.readFile(fullPath, 'utf-8');
  const ext = path.extname(fullPath);

  // Handle different file types
  if (ext === '.ts' || ext === '.tsx' || options.typescript) {
    content = await transpileTypeScript(content, fullPath);
  } else if (ext === '.md') {
    content = extractCodeFromMarkdown(content);
  } else if (ext === '.js' || ext === '.mjs') {
    // Check if JavaScript file has ES modules and transpile if needed
    if (await hasESModules(content)) {
      content = await transpileTypeScript(content, fullPath);
    }
  }

  // Create script context
  const context = await createScriptContext(fullPath, args);

  // Add shebang support
  if (content.startsWith('#!')) {
    content = content.split('\n').slice(1).join('\n');
  }

  // Wrap in async function
  const wrappedCode = `
(async () => {
  ${content}
})();
`;

  // Run script
  if (options.watch) {
    const { watch } = await import('chokidar');

    const runAndLog = async () => {
      try {
        clack.log.info(chalk.dim(`Running ${scriptPath}...`));
        await executeScript(wrappedCode, fullPath, context);
      } catch (error) {
        handleError(error, {
          verbose: false,
          quiet: false,
          output: 'text'
        });
      }
    };

    await runAndLog();

    const watcher = watch(fullPath, { ignoreInitial: true });
    watcher.on('change', async () => {
      console.clear();
      clack.log.info(chalk.dim('File changed, rerunning...'));
      content = await fs.readFile(fullPath, 'utf-8');
      if (ext === '.ts' || ext === '.tsx' || options.typescript) {
        content = await transpileTypeScript(content, fullPath);
      } else if (ext === '.js' || ext === '.mjs') {
        // Check if JavaScript file has ES modules and transpile if needed
        if (await hasESModules(content)) {
          content = await transpileTypeScript(content, fullPath);
        }
      }
      await runAndLog();
    });

    // Keep process alive
    process.stdin.resume();
  } else {
    await executeScript(wrappedCode, fullPath, context);
  }
}

export async function evalCode(code: string, args: string[]) {
  const context = await createScriptContext('<eval>', args);

  // Check if code has ES modules and transpile if needed
  if (await hasESModules(code)) {
    code = await transpileTypeScript(code, '<eval>');
  }

  const wrappedCode = `
(async () => {
  ${code}
})();
`;
  await executeScript(wrappedCode, '<eval>', context);
}

async function executeScript(code: string, filename: string, context: any) {
  const script = new vm.Script(code, {
    filename,
    importModuleDynamically: vm.constants.USE_MAIN_CONTEXT_DEFAULT_LOADER
  });
  const result = await script.runInContext(context);

  // Handle Promise results
  if (result && typeof result.then === 'function') {
    await result;
  }
}

async function createScriptContext(scriptPath: string, args: string[]) {
  const require = createRequire(scriptPath === '<eval>' || scriptPath === '<repl>' ? import.meta.url : scriptPath);

  // Set script mode environment variable
  process.env['XEC_SCRIPT_MODE'] = 'true';

  // Import Xec script utilities
  const { $ } = await import('@xec-sh/core');
  const scriptUtils = await import('../script-utils.js');
  
  // Import CLI configuration API
  const cliApi = await import('../cli.js');
  await cliApi.loadCliConfig(); // Ensure config is loaded

  // Create global context with available utilities
  const context = vm.createContext({
    // Node.js globals
    console,
    process,
    Buffer,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout,
    setInterval,
    setImmediate,
    clearTimeout,
    clearInterval,
    clearImmediate,

    // Module system
    require,
    module: { exports: {} },
    exports: {},
    __filename: scriptPath,
    __dirname: path.dirname(scriptPath),

    // Arguments
    args,
    argv: [process.argv[0], scriptPath, ...args],

    // Core Xec utilities
    $,
    ...scriptUtils.default,
    
    // CLI configuration API
    config: cliApi.config,
    hosts: cliApi.hosts,
    containers: cliApi.containers,
    pods: cliApi.pods,
    resolveAlias: cliApi.resolveAlias,
    runAlias: cliApi.runAlias,
    useProfile: cliApi.useProfile,

    // Helper functions
    log: console.log,
    print: console.log,
    echo: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
    debug: console.debug,

    // Global namespace for scripts
    global: {}
  });

  // Import function for dynamic imports
  context['import'] = async (specifier: string) => {
    const resolved = require.resolve(specifier);
    return import(pathToFileURL(resolved).href);
  };

  return context;
}

async function transpileTypeScript(code: string, filename: string): Promise<string> {
  const result = await transform(code, {
    format: 'cjs',
    target: 'node16',
    loader: filename.endsWith('.tsx') ? 'tsx' : 'ts',
    sourcemap: 'inline',
    sourcefile: filename
  });
  return result.code;
}

function extractCodeFromMarkdown(content: string): string {
  const codeBlocks: string[] = [];
  const regex = /```(?:javascript|js|typescript|ts|xec)?\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(content)) !== null) {
    if (typeof match[1] === 'string') {
      codeBlocks.push(match[1]);
    }
  }

  return codeBlocks.join('\n\n');
}

async function hasESModules(code: string): Promise<boolean> {
  // Check for ES module syntax
  return /\b(import|export)\b/.test(code);
}

export async function startRepl() {
  const repl = await import('repl');
  const context = await createScriptContext('<repl>', []);

  clack.log.info(chalk.bold('Xec Interactive Shell'));
  clack.log.info(chalk.dim('Type .help for commands'));

  const replServer = repl.start({
    prompt: chalk.cyan('xec> '),
    useGlobal: false,
    breakEvalOnSigint: true
  });

  // Add context to REPL
  Object.assign(replServer.context, context);

  // Add custom commands
  replServer.defineCommand('load', {
    help: 'Load and run a script file',
    action(filename: string) {
      runScript(filename.trim(), [], {})
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
}