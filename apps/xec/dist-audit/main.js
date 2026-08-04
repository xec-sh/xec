import fs from 'fs';
import process from 'process';
import { Command } from 'commander';
import { fileURLToPath } from 'url';
import { join, dirname } from 'path';
import { checkForCommandTypo } from '@xec-sh/core';
import { handleError, TaskManager, isDirectCommand, ConfigurationManager, executeDirectCommand } from '@xec-sh/ops';

import { customizeHelp } from './utils/help-customizer.js';
import { loadDynamicCommands, registerCliCommands } from './utils/cli-command-manager.js';
import { saveCommandHistory, initializeCommandPalette } from './utils/command-palette.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
export function createProgram() {
    const program = new Command();
    const pkg = JSON.parse(fs.readFileSync(join(__dirname, '../package.json'), 'utf-8'));
    program
        .name('xec')
        .description('Xec - universal execution shell')
        .version(pkg.version)
        .option('-v, --verbose', 'Enable verbose output')
        .option('-q, --quiet', 'Suppress output')
        .option('--cwd <path>', 'Set current working directory')
        .option('--no-color', 'Disable colored output')
        .option('-e, --eval <code>', 'Evaluate code')
        .option('--repl', 'Start interactive REPL')
        .hook('preAction', (thisCommand) => {
        const opts = thisCommand.opts();
        if (opts['cwd']) {
            process.chdir(opts['cwd']);
        }
        if (opts['noColor']) {
            process.env['NO_COLOR'] = '1';
        }
    });
    return program;
}
export async function loadCommands(program) {
    const commandsDir = join(__dirname, './commands');
    if (fs.existsSync(commandsDir)) {
        const files = fs.readdirSync(commandsDir);
        for (const file of files) {
            if (file.endsWith('.js')) {
                const commandPath = join(commandsDir, file);
                const module = await import(commandPath);
                if (module.default && typeof module.default === 'function') {
                    module.default(program);
                }
            }
        }
    }
    const dynamicCommandNames = await loadDynamicCommands(program);
    return dynamicCommandNames;
}
export async function run(argv = process.argv) {
    const program = createProgram();
    const configManager = new ConfigurationManager();
    const taskManager = new TaskManager({ configManager });
    await taskManager.load();
    await initializeCommandPalette();
    const dynamicCommandNames = await loadCommands(program);
    customizeHelp(program, dynamicCommandNames);
    const commandRegistry = registerCliCommands(program);
    const commandNames = program.commands.map(cmd => cmd.name())
        .concat(program.commands.flatMap(cmd => cmd.aliases() || []))
        .concat(dynamicCommandNames);
    try {
        const args = argv.slice(2);
        const firstArg = args[0];
        if (args.includes('-e') || args.includes('--eval')) {
            const evalIndex = args.indexOf('-e') !== -1 ? args.indexOf('-e') : args.indexOf('--eval');
            const code = args[evalIndex + 1];
            if (!code) {
                throw new Error('Code is required for eval');
            }
            const scriptArgs = args.slice(evalIndex + 2);
            await evalCodeDirectly(code, scriptArgs, {});
            return;
        }
        if (args.includes('--repl')) {
            await startReplDirectly({});
            return;
        }
        if (firstArg && !firstArg.startsWith('-') && firstArg !== 'help') {
            const potentialFile = firstArg;
            if (potentialFile.endsWith('.js') || potentialFile.endsWith('.ts') || potentialFile.endsWith('.mjs')) {
                const scriptArgs = args.slice(1);
                await runScriptDirectly(potentialFile, scriptArgs, {});
                return;
            }
            if (fs.existsSync(potentialFile)) {
                const stats = fs.statSync(potentialFile);
                if (stats.isFile()) {
                    const scriptArgs = args.slice(1);
                    await runScriptDirectly(potentialFile, scriptArgs, {});
                    return;
                }
            }
        }
        if (firstArg && !firstArg.startsWith('-') && !commandNames.includes(firstArg) && await taskManager.exists(firstArg)) {
            const taskName = firstArg;
            const taskArgs = args.slice(1);
            const params = {};
            const remainingArgs = [];
            for (let i = 0; i < taskArgs.length; i++) {
                const arg = taskArgs[i];
                if (!arg)
                    continue;
                if (arg.startsWith('--') && arg.includes('=')) {
                    const [key, value] = arg.substring(2).split('=', 2);
                    if (key) {
                        params[key] = value || '';
                    }
                }
                else if (arg.startsWith('--') && i + 1 < taskArgs.length) {
                    const nextArg = taskArgs[i + 1];
                    if (nextArg && !nextArg.startsWith('-')) {
                        const key = arg.substring(2);
                        params[key] = nextArg;
                        i++;
                    }
                    else {
                        remainingArgs.push(arg);
                    }
                }
                else {
                    remainingArgs.push(arg);
                }
            }
            try {
                const result = await taskManager.run(taskName, params);
                if (!result.success) {
                    console.error(`Task '${taskName}' failed`);
                    process.exit(1);
                }
            }
            catch (error) {
                handleError(error, {
                    verbose: args.includes('-v') || args.includes('--verbose'),
                    quiet: args.includes('-q') || args.includes('--quiet'),
                    output: 'text'
                });
                process.exit(1);
            }
            return;
        }
        const taskList = await taskManager.list();
        const taskNames = taskList.map((t) => t.name);
        if (args.length > 0 && isDirectCommand(args, commandNames, taskNames)) {
            const options = {
                verbose: args.includes('-v') || args.includes('--verbose'),
                quiet: args.includes('-q') || args.includes('--quiet'),
                cwd: undefined,
            };
            const cwdIndex = args.indexOf('--cwd');
            if (cwdIndex !== -1 && args[cwdIndex + 1]) {
                options.cwd = args[cwdIndex + 1];
                args.splice(cwdIndex, 2);
            }
            const cleanArgs = args.filter(arg => !arg.startsWith('-') ||
                (arg.startsWith('-') && !['--verbose', '-v', '--quiet', '-q'].includes(arg)));
            await executeDirectCommand(cleanArgs, options);
            return;
        }
        program.on('command:*', () => {
            const unknownCommand = program.args[0];
            console.error(`✖ Unknown command '${unknownCommand}'`);
            if (unknownCommand) {
                const suggestion = checkForCommandTypo(unknownCommand, commandRegistry);
                if (suggestion) {
                    console.error('');
                    console.error(suggestion);
                }
            }
            console.error('');
            console.error(`Run 'xec --help' for a list of available commands`);
            process.exit(1);
        });
        if (argv.length === 2) {
            argv.push('--help');
        }
        await program.parseAsync(argv);
        await saveCommandHistory();
    }
    catch (error) {
        handleError(error, {
            verbose: program.opts()['verbose'],
            quiet: program.opts()['quiet'],
            output: 'text'
        });
    }
}
async function runScriptDirectly(scriptPath, args, options) {
    const { executeScript } = await import('@xec-sh/ops');
    await executeScript(scriptPath, { ...options, context: { args } });
}
async function evalCodeDirectly(code, args, options) {
    const { evaluateCode } = await import('@xec-sh/ops');
    await evaluateCode(code, { ...options, context: { args } });
}
async function startReplDirectly(options) {
    const { startRepl } = await import('@xec-sh/ops');
    await startRepl(options);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    run();
}
//# sourceMappingURL=main.js.map