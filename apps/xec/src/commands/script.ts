import vm from 'vm';
import path from 'path';
import chalk from 'chalk';
import fs from 'fs/promises';
import { Command } from 'commander';
import { transform } from 'esbuild';
import { pathToFileURL } from 'url';
import { createRequire } from 'module';
import * as clack from '@clack/prompts';

export default function (program: Command) {
  program
    .command('script [file]')
    .alias('s')
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
        clack.log.error(error instanceof Error ? error.message : 'Unknown error');
        if (process.env['XEC_DEBUG']) {
          console.error(error);
        }
        process.exit(1);
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
        clack.log.error(error instanceof Error ? error.message : 'Script error');
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

  // Import Xec script utilities
  const { $ } = await import('@xec/ush');
  const core = await import('@xec/core');
  const scriptUtils = await import('../script-utils.js');

  // Import all DSL functions from core
  const {
    // Task builders
    task, noop, wait, shell, group, script: scriptTask, sequence, log: logTask, fail: failTask, parallel: parallelTask,
    // Recipe builders
    recipe, phaseRecipe, simpleRecipe, moduleRecipe,
    // Context functions
    log, env, info, warn, fail, skip, when, debug, error, retry,
    getVar, setVar, secret, unless, getVars, getHost, getTags,
    isDryRun, getRunId, getPhase, getState, setState, hasState,
    getHosts, template, parallel, getTaskId, getHelper, getAttempt,
    clearState, getRecipeId, deleteState, matchesHost, matchesTags,
    registerHelper,
    // Standard library
    createStandardLibrary
  } = core;

  // Create global context
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
    __filename: scriptPath,
    __dirname: path.dirname(scriptPath),

    // Xec globals
    ...scriptUtils,
    $,
    argv: args,

    // DSL functions
    task, noop, wait, shell, group, script: scriptTask, sequence, logTask, failTask, parallelTask,
    recipe, phaseRecipe, simpleRecipe, moduleRecipe,

    // Context functions (global helpers)
    log, env, info, warn, fail, skip, when, debug, error, retry,
    getVar, setVar, secret, unless, getVars, getHost, getTags,
    isDryRun, getRunId, getPhase, getState, setState, hasState,
    getHosts, template, parallel, getTaskId, getHelper, getAttempt,
    clearState, getRecipeId, deleteState, matchesHost, matchesTags,
    registerHelper,

    // Common utilities
    chalk: (await import('chalk')).default,
    fs: (await import('fs-extra')).default,
    path,
    os: await import('os'),

    // Async utilities
    sleep: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),

    // Recipe integration
    runRecipe: async (name: string, vars: any = {}) => {
      const { executeRecipe } = core;

      // Try to load recipe
      const recipePath = path.join(process.cwd(), '.xec/recipes', `${name}.js`);
      const module = await import(pathToFileURL(recipePath).href);
      const recipe = module[name] || module.default;

      if (!recipe) {
        throw new Error(`Recipe '${name}' not found`);
      }

      return await executeRecipe(recipe, { vars });
    },

    // Dynamic import
    dynamicImport: async (specifier: string) => {
      if (specifier.startsWith('.')) {
        return import(pathToFileURL(path.join(path.dirname(scriptPath), specifier)).href);
      }
      return import(specifier);
    },

    // Stdlib factory
    createStdlib: async () => {
      const envInfo = {
        type: 'local' as const,
        capabilities: {
          shell: true,
          sudo: process.platform !== 'win32',
          docker: false,
          systemd: process.platform === 'linux'
        },
        platform: {
          os: process.platform === 'darwin' ? 'darwin' :
            process.platform === 'win32' ? 'windows' :
              'linux' as any,
          arch: process.arch === 'x64' ? 'x64' :
            process.arch === 'arm64' ? 'arm64' :
              'arm' as any
        }
      };

      const logger: any = {
        debug: (msg: string) => console.log(chalk.gray('[DEBUG]'), msg),
        info: (msg: string) => console.log(chalk.blue('[INFO]'), msg),
        warn: (msg: string) => console.log(chalk.yellow('[WARN]'), msg),
        error: (msg: string) => console.error(chalk.red('[ERROR]'), msg),
        child() { return this; }
      };

      return createStandardLibrary({ $, env: envInfo, logger });
    },
  });

  // Add import() function
  context['import'] = context['dynamicImport'];

  return context;
}

