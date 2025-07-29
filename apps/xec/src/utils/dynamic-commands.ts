import path from 'path';
import fs from 'fs-extra';
import { Command } from 'commander';
import { pathToFileURL } from 'url';
import * as clack from '@clack/prompts';

import { getModuleLoader, initializeGlobalModuleContext } from './unified-module-loader.js';

interface DynamicCommand {
  name: string;
  path: string;
  loaded: boolean;
  error?: string;
}

export class DynamicCommandLoader {
  private commands: Map<string, DynamicCommand> = new Map();
  private commandDirs: string[] = [];
  private moduleLoader = getModuleLoader({
    verbose: process.env['XEC_DEBUG'] === 'true',
    preferredCDN: 'esm.sh'
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

    try {
      let moduleExports: any;
      
      // Ensure module context is initialized
      await initializeGlobalModuleContext();
      
      // For TypeScript files, transform them first
      if (ext === '.ts' || ext === '.tsx') {
        const content = await fs.readFile(filePath, 'utf-8');
        const transformedCode = await this.moduleLoader.transformTypeScript(content, filePath);
        
        // Find a directory with node_modules for the temporary file
        let tempDir = process.cwd();
        
        // First, try to find node_modules relative to the CLI installation
        // This is important for global npm installations
        const cliScriptPath = import.meta.url.replace('file://', '');
        let cliDir = path.dirname(cliScriptPath);
        
        // Search upwards from CLI location for node_modules
        for (let i = 0; i < 5; i++) {
          if (await fs.pathExists(path.join(cliDir, 'node_modules'))) {
            tempDir = cliDir;
            break;
          }
          const parentDir = path.dirname(cliDir);
          if (parentDir === cliDir) break;
          cliDir = parentDir;
        }
        
        // If not found, search from the command file location
        if (tempDir === process.cwd()) {
          let searchDir = path.dirname(filePath);
          for (let i = 0; i < 10; i++) {
            if (await fs.pathExists(path.join(searchDir, 'node_modules'))) {
              tempDir = searchDir;
              break;
            }
            const parentDir = path.dirname(searchDir);
            if (parentDir === searchDir) break;
            searchDir = parentDir;
          }
        }
        
        // Create temp directory in the xec installation directory
        const tempDirPath = path.join(tempDir, '.xec-temp');
        await fs.ensureDir(tempDirPath);
        
        // Write transformed file
        const tempFileName = `${commandName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.mjs`;
        const tempPath = path.join(tempDirPath, tempFileName);
        await fs.writeFile(tempPath, transformedCode);
        
        try {
          // Import the module
          moduleExports = await import(pathToFileURL(tempPath).href);
        } finally {
          // Clean up
          await fs.remove(tempPath).catch(() => {});
        }
      } else {
        // For JavaScript files, import directly
        moduleExports = await import(pathToFileURL(filePath).href);
      }
      
      if (!moduleExports) {
        throw new Error('Module did not export anything');
      }

      // Register command
      if (moduleExports.command && typeof moduleExports.command === 'function') {
        // New style: export function command(program) {}
        moduleExports.command(program);
        this.commands.get(commandName)!.loaded = true;
      } else if (typeof moduleExports === 'function') {
        // Direct default export
        moduleExports(program);
        this.commands.get(commandName)!.loaded = true;
      } else if (moduleExports.default && typeof moduleExports.default === 'function') {
        // ES module default export
        moduleExports.default(program);
        this.commands.get(commandName)!.loaded = true;
      } else {
        throw new Error('Command file must export a "command" function or default function');
      }

      if (process.env['XEC_DEBUG']) {
        clack.log.info(`Loaded dynamic command: ${commandName}`);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.commands.get(commandName)!.error = errorMessage;
      
      if (process.env['XEC_DEBUG']) {
        console.error(`Failed to load command ${commandName}:`, error);
        if (error instanceof Error && error.stack) {
          console.error('Stack trace:', error.stack);
        }
      } else {
        // Always show critical loading errors
        clack.log.error(`Failed to load command '${commandName}': ${errorMessage}`);
      }
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
export async function loadDynamicCommands(program: Command): Promise<void> {
  const loader = getDynamicCommandLoader();
  await loader.loadCommands(program);
  loader.reportLoadingSummary();
}