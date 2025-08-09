import chalk from 'chalk';
import { kit } from '@xec-sh/kit';

import { ConfigurationManager } from '../config/configuration-manager.js';

import type { PodConfig, HostConfig, TargetType, ResolvedTarget, ContainerConfig } from '../config/types.js';

export interface InteractiveOptions {
  interactive?: boolean;
}

export interface TargetSelectorOptions {
  message: string;
  type?: 'all' | 'ssh' | 'docker' | 'k8s' | 'local';
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export interface CommandOption {
  id: string;
  title: string;
  icon?: string;
  shortcut?: string;
  action: () => Promise<void>;
}

export class InteractiveHelpers {
  private static configManager: ConfigurationManager | null = null;
  private static recentCommands: string[] = [];

  static async getConfigManager(): Promise<ConfigurationManager> {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager();
      await this.configManager.load();
    }
    return this.configManager;
  }

  private static setupCancelHandlers(): void {
    // Handle Ctrl+C globally
    process.on('SIGINT', () => {
      kit.log.message(`${'─'.repeat(40)}\n${chalk.gray('Cancelled')}\n`);
      process.exit(0);
    });
  }


  static async selectTarget(options: TargetSelectorOptions): Promise<ResolvedTarget | ResolvedTarget[] | null> {
    const configManager = await this.getConfigManager();
    const config = configManager.getConfig();
    const targets: ResolvedTarget[] = [];

    // Gather targets based on type
    if (config.targets) {
      for (const [name, targetConfig] of Object.entries(config.targets)) {
        if (!targetConfig || !targetConfig.type) continue;

        const targetType = targetConfig.type as TargetType;

        // Filter by type if specified
        if (options.type && options.type !== 'all') {
          // Map legacy types to new types
          const typeMap: Record<string, TargetType> = {
            'ssh': 'ssh',
            'docker': 'docker',
            'k8s': 'k8s',
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
          config: targetConfig as any,
          source: 'configured',
        });
      }
    }

    // Add local target if not already present and requested
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

    if (targets.length === 0 && !options.allowCustom) {
      kit.log.warning('No targets configured. Use "xec new profile" to create a configuration.');
      return null;
    }

    const targetOptions = targets.map(target => ({
      value: target,
      label: this.getTargetIcon(target.type) + ' ' + target.id,
      hint: chalk.gray(target.type),
    }));

    if (options.allowCustom) {
      targetOptions.push({
        value: { custom: true } as any,
        label: '→ Enter custom target...',
        hint: chalk.cyan('Custom'),
      });
    }

    if (targetOptions.length === 0) {
      kit.log.warning('No targets available');
      return null;
    }

    if (options.allowMultiple) {
      const selected = await kit.multiselect({
        message: options.message,
        options: targetOptions,
      });

      if (kit.isCancel(selected)) return null;

      // Handle custom target selection
      if (Array.isArray(selected) && selected.some((t: any) => typeof t === 'object' && t && 'custom' in t && t.custom)) {
        const customTarget = await this.enterCustomTarget();
        if (!customTarget) return null;
        return [customTarget];
      }

      // Kit returns option objects, extract the values
      return (selected as any[]).map(s => s.value || s).filter(t => t && typeof t === 'object' && 'id' in t) as ResolvedTarget[];
    } else {
      const selected = await kit.select({
        message: options.message,
        options: targetOptions,
      });

      if (kit.isCancel(selected)) return null;

      // Handle custom target selection
      if (typeof selected === 'object' && selected && 'custom' in selected && selected.custom) {
        return await this.enterCustomTarget();
      }

      // Kit returns option object, extract the value
      const value = (selected as any).value || selected;
      return value as ResolvedTarget;
    }
  }

