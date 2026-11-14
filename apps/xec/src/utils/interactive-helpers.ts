import type { PodConfig, HostConfig, ResolvedTarget, ContainerConfig } from '@xec-sh/ops';

import { getExecutionSignal } from '@xec-sh/core';
import { TargetResolver, ConfigurationManager } from '@xec-sh/ops';
import {
  log,
  text,
  prism,
  intro,
  outro,
  select,
  confirm,
  isCancel,
  multiselect,
  type CANCEL_SYMBOL
} from '@xec-sh/kit';

import { canPrompt } from './plain-mode.js';

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
  private static cancellation: AbortSignal | undefined;
  private static onCancel = () => {
    InteractiveHelpers.cancelled = true;
  };
  private static configManager: ConfigurationManager | null = null;

  static async getConfigManager(): Promise<ConfigurationManager> {
    if (!this.configManager) {
      this.configManager = new ConfigurationManager();
      await this.configManager.load();
    }
    return this.configManager;
  }

  static setupCancelHandlers(): void {
    this.cancellation?.removeEventListener('abort', this.onCancel);
    this.cancellation = getExecutionSignal();
    this.cancellation?.throwIfAborted();
    this.cancelled = false;
    this.cancellation?.addEventListener('abort', this.onCancel, { once: true });
  }

  static isCancelled(value: unknown): boolean {
    return isCancel(value) || this.cancelled;
  }

  private static requireInteractive(): void {
    this.cancellation?.throwIfAborted();
    if (this.cancelled) throw new DOMException('Interactive operation cancelled', 'AbortError');
    if (!canPrompt()) throw new Error('Interactive selection requires a terminal. Supply command arguments for non-interactive use.');
  }

  private static answer<T>(value: T | typeof CANCEL_SYMBOL): T {
    if (isCancel(value) || this.cancelled || this.cancellation?.aborted) {
      this.cancelled = true;
      throw new DOMException('Interactive operation cancelled', 'AbortError');
    }
    return value;
  }

  static async selectTarget(options: TargetSelectorOptions): Promise<ResolvedTarget | ResolvedTarget[] | null> {
    this.requireInteractive();
    const configManager = await this.getConfigManager();
    const config = configManager.getConfig();
    const resolver = new TargetResolver(config, { autoDetect: false });
    const targets = (await resolver.list()).filter(target =>
      options.type === undefined || options.type === 'all' || target.type === options.type
    );

    const targetOptions: Array<{ value: ResolvedTarget | 'custom'; label: string }> = targets.map(target => ({
      value: target,
      label: `${this.getTargetIcon(target.type)} ${target.id} ${prism.gray(`(${target.type})`)}`,
    }));

    if (options.allowCustom) {
      targetOptions.push({
        value: 'custom',
        label: prism.cyan('→ Enter custom target...'),
      });
    }

    if (targetOptions.length === 0) {
      log.warning('No targets configured. Use "xec new profile" to create a configuration.');
      return null;
    }

    if (options.allowMultiple) {
      const selected = this.answer(await multiselect({
        signal: this.cancellation,
        message: options.message,
        options: targetOptions,
        required: true,
      }));

      // Handle custom target selection
      if (selected.includes('custom')) {
        const customTarget = await this.enterCustomTarget();
        if (!customTarget) return null;
        return [...selected.filter((target): target is ResolvedTarget => target !== 'custom'), customTarget];
      }

      return selected.filter((target): target is ResolvedTarget => target !== 'custom');
    } else {
      const selected = this.answer(await select({
        signal: this.cancellation,
        message: options.message,
        options: targetOptions,
      }));

      // Handle custom target selection
      if (selected === 'custom') {
        return await this.enterCustomTarget();
      }

      return selected;
    }
  }

  static async enterCustomTarget(): Promise<ResolvedTarget | null> {
    this.requireInteractive();
    const targetType = this.answer(await select({
      signal: this.cancellation,
      message: 'Select target type:',
      options: [
        { value: 'ssh', label: '🖥️  SSH Host' },
        { value: 'docker', label: '🐳 Docker Container' },
        { value: 'kubernetes', label: '☸️  Kubernetes Pod' },
      ],
    }));

    switch (targetType) {
      case 'ssh': {
        const hostInput = this.answer(await text({
          signal: this.cancellation,
          message: 'Enter SSH host:',
          placeholder: 'user@hostname or hostname',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Host cannot be empty';
            }
            return undefined;
          },
        }));

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
        const container = this.answer(await text({
          signal: this.cancellation,
          message: 'Enter container name or ID:',
          placeholder: 'myapp',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Container name cannot be empty';
            }
            return undefined;
          },
        }));

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
        const namespace = this.answer(await text({
          signal: this.cancellation,
          message: 'Enter namespace:',
          placeholder: 'default',
          initialValue: 'default',
        }));

        const pod = this.answer(await text({
          signal: this.cancellation,
          message: 'Enter pod name:',
          placeholder: 'myapp-pod',
          validate: (value) => {
            if (!value || value.trim().length === 0) {
              return 'Pod name cannot be empty';
            }
            return undefined;
          },
        }));

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
      default:
        // The select() above offers exactly these three, but the cast means
        // the compiler cannot prove it; without this the method returned
        // undefined where its signature promises a target or null.
        return null;
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
    this.requireInteractive();
    const result = this.answer(await confirm({
      signal: this.cancellation,
      message,
      initialValue: defaultValue,
    }));
    return result === true;
  }

  static async selectFromList<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    allowCustom?: false
  ): Promise<T | null>;
  static async selectFromList<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    allowCustom: true
  ): Promise<T | { custom: true } | null>;
  static async selectFromList<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    allowCustom = false
  ): Promise<T | { custom: true } | null> {
    this.requireInteractive();
    if (items.length === 0 && !allowCustom) {
      log.warning('No items available');
      return null;
    }
    const options: Array<{ value: T | { custom: true }; label: string }> = items.map(item => ({
      value: item,
      label: getLabelFn(item),
    }));
    if (allowCustom) {
      options.push({ value: { custom: true }, label: 'Enter custom value…' });
    }
    return this.answer(await select({
      signal: this.cancellation,
      message,
      options,
    }));
  }

  static async inputText(
    message: string,
    options: {
      placeholder?: string;
      initialValue?: string;
      validate?: (value: string | undefined) => string | undefined;
    } = {}
  ): Promise<string | null> {
    this.requireInteractive();
    const result = this.answer(await text({
      signal: this.cancellation,
      message,
      placeholder: options.placeholder,
      initialValue: options.initialValue,
      validate: options.validate,
    }));

    return result;
  }

  static async selectMultiple<T>(
    message: string,
    items: T[],
    getLabelFn: (item: T) => string,
    required = true
  ): Promise<T[] | null> {
    this.requireInteractive();
    if (items.length === 0) {
      log.warning('No items available');
      return null;
    }

    const options: Array<{ value: T, label: string }> = items.map(item => ({
      value: item,
      label: getLabelFn(item),
    }));

    const selected = this.answer(await multiselect({
      signal: this.cancellation,
      message,
      options,
      required,
    }));

    return selected;
  }

  static startInteractiveMode(title: string): void {
    this.setupCancelHandlers();
    try {
      this.requireInteractive();
    } catch (error) {
      this.cancellation?.removeEventListener('abort', this.onCancel);
      this.cancellation = undefined;
      throw error;
    }
    intro(prism.bgBlue(` ${title} `));
  }

  static endInteractiveMode(message?: string): void {
    this.cancellation?.removeEventListener('abort', this.onCancel);
    this.cancellation = undefined;
    if (this.cancelled) {
      outro(prism.gray('Cancelled'));
    } else if (message) {
      outro(prism.green(message));
    } else {
      outro(prism.green('✓ Done!'));
    }
  }

  static showError(message: string): void {
    if (this.cancelled) {
      this.endInteractiveMode();
      return;
    }
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


}
