/**
 * REPLServer provides interactive REPL functionality
 * @module @xec-sh/loader/repl/repl-server
 */

import type { REPLServer as NodeREPLServer } from 'node:repl';

import * as repl from 'node:repl';

import { REPLCommands, createBuiltinCommands } from './repl-commands.js';

/** Every listener on `emitter`, by event, as it stands now. */
function listenerSnapshot(emitter: NodeJS.EventEmitter): Map<string | symbol, Set<unknown>> {
  return new Map(emitter.eventNames().map(event => [event, new Set(emitter.listeners(event))]));
}

/** Those listeners on `emitter` that are not in `before`. */
function listenersAddedSince(
  emitter: NodeJS.EventEmitter,
  before: Map<string | symbol, Set<unknown>>
): Array<[string | symbol, (...args: any[]) => void]> {
  const added: Array<[string | symbol, (...args: any[]) => void]> = [];
  for (const event of emitter.eventNames()) {
    const known = before.get(event);
    for (const listener of emitter.listeners(event)) {
      if (!known?.has(listener)) added.push([event, listener as (...args: any[]) => void]);
    }
  }
  return added;
}

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

  /**
   * The listeners `repl.start` attached to the input stream.
   *
   * Node's `close()` leaves them there: five start/close cycles leave five
   * `data` listeners on stdin, and the tenth trips
   * MaxListenersExceededWarning. A host that opens a REPL more than once —
   * or a test file that does — accumulates them for the life of the
   * process. Recording exactly what `start` added, rather than diffing at
   * close time, means a listener the application attached while the REPL
   * was running is never mistaken for ours.
   */
  private attachedToInput: Array<[string | symbol, (...args: any[]) => void]> = [];
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

    // Node's REPL evaluates each line in a single persistent vm context, not by
    // importing a fresh module per line — so a session does not accumulate
    // modules in the ESM registry the way script reloads do. Keep it that way:
    // routing lines through CodeEvaluator (which imports a transient file each
    // time) would leak one registry entry per line entered.
    const input = (this.options.replOptions?.input ?? process.stdin) as NodeJS.EventEmitter;
    const before = listenerSnapshot(input);

    this.server = repl.start({
      prompt: this.options.prompt,
      useGlobal: this.options.useGlobal,
      breakEvalOnSigint: this.options.breakEvalOnSigint,
      useColors: this.options.useColors,
      ...this.options.replOptions,
    });

    this.attachedToInput = listenersAddedSince(input, before);

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
      const input = this.server.input as unknown as NodeJS.EventEmitter;
      this.server.close();

      // `close()` does not do this, so the listeners would outlive every
      // session. Removing one that is already gone is a no-op, so this
      // stays correct if a future Node starts cleaning up after itself.
      for (const [event, listener] of this.attachedToInput) {
        input.removeListener(event, listener);
      }
      this.attachedToInput = [];
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