  static async enterCustomTarget(): Promise<ResolvedTarget | null> {
    const targetType = await kit.select({
      message: 'Select target type:',
      options: [
        { value: 'ssh', label: '🖥️  SSH Host' },
        { value: 'docker', label: '🐳 Docker Container' },
        { value: 'k8s', label: '☸️  Kubernetes Pod' },
      ],
    });

    if (kit.isCancel(targetType)) return null;

    // eslint-disable-next-line default-case
    switch (targetType as 'ssh' | 'docker' | 'k8s') {
      case 'ssh': {
        const hostInput = await kit.text({
          message: 'Enter SSH host:',
          placeholder: 'user@hostname or hostname',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Host cannot be empty';
            }
            return undefined;
          },
        });

        if (kit.isCancel(hostInput)) return null;

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
          } as HostConfig,
          source: 'configured',
        };
      }

      case 'docker': {
        const container = await kit.text({
          message: 'Enter container name or ID:',
          placeholder: 'myapp',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Container name cannot be empty';
            }
            return undefined;
          },
        });

        if (kit.isCancel(container)) return null;

        const containerStr = String(container);

        return {
          id: `docker:${containerStr}`,
          type: 'docker',
          name: containerStr,
          config: {
            type: 'docker',
            name: containerStr,
          } as ContainerConfig,
          source: 'configured',
        };
      }

      case 'k8s': {
        const namespace = await kit.text({
          message: 'Enter namespace:',
          placeholder: 'default',
          defaultValue: 'default',
        });

        if (kit.isCancel(namespace)) return null;

        const pod = await kit.text({
          message: 'Enter pod name:',
          placeholder: 'myapp-pod',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Pod name cannot be empty';
            }
            return undefined;
          },
        });

        if (kit.isCancel(pod)) return null;

        const namespaceStr = String(namespace);
        const podStr = String(pod);

        return {
          id: `k8s:${namespaceStr}/${podStr}`,
          type: 'k8s',
          name: podStr,
          config: {
            type: 'k8s',
            name: podStr,
            namespace: namespaceStr,
          } as PodConfig,
          source: 'configured',
        };
      }
    }
  }

  // Enhanced command palette method
  static async showCommandPalette(commands: CommandOption[]): Promise<void> {
    const result = await kit.commandPalette({
      commands: commands.map(cmd => ({
        id: cmd.id,
        title: cmd.title,
        icon: cmd.icon,
        shortcut: cmd.shortcut,
        action: cmd.action,
      })),
      placeholder: 'Type to search commands...',
      recent: this.getRecentCommands(),
    });

    if (result && !kit.isCancel(result)) {
      // Track recent command
      this.addRecentCommand(result.id);
      await result.action();
    }
  }

  static getRecentCommands(): string[] {
    return this.recentCommands;
  }

  static addRecentCommand(commandId: string): void {
    // Remove if already exists
    this.recentCommands = this.recentCommands.filter(id => id !== commandId);
    // Add to front
    this.recentCommands.unshift(commandId);
    // Keep only last 5
    this.recentCommands = this.recentCommands.slice(0, 5);
  }

  static getTargetIcon(type: string): string {
    switch (type) {
      case 'ssh':
        return '🖥️ ';
      case 'docker':
        return '🐳';
      case 'k8s':
        return '☸️ ';
      case 'local':
        return '💻';
      default:
        return '📦';
    }
  }

  static async confirmAction(message: string, defaultValue = false): Promise<boolean> {
    const result = await kit.confirm({
      message,
      defaultValue,
    });

    return !kit.isCancel(result) && (result as boolean);
  }

  static async selectFromList<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    allowCustom = false
  ): Promise<T | null> {
    if (items.length === 0) {
      kit.log.warning('No items available');
      return null;
    }

    const options: Array<{ value: T | { custom: boolean }, label: string }> = items.map(item => ({
      value: item,
      label: getLabelFn(item),
    }));

    if (allowCustom) {
      options.push({
        value: { custom: true },
        label: chalk.cyan('→ Enter custom value...'),
      });
    }

    const selected = await kit.select({
      message,
      options: options as any,
    });

    if (kit.isCancel(selected)) return null;

    return selected as T;
  }

  static async inputText(
    message: string,
    options: {
      placeholder?: string;
      defaultValue?: string;
      validate?: (value: string) => string | undefined;
    } = {}
  ): Promise<string | null> {
    const result = await kit.text({
      message,
      placeholder: options.placeholder,
      defaultValue: options.defaultValue,
      validate: options.validate,
    });

    if (kit.isCancel(result)) return null;

    return result as string;
  }

  static async selectMultiple<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    required = true
  ): Promise<T[] | null> {
    if (items.length === 0) {
      kit.log.warning('No items available');
      return null;
    }

    const options: Array<{ value: T, label: string }> = items.map(item => ({
      value: item,
      label: getLabelFn(item),
    }));

    const selected = await kit.multiselect({
      message,
      options: options as any,
      required,
    });

    if (kit.isCancel(selected)) return null;

    return selected as T[];
  }

  static startInteractiveMode(title: string): void {
    this.setupCancelHandlers();
    kit.log.message(`\n${chalk.bgBlue(` ${title} `)}\n${'─'.repeat(40)}`);
  }

  static endInteractiveMode(message?: string): void {
    kit.log.message(`${'─'.repeat(40)}\n${chalk.green(message || '✓ Done!')}\n`);
  }

  static showError(message: string): void {
    kit.log.error(chalk.red(message));
  }

  static showSuccess(message: string): void {
    kit.log.success(chalk.green(message));
  }

  static showInfo(message: string): void {
    kit.log.info(chalk.blue(message));
  }

  static showWarning(message: string): void {
    kit.log.warning(chalk.yellow(message));
  }

  static createSpinner(message: string): any {
    return kit.spinner(message);
  }
}