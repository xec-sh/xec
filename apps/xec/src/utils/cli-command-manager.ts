import path from 'path';
import fs from 'node:fs/promises';

async function pathExists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}
import type { ScriptLoader } from '@xec-sh/ops';

import { log } from '@xec-sh/kit';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { CommandRegistry, type CommandSuggestion } from '@xec-sh/core';

import { COMMAND_MANIFEST } from './command-manifest.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export interface CliCommand {
  name: string;
  type: 'built-in' | 'dynamic';
  path: string;
  description?: string;
  loaded: boolean;
  error?: string;
  aliases?: string[];
  usage?: string;
}

export class CliCommandManager {
  private commands: Map<string, CliCommand> = new Map();
  private registry: CommandRegistry = new CommandRegistry();
  private commandDirs: string[] = [];
  private scriptLoader: ScriptLoader | null = null;
  private initialized = false;

  constructor() {
    this.initializeCommandDirs();
  }

  /**
   * The shared script loader, built on first use.
   *
   * Constructing it in the constructor made `@xec-sh/ops` a static import of
   * this module, and this module is loaded to register commands — so every
   * invocation, `xec --help` included, paid ~137ms for machinery only a
   * dynamic command actually needs.
   *
   * @returns The singleton loader, so global script context stays shared.
   */
  private async getLoader(): Promise<ScriptLoader> {
    if (!this.scriptLoader) {
      const { getScriptLoader } = await import('@xec-sh/ops');
      this.scriptLoader = getScriptLoader({
        verbose: process.env['XEC_DEBUG'] === 'true',
        preferredCDN: 'esm.sh',
        cache: true
      });
    }
    return this.scriptLoader;
  }

  /**
   * Initialize command directories
   */
  private initializeCommandDirs(): void {
    // Default directories
    this.commandDirs = [
      path.join(process.cwd(), '.xec', 'commands'),
      path.join(process.cwd(), '.xec', 'cli')
    ];

    // Check parent directories (up to 3 levels)
    let currentDir = process.cwd();
    for (let i = 0; i < 3; i++) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break;

      const parentCommandsDir = path.join(parentDir, '.xec', 'commands');
      if (!this.commandDirs.includes(parentCommandsDir)) {
        this.commandDirs.push(parentCommandsDir);
      }
      currentDir = parentDir;
    }

