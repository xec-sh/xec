import {
  log,
  text,
  prism,
  intro,
  outro,
  select,
  confirm,
  spinner,
  isCancel,
  multiselect
} from '@xec-sh/kit';

import { ConfigurationManager } from '../config/configuration-manager.js';

import type { PodConfig, HostConfig, TargetType, ResolvedTarget, ContainerConfig } from '../config/types.js';

export interface InteractiveOptions {
  interactive?: boolean;
}

export interface TargetSelectorOptions {
  message: string;
  type?: 'all' | 'ssh' | 'docker' | 'kubernetes' | 'local';
  allowMultiple?: boolean;
  allowCustom?: boolean;
}

export class InteractiveHelpers {
  private static cancelled = false;
  private static configManager: ConfigurationManager | null = null;

  static async getConfigManager(): Promise<ConfigurationManager> {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager();
      await this.configManager.load();
    }
    return this.configManager;
  }

  static setupCancelHandlers(): void {
    // Handle Ctrl+C
    process.on('SIGINT', () => {
      this.cancelled = true;
      outro(prism.gray('Cancelled'));
      process.exit(0);
    });

    // Handle ESC in prompts (clack handles this internally)
  }

  static isCancelled(value: any): boolean {
    return isCancel(value) || this.cancelled;
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

    const targetOptions = targets.map(target => ({
      value: target,
      label: `${this.getTargetIcon(target.type)} ${target.id} ${prism.gray(`(${target.type})`)}`,
    }));

    if (options.allowCustom) {
      targetOptions.push({
        value: { custom: true } as any,
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

      if (this.isCancelled(selected)) return null;

      // Handle custom target selection
      if (Array.isArray(selected) && selected.some((t: any) => typeof t === 'object' && t && 'custom' in t && t.custom)) {
        const customTarget = await this.enterCustomTarget();
        if (!customTarget) return null;
        return [customTarget];
      }

      return selected as ResolvedTarget[];
    } else {
      const selected = await select({
        message: options.message,
        options: targetOptions,
      });

      if (this.isCancelled(selected)) return null;

      // Handle custom target selection
      if (typeof selected === 'object' && selected && 'custom' in selected && selected.custom) {
        return await this.enterCustomTarget();
      }

      return selected as ResolvedTarget;
    }
  }

  static async enterCustomTarget(): Promise<ResolvedTarget | null> {
    const targetType = await select({
      message: 'Select target type:',
      options: [
        { value: 'ssh', label: '🖥️  SSH Host' },
        { value: 'docker', label: '🐳 Docker Container' },
        { value: 'kubernetes', label: '☸️  Kubernetes Pod' },
      ],
    });

    if (this.isCancelled(targetType)) return null;

    if (this.isCancelled(targetType)) return null;

    switch (targetType as 'ssh' | 'docker' | 'kubernetes') {
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

        if (this.isCancelled(hostInput)) return null;

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

        if (this.isCancelled(container)) return null;

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

      case 'kubernetes': {
        const namespace = await text({
          message: 'Enter namespace:',
          placeholder: 'default',
          initialValue: 'default',
        });

        if (this.isCancelled(namespace)) return null;

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

        if (this.isCancelled(pod)) return null;

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
          } as PodConfig,
          source: 'configured',
        };
      }
    }
  }

  static getTargetIcon(type: string): string {
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

  static async confirmAction(message: string, defaultValue = false): Promise<boolean> {
    const result = await confirm({
      message,
      initialValue: defaultValue,
    });

    return !this.isCancelled(result) && (result as boolean);
  }

  static async selectFromList<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    allowCustom = false
  ): Promise<T | null> {
    if (items.length === 0) {
      log.warning('No items available');
      return null;
    }

    const options: Array<{ value: T | { custom: boolean }, label: string }> = items.map(item => ({
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
      options: options as any,
    });

    if (this.isCancelled(selected)) return null;

    return selected as T;
  }

  static async inputText(
    message: string,
    options: {
      placeholder?: string;
      initialValue?: string;
      validate?: (value: string | undefined) => string | undefined;
    } = {}
  ): Promise<string | null> {
    const result = await text({
      message,
      placeholder: options.placeholder,
      initialValue: options.initialValue,
      validate: options.validate,
    });

    if (this.isCancelled(result)) return null;

    return result as string;
  }

  static async selectMultiple<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    required = true
  ): Promise<T[] | null> {
    if (items.length === 0) {
      log.warning('No items available');
      return null;
    }

    const options: Array<{ value: T, label: string }> = items.map(item => ({
      value: item,
      label: getLabelFn(item),
    }));

    const selected = await multiselect({
      message,
      options: options as any,
      required,
    });

    if (this.isCancelled(selected)) return null;

    return selected as T[];
  }

  static startInteractiveMode(title: string): void {
    this.setupCancelHandlers();
    intro(prism.bgBlue(` ${title} `));
  }

  static endInteractiveMode(message?: string): void {
    if (message) {
      outro(prism.green(message));
    } else {
      outro(prism.green('✓ Done!'));
    }
  }

  static showError(message: string): void {
    log.error(prism.red(message));
  }

  static showSuccess(message: string): void {
    log.success(prism.green(message));
  }

  static showInfo(message: string): void {
    log.info(prism.blue(message));
  }

  static showWarning(message: string): void {
    log.warning(prism.yellow(message));
  }

  static createSpinner(message: string): any {
    const s = spinner();
    s.start(message);
    return s;
  }
}