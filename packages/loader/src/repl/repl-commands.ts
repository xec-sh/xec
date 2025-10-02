/**
 * REPLCommands manages extensible REPL command system
 * @module @xec-sh/loader/repl/repl-commands
 */

import type { REPLServer } from 'node:repl';

/**
 * REPL command definition
 */
export interface REPLCommand {
  /**
   * Help text for the command
   */
  help: string;

  /**
   * Command action handler
   */
  action: (this: REPLServer, ...args: string[]) => void;
}

/**
 * REPL command handler function
 */
export type REPLCommandHandler = (this: REPLServer, ...args: string[]) => void | Promise<void>;

/**
 * REPLCommands manages command registration and execution
 */
export class REPLCommands {
  private commands = new Map<string, REPLCommand>();

  /**
   * Register a new REPL command
   */
  register(name: string, help: string, action: REPLCommandHandler): void {
    this.commands.set(name, { help, action });
  }

  /**
   * Unregister a command
   */
  unregister(name: string): boolean {
    return this.commands.delete(name);
  }

  /**
   * Get all registered commands
   */
  getAll(): Map<string, REPLCommand> {
    return new Map(this.commands);
  }

  /**
   * Get a specific command
   */
  get(name: string): REPLCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Check if command exists
   */
  has(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Clear all commands
   */
  clear(): void {
    this.commands.clear();
  }

  /**
   * Apply all commands to a REPL server
   */
  applyTo(replServer: REPLServer): void {
    for (const [name, command] of this.commands) {
      replServer.defineCommand(name, command);
    }
  }

  /**
   * Get command count
   */
  get size(): number {
    return this.commands.size;
  }

  /**
   * List all command names
   */
  list(): string[] {
    return Array.from(this.commands.keys());
  }
}

/**
 * Built-in REPL commands
 */
export function createBuiltinCommands(): REPLCommands {
  const commands = new REPLCommands();

  // .clear command
  commands.register('clear', 'Clear the console', function () {
    console.clear();
    this.displayPrompt();
  });

  // .runtime command
  commands.register('runtime', 'Show current runtime information', function () {
    console.log(`Runtime: Node.js ${process.version}`);
    console.log(`Platform: ${process.platform} ${process.arch}`);
    console.log(`Features:`);
    console.log(`  TypeScript: ✓`);
    console.log(`  ESM: ✓`);
    console.log(`  Top-level await: ✓`);
    this.displayPrompt();
  });

  // .help command (override default)
  commands.register('help', 'Show available commands', function () {
    console.log('Available commands:');
    // Get all commands from the REPL server
    const commandNames = Object.keys((this as any).commands);
    for (const name of commandNames) {
      const cmd = (this as any).commands[name];
      if (cmd && cmd.help) {
        console.log(`  .${name.padEnd(15)} ${cmd.help}`);
      }
    }
    this.displayPrompt();
  });

  return commands;
}

/**
 * Create a new REPLCommands instance
 */
export function createCommands(): REPLCommands {
  return new REPLCommands();
}
