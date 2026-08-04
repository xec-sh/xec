import { ConfigurationManager } from '@xec-sh/ops';
import { log, text, prism, intro, outro, select, confirm, spinner, isCancel, multiselect } from '@xec-sh/kit';

export class InteractiveHelpers {
    static { this.cancelled = false; }
    static { this.configManager = null; }
    static async getConfigManager() {
        if (!this.configManager) {
            this.configManager = new ConfigurationManager();
            await this.configManager.load();
        }
        return this.configManager;
    }
    static setupCancelHandlers() {
        process.on('SIGINT', () => {
            this.cancelled = true;
            outro(prism.gray('Cancelled'));
            process.exit(0);
        });
    }
    static isCancelled(value) {
        return isCancel(value) || this.cancelled;
    }
    static async selectTarget(options) {
        const configManager = await this.getConfigManager();
        const config = configManager.getConfig();
        const targets = [];
        if (config.targets) {
            for (const [name, targetConfig] of Object.entries(config.targets)) {
                if (!targetConfig || !targetConfig.type)
                    continue;
                const targetType = targetConfig.type;
                if (options.type && options.type !== 'all') {
                    const typeMap = {
                        'ssh': 'ssh',
                        'docker': 'docker',
                        'kubernetes': 'kubernetes',
                        'local': 'local'
                    };
                    if (targetType !== typeMap[options.type]) {
                        continue;
                    }
                }
                targets.push({
                    id: `targets.${name}`,
                    type: targetType,
                    name,
                    config: targetConfig,
                    source: 'configured',
                });
            }
        }
        if ((options.type === 'all' || options.type === 'local') &&
            !targets.some(t => t.type === 'local')) {
            targets.push({
                id: 'local',
                type: 'local',
                name: 'local',
                config: { type: 'local' },
                source: 'configured',
            });
        }
        const targetOptions = targets.map(target => ({
            value: target,
            label: `${this.getTargetIcon(target.type)} ${target.id} ${prism.gray(`(${target.type})`)}`,
        }));
        if (options.allowCustom) {
            targetOptions.push({
                value: { custom: true },
                label: prism.cyan('→ Enter custom target...'),
            });
        }
        if (targetOptions.length === 0) {
            log.warning('No targets configured. Use "xec new profile" to create a configuration.');
            return null;
        }
        if (options.allowMultiple) {
            const selected = await multiselect({
                message: options.message,
                options: targetOptions,
                required: true,
            });
            if (this.isCancelled(selected))
                return null;
            if (Array.isArray(selected) && selected.some((t) => typeof t === 'object' && t && 'custom' in t && t.custom)) {
                const customTarget = await this.enterCustomTarget();
                if (!customTarget)
                    return null;
                return [customTarget];
            }
            return selected;
        }
        else {
            const selected = await select({
                message: options.message,
                options: targetOptions,
            });
            if (this.isCancelled(selected))
                return null;
            if (typeof selected === 'object' && selected && 'custom' in selected && selected.custom) {
                return await this.enterCustomTarget();
            }
            return selected;
        }
    }
    static async enterCustomTarget() {
        const targetType = await select({
            message: 'Select target type:',
            options: [
                { value: 'ssh', label: '🖥️  SSH Host' },
                { value: 'docker', label: '🐳 Docker Container' },
                { value: 'kubernetes', label: '☸️  Kubernetes Pod' },
            ],
        });
        if (this.isCancelled(targetType))
            return null;
        if (this.isCancelled(targetType))
            return null;
        switch (targetType) {
            case 'ssh': {
                const hostInput = await text({
                    message: 'Enter SSH host:',
                    placeholder: 'user@hostname or hostname',
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Host cannot be empty';
                        }
                        return undefined;
                    },
                });
                if (this.isCancelled(hostInput))
                    return null;
                const hostStr = String(hostInput);
                const [user, host] = hostStr.includes('@')
                    ? hostStr.split('@')
                    : [process.env['USER'] || 'root', hostStr];
                return {
                    id: `ssh:${hostStr}`,
                    type: 'ssh',
                    name: hostStr,
                    config: {
                        type: 'ssh',
                        host,
                        username: user,
                    },
                    source: 'configured',
                };
            }
            case 'docker': {
                const container = await text({
                    message: 'Enter container name or ID:',
                    placeholder: 'myapp',
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Container name cannot be empty';
                        }
                        return undefined;
                    },
                });
                if (this.isCancelled(container))
                    return null;
                const containerStr = String(container);
                return {
                    id: `docker:${containerStr}`,
                    type: 'docker',
                    name: containerStr,
                    config: {
                        type: 'docker',
                        name: containerStr,
                    },
                    source: 'configured',
                };
            }
            case 'kubernetes': {
                const namespace = await text({
                    message: 'Enter namespace:',
                    placeholder: 'default',
                    initialValue: 'default',
                });
                if (this.isCancelled(namespace))
                    return null;
                const pod = await text({
                    message: 'Enter pod name:',
                    placeholder: 'myapp-pod',
                    validate: (value) => {
                        if (!value || value.trim().length === 0) {
                            return 'Pod name cannot be empty';
                        }
                        return undefined;
                    },
                });
                if (this.isCancelled(pod))
                    return null;
                const namespaceStr = String(namespace);
                const podStr = String(pod);
                return {
                    id: `kubernetes:${namespaceStr}/${podStr}`,
                    type: 'kubernetes',
                    name: podStr,
                    config: {
                        type: 'kubernetes',
                        name: podStr,
                        namespace: namespaceStr,
                    },
                    source: 'configured',
                };
            }
        }
    }
    static getTargetIcon(type) {
        switch (type) {
            case 'ssh':
                return '🖥️ ';
            case 'docker':
                return '🐳';
            case 'kubernetes':
                return '☸️ ';
            case 'local':
                return '💻';
            default:
                return '📦';
        }
    }
    static async confirmAction(message, defaultValue = false) {
        const result = await confirm({
            message,
            initialValue: defaultValue,
        });
        return !this.isCancelled(result) && result;
    }
    static async selectFromList(message, items, getLabelFn, allowCustom = false) {
        if (items.length === 0) {
            log.warning('No items available');
            return null;
        }
        const options = items.map(item => ({
            value: item,
            label: getLabelFn(item),
        }));
        if (allowCustom) {
            options.push({
                value: { custom: true },
                label: prism.cyan('→ Enter custom value...'),
            });
        }
        const selected = await select({
            message,
            options,
        });
        if (this.isCancelled(selected))
            return null;
        return selected;
    }
    static async inputText(message, options = {}) {
        const result = await text({
            message,
            placeholder: options.placeholder,
            initialValue: options.initialValue,
            validate: options.validate,
        });
        if (this.isCancelled(result))
            return null;
        return result;
    }
    static async selectMultiple(message, items, getLabelFn, required = true) {
        if (items.length === 0) {
            log.warning('No items available');
            return null;
        }
        const options = items.map(item => ({
            value: item,
            label: getLabelFn(item),
        }));
        const selected = await multiselect({
            message,
            options,
            required,
        });
        if (this.isCancelled(selected))
            return null;
        return selected;
    }
    static startInteractiveMode(title) {
        this.setupCancelHandlers();
        intro(prism.bgBlue(` ${title} `));
    }
    static endInteractiveMode(message) {
        if (message) {
            outro(prism.green(message));
        }
        else {
            outro(prism.green('✓ Done!'));
        }
    }
    static showError(message) {
        log.error(prism.red(message));
    }
    static showSuccess(message) {
        log.success(prism.green(message));
    }
    static showInfo(message) {
        log.info(prism.blue(message));
    }
    static showWarning(message) {
        log.warning(prism.yellow(message));
    }
    static createSpinner(message) {
        const s = spinner();
        s.start(message);
        return s;
    }
}
//# sourceMappingURL=interactive-helpers.js.map