/**
 * REPL examples for @xec-sh/loader
 *
 * This example demonstrates:
 * - Starting a REPL server
 * - Custom commands
 * - Context injection
 * - Runtime utilities in REPL
 *
 * Run this example and try:
 * - Type JavaScript code directly
 * - Use .help to see available commands
 * - Use .runtime to see runtime info
 * - Use .clear to clear the console
 * - Access $runtime utilities
 * - Press Ctrl+C twice or .exit to quit
 */

import {
  REPLServer,
  REPLCommands,
  ScriptRuntime,
  GlobalInjector,
  createBuiltinCommands,
} from '../src/index.js';

async function main() {
  console.log('=== @xec-sh/loader REPL Examples ===\n');

  // Example 1: Basic REPL
  console.log('Example 1: Basic REPL (commented out - uncomment to run interactively)');
  console.log('');
  /*
  const basicREPL = new REPLServer({
    prompt: 'basic> ',
    includeBuiltins: true,
    showWelcome: true,
    title: '🚀 Basic REPL',
    welcomeMessage: 'Welcome to the basic REPL! Type .help for commands.',
  });

  basicREPL.start();
  */

  // Example 2: REPL with custom runtime
  console.log('Example 2: REPL with runtime utilities (commented out)');
  console.log('');
  /*
  const runtime = new ScriptRuntime();
  const runtimeREPL = new REPLServer({
    prompt: 'runtime> ',
    includeBuiltins: true,
    showWelcome: true,
    title: '⚡ Runtime REPL',
    welcomeMessage: 'Runtime utilities available as $runtime. Try: $runtime.pwd()',
    context: {
      $runtime: runtime,
    },
  });

  runtimeREPL.start();
  */

  // Example 3: REPL with custom commands
  console.log('Example 3: Creating custom REPL commands');
  const customCommands = new REPLCommands();

  // Add custom commands
  customCommands.register('greet', 'Greet someone', function (name?: string) {
    console.log(`Hello, ${name || 'World'}!`);
    this.displayPrompt();
  });

  customCommands.register('calc', 'Simple calculator', function (expr?: string) {
    if (!expr) {
      console.log('Usage: .calc <expression>');
      console.log('Example: .calc 2 + 2');
    } else {
      try {
        // Note: eval is safe here as it's in a controlled REPL environment
        const result = eval(expr);
        console.log(`Result: ${result}`);
      } catch (error) {
        console.log(`Error: ${(error as Error).message}`);
      }
    }
    this.displayPrompt();
  });

  customCommands.register('env', 'Show environment variable', function (key?: string) {
    if (!key) {
      console.log('Usage: .env <KEY>');
      console.log('Example: .env PATH');
    } else {
      const value = process.env[key];
      console.log(`${key} = ${value || '(not set)'}`);
    }
    this.displayPrompt();
  });

  console.log('   Created custom commands:');
  for (const [name, cmd] of customCommands.getAll()) {
    console.log(`   - .${name}: ${cmd.help}`);
  }
  console.log('');

  /*
  const customREPL = new REPLServer({
    prompt: 'custom> ',
    commands: customCommands,
    includeBuiltins: true,
    showWelcome: true,
    title: '🎨 Custom Commands REPL',
    welcomeMessage: 'Type .help to see all available commands including custom ones.',
  });

  customREPL.start();
  */

  // Example 4: REPL with global injector
  console.log('Example 4: REPL with global injection');
  const injector = new GlobalInjector({
    globals: {
      API_URL: 'https://api.example.com',
      VERSION: '1.0.0',
      config: {
        debug: true,
        timeout: 5000,
      },
    },
  });

  console.log('   Injected globals:');
  console.log('   - API_URL');
  console.log('   - VERSION');
  console.log('   - config');
  console.log('');

  /*
  await injector.execute(async () => {
    const injectedREPL = new REPLServer({
      prompt: 'injected> ',
      includeBuiltins: true,
      showWelcome: true,
      title: '💉 Injected Globals REPL',
      welcomeMessage: 'Try: API_URL, VERSION, or config',
    });

    injectedREPL.start();
  });
  */

  // Example 5: Programmatic REPL usage
  console.log('Example 5: Programmatic REPL usage');
  const progREPL = new REPLServer({
    prompt: 'prog> ',
    showWelcome: false,
  });

  const server = progREPL.start();
  console.log(`   REPL started: ${progREPL.isRunning()}`);
  console.log(`   Prompt: ${server.getPrompt()}`);

  // Add context dynamically
  progREPL.addContext('version', '2.0.0');
  progREPL.addContext('timestamp', Date.now());

  console.log(`   Added context variables: version, timestamp`);

  // Register command dynamically
  progREPL.registerCommand('info', 'Show REPL info', function () {
    console.log('REPL Information:');
    console.log(`- Prompt: ${this.getPrompt()}`);
    console.log(`- Context keys: ${Object.keys(this.context).join(', ')}`);
    this.displayPrompt();
  });

  console.log(`   Registered command: .info`);

  // Stop the REPL
  progREPL.stop();
  console.log(`   REPL stopped: ${!progREPL.isRunning()}`);
  console.log('');

  // Example 6: REPL lifecycle management
  console.log('Example 6: REPL lifecycle management');
  const lifecycleREPL = new REPLServer({
    prompt: 'lifecycle> ',
    showWelcome: false,
  });

  console.log(`   Initial state - Running: ${lifecycleREPL.isRunning()}`);

  lifecycleREPL.start();
  console.log(`   After start - Running: ${lifecycleREPL.isRunning()}`);

  lifecycleREPL.stop();
  console.log(`   After stop - Running: ${lifecycleREPL.isRunning()}`);

  // Can restart
  lifecycleREPL.start();
  console.log(`   After restart - Running: ${lifecycleREPL.isRunning()}`);

  lifecycleREPL.stop();
  console.log('');

  // Example 7: Full-featured REPL setup
  console.log('Example 7: Full-featured REPL setup');

  const runtime = new ScriptRuntime();
  const fullCommands = createBuiltinCommands();

  // Add domain-specific commands
  fullCommands.register('status', 'Show system status', function () {
    console.log('System Status:');
    console.log(`- Platform: ${process.platform}`);
    console.log(`- Node version: ${process.version}`);
    console.log(`- Memory: ${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)}MB`);
    console.log(`- Uptime: ${Math.round(process.uptime())}s`);
    this.displayPrompt();
  });

  fullCommands.register('pwd', 'Print working directory', function () {
    console.log(process.cwd());
    this.displayPrompt();
  });

  console.log('   Full-featured REPL configured with:');
  console.log('   - Built-in commands (.clear, .help, .runtime)');
  console.log('   - Custom commands (.status, .pwd)');
  console.log('   - Runtime utilities ($runtime)');
  console.log('   - Custom context variables');
  console.log('');

  /*
  const fullREPL = new REPLServer({
    prompt: '⚡ xec> ',
    includeBuiltins: false, // We already created builtin commands
    commands: fullCommands,
    showWelcome: true,
    title: '⚡ Xec Loader REPL',
    welcomeMessage: `
Welcome to Xec Loader REPL!

Available utilities:
  $runtime - Runtime utilities (cd, pwd, env, retry, etc.)

Type .help to see all commands.
Type .exit or press Ctrl+C twice to quit.
    `,
    context: {
      $runtime: runtime,
      version: '1.0.0',
      author: 'Xec Team',
    },
    useColors: true,
    breakEvalOnSigint: true,
  });

  fullREPL.start();
  fullREPL.setupSignalHandlers();
  */

  console.log('=== REPL examples configured! ===');
  console.log('');
  console.log('To run an interactive REPL:');
  console.log('1. Uncomment one of the REPL examples above');
  console.log('2. Run: npx tsx examples/repl.ts');
  console.log('3. Interact with the REPL');
  console.log('4. Press Ctrl+C twice or type .exit to quit');
}

// Run examples
main().catch(console.error);