async function hasESModules(content: string): Promise<boolean> {
  // Check for ES module syntax
  const esModuleRegex = /(?:^|\n)\s*(?:import\s+|export\s+|import\s*\(|export\s*\{)/m;
  return esModuleRegex.test(content);
}

async function hasTopLevelAwait(content: string): Promise<boolean> {
  // Simple check for top-level await by looking for await outside of function/arrow function blocks
  // This is a basic heuristic - for more complex cases, we'd need a proper AST parser
  const lines = content.split('\n');
  
  for (const line of lines) {
    const trimmedLine = line.trim();
    
    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('/*')) {
      continue;
    }
    
    // Check for await at the start of a line (after variable declarations, etc.)
    if (/^(const|let|var)?\s*\w*\s*=?\s*await\s+/.test(trimmedLine)) {
      return true;
    }
    
    // Check for await as a statement
    if (trimmedLine.startsWith('await ')) {
      return true;
    }
  }
  
  return false;
}

async function transpileTypeScript(content: string, filename: string): Promise<string> {
  const hasModules = await hasESModules(content);
  const hasTopLevel = await hasTopLevelAwait(content);

  // If we have top-level await, extract imports and wrap the rest in an async IIFE
  if (hasTopLevel) {
    const lines = content.split('\n');
    const imports: string[] = [];
    const otherCode: string[] = [];
    
    for (const line of lines) {
      if (line.trim().startsWith('import ') || line.trim().startsWith('export ')) {
        imports.push(line);
      } else {
        otherCode.push(line);
      }
    }
    
    // Reconstruct with imports at top level and other code in async IIFE
    content = [
      ...imports,
      '',
      '(async () => {',
      ...otherCode,
      '})();'
    ].join('\n');
  }

  const result = await transform(content, {
    loader: 'ts',
    format: hasModules ? 'cjs' : 'esm', // Convert ES modules to CommonJS
    target: 'node18',
    sourcefile: filename,
    platform: 'node',
  });

  return result.code;
}

function extractCodeFromMarkdown(content: string): string {
  const codeBlocks: string[] = [];
  const lines = content.split('\n');
  let inCodeBlock = false;
  let currentBlock: string[] = [];
  let language = '';

  for (const line of lines) {
    if (line.startsWith('```')) {
      if (inCodeBlock) {
        // End of code block
        if (language === 'js' || language === 'javascript' ||
          language === 'ts' || language === 'typescript' ||
          language === 'xec' || language === '') {
          codeBlocks.push(currentBlock.join('\n'));
        }
        currentBlock = [];
        inCodeBlock = false;
        language = '';
      } else {
        // Start of code block
        inCodeBlock = true;
        language = line.slice(3).trim();
      }
    } else if (inCodeBlock) {
      currentBlock.push(line);
    }
  }

  return codeBlocks.join('\n\n');
}

export async function startRepl() {
  clack.intro(chalk.bgBlue(' Xec Interactive Shell '));
  clack.log.info('Type ".help" for help, ".exit" to quit\n');

  const repl = await import('repl');
  const context = await createScriptContext('<repl>', []);

  const replServer = repl.start({
    prompt: chalk.green('xec> '),
    useColors: true,
    useGlobal: false,
    breakEvalOnSigint: true,
    preview: false,
  });

  // Set custom context
  Object.assign(replServer.context, context);

  // Add custom commands
  replServer.defineCommand('run', {
    help: 'Run a recipe',
    async action(name: string) {
      this.clearBufferedCommand();
      try {
        const result = await context['runRecipe'](name);
        console.log(chalk.green('✓ Recipe completed'));
      } catch (error) {
        console.log(chalk.red('✗ ' + (error as Error).message));
      }
      this.displayPrompt();
    }
  });

  replServer.defineCommand('load', {
    help: 'Load a script file',
    async action(file: string) {
      this.clearBufferedCommand();
      try {
        let content = await fs.readFile(file, 'utf-8');
        const ext = path.extname(file);

        // Handle different file types
        if (ext === '.ts' || ext === '.tsx') {
          content = await transpileTypeScript(content, file);
        } else if (ext === '.js' || ext === '.mjs') {
          // Check if JavaScript file has ES modules and transpile if needed
          if (await hasESModules(content)) {
            content = await transpileTypeScript(content, file);
          }
        }

        await executeScript(content, file, replServer.context);
        console.log(chalk.green('✓ Script loaded'));
      } catch (error) {
        console.log(chalk.red('✗ ' + (error as Error).message));
      }
      this.displayPrompt();
    }
  });

  replServer.on('exit', () => {
    clack.outro(chalk.green('Bye!'));
    process.exit(0);
  });
}