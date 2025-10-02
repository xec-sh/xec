/**
 * REPLServer provides interactive REPL functionality
 * @module @xec-sh/loader/repl/repl-server
 */

import type { REPLServer as NodeREPLServer } from 'node:repl';

import * as repl from 'node:repl';

import { REPLCommands, createBuiltinCommands } from './repl-commands.js';

/**
 * REPL server options
 */
export interface REPLServerOptions {
  /**
   * Custom prompt string
   */
  prompt?: string;

  /**
   * Use global scope
   */
  useGlobal?: boolean;

  /**
   * Break eval on SIGINT
   */
  breakEvalOnSigint?: boolean;

  /**
   * Use colors in output
   */
  useColors?: boolean;

  /**
   * Initial context objects
   */
  context?: Record<string, any>;

  /**
   * Custom commands
   */
  commands?: REPLCommands;

  /**
   * Include built-in commands
   */
  includeBuiltins?: boolean;

  /**
   * Show welcome message
   */
  showWelcome?: boolean;

  /**
   * Welcome message
   */
  welcomeMessage?: string;

  /**
   * REPL title
   */
  title?: string;

  /**
   * REPL server instance options
   */
  replOptions?: repl.ReplOptions;
}

/**
 * REPLServer manages interactive REPL sessions
 */
export class REPLServer {
  private server?: NodeREPLServer;
  private readonly options: Required<Omit<REPLServerOptions, 'context' | 'commands' | 'replOptions' | 'welcomeMessage' | 'title'>> & {
    context: Record<string, any>;
    commands?: REPLCommands;
    replOptions?: repl.ReplOptions;
    welcomeMessage?: string;
    title?: string;
  };
  private readonly commands: REPLCommands;

  constructor(options: REPLServerOptions = {}) {
    this.options = {
      prompt: options.prompt || '> ',
      useGlobal: options.useGlobal ?? false,
      breakEvalOnSigint: options.breakEvalOnSigint ?? true,
      useColors: options.useColors ?? true,
      context: options.context || {},
      commands: options.commands,
      includeBuiltins: options.includeBuiltins ?? true,
      showWelcome: options.showWelcome ?? true,
      replOptions: options.replOptions,
      welcomeMessage: options.welcomeMessage,
      title: options.title,
    };

    // Initialize commands
    if (this.options.includeBuiltins) {
      this.commands = createBuiltinCommands();
      // Merge custom commands if provided
      if (this.options.commands) {
        for (const [name, cmd] of this.options.commands.getAll()) {
          this.commands.register(name, cmd.help, cmd.action);
        }
      }
    } else {
      this.commands = this.options.commands || new REPLCommands();
    }
  }

  /**
   * Start the REPL server
   */
  start(): NodeREPLServer {
    // Check if already running
    if (this.server) {
      throw new Error('REPL server is already running');
    }

    // Show welcome message
    if (this.options.showWelcome) {
      this.showWelcome();
    }

    // Create REPL server
    this.server = repl.start({
      prompt: this.options.prompt,
      useGlobal: this.options.useGlobal,
      breakEvalOnSigint: this.options.breakEvalOnSigint,
      useColors: this.options.useColors,
      ...this.options.replOptions,
    });

    // Apply context
    Object.assign(this.server.context, this.options.context);

    // Apply commands
    this.commands.applyTo(this.server);

    return this.server;
  }

  /**
   * Show welcome message
   */
  private showWelcome(): void {
    if (this.options.title) {
      console.log(this.options.title);
    }

    if (this.options.welcomeMessage) {
      console.log(this.options.welcomeMessage);
    } else {
      console.log('Type .help for available commands');
    }
    console.log('');
  }

  /**
   * Stop the REPL server
   */
  stop(): void {
    if (this.server) {
      this.server.close();
      this.server = undefined;
    }
  }

  /**
   * Get the underlying Node.js REPL server
   */
  getServer(): NodeREPLServer | undefined {
    return this.server;
  }

  /**
   * Add context to the REPL
   */
  addContext(key: string, value: any): void {
    this.options.context[key] = value;
    if (this.server) {
      this.server.context[key] = value;
    }
  }

  /**
   * Remove context from the REPL
   */
  removeContext(key: string): void {
    delete this.options.context[key];
    if (this.server) {
      delete this.server.context[key];
    }
  }

  /**
   * Get REPL context or a specific key
   */
  getContext(key?: string): any {
    if (key) {
      return this.options.context[key];
    }
    return { ...this.options.context };
  }

  /**
   * Register a new command
   */
  registerCommand(name: string, help: string, action: (this: NodeREPLServer, ...args: string[]) => void): void {
    this.commands.register(name, help, action);
    if (this.server) {
      this.server.defineCommand(name, { help, action });
    }
  }

  /**
   * Unregister a command
   */
  unregisterCommand(name: string): boolean {
    const result = this.commands.unregister(name);
    if (result && this.server) {
      // Remove from server.commands if it exists
      delete (this.server.commands as any)[name];
    }
    return result;
  }

  /**
   * Get all commands
   */
  getCommands(): REPLCommands {
    return this.commands;
  }

  /**
   * Display prompt
   */
  displayPrompt(): void {
    if (this.server) {
      this.server.displayPrompt();
    }
  }

  /**
   * Check if server is running
   */
  isRunning(): boolean {
    return this.server !== undefined;
  }

  /**
   * Setup signal handlers
   */
  setupSignalHandlers(): void {
    if (!this.server) {
      throw new Error('REPL server not started');
    }

    this.server.on('exit', () => {
      console.log('Exiting REPL...');
      process.exit(0);
    });

    // Handle SIGINT
    process.on('SIGINT', () => {
      if (this.server) {
        this.server.close();
      }
      process.exit(0);
    });
  }
}

/**
 * Create a new REPL server instance
 */
export function createREPLServer(options?: REPLServerOptions): REPLServer {
  return new REPLServer(options);
}

/**
 * Start a REPL server with default options
 */
export function startREPL(options?: REPLServerOptions): NodeREPLServer {
  const server = new REPLServer(options);
  return server.start();
}
