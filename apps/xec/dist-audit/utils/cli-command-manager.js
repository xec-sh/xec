import path from 'path';
import fs from 'node:fs/promises';

async function pathExists(p) {
    try {
        await fs.access(p);
        return true;
    }
    catch {
        return false;
    }
}
import { log } from '@xec-sh/kit';
import { fileURLToPath } from 'url';
import { Command } from 'commander';
import { getScriptLoader } from '@xec-sh/ops';
import { CommandRegistry } from '@xec-sh/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export class CliCommandManager {
    constructor() {
        this.commands = new Map();
        this.registry = new CommandRegistry();
        this.commandDirs = [];
        this.initialized = false;
        this.initializeCommandDirs();
        this.scriptLoader = getScriptLoader({
            verbose: process.env['XEC_DEBUG'] === 'true',
            preferredCDN: 'esm.sh',
            cache: true
        });
    }
    initializeCommandDirs() {
        this.commandDirs = [
            path.join(process.cwd(), '.xec', 'commands'),
            path.join(process.cwd(), '.xec', 'cli')
        ];
        let currentDir = process.cwd();
        for (let i = 0; i < 3; i++) {
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir)
                break;
            const parentCommandsDir = path.join(parentDir, '.xec', 'commands');
            if (!this.commandDirs.includes(parentCommandsDir)) {
                this.commandDirs.push(parentCommandsDir);
            }
            currentDir = parentDir;
        }
        if (process.env['XEC_COMMANDS_PATH']) {
            const additionalPaths = process.env['XEC_COMMANDS_PATH'].split(':');
            this.commandDirs.push(...additionalPaths);
        }
    }
    async ensureInitialized() {
        if (this.initialized)
            return;
        this.initialized = true;
    }
    async discoverAndLoad(program) {
        await this.ensureInitialized();
        const builtIn = await this.discoverBuiltInCommands();
        const dynamic = await this.discoverDynamicCommands();
        const allCommands = new Map();
        builtIn.forEach(cmd => allCommands.set(cmd.name, cmd));
        dynamic.forEach(cmd => allCommands.set(cmd.name, cmd));
        this.commands = allCommands;
        await this.loadDynamicCommands(program);
        this.buildRegistry(program);
        return Array.from(allCommands.values());
    }
    async discoverAll() {
        await this.ensureInitialized();
        const builtIn = await this.discoverBuiltInCommands();
        const dynamic = await this.discoverDynamicCommands();
        const allCommands = new Map();
        builtIn.forEach(cmd => allCommands.set(cmd.name, cmd));
        dynamic.forEach(cmd => allCommands.set(cmd.name, cmd));
        this.commands = allCommands;
        return Array.from(allCommands.values());
    }
    async discoverBuiltInCommands() {
        const commandsDir = path.join(__dirname, '../commands');
        const commands = [];
        if (!await pathExists(commandsDir)) {
            return commands;
        }
        const files = await fs.readdir(commandsDir);
        for (const file of files) {
            if (!file.endsWith('.js') && !file.endsWith('.ts'))
                continue;
            if (file.endsWith('.d.ts'))
                continue;
            const basename = path.basename(file, path.extname(file));
            if (basename.includes('.test') || basename.includes('.spec'))
                continue;
            const filePath = path.join(commandsDir, file);
            const metadata = await this.extractCommandMetadata(filePath, basename);
            commands.push({
                name: basename,
                type: 'built-in',
                path: filePath,
                loaded: true,
                ...metadata
            });
        }
        return commands;
    }
    async discoverDynamicCommands() {
        const commands = [];
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
        if (process.env['XEC_DEBUG']) {
            console.log(`[DEBUG] Discovered ${commands.length} dynamic commands:`, commands.map(c => c.name));
        }
        return commands;
    }
    async discoverCommandsInDirectory(dir, commands, prefix) {
        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });
            for (const entry of entries) {
                const fullPath = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    const newPrefix = prefix ? `${prefix}:${entry.name}` : entry.name;
                    await this.discoverCommandsInDirectory(fullPath, commands, newPrefix);
                }
                else if (this.isCommandFile(entry.name)) {
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
        }
        catch {
        }
    }
    async loadDynamicCommands(program) {
        const dynamicCommands = this.getDynamicCommands();
        if (process.env['XEC_DEBUG'] && dynamicCommands.length > 0) {
            const logger = log;
            logger.info(`Loading ${dynamicCommands.length} dynamic commands`);
        }
        for (const cmd of dynamicCommands) {
            const result = await this.scriptLoader.loadDynamicCommand(cmd.path, program, cmd.name);
            if (result.success) {
                cmd.loaded = true;
            }
            else {
                cmd.loaded = false;
                cmd.error = result.error;
            }
        }
        this.reportLoadingSummary();
    }
    isCommandFile(filename) {
        const ext = path.extname(filename);
        const basename = path.basename(filename, ext);
        if (basename.startsWith('.') || basename.endsWith('.test') || basename.endsWith('.spec')) {
            return false;
        }
        return ['.js', '.mjs', '.ts', '.tsx'].includes(ext);
    }
    async extractCommandMetadata(filePath, commandName) {
        try {
            const module = await import(fileURLToPath(new URL(`file://${filePath}`, import.meta.url)));
            if (module.metadata) {
                return module.metadata;
            }
            if (module.default || module.command) {
                const program = new Command();
                const commandFn = module.default || module.command;
                if (typeof commandFn === 'function') {
                    commandFn(program);
                    if (program.commands.length > 0) {
                        const cmd = program.commands[0];
                        if (cmd) {
                            return {
                                description: cmd.description(),
                                aliases: cmd.aliases(),
                                usage: cmd.usage()
                            };
                        }
                    }
                }
            }
        }
        catch {
        }
        try {
            const content = await fs.readFile(filePath, 'utf-8');
            const description = this.parseDescription(content, commandName);
            return { description };
        }
        catch {
            return {};
        }
    }
    parseDescription(content, commandName) {
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
        const defaults = {
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
    buildRegistry(program) {
        const registry = new CommandRegistry();
        if (program.name() && program.name() !== 'xec') {
            registry.register(this.extractCommandInfo(program));
        }
        this.registerCommandsRecursively(program, registry);
        this.registry = registry;
        return registry;
    }
    registerCommandsRecursively(cmd, registry, parentName = '') {
        cmd.commands.forEach(subCmd => {
            const info = this.extractCommandInfo(subCmd);
            if (parentName) {
                info.command = `${parentName} ${info.command}`;
            }
            registry.register(info);
            if (subCmd.commands && subCmd.commands.length > 0) {
                this.registerCommandsRecursively(subCmd, registry, info.command);
            }
        });
    }
    extractCommandInfo(cmd) {
        return {
            command: cmd.name(),
            description: cmd.description(),
            aliases: cmd.aliases(),
            usage: cmd.usage() || `xec ${cmd.name()} [options]`
        };
    }
    reportLoadingSummary() {
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
    findCommand(program, nameOrAlias) {
        if (!nameOrAlias || !program || !program.commands)
            return null;
        const searchTerm = nameOrAlias.toLowerCase();
        for (const cmd of program.commands) {
            if (cmd.name().toLowerCase() === searchTerm) {
                return cmd;
            }
        }
        for (const cmd of program.commands) {
            const aliases = cmd.aliases();
            if (aliases && aliases.some(alias => alias.toLowerCase() === searchTerm)) {
                return cmd;
            }
        }
        return null;
    }
    addCommandDirectory(dir) {
        if (!this.commandDirs.includes(dir)) {
            this.commandDirs.push(dir);
        }
    }
    getCommands() {
        return Array.from(this.commands.values());
    }
    getBuiltInCommands() {
        return this.getCommands().filter(cmd => cmd.type === 'built-in');
    }
    getDynamicCommands() {
        return this.getCommands().filter(cmd => cmd.type === 'dynamic');
    }
    getLoadedCommands() {
        return this.getCommands().filter(cmd => cmd.loaded);
    }
    getFailedCommands() {
        return this.getCommands().filter(cmd => !cmd.loaded && cmd.error);
    }
    getCommand(name) {
        return this.commands.get(name);
    }
    hasCommand(name) {
        return this.commands.has(name);
    }
    getCommandDirectories() {
        return this.commandDirs;
    }
    getRegistry() {
        return this.registry;
    }
    static generateCommandTemplate(name, description = 'A custom command') {
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
    static async validateCommandFile(filePath) {
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
        }
        catch (error) {
            return {
                valid: false,
                error: error instanceof Error ? error.message : 'Failed to read command file'
            };
        }
    }
}
let managerInstance;
export function getCliCommandManager() {
    if (!managerInstance) {
        managerInstance = new CliCommandManager();
    }
    return managerInstance;
}
export async function discoverAndLoadCommands(program) {
    const manager = getCliCommandManager();
    return manager.discoverAndLoad(program);
}
export async function discoverAllCommands() {
    const manager = getCliCommandManager();
    return manager.discoverAll();
}
export async function loadDynamicCommands(program) {
    const manager = getCliCommandManager();
    await manager.discoverAndLoad(program);
    return manager.getDynamicCommands()
        .filter(cmd => cmd.loaded)
        .map(cmd => cmd.name);
}
export function buildCommandRegistry(program) {
    const manager = getCliCommandManager();
    return manager.getRegistry();
}
export function registerCliCommands(program) {
    return buildCommandRegistry(program);
}
export function findCommand(program, nameOrAlias) {
    const manager = getCliCommandManager();
    return manager.findCommand(program, nameOrAlias);
}
export { getCliCommandManager as getCommandManager };
export { getCliCommandManager as getDynamicCommandLoader };
export { getCliCommandManager as getCommandDiscovery };
export { CliCommandManager as CommandManager };
export { CliCommandManager as DynamicCommandLoader };
//# sourceMappingURL=cli-command-manager.js.map