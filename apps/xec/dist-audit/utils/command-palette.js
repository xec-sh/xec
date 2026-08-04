import path from 'path';
import fs from 'fs/promises';
import { log, select, isCancel } from '@xec-sh/kit';

const registerGlobalShortcut = (shortcut, callback) => {
};
import { execSync } from 'child_process';
import { TaskManager, ConfigurationManager } from '@xec-sh/ops';

export class CommandPalette {
    static { this.recentCommands = []; }
    static { this.recentFiles = []; }
    static { this.recentTargets = []; }
    static { this.commandHistory = new Map(); }
    static registerGlobalShortcuts() {
        registerGlobalShortcut('Ctrl+Shift+P', async () => {
            await this.show();
        });
        registerGlobalShortcut('Ctrl+P', async () => {
            await this.showQuickOpen();
        });
        registerGlobalShortcut('Ctrl+Shift+R', async () => {
            await this.showRecentTasks();
        });
    }
    static async show() {
        const commands = await this.buildCommandList();
        const selected = await select({
            message: 'Search commands...',
            options: commands.map(cmd => ({
                value: cmd.id,
                label: cmd.title,
                hint: cmd.shortcut
            }))
        });
        if (selected && !isCancel(selected)) {
            this.trackCommand(selected);
            const command = commands.find(cmd => cmd.id === selected);
            if (command) {
                try {
                    await command.action();
                }
                catch (error) {
                    log.error(`Command failed: ${error}`);
                }
            }
        }
    }
    static async buildCommandList() {
        const commands = [];
        commands.push({
            id: 'run',
            title: 'Run Script',
            subtitle: 'Execute a script or task',
            icon: '▶️',
            group: 'commands',
            shortcut: 'r',
            action: async () => {
                const scriptPath = await this.selectScript();
                if (scriptPath) {
                    execSync(`xec run ${scriptPath}`, { stdio: 'inherit' });
                }
            },
        }, {
            id: 'new',
            title: 'Create New',
            subtitle: 'Create new project or script',
            icon: '✨',
            group: 'commands',
            shortcut: 'n',
            action: async () => {
                execSync('xec new', { stdio: 'inherit' });
            },
        }, {
            id: 'config',
            title: 'Configuration',
            subtitle: 'Manage configuration',
            icon: '⚙️',
            group: 'commands',
            shortcut: 'c',
            action: async () => {
                execSync('xec config', { stdio: 'inherit' });
            },
        }, {
            id: 'secrets',
            title: 'Secrets',
            subtitle: 'Manage secrets',
            icon: '🔐',
            group: 'commands',
            shortcut: 's',
            action: async () => {
                execSync('xec secrets', { stdio: 'inherit' });
            },
        }, {
            id: 'inspect',
            title: 'Inspect',
            subtitle: 'Inspect targets',
            icon: '🔍',
            group: 'commands',
            shortcut: 'i',
            action: async () => {
                execSync('xec inspect', { stdio: 'inherit' });
            },
        }, {
            id: 'copy',
            title: 'Copy Files',
            subtitle: 'Copy files between targets',
            icon: '📋',
            group: 'commands',
            action: async () => {
                execSync('xec copy --interactive', { stdio: 'inherit' });
            },
        }, {
            id: 'forward',
            title: 'Port Forward',
            subtitle: 'Forward ports',
            icon: '🔌',
            group: 'commands',
            action: async () => {
                execSync('xec forward', { stdio: 'inherit' });
            },
        }, {
            id: 'logs',
            title: 'View Logs',
            subtitle: 'View target logs',
            icon: '📜',
            group: 'commands',
            action: async () => {
                execSync('xec logs', { stdio: 'inherit' });
            },
        }, {
            id: 'watch',
            title: 'Watch',
            subtitle: 'Watch for changes',
            icon: '👁️',
            group: 'commands',
            action: async () => {
                execSync('xec watch', { stdio: 'inherit' });
            },
        });
        try {
            const tasks = await this.loadTasks();
            for (const task of tasks) {
                commands.push({
                    id: `task:${task.name}`,
                    title: task.name,
                    subtitle: task.description || 'Run task',
                    icon: '⚡',
                    group: 'tasks',
                    action: async () => {
                        execSync(`xec run ${task.name}`, { stdio: 'inherit' });
                    },
                });
            }
        }
        catch {
        }
        for (const file of this.recentFiles.slice(0, 5)) {
            commands.push({
                id: `file:${file}`,
                title: path.basename(file),
                subtitle: file,
                icon: '📄',
                group: 'files',
                action: async () => {
                    execSync(`xec run ${file}`, { stdio: 'inherit' });
                },
            });
        }
        for (const target of this.recentTargets.slice(0, 5)) {
            commands.push({
                id: `target:${target}`,
                title: target,
                subtitle: 'Connect to target',
                icon: '🎯',
                group: 'targets',
                action: async () => {
                    execSync(`xec in ${target}`, { stdio: 'inherit' });
                },
            });
        }
        commands.push({
            id: 'reload',
            title: 'Reload Configuration',
            icon: '🔄',
            group: 'system',
            action: async () => {
                log.info('Reloading configuration...');
                const config = new ConfigurationManager();
                await config.load();
                log.success('Configuration reloaded');
            },
        }, {
            id: 'clear',
            title: 'Clear Terminal',
            icon: '🧹',
            group: 'system',
            shortcut: 'Ctrl+L',
            action: async () => {
                console.clear();
            },
        }, {
            id: 'exit',
            title: 'Exit',
            icon: '🚪',
            group: 'system',
            shortcut: 'q',
            action: async () => {
                process.exit(0);
            },
        });
        return this.sortByUsage(commands);
    }
    static async showQuickOpen() {
        const files = await this.findExecutableFiles();
        const fileOptions = files.map(file => ({
            value: file,
            label: path.basename(file),
            hint: this.getFileIcon(file)
        }));
        const selected = await select({
            message: 'Search files...',
            options: fileOptions
        });
        if (selected && !isCancel(selected)) {
            this.trackFile(selected);
            execSync(`xec run ${selected}`, { stdio: 'inherit' });
        }
    }
    static async showRecentTasks() {
        const tasks = await this.loadTasks();
        const recentTasks = this.getRecentTasks(tasks);
        if (recentTasks.length === 0) {
            log.info('No recent tasks');
            return;
        }
        const selected = await select({
            message: 'Select recent task...',
            options: recentTasks.map(task => ({
                value: task.name,
                label: task.name,
                hint: '⚡'
            }))
        });
        if (selected && !isCancel(selected)) {
            execSync(`xec run ${selected}`, { stdio: 'inherit' });
        }
    }
    static async loadTasks() {
        try {
            const configManager = new ConfigurationManager({
                projectRoot: process.cwd(),
            });
            const taskManager = new TaskManager({
                configManager,
                debug: false,
                dryRun: false,
            });
            await taskManager.load();
            return await taskManager.list();
        }
        catch {
            return [];
        }
    }
    static async findExecutableFiles() {
        const { glob } = await import('glob');
        const patterns = [
            '*.js',
            '*.ts',
            '*.mjs',
            '*.cjs',
            'src/**/*.{js,ts}',
            'scripts/**/*.{js,ts,sh}',
        ];
        const files = [];
        for (const pattern of patterns) {
            const matches = await glob(pattern, {
                ignore: ['**/node_modules/**', '**/dist/**', '**/build/**'],
                absolute: true,
            });
            files.push(...matches);
        }
        return files;
    }
    static getFileIcon(filePath) {
        const ext = path.extname(filePath);
        switch (ext) {
            case '.js':
            case '.mjs':
            case '.cjs':
                return '📜';
            case '.ts':
            case '.tsx':
                return '📘';
            case '.sh':
            case '.bash':
                return '🐚';
            case '.py':
                return '🐍';
            case '.json':
                return '📋';
            case '.yaml':
            case '.yml':
                return '📝';
            default:
                return '📄';
        }
    }
    static trackCommand(commandId) {
        const count = this.commandHistory.get(commandId) || 0;
        this.commandHistory.set(commandId, count + 1);
        this.recentCommands = this.recentCommands.filter(id => id !== commandId);
        this.recentCommands.unshift(commandId);
        this.recentCommands = this.recentCommands.slice(0, 10);
    }
    static trackFile(filePath) {
        this.recentFiles = this.recentFiles.filter(f => f !== filePath);
        this.recentFiles.unshift(filePath);
        this.recentFiles = this.recentFiles.slice(0, 10);
    }
    static trackTarget(target) {
        this.recentTargets = this.recentTargets.filter(t => t !== target);
        this.recentTargets.unshift(target);
        this.recentTargets = this.recentTargets.slice(0, 10);
    }
    static sortByUsage(commands) {
        return commands.sort((a, b) => {
            const aCount = this.commandHistory.get(a.id) || 0;
            const bCount = this.commandHistory.get(b.id) || 0;
            if (aCount !== bCount) {
                return bCount - aCount;
            }
            const groupOrder = ['commands', 'tasks', 'files', 'targets', 'system'];
            const aGroup = groupOrder.indexOf(a.group || 'system');
            const bGroup = groupOrder.indexOf(b.group || 'system');
            if (aGroup !== bGroup) {
                return aGroup - bGroup;
            }
            return a.title.localeCompare(b.title);
        });
    }
    static getRecentTasks(allTasks) {
        return allTasks
            .filter(task => this.commandHistory.has(`task:${task.name}`))
            .sort((a, b) => {
            const aCount = this.commandHistory.get(`task:${a.name}`) || 0;
            const bCount = this.commandHistory.get(`task:${b.name}`) || 0;
            return bCount - aCount;
        })
            .slice(0, 10);
    }
    static async selectScript() {
        const { selectFiles } = await import('@xec-sh/ops');
        const files = await selectFiles({
            title: 'Select script to run',
            multiple: false,
            filters: [
                { name: 'Scripts', extensions: ['js', 'ts', 'mjs', 'cjs'] },
                { name: 'All Files', extensions: ['*'] },
            ],
        });
        return files?.[0] || null;
    }
    static async initialize() {
        try {
            const historyPath = path.join(process.env['HOME'] || '.', '.xec-command-history.json');
            const data = await fs.readFile(historyPath, 'utf-8');
            const history = JSON.parse(data);
            this.recentCommands = history.recentCommands || [];
            this.recentFiles = history.recentFiles || [];
            this.recentTargets = history.recentTargets || [];
            if (history.commandHistory) {
                this.commandHistory = new Map(Object.entries(history.commandHistory));
            }
        }
        catch {
        }
        this.registerGlobalShortcuts();
    }
    static async saveHistory() {
        try {
            const historyPath = path.join(process.env['HOME'] || '.', '.xec-command-history.json');
            const history = {
                recentCommands: this.recentCommands,
                recentFiles: this.recentFiles,
                recentTargets: this.recentTargets,
                commandHistory: Object.fromEntries(this.commandHistory),
            };
            await fs.writeFile(historyPath, JSON.stringify(history, null, 2));
        }
        catch {
        }
    }
}
export const showCommandPalette = CommandPalette.show.bind(CommandPalette);
export const showQuickOpen = CommandPalette.showQuickOpen.bind(CommandPalette);
export const showRecentTasks = CommandPalette.showRecentTasks.bind(CommandPalette);
export const initializeCommandPalette = CommandPalette.initialize.bind(CommandPalette);
export const saveCommandHistory = CommandPalette.saveHistory.bind(CommandPalette);
//# sourceMappingURL=command-palette.js.map