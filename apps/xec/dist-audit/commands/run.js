import path from 'path';
import fs from 'fs/promises';
import { $ } from '@xec-sh/core';
import { log, prism } from '@xec-sh/kit';
import { TaskManager , ScriptLoader, ConfigurationManager } from '@xec-sh/ops';

import { BaseCommand } from '../utils/command-base.js';

export class RunCommand extends BaseCommand {
    constructor() {
        super({
            name: 'run',
            description: 'Run an Xec script or task',
            arguments: '[fileOrTask]',
            aliases: ['r'],
            options: [
                {
                    flags: '-e, --eval <code>',
                    description: 'Evaluate code'
                },
                {
                    flags: '--repl',
                    description: 'Start interactive REPL'
                },
                {
                    flags: '--typescript',
                    description: 'Enable TypeScript support'
                },
                {
                    flags: '--watch',
                    description: 'Watch for file changes'
                },
                {
                    flags: '--runtime <runtime>',
                    description: 'Specify runtime: auto, node, bun, deno (default: auto)'
                },
                {
                    flags: '--no-universal',
                    description: 'Disable universal loader (legacy mode)'
                }
            ],
            examples: [
                {
                    command: 'xec run script.js',
                    description: 'Run a JavaScript file'
                },
                {
                    command: 'xec run script.ts',
                    description: 'Run a TypeScript file'
                },
                {
                    command: 'xec run build',
                    description: 'Run a task named "build"'
                },
                {
                    command: 'xec run -e "console.log(\'Hello\')"',
                    description: 'Evaluate inline code'
                },
                {
                    command: 'xec run --repl',
                    description: 'Start interactive REPL'
                }
            ]
        });
        this.scriptLoader = new ScriptLoader({
            verbose: process.env['XEC_DEBUG'] === 'true',
            cache: true,
            preferredCDN: 'esm.sh'
        });
    }
    create() {
        const command = super.create();
        command.option('-p, --param <key=value...>', 'Task parameters (can be used multiple times)', (value, previous = []) => {
            previous.push(value);
            return previous;
        }, []);
        command.allowUnknownOption(true);
        return command;
    }
    async execute(args) {
        const fileOrTask = args[0];
        const options = args[args.length - 1];
        const scriptArgs = args.slice(1, args.length - 1);
        if (options.repl) {
            await this.startRepl(options);
        }
        else if (options.eval) {
            await this.evalCode(options.eval, scriptArgs, options);
        }
        else if (fileOrTask) {
            const isFile = fileOrTask.includes('.') || fileOrTask.includes('/') || fileOrTask.includes('\\');
            if (isFile) {
                await this.runScript(fileOrTask, scriptArgs, options);
            }
            else {
                await this.runTask(fileOrTask, options);
            }
        }
        else {
            log.error('No script file or task specified');
            log.info('Usage: xec run <file> [args...]');
            log.info('       xec run <task> [options]');
            log.info('       xec run -e <code>');
            log.info('       xec run --repl');
            throw new Error('No script file or task specified');
        }
    }
    async runScript(scriptPath, args, options) {
        const execOptions = {
            verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
            quiet: this.options.quiet,
            typescript: options.typescript,
            watch: options.watch,
            context: {
                args,
                argv: [process.argv[0] || 'node', scriptPath, ...args],
                __filename: path.resolve(scriptPath),
                __dirname: path.dirname(path.resolve(scriptPath)),
            },
            target: {
                type: 'local',
                name: 'local',
                config: {}
            },
            targetEngine: $
        };
        const result = await this.scriptLoader.executeScript(scriptPath, execOptions);
        if (!result.success && result.error) {
            if (result.error.message.includes('runtime requested but not available')) {
                log.error(result.error.message);
                const runtime = options.runtime || 'auto';
                if (runtime !== 'auto') {
                    log.info('\nTo use a specific runtime, ensure it is installed and run xec with it:');
                    log.info(`  ${prism.cyan(`${runtime} xec run ${scriptPath}`)}`);
                }
            }
            else {
                throw result.error;
            }
        }
    }
    async evalCode(code, args, options) {
        const execOptions = {
            verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
            quiet: this.options.quiet,
            typescript: options.typescript,
            context: {
                args,
                argv: ['xec', '<eval>', ...args],
                __filename: '<eval>',
                __dirname: process.cwd(),
            },
            target: {
                type: 'local',
                name: 'local',
                config: {}
            },
            targetEngine: $
        };
        const result = await this.scriptLoader.evaluateCode(code, execOptions);
        if (!result.success && result.error) {
            throw result.error;
        }
    }
    async startRepl(options) {
        const execOptions = {
            verbose: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
            quiet: this.options.quiet,
            typescript: options.typescript,
            target: {
                type: 'local',
                name: 'local',
                config: {}
            },
            targetEngine: $
        };
        await this.scriptLoader.startRepl(execOptions);
    }
    async runTask(taskName, options) {
        const configManager = new ConfigurationManager({
            projectRoot: process.cwd(),
        });
        const taskManager = new TaskManager({
            configManager,
            debug: this.options.verbose || process.env['XEC_DEBUG'] === 'true',
            dryRun: false,
        });
        await taskManager.load();
        if (!await taskManager.exists(taskName)) {
            try {
                await fs.access(taskName);
                return await this.runScript(taskName, [], options);
            }
            catch {
                log.error(`Task '${taskName}' not found`);
                log.info(prism.dim('\nRun "xec inspect tasks" to see available tasks'));
                throw new Error(`Task '${taskName}' not found`);
            }
        }
        const params = {};
        if (options.param) {
            for (const param of options.param) {
                const [key, ...valueParts] = param.split('=');
                const value = valueParts.join('=');
                if (!key || !value) {
                    log.error(`Invalid parameter format: ${param}`);
                    log.info(prism.dim('Use --param key=value'));
                    throw new Error(`Invalid parameter format: ${param}`);
                }
                let parsedValue = value;
                if (value === 'true')
                    parsedValue = true;
                else if (value === 'false')
                    parsedValue = false;
                else if (!isNaN(Number(value)))
                    parsedValue = Number(value);
                else if (value.startsWith('[') || value.startsWith('{')) {
                    try {
                        parsedValue = JSON.parse(value);
                    }
                    catch {
                    }
                }
                params[key] = parsedValue;
            }
        }
        if (!this.options.quiet) {
            log.info(`Running task: ${prism.cyan(taskName)}`);
            if (Object.keys(params).length > 0) {
                log.info(prism.dim('Parameters:'));
                for (const [key, value] of Object.entries(params)) {
                    log.info(prism.dim(`  ${key}: ${JSON.stringify(value)}`));
                }
            }
        }
        const result = await taskManager.run(taskName, params);
        if (!result.success) {
            log.error(`Task '${taskName}' failed`);
            if (result.error) {
                log.error(result.error.message);
            }
            throw new Error(`Task '${taskName}' failed`);
        }
        if (!this.options.quiet) {
            log.success(`Task '${taskName}' completed successfully`);
        }
    }
}
export async function runScript(scriptPath, args, options) {
    const command = new RunCommand();
    return command['runScript'](scriptPath, args, options);
}
export async function evalCode(code, args, options) {
    const command = new RunCommand();
    return command['evalCode'](code, args, options);
}
export async function startRepl(options) {
    const command = new RunCommand();
    return command['startRepl'](options);
}
export async function runTask(taskName, options) {
    const command = new RunCommand();
    return command['runTask'](taskName, options);
}
export default function command(program) {
    const cmd = new RunCommand();
    program.addCommand(cmd.create());
}
//# sourceMappingURL=run.js.map