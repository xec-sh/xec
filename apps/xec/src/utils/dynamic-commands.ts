import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import * as clack from '@clack/prompts';

import { ScriptLoader } from './script-loader.js';
import { initializeGlobalModuleContext } from './module-loader.js';

interface DynamicCommand {
  name: string;
  path: string;
  loaded: boolean;
  error?: string;
}

export class DynamicCommandLoader {
  private commands: Map<string, DynamicCommand> = new Map();
  private commandDirs: string[] = [];
  private scriptLoader = new ScriptLoader({
    verbose: process.env['XEC_DEBUG'] === 'true',
    preferredCDN: 'esm.sh',
    cache: true
  });

  constructor() {
    // Default command directories
    this.commandDirs = [
      path.join(process.cwd(), '.xec', 'commands'),
      path.join(process.cwd(), '.xec', 'cli')
    ];

    // Also check parent directories for .xec/commands (up to 3 levels)
    let currentDir = process.cwd();
    for (let i = 0; i < 3; i++) {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) break; // Reached root

      const parentCommandsDir = path.join(parentDir, '.xec', 'commands');
      if (!this.commandDirs.includes(parentCommandsDir)) {
        this.commandDirs.push(parentCommandsDir);
      }

      currentDir = parentDir;
    }

    // Add paths from XEC_COMMANDS_PATH env variable
    if (process.env['XEC_COMMANDS_PATH']) {
      const additionalPaths = process.env['XEC_COMMANDS_PATH'].split(':');
      this.commandDirs.push(...additionalPaths);
    }

    // Initialize global module context
    initializeGlobalModuleContext({
      verbose: process.env['XEC_DEBUG'] === 'true',
      preferredCDN: 'esm.sh'
    }).catch(err => {
      if (process.env['XEC_DEBUG']) {
        console.warn('Failed to initialize module context:', err);
      }
    });
  }

  /**
   * Load all dynamic commands
   */
  async loadCommands(program: Command): Promise<void> {
    if (process.env['XEC_DEBUG']) {
      clack.log.info(`Loading dynamic commands from directories: ${this.commandDirs.join(', ')}`);
    }
    for (const dir of this.commandDirs) {
      if (await fs.pathExists(dir)) {
        if (process.env['XEC_DEBUG']) {
          clack.log.info(`Loading commands from directory: ${dir}`);
        }
        await this.loadCommandsFromDirectory(dir, program);
      } else if (process.env['XEC_DEBUG']) {
        clack.log.warn(`Command directory does not exist: ${dir}`);
      }
    }
  }

  /**
   * Load commands from a directory
   */
  private async loadCommandsFromDirectory(dir: string, program: Command, prefix: string = ''): Promise<void> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Recursively load commands from subdirectories
          const newPrefix = prefix ? `${prefix}:${entry.name}` : entry.name;
          await this.loadCommandsFromDirectory(fullPath, program, newPrefix);
        } else if (this.isCommandFile(entry.name)) {
          await this.loadCommandFile(fullPath, program, prefix);
        }
      }
    } catch (error) {
      if (process.env['XEC_DEBUG']) {
        console.error(`Failed to load commands from ${dir}:`, error);
      }
    }
  }

  /**
   * Check if file is a command file
   */
  private isCommandFile(filename: string): boolean {
    const ext = path.extname(filename);
    const basename = path.basename(filename, ext);

    // Skip hidden files and test files
    if (basename.startsWith('.') || basename.endsWith('.test') || basename.endsWith('.spec')) {
      return false;
    }

    return ['.js', '.mjs', '.ts', '.tsx'].includes(ext);
  }

  /**
   * Load a single command file
   */
  private async loadCommandFile(filePath: string, program: Command, prefix: string): Promise<void> {
    const ext = path.extname(filePath);
    const basename = path.basename(filePath, ext);
    const commandName = prefix ? `${prefix}:${basename}` : basename;

    // Track command
    this.commands.set(commandName, {
      name: commandName,
      path: filePath,
      loaded: false
    });

    // Use ScriptLoader to load the dynamic command
    const result = await this.scriptLoader.loadDynamicCommand(filePath, program, commandName);

    if (result.success) {
      this.commands.get(commandName)!.loaded = true;
    } else {
      this.commands.get(commandName)!.error = result.error;
    }
  }

  /**
   * Get all loaded commands
   */
  getCommands(): DynamicCommand[] {
    return Array.from(this.commands.values());
  }

  /**
   * Get successfully loaded commands
   */
  getLoadedCommands(): DynamicCommand[] {
    return this.getCommands().filter(cmd => cmd.loaded);
  }

  /**
   * Get failed commands
   */
  getFailedCommands(): DynamicCommand[] {
    return this.getCommands().filter(cmd => !cmd.loaded && cmd.error);
  }

  /**
   * Report loading summary
   */
  reportLoadingSummary(): void {
    const commands = this.getCommands();
    const loaded = this.getLoadedCommands();
    const failed = this.getFailedCommands();

    if (process.env['XEC_DEBUG'] && commands.length > 0) {
      clack.log.info(`Dynamic commands: ${loaded.length} loaded, ${failed.length} failed`);

      if (failed.length > 0) {
        clack.log.warn('Failed commands:');
        failed.forEach(cmd => {
          clack.log.error(`  - ${cmd.name}: ${cmd.error}`);
        });
      }
    }
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
   * Get command directories
   */
  getCommandDirectories(): string[] {
    return this.commandDirs;
  }

  /**
   * Generate command template
   */
  static generateCommandTemplate(name: string, description: string = 'A custom command'): string {
    return `/**
 * ${description}
 * This will be available as: xec ${name} [args...]
 */

export function command(program) {
  program
    .command('${name} [args...]')
    .description('${description}')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (args, options) => {
      const { log } = await import('@clack/prompts');
      
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

      // Check for required exports
      if (!content.includes('export function command') && !content.includes('export default')) {
        return {
          valid: false,
          error: 'Command file must export a "command" function or default function'
        };
      }

      // Check for basic structure
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
let loader: DynamicCommandLoader;

/**
 * Get dynamic command loader instance
 */
export function getDynamicCommandLoader(): DynamicCommandLoader {
  if (!loader) {
    loader = new DynamicCommandLoader();
  }
  return loader;
}

/**
 * Load dynamic commands into program
 */
export async function loadDynamicCommands(program: Command): Promise<string[]> {
  const loader = getDynamicCommandLoader();
  await loader.loadCommands(program);
  loader.reportLoadingSummary();

  // Return list of successfully loaded dynamic command names
  return loader.getLoadedCommands().map(cmd => cmd.name);
}