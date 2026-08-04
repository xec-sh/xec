import { z } from 'zod';
import path from 'path';
import { prism } from '@xec-sh/kit';
import { ScriptLoader , parseTimeout, validateOptions } from '@xec-sh/ops';

import { ConfigAwareCommand } from '../utils/command-base.js';
import { InteractiveHelpers } from '../utils/interactive-helpers.js';

export class OnCommand extends ConfigAwareCommand {
    constructor() {
        super({
            name: 'on',
            description: 'Execute commands on SSH hosts',
            arguments: '<hosts> [command...]',
            options: [
                {
                    flags: '-p, --profile <profile>',
                    description: 'Configuration profile to use',
                },
                {
                    flags: '--task <task>',
                    description: 'Execute a configured task on the hosts',
                },
                {
                    flags: '--repl',
                    description: 'Start a REPL session with $target available',
                },
                {
                    flags: '-t, --timeout <duration>',
                    description: 'Command timeout (e.g., 30s, 5m)',
                },
                {
                    flags: '-e, --env <key=value>',
                    description: 'Environment variables (can be used multiple times)',
                },
                {
                    flags: '-d, --cwd <path>',
                    description: 'Working directory on remote host',
                },
                {
                    flags: '-u, --user <user>',
                    description: 'User to run command as (overrides config)',
                },
                {
                    flags: '--parallel',
                    description: 'Execute on multiple hosts in parallel',
                },
                {
                    flags: '--max-concurrent <n>',
                    description: 'Maximum concurrent executions',
                    defaultValue: '10',
                },
                {
                    flags: '--fail-fast',
                    description: 'Stop on first failure in parallel mode',
                },
                {
                    flags: '-i, --interactive',
                    description: 'Interactive mode for selecting SSH hosts and execution options',
                },
            ],
            examples: [
                {
                    command: 'xec on hosts.web-1 "uptime"',
                    description: 'Execute on configured SSH host',
                },
                {
                    command: 'xec on hosts.web-* "systemctl status nginx" --parallel',
                    description: 'Execute on multiple hosts in parallel',
                },
                {
                    command: 'xec on deploy@server.com "date"',
                    description: 'Execute on direct SSH target',
                },
                {
                    command: 'xec on hosts.db-master ./scripts/backup.ts',
                    description: 'Execute script with $target context',
                },
                {
                    command: 'xec on hosts.* --task deploy --parallel',
                    description: 'Run deploy task on all hosts',
                },
                {
                    command: 'xec on --interactive',
                    description: 'Interactive mode for selecting hosts and commands',
                },
            ],
            validateOptions: (options) => {
                const schema = z.object({
                    profile: z.string().optional(),
                    task: z.string().optional(),
                    repl: z.boolean().optional(),
                    timeout: z.string().optional(),
                    env: z.array(z.string()).optional(),
                    cwd: z.string().optional(),
                    user: z.string().optional(),
                    parallel: z.boolean().optional(),
                    maxConcurrent: z.string().optional(),
                    failFast: z.boolean().optional(),
                    interactive: z.boolean().optional(),
                    verbose: z.boolean().optional(),
                    quiet: z.boolean().optional(),
                    dryRun: z.boolean().optional(),
                });
                validateOptions(options, schema);
            },
        });
    }
    getCommandConfigKey() {
        return 'on';
    }
    async execute(args) {
        let [hostPattern, ...commandParts] = args.slice(0, -1);
        const options = args[args.length - 1];
        if (options.interactive) {
            const interactiveResult = await this.runInteractiveMode(options);
            if (!interactiveResult)
                return;
            hostPattern = interactiveResult.hostPattern;
            commandParts = interactiveResult.commandParts || [];
            Object.assign(options, interactiveResult.options);
        }
        if (!hostPattern) {
            throw new Error('Host specification is required');
        }
        await this.initializeConfig(options);
        const defaults = this.getCommandDefaults();
        const mergedOptions = this.applyDefaults(options, defaults);
        let targets;
        if (hostPattern.includes('*') || hostPattern.includes('{')) {
            const pattern = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
            targets = await this.findTargets(pattern);
            if (targets.length === 0) {
                throw new Error(`No hosts found matching pattern: ${hostPattern}`);
            }
        }
        else if (hostPattern.includes(',')) {
            const hostIds = hostPattern.split(',');
            targets = [];
            for (const hostId of hostIds) {
                try {
                    const target = await this.resolveTarget(hostId);
                    targets.push(target);
                }
                catch {
                    targets.push({
                        id: `ssh:${hostId}`,
                        type: 'ssh',
                        name: hostId,
                        config: {
                            type: 'ssh',
                            host: hostId,
                            user: mergedOptions.user || process.env['USER'] || 'root',
                        },
                        source: 'detected'
                    });
                }
            }
        }
        else if (hostPattern.includes('@') && !hostPattern.includes('.')) {
            const [user, host] = hostPattern.split('@');
            targets = [{
                    id: `ssh:${hostPattern}`,
                    type: 'ssh',
                    name: host,
                    config: {
                        type: 'ssh',
                        host,
                        user,
                    },
                    source: 'detected'
                }];
        }
        else {
            const targetSpec = hostPattern.startsWith('hosts.') ? hostPattern : `hosts.${hostPattern}`;
            try {
                const target = await this.resolveTarget(targetSpec);
                targets = [target];
            }
            catch {
                targets = [{
                        id: `ssh:${hostPattern}`,
                        type: 'ssh',
                        name: hostPattern,
                        config: {
                            type: 'ssh',
                            host: hostPattern,
                            user: mergedOptions.user || process.env['USER'] || 'root',
                        },
                        source: 'detected'
                    }];
            }
        }
        const nonSshTargets = targets.filter(t => t.type !== 'ssh');
        if (nonSshTargets.length > 0) {
            throw new Error(`'on' command only supports SSH hosts. Found: ${nonSshTargets.map(t => t.type).join(', ')}`);
        }
        if (mergedOptions.task) {
            await this.executeTask(targets, mergedOptions.task, mergedOptions);
        }
        else if (mergedOptions.repl) {
            if (targets.length === 0) {
                throw new Error('No targets found');
            }
            if (targets.length > 1) {
                throw new Error('REPL mode is only supported for single hosts');
            }
            await this.startRepl(targets[0], mergedOptions);
        }
        else if (commandParts.length > 0) {
            const cmd = commandParts.join(' ');
            if (cmd.endsWith('.ts') || cmd.endsWith('.js')) {
                await this.executeScript(targets, cmd, mergedOptions);
            }
            else {
                await this.executeCommand(targets, cmd, mergedOptions);
            }
        }
        else {
            throw new Error('No command, task, or REPL mode specified');
        }
    }
    async executeCommand(targets, cmd, options) {
        if (options.dryRun) {
            for (const target of targets) {
                this.log(`[DRY RUN] Would execute on ${this.formatTargetDisplay(target)}: ${prism.yellow(cmd)}`, 'info');
            }
            return;
        }
        if (options.parallel && targets.length > 1) {
            await this.executeParallel(targets, cmd, options);
        }
        else {
            for (const target of targets) {
                await this.executeSingle(target, cmd, options);
            }
        }
    }
    async executeSingle(target, cmd, options) {
        const targetDisplay = this.formatTargetDisplay(target);
        if (!options.quiet) {
            this.startSpinner(`Executing on ${targetDisplay}...`);
        }
        try {
            const engine = await this.createTargetEngine(target);
            let execEngine = engine;
            if (options.env && options.env.length > 0) {
                const envVars = {};
                for (const envVar of options.env) {
                    const [key, value] = envVar.split('=');
                    if (key && value !== undefined) {
                        envVars[key] = value;
                    }
                }
                execEngine = execEngine.env(envVars);
            }
            if (options.cwd) {
                execEngine = execEngine.cd(options.cwd);
            }
            if (options.timeout) {
                const timeoutMs = parseTimeout(options.timeout);
                execEngine = execEngine.timeout(timeoutMs);
            }
            const result = await execEngine.raw `${cmd}`;
            if (!options.quiet) {
                this.stopSpinner();
                this.log(`${prism.green('✓')} ${targetDisplay}`, 'success');
                if (result.stdout) {
                    console.log(result.stdout.trim());
                }
                if (result.stderr && options.verbose) {
                    console.error(prism.yellow(result.stderr.trim()));
                }
            }
        }
        catch (error) {
            if (!options.quiet) {
                this.stopSpinner();
            }
            const errorMessage = error instanceof Error ? error.message : String(error);
            this.log(`${prism.red('✗')} ${targetDisplay}: ${errorMessage}`, 'error');
            throw error;
        }
    }
    async executeParallel(targets, cmd, options) {
        const maxConcurrent = parseInt(String(options.maxConcurrent || '10'), 10);
        this.log(`Executing on ${targets.length} hosts in parallel (max ${maxConcurrent} concurrent)...`, 'info');
        const results = [];
        const queue = [...targets];
        const worker = async () => {
            while (queue.length > 0) {
                const target = queue.shift();
                try {
                    await this.executeSingle(target, cmd, { ...options, quiet: true });
                    results.push({ target, success: true });
                }
                catch (error) {
                    results.push({ target, success: false, error });
                    if (options.failFast) {
                        queue.length = 0;
                    }
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(maxConcurrent, targets.length) }, () => worker()));
        const successful = results.filter(r => r.success);
        const failed = results.filter(r => !r.success);
        if (successful.length > 0) {
            this.log(`${prism.green('✓')} Succeeded on ${successful.length} hosts:`, 'success');
            for (const result of successful) {
                this.log(`  - ${this.formatTargetDisplay(result.target)}`, 'info');
            }
        }
        if (failed.length > 0) {
            this.log(`${prism.red('✗')} Failed on ${failed.length} hosts:`, 'error');
            for (const result of failed) {
                const errorMessage = result.error instanceof Error ? result.error.message : String(result.error);
                this.log(`  - ${this.formatTargetDisplay(result.target)}: ${errorMessage}`, 'error');
            }
            throw new Error(`Command failed on ${failed.length} hosts`);
        }
    }
    async executeTask(targets, taskName, options) {
        if (!this.taskManager) {
            throw new Error('Task manager not initialized');
        }
        const executeTaskOnTarget = async (target) => {
            const targetDisplay = this.formatTargetDisplay(target);
            if (!options.quiet) {
                this.log(`Running task '${taskName}' on ${targetDisplay}...`, 'info');
            }
            const result = await this.taskManager.run(taskName, {}, {
                target: target.id
            });
            if (result.success) {
                if (!options.quiet) {
                    this.log(`${prism.green('✓')} Task completed on ${targetDisplay}`, 'success');
                }
            }
            else {
                throw new Error(result.error?.message || 'Task failed');
            }
        };
        if (options.parallel && targets.length > 1) {
            const promises = targets.map(target => executeTaskOnTarget(target)
                .then(() => ({ target, success: true }))
                .catch(error => ({ target, error, success: false })));
            const results = await Promise.all(promises);
            const errors = results.filter(r => 'error' in r);
            if (errors.length > 0) {
                for (const { target, error } of errors) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.log(`${prism.red('✗')} Task failed on ${this.formatTargetDisplay(target)}: ${errorMessage}`, 'error');
                }
                throw new Error(`Task failed on ${errors.length} hosts`);
            }
        }
        else {
            for (const target of targets) {
                await executeTaskOnTarget(target);
            }
        }
    }
    async executeScript(targets, scriptPath, options) {
        const scriptLoader = new ScriptLoader({
            verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
            quiet: options.quiet,
            cache: true,
            preferredCDN: 'esm.sh'
        });
        const executeScriptOnTarget = async (target) => {
            const targetDisplay = this.formatTargetDisplay(target);
            if (!options.quiet) {
                this.log(`Running script '${scriptPath}' on ${targetDisplay}...`, 'info');
            }
            const engine = await this.createTargetEngine(target);
            const execOptions = {
                target,
                targetEngine: engine,
                context: {
                    args: process.argv.slice(3),
                    argv: [process.argv[0] || 'node', scriptPath, ...process.argv.slice(3)],
                    __filename: path.resolve(scriptPath),
                    __dirname: path.dirname(path.resolve(scriptPath))
                },
                verbose: options.verbose,
                quiet: options.quiet
            };
            const result = await scriptLoader.executeScript(scriptPath, execOptions);
            if (result.success) {
                if (!options.quiet) {
                    this.log(`${prism.green('✓')} Script completed on ${targetDisplay}`, 'success');
                }
            }
            else {
                throw result.error || new Error('Script execution failed');
            }
        };
        if (options.parallel && targets.length > 1) {
            const promises = targets.map(target => executeScriptOnTarget(target)
                .then(() => ({ target, success: true }))
                .catch(error => ({ target, error, success: false })));
            const results = await Promise.all(promises);
            const errors = results.filter(r => 'error' in r);
            if (errors.length > 0) {
                for (const { target, error } of errors) {
                    const errorMessage = error instanceof Error ? error.message : String(error);
                    this.log(`${prism.red('✗')} Script failed on ${this.formatTargetDisplay(target)}: ${errorMessage}`, 'error');
                }
                throw new Error(`Script failed on ${errors.length} hosts`);
            }
        }
        else {
            for (const target of targets) {
                await executeScriptOnTarget(target);
            }
        }
    }
    async startRepl(target, options) {
        const targetDisplay = this.formatTargetDisplay(target);
        this.log(`Starting REPL with $target configured for ${targetDisplay}...`, 'info');
        const scriptLoader = new ScriptLoader({
            verbose: options.verbose || process.env['XEC_DEBUG'] === 'true',
            quiet: options.quiet,
            cache: true,
            preferredCDN: 'esm.sh'
        });
        const engine = await this.createTargetEngine(target);
        const execOptions = {
            target,
            targetEngine: engine,
            verbose: options.verbose,
            quiet: options.quiet
        };
        await scriptLoader.startRepl(execOptions);
    }
    async runInteractiveMode(options) {
        InteractiveHelpers.startInteractiveMode('Interactive SSH Execution Mode');
        try {
            const hosts = await InteractiveHelpers.selectTarget({
                message: 'Select SSH hosts to execute on:',
                type: 'ssh',
                allowMultiple: true,
                allowCustom: true,
            });
            if (!hosts)
                return null;
            let hostPattern;
            if (Array.isArray(hosts)) {
                if (hosts.length === 1) {
                    hostPattern = hosts[0]?.id || '';
                }
                else {
                    const hostIds = hosts.map(h => h.id).filter(Boolean);
                    hostPattern = hostIds.join(',');
                }
            }
            else {
                hostPattern = hosts.id;
            }
            const executionType = await InteractiveHelpers.selectFromList('What do you want to execute?', [
                { value: 'command', label: '💻 Command' },
                { value: 'script', label: '📜 Script file' },
                { value: 'task', label: '⚙️  Configured task' },
                { value: 'repl', label: '🔧 REPL session' },
            ], (item) => item.label);
            if (!executionType)
                return null;
            const interactiveOptions = {};
            let commandParts = [];
            switch (executionType?.value) {
                case 'command': {
                    const cmd = await InteractiveHelpers.inputText('Enter command to execute:', {
                        placeholder: 'uptime',
                        validate: (value) => {
                            if (!value || value.trim().length === 0) {
                                return 'Command cannot be empty';
                            }
                            return undefined;
                        },
                    });
                    if (!cmd)
                        return null;
                    commandParts = [cmd];
                    break;
                }
                case 'script': {
                    const scriptPath = await InteractiveHelpers.inputText('Enter script file path:', {
                        placeholder: './deploy.ts or /path/to/script.js',
                        validate: (value) => {
                            if (!value || value.trim().length === 0) {
                                return 'Script path cannot be empty';
                            }
                            if (!value.endsWith('.ts') && !value.endsWith('.js')) {
                                return 'Script must be a .ts or .js file';
                            }
                            return undefined;
                        },
                    });
                    if (!scriptPath)
                        return null;
                    commandParts = [scriptPath];
                    break;
                }
                case 'task': {
                    const taskName = await InteractiveHelpers.inputText('Enter task name:', {
                        placeholder: 'deploy, backup, etc.',
                        validate: (value) => {
                            if (!value || value.trim().length === 0) {
                                return 'Task name cannot be empty';
                            }
                            return undefined;
                        },
                    });
                    if (!taskName)
                        return null;
                    interactiveOptions.task = taskName;
                    break;
                }
                case 'repl': {
                    if (Array.isArray(hosts) && hosts.length > 1) {
                        InteractiveHelpers.showWarning('REPL mode only supports single hosts. Using the first selected host.');
                        hostPattern = hosts[0]?.id || '';
                    }
                    interactiveOptions.repl = true;
                    break;
                }
            }
            if (Array.isArray(hosts) && hosts.length > 1 && executionType.value !== 'repl') {
                const useParallel = await InteractiveHelpers.confirmAction('Execute on hosts in parallel?', true);
                if (useParallel) {
                    interactiveOptions.parallel = true;
                    const maxConcurrent = await InteractiveHelpers.selectFromList('Maximum concurrent executions:', [
                        { value: '5', label: '5 hosts' },
                        { value: '10', label: '10 hosts' },
                        { value: '20', label: '20 hosts' },
                        { value: 'custom', label: 'Custom amount...' },
                    ], (item) => item.label);
                    if (maxConcurrent) {
                        if (maxConcurrent?.value === 'custom') {
                            const customCount = await InteractiveHelpers.inputText('Enter max concurrent executions:', {
                                placeholder: '10',
                                validate: (value) => {
                                    if (!value)
                                        return 'Number is required';
                                    const num = parseInt(value, 10);
                                    if (isNaN(num) || num <= 0) {
                                        return 'Please enter a positive number';
                                    }
                                    return undefined;
                                },
                            });
                            if (customCount) {
                                interactiveOptions.maxConcurrent = parseInt(customCount, 10);
                            }
                        }
                        else {
                            interactiveOptions.maxConcurrent = parseInt(maxConcurrent?.value || '10', 10);
                        }
                    }
                    const useFailFast = await InteractiveHelpers.confirmAction('Stop on first failure?', false);
                    if (useFailFast) {
                        interactiveOptions.failFast = true;
                    }
                }
            }
            const useTimeout = await InteractiveHelpers.confirmAction('Set command timeout?', false);
            if (useTimeout) {
                const timeout = await InteractiveHelpers.selectFromList('Select timeout duration:', [
                    { value: '30s', label: '30 seconds' },
                    { value: '1m', label: '1 minute' },
                    { value: '5m', label: '5 minutes' },
                    { value: '15m', label: '15 minutes' },
                    { value: 'custom', label: 'Custom duration...' },
                ], (item) => item.label);
                if (timeout) {
                    if (timeout?.value === 'custom') {
                        const customTimeout = await InteractiveHelpers.inputText('Enter timeout duration:', {
                            placeholder: '10m (10 minutes) or 30s (30 seconds)',
                            validate: (value) => {
                                if (!value || value.trim().length === 0) {
                                    return 'Timeout cannot be empty';
                                }
                                if (!/^\d+[smh]$/.test(value)) {
                                    return 'Please use format like 30s, 5m, or 1h';
                                }
                                return undefined;
                            },
                        });
                        if (customTimeout) {
                            interactiveOptions.timeout = customTimeout;
                        }
                    }
                    else {
                        interactiveOptions.timeout = timeout?.value || '30s';
                    }
                }
            }
            const useEnvVars = await InteractiveHelpers.confirmAction('Set environment variables?', false);
            if (useEnvVars) {
                const envVars = [];
                let addingVars = true;
                while (addingVars) {
                    const envVar = await InteractiveHelpers.inputText('Enter environment variable (KEY=value):', {
                        placeholder: 'NODE_ENV=production',
                        validate: (value) => {
                            if (!value || value.trim().length === 0) {
                                return 'Environment variable cannot be empty';
                            }
                            if (!value.includes('=')) {
                                return 'Please use KEY=value format';
                            }
                            return undefined;
                        },
                    });
                    if (envVar) {
                        envVars.push(envVar);
                    }
                    addingVars = await InteractiveHelpers.confirmAction('Add another environment variable?', false);
                }
                if (envVars.length > 0) {
                    interactiveOptions.env = envVars;
                }
            }
            const useCwd = await InteractiveHelpers.confirmAction('Set working directory on remote hosts?', false);
            if (useCwd) {
                const cwd = await InteractiveHelpers.inputText('Enter working directory:', {
                    placeholder: '/app, /home/user, etc.',
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Working directory cannot be empty';
                        }
                        return undefined;
                    },
                });
                if (cwd) {
                    interactiveOptions.cwd = cwd;
                }
            }
            const useCustomUser = await InteractiveHelpers.confirmAction('Override SSH user for execution?', false);
            if (useCustomUser) {
                const user = await InteractiveHelpers.inputText('Enter SSH user:', {
                    placeholder: 'root, deploy, www-data, etc.',
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'User cannot be empty';
                        }
                        return undefined;
                    },
                });
                if (user) {
                    interactiveOptions.user = user;
                }
            }
            InteractiveHelpers.endInteractiveMode('SSH execution configuration complete!');
            return {
                hostPattern,
                commandParts: commandParts.length > 0 ? commandParts : undefined,
                options: interactiveOptions,
            };
        }
        catch (error) {
            InteractiveHelpers.showError(`Interactive mode failed: ${error}`);
            return null;
        }
    }
}
export default function command(program) {
    const cmd = new OnCommand();
    program.addCommand(cmd.create());
}
//# sourceMappingURL=on.js.map