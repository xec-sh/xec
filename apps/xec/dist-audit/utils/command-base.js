import * as path from 'path';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import { handleError, TaskManager, TargetResolver, OutputFormatter, ConfigurationManager } from '@xec-sh/ops';
import { log, prism, text as kitText, select as kitSelect, spinner as kitSpinner, confirm as kitConfirm, multiselect as kitMultiselect } from '@xec-sh/kit';

export class BaseCommand {
    constructor(config) {
        this.config = config;
        this.options = {
            verbose: false,
            quiet: false,
            output: 'text',
            dryRun: false
        };
        this.xecConfig = null;
        this.targetResolver = null;
        this.taskManager = null;
        this.formatter = new OutputFormatter();
    }
    create() {
        const command = new Command(this.config.name);
        command
            .description(this.config.description)
            .option('-o, --output <format>', 'Output format (text|json|yaml|csv)', 'text')
            .option('-c, --config <path>', 'Path to configuration file')
            .option('--dry-run', 'Perform a dry run without making changes');
        if (this.config.arguments) {
            command.arguments(this.config.arguments);
        }
        if (this.config.aliases) {
            this.config.aliases.forEach(alias => command.alias(alias));
        }
        if (this.config.options) {
            this.config.options.forEach(opt => {
                command.option(opt.flags, opt.description, opt.defaultValue);
            });
        }
        if (this.config.examples) {
            const exampleText = this.config.examples
                .map(ex => `  ${prism.cyan(ex.command)}\n    ${ex.description}`)
                .join('\n\n');
            command.addHelpText('after', `\nExamples:\n\n${exampleText}`);
        }
        command.action(async (...args) => {
            try {
                const invokedCommand = args[args.length - 1];
                const options = args.length > 1 ? args[args.length - 2] : {};
                const positionalArgs = args.slice(0, -2);
                const parentOptions = invokedCommand?.parent?.opts?.() || {};
                const commandOptions = {};
                for (const key in options) {
                    if (!key.startsWith('_') && key !== 'parent' && key !== 'args' &&
                        key !== 'commands' && key !== 'options' && typeof options[key] !== 'function') {
                        commandOptions[key] = options[key];
                    }
                }
                this.options = {
                    ...commandOptions,
                    verbose: parentOptions.verbose || options.verbose || false,
                    quiet: parentOptions.quiet || options.quiet || false,
                    output: options.output || 'text',
                    config: options.config,
                    dryRun: options.dryRun || false,
                };
                if (this.config.validateOptions) {
                    this.config.validateOptions(options);
                }
                this.formatter.setFormat(this.options.output || 'text');
                this.formatter.setQuiet(this.options.quiet || false);
                this.formatter.setVerbose(this.options.verbose || false);
                await this.execute([...positionalArgs, this.options]);
            }
            catch (error) {
                handleError(error, this.options);
            }
        });
        return command;
    }
    getCommandConfigKey() {
        return this.config.name;
    }
    async initializeConfig(options) {
        this.configManager = new ConfigurationManager({
            projectRoot: options.configPath ? path.dirname(path.dirname(options.configPath)) : process.cwd(),
            profile: options.profile,
        });
        this.xecConfig = await this.configManager.load();
        this.targetResolver = new TargetResolver(this.xecConfig);
        this.taskManager = new TaskManager({
            configManager: this.configManager,
            debug: options.verbose,
            dryRun: options.dryRun
        });
        await this.taskManager.load();
    }
    getCommandDefaults() {
        if (!this.xecConfig) {
            return {};
        }
        const commandKey = this.getCommandConfigKey();
        const defaults = this.xecConfig.commands?.[commandKey] || {};
        return defaults;
    }
    async resolveTarget(targetSpec) {
        if (!this.targetResolver) {
            throw new Error('Configuration not initialized');
        }
        return this.targetResolver.resolve(targetSpec);
    }
    async findTargets(pattern) {
        if (!this.targetResolver) {
            throw new Error('Configuration not initialized');
        }
        return this.targetResolver.find(pattern);
    }
    async createTargetEngine(target) {
        const config = target.config;
        switch (target.type) {
            case 'local':
                return $;
            case 'ssh':
                {
                    if (this.options?.verbose) {
                        console.log('SSH target config:', JSON.stringify(config, null, 2));
                    }
                    const sshEngine = $.ssh({
                        host: config.host,
                        username: config.user || config.username,
                        port: config.port,
                        privateKey: config.privateKey,
                        password: config.password,
                        passphrase: config.passphrase,
                        hostKeyChecking: config.hostKeyChecking,
                        knownHostsPath: config.knownHostsPath
                    });
                    if (config.env && Object.keys(config.env).length > 0) {
                        return sshEngine.env(config.env);
                    }
                    return sshEngine;
                }
            case 'docker':
                {
                    const dockerOptions = {
                        container: config.container,
                        image: config.image,
                        user: config.user,
                        workingDir: config.workdir,
                        tty: config.tty,
                        ...config
                    };
                    Object.keys(dockerOptions).forEach(key => {
                        if (dockerOptions[key] === undefined) {
                            delete dockerOptions[key];
                        }
                    });
                    const dockerEngine = $.docker(dockerOptions);
                    if (config.env && Object.keys(config.env).length > 0) {
                        return dockerEngine.env(config.env);
                    }
                    return dockerEngine;
                }
            case 'kubernetes':
                {
                    const k8sOptions = {
                        pod: config.pod,
                        namespace: config.namespace || 'default',
                        container: config.container,
                        context: config.context,
                        kubeconfig: config.kubeconfig,
                        ...config
                    };
                    Object.keys(k8sOptions).forEach(key => {
                        if (k8sOptions[key] === undefined) {
                            delete k8sOptions[key];
                        }
                    });
                    return $.k8s(k8sOptions);
                }
            default:
                throw new Error(`Unsupported target type: ${target.type}`);
        }
    }
    formatTargetDisplay(target) {
        const name = prism.cyan(target.name || target.id);
        const type = prism.gray(`[${target.type}]`);
        let details = '';
        switch (target.type) {
            case 'ssh':
                {
                    const sshConfig = target.config;
                    const username = sshConfig.user || sshConfig.username || 'unknown';
                    details = ` ${prism.gray(`${username}@${sshConfig.host}`)}`;
                    break;
                }
            case 'docker':
                {
                    const dockerConfig = target.config;
                    if (dockerConfig.image) {
                        details = ` ${prism.gray(`(${dockerConfig.image})`)}`;
                    }
                    break;
                }
            case 'kubernetes':
                {
                    const k8sConfig = target.config;
                    if (k8sConfig.namespace && k8sConfig.namespace !== 'default') {
                        details = ` ${prism.gray(`(ns: ${k8sConfig.namespace})`)}`;
                    }
                    if (k8sConfig.container) {
                        details += ` ${prism.gray(`[${k8sConfig.container}]`)}`;
                    }
                    break;
                }
        }
        return `${name}${details} ${type}`;
    }
    applyDefaults(options, defaults) {
        const merged = { ...options };
        Object.keys(defaults).forEach(key => {
            if (defaults[key] !== undefined) {
                if (!this.wasOptionExplicitlySet(key, options)) {
                    merged[key] = defaults[key];
                }
            }
        });
        return merged;
    }
    wasOptionExplicitlySet(key, options) {
        return options[key] !== undefined;
    }
    startSpinner(message) {
        if (!this.options.quiet) {
            this.currentSpinner = kitSpinner();
            this.currentSpinner.start(message);
        }
    }
    stopSpinner(message, code) {
        if (this.currentSpinner) {
            if (code === 0 || code === undefined) {
                this.currentSpinner.stop(message || 'Done');
            }
            else {
                this.currentSpinner.error(message || 'Failed');
            }
            this.currentSpinner = null;
        }
    }
    log(message, level = 'info') {
        if (this.options.quiet)
            return;
        switch (level) {
            case 'success':
                log.success(message);
                break;
            case 'warn':
                log.warning(message);
                break;
            case 'error':
                log.error(message);
                break;
            default:
                log.info(message);
        }
    }
    output(data, title) {
        this.formatter.output(data, title);
    }
    table(rows, headers) {
        const tableData = {
            columns: headers ? headers.map(h => ({ header: h })) : Object.keys(rows[0] || {}).map(k => ({ header: k })),
            rows: rows.map(row => {
                if (headers) {
                    return headers.map(h => row[h] || '');
                }
                else {
                    return Object.values(row);
                }
            })
        };
        this.formatter.table(tableData);
    }
    async confirm(message, initial = false) {
        if (this.options.quiet)
            return Promise.resolve(initial);
        const result = await kitConfirm({ message, initialValue: initial });
        if (typeof result === 'symbol') {
            return initial;
        }
        return result;
    }
    async prompt(message, initial) {
        if (this.options.quiet)
            return Promise.resolve(initial || '');
        const result = await kitText({ message, initialValue: initial });
        if (typeof result === 'symbol') {
            return initial || '';
        }
        return result;
    }
    async select(message, options) {
        if (this.options.quiet)
            return Promise.resolve(options[0]?.value || '');
        const result = await kitSelect({ message, options });
        if (typeof result === 'symbol') {
            return options[0]?.value || '';
        }
        return result;
    }
    async multiselect(message, options) {
        if (this.options.quiet)
            return Promise.resolve([]);
        const result = await kitMultiselect({ message, options });
        if (typeof result === 'symbol') {
            return [];
        }
        return result;
    }
    intro(message) {
        if (!this.options.quiet) {
            console.log(prism.bold(message));
        }
    }
    outro(message) {
        if (!this.options.quiet) {
            console.log(prism.dim(message));
        }
    }
    isDryRun() {
        return this.options.dryRun || false;
    }
    isVerbose() {
        return this.options.verbose || false;
    }
    isQuiet() {
        return this.options.quiet || false;
    }
}
export class SubcommandBase extends BaseCommand {
    create() {
        const command = super.create();
        this.setupSubcommands(command);
        return command;
    }
    async execute(args) {
        const command = args[args.length - 1];
        if (!command.args.length) {
            command.help();
        }
    }
}
export const ConfigAwareCommand = BaseCommand;
//# sourceMappingURL=command-base.js.map