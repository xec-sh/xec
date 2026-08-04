import { z } from 'zod';
import * as fs from 'fs';
import * as path from 'path';
import { $ } from '@xec-sh/core';
import { prism } from '@xec-sh/kit';
import { FileWatcher } from '@xec-sh/loader';
import { validateOptions, getScriptLoader } from '@xec-sh/ops';

import { ConfigAwareCommand } from '../utils/command-base.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';

export class WatchCommand extends ConfigAwareCommand {
    constructor() {
        super({
            name: 'watch',
            description: 'Watch files for changes and execute commands',
            arguments: '<target> [paths...]',
            options: [
                {
                    flags: '-p, --profile <profile>',
                    description: 'Configuration profile to use',
                },
                {
                    flags: '--pattern <pattern>',
                    description: 'File patterns to watch (can be used multiple times)',
                },
                {
                    flags: '--exclude <pattern>',
                    description: 'Patterns to exclude (can be used multiple times)',
                },
                {
                    flags: '--command <command>',
                    description: 'Command to execute on change',
                },
                {
                    flags: '--task <task>',
                    description: 'Task to run on change',
                },
                {
                    flags: '--script <script>',
                    description: 'Script file to execute on change',
                },
                {
                    flags: '-d, --debounce <ms>',
                    description: 'Debounce interval in milliseconds',
                    defaultValue: '300',
                },
                {
                    flags: '--initial',
                    description: 'Run command immediately on start',
                },
                {
                    flags: '--poll',
                    description: 'Use polling instead of native watchers',
                },
                {
                    flags: '--interval <ms>',
                    description: 'Polling interval (when --poll is used)',
                    defaultValue: '1000',
                },
                {
                    flags: '-i, --interactive',
                    description: 'Interactive mode for configuring watch settings',
                },
            ],
            examples: [
                {
                    command: 'xec watch --interactive',
                    description: 'Interactive mode to configure file watching',
                },
                {
                    command: 'xec watch local "src/**/*.ts" --command "npm test"',
                    description: 'Watch TypeScript files and run tests',
                },
                {
                    command: 'xec watch hosts.dev /app --task deploy',
                    description: 'Watch remote directory and run deploy task',
                },
                {
                    command: 'xec watch containers.app /src --pattern "*.js" --command "npm run build"',
                    description: 'Watch JavaScript files in container',
                },
                {
                    command: 'xec watch pods.frontend /app --exclude "node_modules" --task reload',
                    description: 'Watch pod files excluding node_modules',
                },
                {
                    command: 'xec watch local "src/**/*.ts" --script ./scripts/build.js',
                    description: 'Watch TypeScript files and run build script',
                },
            ],
            validateOptions: (options) => {
                const schema = z.object({
                    profile: z.string().optional(),
                    pattern: z.array(z.string()).optional(),
                    exclude: z.array(z.string()).optional(),
                    command: z.string().optional(),
                    task: z.string().optional(),
                    script: z.string().optional(),
                    debounce: z.string().optional(),
                    initial: z.boolean().optional(),
                    poll: z.boolean().optional(),
                    interval: z.string().optional(),
                    interactive: z.boolean().optional(),
                    verbose: z.boolean().optional(),
                    quiet: z.boolean().optional(),
                    dryRun: z.boolean().optional(),
                });
                validateOptions(options, schema);
            },
        });
        this.sessions = new Map();
        this.running = true;
    }
    getCommandConfigKey() {
        return 'watch';
    }
    async execute(args) {
        const [targetSpec, ...paths] = args.slice(0, -1);
        const options = args[args.length - 1];
        if (options.interactive) {
            return await this.runInteractiveMode();
        }
        if (!targetSpec) {
            throw new Error('Target specification is required');
        }
        if (!options.command && !options.task && !options.script) {
            throw new Error('Either --command, --task, or --script must be specified');
        }
        await this.initializeConfig(options);
        const defaults = this.getCommandDefaults();
        const mergedOptions = this.applyDefaults(options, defaults);
        const target = await this.resolveTarget(targetSpec);
        const watchPaths = paths.length > 0 ? paths : ['.'];
        if (mergedOptions.dryRun) {
            this.log('[DRY RUN] Would watch:', 'info');
            this.log(`  Target: ${this.formatTargetDisplay(target)}`, 'info');
            this.log(`  Paths: ${watchPaths.join(', ')}`, 'info');
            if (mergedOptions.pattern) {
                this.log(`  Patterns: ${mergedOptions.pattern.join(', ')}`, 'info');
            }
            if (mergedOptions.exclude) {
                this.log(`  Exclude: ${mergedOptions.exclude.join(', ')}`, 'info');
            }
            const action = mergedOptions.command
                ? `command: ${mergedOptions.command}`
                : mergedOptions.task
                    ? `task: ${mergedOptions.task}`
                    : `script: ${mergedOptions.script}`;
            this.log(`  Action: ${action}`, 'info');
            return;
        }
        this.setupCleanupHandlers();
        await this.startWatching(target, watchPaths, mergedOptions);
        if (mergedOptions.initial) {
            await this.executeAction(target, 'initial', mergedOptions);
        }
        if (!mergedOptions.quiet) {
            this.log('Watching for changes. Press Ctrl+C to stop...', 'info');
        }
        await new Promise(() => { });
    }
    async startWatching(target, paths, options) {
        const sessionId = target.id;
        if (this.sessions.has(sessionId)) {
            throw new Error(`Already watching target: ${sessionId}`);
        }
        const targetDisplay = this.formatTargetDisplay(target);
        if (!options.quiet) {
            this.log(`Setting up watch on ${targetDisplay}...`, 'info');
        }
        try {
            let session;
            switch (target.type) {
                case 'local':
                    session = await this.watchLocal(target, paths, options);
                    break;
                case 'ssh':
                    session = await this.watchSSH(target, paths, options);
                    break;
                case 'docker':
                    session = await this.watchDocker(target, paths, options);
                    break;
                case 'kubernetes':
                    session = await this.watchKubernetes(target, paths, options);
                    break;
                default:
                    throw new Error(`Watch not supported for target type: ${target.type}`);
            }
            this.sessions.set(sessionId, session);
            if (!options.quiet) {
                this.log(`${prism.green('✓')} Watching ${targetDisplay} for changes`, 'success');
                this.log(`  Paths: ${paths.join(', ')}`, 'info');
                if (options.pattern) {
                    this.log(`  Patterns: ${options.pattern.join(', ')}`, 'info');
                }
            }
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`${prism.red('✗')} Failed to start watching: ${errorMessage}`, 'error');
            throw error;
        }
    }
    async watchLocal(target, paths, options) {
        const watcher = new FileWatcher(paths, {
            debounce: parseInt(options.interval || '200', 10),
            ignore: options.exclude || [],
            recursive: true,
            extensions: [],
        });
        watcher.on('change', (event) => {
            if (this.shouldIgnoreFile(event.path, options)) {
                return;
            }
            this.scheduleExecution(target, event.path, options);
        });
        watcher.on('error', (error) => {
            this.log(`Watch error: ${error}`, 'error');
        });
        watcher.start();
        return {
            target,
            watcher,
        };
    }
    async watchSSH(target, paths, options) {
        const config = target.config;
        const sshEngine = await this.createTargetEngine(target);
        const watchCommand = this.buildRemoteWatchCommand(paths, options);
        const watchProcess = sshEngine.raw `${watchCommand}`.nothrow();
        watchProcess.child?.stdout?.on('data', (data) => {
            const lines = data.toString().trim().split('\n');
            for (const line of lines) {
                if (line.trim()) {
                    const filePath = this.parseWatchOutput(line);
                    if (filePath && !this.shouldIgnoreFile(filePath, options)) {
                        this.scheduleExecution(target, filePath, options);
                    }
                }
            }
        });
        watchProcess.child?.stderr?.on('data', (data) => {
            if (options.verbose) {
                this.log(`Watch stderr: ${data.toString().trim()}`, 'warn');
            }
        });
        return {
            target,
            watcher: watchProcess,
        };
    }
    async watchDocker(target, paths, options) {
        const config = target.config;
        const container = config.container || target.name;
        const watchCommand = this.buildRemoteWatchCommand(paths, options);
        const watchProcess = $.local() `docker exec ${container} sh -c "${watchCommand}"`.nothrow();
        if (watchProcess.child?.stdout) {
            watchProcess.child.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        const filePath = this.parseWatchOutput(line);
                        if (filePath && !this.shouldIgnoreFile(filePath, options)) {
                            this.scheduleExecution(target, filePath, options);
                        }
                    }
                }
            });
        }
        return {
            target,
            watcher: watchProcess,
        };
    }
    async watchKubernetes(target, paths, options) {
        const config = target.config;
        const namespace = config.namespace || 'default';
        const pod = config.pod || target.name;
        const containerFlag = config.container ? `-c ${config.container}` : '';
        const watchCommand = this.buildRemoteWatchCommand(paths, options);
        const watchProcess = $.local() `kubectl exec -n ${namespace} ${containerFlag} ${pod} -- sh -c "${watchCommand}"`.nothrow();
        if (watchProcess.child?.stdout) {
            watchProcess.child.stdout.on('data', (data) => {
                const lines = data.toString().trim().split('\n');
                for (const line of lines) {
                    if (line.trim()) {
                        const filePath = this.parseWatchOutput(line);
                        if (filePath && !this.shouldIgnoreFile(filePath, options)) {
                            this.scheduleExecution(target, filePath, options);
                        }
                    }
                }
            });
        }
        return {
            target,
            watcher: watchProcess,
        };
    }
    buildRemoteWatchCommand(paths, options) {
        const events = 'modify,create,delete,move';
        const excludePatterns = options.exclude?.map(p => `--exclude '${p}'`).join(' ') || '';
        const pathsStr = paths.join(' ');
        const inotifyCommand = options.pattern && options.pattern.length > 0
            ? `while true; do find ${pathsStr} \\( ${options.pattern.map(p => `-name "${p}"`).join(' -o ')} \\) -print0 | xargs -0 inotifywait -e ${events} ${excludePatterns} --format '%w%f' 2>/dev/null || sleep 1; done`
            : `inotifywait -mr -e ${events} ${excludePatterns} --format '%w%f' ${pathsStr} 2>/dev/null`;
        const fallbackCommand = `
      last_mtime=""
      while true; do
        current_mtime=$(find ${pathsStr} -type f -exec stat -c '%Y' {} \\; 2>/dev/null | sort -n | tail -1)
        if [ ! -z "$current_mtime" ] && [ "$current_mtime" != "$last_mtime" ]; then
          echo "${pathsStr} MODIFY"
          last_mtime="$current_mtime"
        fi
        sleep 1
      done
    `.trim().replace(/\n\s*/g, ' ');
        return `command -v inotifywait >/dev/null 2>&1 && (${inotifyCommand}) || (${fallbackCommand})`;
    }
    parseWatchOutput(line) {
        const trimmed = line.trim();
        if (!trimmed)
            return undefined;
        const parts = trimmed.split(' ');
        if (parts.length > 0) {
            return parts[0];
        }
        return undefined;
    }
    shouldIgnoreFile(filePath, options) {
        if (options.pattern && options.pattern.length > 0) {
            const basename = path.basename(filePath);
            const matches = options.pattern.some(pattern => {
                const regex = pattern
                    .replace(/\*/g, '.*')
                    .replace(/\?/g, '.');
                return new RegExp(`^${regex}$`).test(basename);
            });
            if (!matches) {
                return true;
            }
        }
        return false;
    }
    scheduleExecution(target, changedFile, options) {
        const session = this.sessions.get(target.id);
        if (!session)
            return;
        const debounceMs = parseInt(options.debounce || '300', 10);
        if (session.debounceTimer) {
            clearTimeout(session.debounceTimer);
        }
        session.debounceTimer = setTimeout(async () => {
            await this.executeAction(target, changedFile, options);
            session.lastRun = new Date();
        }, debounceMs);
    }
    async executeAction(target, changedFile, options) {
        const targetDisplay = this.formatTargetDisplay(target);
        const timestamp = new Date().toLocaleTimeString();
        if (!options.quiet) {
            this.log(`\n[${timestamp}] Change detected: ${changedFile}`, 'info');
            this.startSpinner(`Executing on ${targetDisplay}...`);
        }
        try {
            const engine = await this.createTargetEngine(target);
            if (options.command) {
                const result = await engine.raw `${options.command}`.nothrow();
                if (!options.quiet) {
                    this.stopSpinner();
                    if (result.exitCode === 0) {
                        this.log(`${prism.green('✓')} Command executed successfully`, 'success');
                        if (result.stdout && options.verbose) {
                            console.log(result.stdout.trim());
                        }
                    }
                    else {
                        throw new Error(`Command failed with exit code ${result.exitCode}`);
                    }
                }
                else if (result.exitCode !== 0) {
                    throw new Error(`Command failed with exit code ${result.exitCode}`);
                }
            }
            else if (options.script) {
                const scriptLoader = getScriptLoader({
                    verbose: options.verbose,
                    quiet: options.quiet,
                });
                const result = await scriptLoader.executeScript(options.script, {
                    target,
                    targetEngine: engine,
                    context: {
                        args: [],
                        argv: [process.argv[0] || 'node', options.script],
                        __filename: options.script,
                        __dirname: path.dirname(options.script),
                    },
                    quiet: options.quiet,
                });
                if (!options.quiet) {
                    this.stopSpinner();
                    if (result.success) {
                        this.log(`${prism.green('✓')} Script executed successfully`, 'success');
                    }
                    else {
                        throw new Error(result.error?.message || 'Script execution failed');
                    }
                }
                else if (!result.success) {
                    throw new Error(result.error?.message || 'Script execution failed');
                }
            }
            else if (options.task && this.taskManager) {
                const result = await this.taskManager.run(options.task, {}, {
                    target: target.id
                });
                if (!options.quiet) {
                    this.stopSpinner();
                    if (result.success) {
                        this.log(`${prism.green('✓')} Task '${options.task}' completed`, 'success');
                    }
                    else {
                        throw new Error(result.error?.message || 'Task failed');
                    }
                }
            }
        }
        catch (error) {
            if (!options.quiet) {
                this.stopSpinner();
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`${prism.red('✗')} Execution failed: ${errorMessage}`, 'error');
        }
    }
    setupCleanupHandlers() {
        const cleanup = async () => {
            this.running = false;
            this.log('\nStopping watchers...', 'info');
            for (const [sessionId, session] of Array.from(this.sessions.entries())) {
                try {
                    if (session.debounceTimer) {
                        clearTimeout(session.debounceTimer);
                    }
                    if (session.watcher) {
                        if (typeof session.watcher.close === 'function') {
                            await session.watcher.close();
                        }
                        else if (typeof session.watcher.kill === 'function') {
                            session.watcher.kill();
                        }
                    }
                    this.log(`Stopped watching ${sessionId}`, 'info');
                }
                catch (error) {
                    this.log(`Failed to cleanup ${sessionId}: ${error}`, 'error');
                }
            }
            this.sessions.clear();
            process.exit(0);
        };
        process.once('SIGINT', cleanup);
        process.once('SIGTERM', cleanup);
    }
    async runInteractiveMode() {
        InteractiveHelpers.startInteractiveMode('Watch Configuration');
        try {
            const target = await InteractiveHelpers.selectTarget({
                message: 'Select target to watch:',
                type: 'all',
                allowCustom: true,
            });
            if (!target) {
                InteractiveHelpers.endInteractiveMode('Cancelled');
                return;
            }
            const pathsInput = await InteractiveHelpers.inputText('Enter paths to watch (comma-separated):', {
                placeholder: './src, ./config, ./app',
                initialValue: '.',
                validate: (value) => {
                    if (!value?.trim()) {
                        return 'At least one path is required';
                    }
                    return undefined;
                },
            });
            if (!pathsInput) {
                InteractiveHelpers.endInteractiveMode('Cancelled');
                return;
            }
            const watchPaths = pathsInput.split(',').map(p => p.trim()).filter(Boolean);
            const usePatterns = await InteractiveHelpers.confirmAction('Do you want to specify file patterns to watch?', false);
            let patterns;
            if (usePatterns) {
                const patternsInput = await InteractiveHelpers.inputText('Enter file patterns (comma-separated):', {
                    placeholder: '*.ts, *.js, *.json',
                });
                if (patternsInput) {
                    patterns = patternsInput.split(',').map(p => p.trim()).filter(Boolean);
                }
            }
            const useExcludes = await InteractiveHelpers.confirmAction('Do you want to exclude any patterns?', false);
            let excludes;
            if (useExcludes) {
                const excludesInput = await InteractiveHelpers.inputText('Enter exclude patterns (comma-separated):', {
                    placeholder: 'node_modules, .git, *.log',
                });
                if (excludesInput) {
                    excludes = excludesInput.split(',').map(p => p.trim()).filter(Boolean);
                }
            }
            const actionType = await InteractiveHelpers.selectFromList('What should run when files change?', ['command', 'task', 'script'], (type) => {
                switch (type) {
                    case 'command': return '🔧 Execute a shell command';
                    case 'task': return '📋 Run a configured task';
                    case 'script': return '📜 Execute a script file';
                    default: return type;
                }
            });
            if (!actionType) {
                InteractiveHelpers.endInteractiveMode('Cancelled');
                return;
            }
            let command;
            let task;
            let script;
            if (actionType === 'command') {
                const commandInput = await InteractiveHelpers.inputText('Enter command to execute on change:', {
                    placeholder: 'npm test, npm run build, etc.',
                    validate: (value) => {
                        if (!value?.trim()) {
                            return 'Command cannot be empty';
                        }
                        return undefined;
                    },
                });
                command = commandInput || undefined;
                if (!command) {
                    InteractiveHelpers.endInteractiveMode('Cancelled');
                    return;
                }
            }
            else if (actionType === 'script') {
                const scriptInput = await InteractiveHelpers.inputText('Enter script file path:', {
                    placeholder: './scripts/build.js, ./tasks/deploy.ts',
                    validate: (value) => {
                        if (!value?.trim()) {
                            return 'Script path cannot be empty';
                        }
                        if (!fs.existsSync(value.trim())) {
                            return 'Script file not found';
                        }
                        return undefined;
                    },
                });
                script = scriptInput || undefined;
                if (!script) {
                    InteractiveHelpers.endInteractiveMode('Cancelled');
                    return;
                }
            }
            else {
                await this.initializeConfig({});
                const taskInfos = this.taskManager ? await this.taskManager.list() : [];
                const availableTasks = taskInfos.map(info => info.name);
                if (availableTasks.length === 0) {
                    InteractiveHelpers.showWarning('No tasks found in configuration. You can still enter a task name.');
                    const taskInput = await InteractiveHelpers.inputText('Enter task name:', {
                        placeholder: 'deploy, build, test',
                        validate: (value) => {
                            if (!value?.trim()) {
                                return 'Task name cannot be empty';
                            }
                            return undefined;
                        },
                    });
                    task = taskInput || undefined;
                }
                else {
                    const selectedTask = await InteractiveHelpers.selectFromList('Select task to run:', availableTasks, (taskName) => {
                        const info = taskInfos.find(t => t.name === taskName);
                        const description = info?.description ? ` - ${info.description}` : '';
                        return `📋 ${taskName}${description}`;
                    }, true);
                    if (!selectedTask) {
                        InteractiveHelpers.endInteractiveMode('Cancelled');
                        return;
                    }
                    if (selectedTask.custom) {
                        const customTaskInput = await InteractiveHelpers.inputText('Enter custom task name:', {
                            validate: (value) => {
                                if (!value?.trim()) {
                                    return 'Task name cannot be empty';
                                }
                                return undefined;
                            },
                        });
                        task = customTaskInput || undefined;
                    }
                    else {
                        task = selectedTask;
                    }
                }
                if (!task) {
                    InteractiveHelpers.endInteractiveMode('Cancelled');
                    return;
                }
            }
            const configureAdvanced = await InteractiveHelpers.confirmAction('Configure advanced options (debounce, polling, etc.)?', false);
            let debounce = '300';
            let poll = false;
            let interval = '1000';
            let initial = false;
            if (configureAdvanced) {
                const debounceInput = await InteractiveHelpers.inputText('Debounce interval (ms):', {
                    initialValue: '300',
                    validate: (value) => {
                        if (!value)
                            return 'Value is required';
                        const num = parseInt(value, 10);
                        if (isNaN(num) || num < 0) {
                            return 'Must be a positive number';
                        }
                        return undefined;
                    },
                });
                if (debounceInput) {
                    debounce = debounceInput;
                }
                poll = await InteractiveHelpers.confirmAction('Use polling instead of native file watchers?', false);
                if (poll) {
                    const intervalInput = await InteractiveHelpers.inputText('Polling interval (ms):', {
                        initialValue: '1000',
                        validate: (value) => {
                            if (!value)
                                return 'Value is required';
                            const num = parseInt(value, 10);
                            if (isNaN(num) || num < 100) {
                                return 'Must be at least 100ms';
                            }
                            return undefined;
                        },
                    });
                    if (intervalInput) {
                        interval = intervalInput;
                    }
                }
                initial = await InteractiveHelpers.confirmAction('Run action immediately on start?', false);
            }
            InteractiveHelpers.showInfo('\nWatch Configuration Summary:');
            console.log(`  Target: ${InteractiveHelpers.getTargetIcon(target.type)} ${target.id}`);
            console.log(`  Paths: ${watchPaths.join(', ')}`);
            if (patterns) {
                console.log(`  Patterns: ${patterns.join(', ')}`);
            }
            if (excludes) {
                console.log(`  Exclude: ${excludes.join(', ')}`);
            }
            if (command) {
                console.log(`  Command: ${command}`);
            }
            if (task) {
                console.log(`  Task: ${task}`);
            }
            if (script) {
                console.log(`  Script: ${script}`);
            }
            console.log(`  Debounce: ${debounce}ms`);
            if (poll) {
                console.log(`  Polling: ${interval}ms`);
            }
            if (initial) {
                console.log(`  Initial run: Yes`);
            }
            console.log('');
            const proceed = await InteractiveHelpers.confirmAction('Start watching with these settings?', true);
            if (!proceed) {
                InteractiveHelpers.endInteractiveMode('Cancelled');
                return;
            }
            InteractiveHelpers.endInteractiveMode('Starting watch...');
            const watchOptions = {
                pattern: patterns,
                exclude: excludes,
                command,
                task,
                script,
                debounce,
                initial,
                poll,
                interval,
                quiet: false,
                verbose: false,
                dryRun: false,
            };
            if (!this.taskManager) {
                await this.initializeConfig(watchOptions);
            }
            const defaults = this.getCommandDefaults();
            const mergedOptions = this.applyDefaults(watchOptions, defaults);
            this.setupCleanupHandlers();
            await this.startWatching(target, watchPaths, mergedOptions);
            if (mergedOptions.initial) {
                await this.executeAction(target, 'initial', mergedOptions);
            }
            console.log('\n' + prism.green('✓') + ` Watching ${InteractiveHelpers.getTargetIcon(target.type)} ${target.id} for changes...`);
            console.log(prism.gray('Press Ctrl+C to stop watching'));
            await new Promise(() => { });
        }
        catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            InteractiveHelpers.showError(`Configuration failed: ${errorMessage}`);
            InteractiveHelpers.endInteractiveMode('Failed');
            throw error;
        }
    }
}
export default function command(program) {
    const cmd = new WatchCommand();
    program.addCommand(cmd.create());
}
//# sourceMappingURL=watch.js.map