    // Add paths from environment variable
    if (process.env['XEC_COMMANDS_PATH']) {
      const additionalPaths = process.env['XEC_COMMANDS_PATH'].split(':');
      this.commandDirs.push(...additionalPaths);
    }
  }

  /**
   * Initialize module context (once)
   * Note: ScriptLoader now handles all global context initialization including kit
   */
  private async ensureInitialized(): Promise<void> {
    if (this.initialized) return;

    // ScriptLoader now handles all global context initialization
    // No need to duplicate it here
    this.initialized = true;
  }

  /**
   * Discover and load all commands
   */
  async discoverAndLoad(program: Command): Promise<CliCommand[]> {
    await this.ensureInitialized();

    // Discover all commands
    const builtIn = await this.discoverBuiltInCommands();
    const dynamic = await this.discoverDynamicCommands();

    // Merge (dynamic overrides built-in if same name)
    const allCommands = new Map<string, CliCommand>();
    builtIn.forEach(cmd => allCommands.set(cmd.name, cmd));
    dynamic.forEach(cmd => allCommands.set(cmd.name, cmd));

    this.commands = allCommands;

    // Load dynamic commands into program
    await this.loadDynamicCommands(program);

    // Build registry from program
    this.buildRegistry(program);

    return Array.from(allCommands.values());
  }

  /**
   * Discover all commands without loading them
   */
  async discoverAll(): Promise<CliCommand[]> {
    await this.ensureInitialized();

    // Discover all commands
    const builtIn = await this.discoverBuiltInCommands();
    const dynamic = await this.discoverDynamicCommands();

    // Merge (dynamic overrides built-in if same name)
    const allCommands = new Map<string, CliCommand>();
    builtIn.forEach(cmd => allCommands.set(cmd.name, cmd));
    dynamic.forEach(cmd => allCommands.set(cmd.name, cmd));

    this.commands = allCommands;
    return Array.from(allCommands.values());
  }

  /**
   * Discover built-in commands.
   *
   * Read from the manifest rather than from disk. The previous version listed
   * the directory and then imported every file to read its description —
   * which is exactly what the manifest exists to avoid, since each command
   * module statically imports `@xec-sh/ops` and brings the config and secrets
   * layers with it. `xec --version` was loading a bundler.
   *
   * The manifest cannot drift: `command-manifest.test.ts` loads every module
   * for real and fails if the two disagree.
   */
  private async discoverBuiltInCommands(): Promise<CliCommand[]> {
    const commandsDir = path.join(__dirname, '../commands');

    return COMMAND_MANIFEST.map(entry => ({
      name: entry.name,
      type: 'built-in' as const,
      path: path.join(commandsDir, `${entry.module}.js`),
      loaded: true,
      description: entry.description,
      aliases: entry.aliases,
    }));
  }

  /**
   * Discover dynamic commands
   */
  private async discoverDynamicCommands(): Promise<CliCommand[]> {
    const commands: CliCommand[] = [];

    // DEBUG: Log command directories being searched
    if (process.env['XEC_DEBUG']) {
      console.log('[DEBUG] Searching for dynamic commands in:');
      for (const dir of this.commandDirs) {
        const exists = await pathExists(dir);
        console.log(`[DEBUG]   ${exists ? '✓' : '✗'} ${dir}`);
      }
    }

    for (const dir of this.commandDirs) {
      if (await pathExists(dir)) {
        await this.discoverCommandsInDirectory(dir, commands, '');
      }
    }

    // DEBUG: Log discovered commands
    if (process.env['XEC_DEBUG']) {
      console.log(`[DEBUG] Discovered ${commands.length} dynamic commands:`, commands.map(c => c.name));
    }

    return commands;
  }

  /**
   * Recursively discover commands in directory
   */
  private async discoverCommandsInDirectory(
    dir: string,
    commands: CliCommand[],
    prefix: string
  ): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          const newPrefix = prefix ? `${prefix}:${entry.name}` : entry.name;
          await this.discoverCommandsInDirectory(fullPath, commands, newPrefix);
        } else if (this.isCommandFile(entry.name)) {
          const basename = path.basename(entry.name, path.extname(entry.name));
          const commandName = prefix ? `${prefix}:${basename}` : basename;
          const metadata = await this.extractCommandMetadata(fullPath, commandName);

          commands.push({
            name: commandName,
            type: 'dynamic',
            path: fullPath,
            loaded: false,
            ...metadata
          });
        }
      }
    } catch {
      // Silently ignore directory read errors
    }
  }

  /**
   * Load dynamic commands into program
   */
  private async loadDynamicCommands(program: Command): Promise<void> {
    const dynamicCommands = this.getDynamicCommands();

    if (process.env['XEC_DEBUG'] && dynamicCommands.length > 0) {
      const logger = log;
      logger.info(`Loading ${dynamicCommands.length} dynamic commands`);
    }

    // Register a stub per command and load the real one only when it is
    // invoked. Loading them all up front meant every `xec --help` transformed
    // and executed every `.xec/commands/*.ts` in the project — the script
    // loader, esbuild and whatever the command imports at module scope, to
    // print one line of description each.
    for (const cmd of dynamicCommands) {
      const stub = program
        .command(cmd.name)
        .description(cmd.description ?? '')
        .allowUnknownOption()
        .allowExcessArguments();

      for (const alias of cmd.aliases ?? []) {
        stub.alias(alias);
      }

      stub.action(async () => {
        // A fresh program, so the real command registers its own options and
        // arguments over the stub's permissive ones.
        const fresh = new Command();
        const result = await (await this.getLoader()).loadDynamicCommand(cmd.path, fresh, cmd.name);

        if (!result.success) {
          cmd.loaded = false;
          cmd.error = result.error;
          throw new Error(`Failed to load command '${cmd.name}': ${result.error}`);
        }

        cmd.loaded = true;
        await fresh.parseAsync(process.argv);
      });
    }

    this.reportLoadingSummary();
  }

  /**
   * Check if file is a command file
   */
  private isCommandFile(filename: string): boolean {
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);

    if (basename.startsWith('.') || basename.endsWith('.test') || basename.endsWith('.spec')) {
      return false;
    }

    return ['.js', '.mjs', '.ts', '.tsx'].includes(ext);
  }

  /**
   * Extract command metadata from file
   */
  private async extractCommandMetadata(
    filePath: string,
    commandName: string
  ): Promise<{ description?: string; aliases?: string[]; usage?: string }> {
    // Read the description out of the file rather than importing it.
    //
    // Discovery only needs a name and a line of text, but importing a
    // command runs it: a TypeScript one has to go through the transformer,
    // which pulls in esbuild, and any of them may import the ops layer at
    // module scope. That was paid on every invocation — `xec --help` in a
    // project with one `.xec/commands/*.ts` file loaded a bundler to print a
    // sentence. The module is imported when the command is actually invoked.
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const description = this.parseDescription(content, commandName);
      return { description };
    } catch {
      return {};
    }
  }

  /**
   * Parse description from file content
   */
  private parseDescription(content: string, commandName: string): string | undefined {
    const patterns = [
      /\/\*\*[\s\S]*?\*\s*(.+?)[\s\S]*?\*\//,
      /\.description\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/,
      /description\s*:\s*['"`]([^'"`]+)['"`]/,
      /\/\/\s*(?:Command|Description):\s*(.+)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    // Default descriptions
    const defaults: Record<string, string> = {
      'config': 'Manage xec configuration',
      'copy': 'Copy files between local and remote systems',
      'forward': 'Set up port forwarding and tunnels',
      'in': 'Execute commands in containers or pods',
      'inspect': 'Inspect xec resources and configuration',
      'logs': 'View logs from various sources',
      'new': 'Create new xec resources',
      'on': 'Execute commands on remote hosts via SSH',
      'run': 'Run scripts and evaluate code',
      'secrets': 'Manage encrypted secrets',
      'watch': 'Watch files and execute commands on changes'
    };

    return defaults[commandName];
  }

  /**
   * Build command registry from program
   */
  private buildRegistry(program: Command): CommandRegistry {
    const registry = new CommandRegistry();

    // Register main command if not xec
    if (program.name() && program.name() !== 'xec') {
      registry.register(this.extractCommandInfo(program));
    }

    // Register all commands recursively
    this.registerCommandsRecursively(program, registry);

    this.registry = registry;
    return registry;
  }

  /**
   * Register commands recursively
   */
  private registerCommandsRecursively(
    cmd: Command,
    registry: CommandRegistry,
    parentName: string = ''
  ): void {
    cmd.commands.forEach(subCmd => {
      const info = this.extractCommandInfo(subCmd);
      if (parentName) {
        info.command = `${parentName} ${info.command}`;
      }
      registry.register(info);

      // Recurse for nested commands
      if (subCmd.commands && subCmd.commands.length > 0) {
        this.registerCommandsRecursively(subCmd, registry, info.command);
      }
    });
  }

  /**
   * Extract command info for registry
   */
  private extractCommandInfo(cmd: Command): CommandSuggestion {
    return {
      command: cmd.name(),
      description: cmd.description(),
      aliases: cmd.aliases(),
      usage: cmd.usage() || `xec ${cmd.name()} [options]`
    };
  }

  /**
   * Report loading summary
   */
  private reportLoadingSummary(): void {
    const dynamic = this.getDynamicCommands();
    const loaded = dynamic.filter(cmd => cmd.loaded);
    const failed = dynamic.filter(cmd => !cmd.loaded && cmd.error);

    if (process.env['XEC_DEBUG'] && dynamic.length > 0) {
      const logger = log;
      logger.info(`Dynamic commands: ${loaded.length} loaded, ${failed.length} failed`);

      if (failed.length > 0) {
        logger.warning('Failed commands:');
        failed.forEach(cmd => {
          logger.error(`  - ${cmd.name}: ${cmd.error}`);
        });
      }
    }
  }

  /**
   * Find command in program by name or alias
   */
  findCommand(program: Command, nameOrAlias: string): Command | null {
    if (!nameOrAlias || !program || !program.commands) return null;

    const searchTerm = nameOrAlias.toLowerCase();

    // Try exact match first
    for (const cmd of program.commands) {
      if (cmd.name().toLowerCase() === searchTerm) {
        return cmd;
      }
    }

    // Then try aliases
    for (const cmd of program.commands) {
      const aliases = cmd.aliases();
      if (aliases && aliases.some(alias => alias.toLowerCase() === searchTerm)) {
        return cmd;
      }
    }

    return null;
  }

  /**
   * Add command directory
   */
  addCommandDirectory(dir: string): void {
    if (!this.commandDirs.includes(dir)) {
      this.commandDirs.push(dir);
    }
  }

  /**
   * Get all commands
   */
  getCommands(): CliCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get built-in commands
   */
  getBuiltInCommands(): CliCommand[] {
    return this.getCommands().filter(cmd => cmd.type === 'built-in');
  }

  /**
   * Get dynamic commands
   */
  getDynamicCommands(): CliCommand[] {
    return this.getCommands().filter(cmd => cmd.type === 'dynamic');
  }

  /**
   * Get loaded commands
   */
  getLoadedCommands(): CliCommand[] {
    return this.getCommands().filter(cmd => cmd.loaded);
  }

  /**
   * Get failed commands
   */
  getFailedCommands(): CliCommand[] {
    return this.getCommands().filter(cmd => !cmd.loaded && cmd.error);
  }

  /**
   * Get command by name
   */
  getCommand(name: string): CliCommand | undefined {
    return this.commands.get(name);
  }

  /**
   * Check if command exists
   */
  hasCommand(name: string): boolean {
    return this.commands.has(name);
  }

  /**
   * Get command directories
   */
  getCommandDirectories(): string[] {
    return this.commandDirs;
  }

  /**
   * Get command registry
   */
  getRegistry(): CommandRegistry {
    return this.registry;
  }

  /**
   * Generate command template
   */
  static generateCommandTemplate(name: string, description: string = 'A custom command'): string {
    return `/**
 * ${description}
 * This will be available as: xec ${name} [args...]
 */

export default function command(program) {
  program
    .command('${name} [args...]')
    .description('${description}')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (args, options) => {
      const logger = log;
      
      log.info('Running ${name} command');
      
      if (options.verbose) {
        log.info('Arguments:', args);
        log.info('Options:', options);
      }
      
      // Your command logic here
      const { $ } = await import('@xec-sh/core');
      
      try {
        // Example: Run a command
        const result = await $\`echo "Running ${name}"\`;
        log.success(result.stdout);
      } catch (error) {
        log.error(error.message);
        process.exit(1);
      }
    });
}
`;
  }

  /**
   * Validate command file
   */
  static async validateCommandFile(filePath: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const content = await fs.readFile(filePath, 'utf-8');

      if (!content.includes('export default') && !content.includes('export function command')) {
        return {
          valid: false,
          error: 'Command file must export a default function or "command" function'
        };
      }

      if (!content.includes('.command(') && !content.includes('program.command(')) {
        return {
          valid: false,
          error: 'Command file must register at least one command'
        };
      }

      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Failed to read command file'
      };
    }
  }
}

// Singleton instance
let managerInstance: CliCommandManager;

/**
 * Get CLI command manager instance
 */
export function getCliCommandManager(): CliCommandManager {
  if (!managerInstance) {
    managerInstance = new CliCommandManager();
  }
  return managerInstance;
}

/**
 * Discover and load all commands
 */
export async function discoverAndLoadCommands(program: Command): Promise<CliCommand[]> {
  const manager = getCliCommandManager();
  return manager.discoverAndLoad(program);
}

/**
 * Discover all commands without loading (for inspection)
 */
export async function discoverAllCommands(): Promise<CliCommand[]> {
  const manager = getCliCommandManager();
  return manager.discoverAll();
}

/**
 * Load dynamic commands (legacy API)
 */
export async function loadDynamicCommands(program: Command): Promise<string[]> {
  const manager = getCliCommandManager();
  await manager.discoverAndLoad(program);
  return manager.getDynamicCommands()
    .filter(cmd => cmd.loaded)
    .map(cmd => cmd.name);
}

/**
 * Build command registry
 */
export function buildCommandRegistry(program: Command): CommandRegistry {
  const manager = getCliCommandManager();
  return manager.getRegistry();
}

/**
 * Register CLI commands
 */
export function registerCliCommands(program: Command): CommandRegistry {
  return buildCommandRegistry(program);
}

/**
 * Find command by name or alias
 */
export function findCommand(program: Command, nameOrAlias: string): Command | null {
  const manager = getCliCommandManager();
  return manager.findCommand(program, nameOrAlias);
}

// Legacy exports for compatibility
export { getCliCommandManager as getCommandManager };
export { getCliCommandManager as getDynamicCommandLoader };
export { getCliCommandManager as getCommandDiscovery };

// Re-export types
export type { CommandSuggestion } from '@xec-sh/core';
export type DiscoveredCommand = CliCommand;
export type DynamicCommand = CliCommand;
export { CliCommandManager as CommandManager };
export { CliCommandManager as DynamicCommandLoader };