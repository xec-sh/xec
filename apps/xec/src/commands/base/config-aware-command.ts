/**
 * Base class for commands that integrate with the configuration system
 */

import chalk from 'chalk';
import * as path from 'path';
import { $ } from '@xec-sh/core';

import { BaseCommand } from '../../utils/command-base.js';
import { TaskManager, TargetResolver, ConfigurationManager } from '../../config/index.js';

import type { Configuration, CommandConfig, ResolvedTarget } from '../../config/types.js';

export interface ConfigAwareOptions {
  profile?: string;
  configPath?: string;
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

export abstract class ConfigAwareCommand extends BaseCommand {
  protected configManager!: ConfigurationManager;
  protected xecConfig: Configuration | null = null;
  protected targetResolver: TargetResolver | null = null;
  protected taskManager: TaskManager | null = null;

  /**
   * The command name used to look up defaults in config
   */
  protected abstract getCommandConfigKey(): string;

  /**
   * Initialize configuration for the command
   */
  protected async initializeConfig(options: ConfigAwareOptions): Promise<void> {
    // Create configuration manager
    this.configManager = new ConfigurationManager({
      projectRoot: options.configPath ? path.dirname(path.dirname(options.configPath)) : process.cwd(),
      profile: options.profile,
    });

    // Load configuration
    this.xecConfig = await this.configManager.load();

    // Initialize target resolver
    this.targetResolver = new TargetResolver(this.xecConfig);

    // Initialize task manager if needed
    this.taskManager = new TaskManager({
      configManager: this.configManager,
      debug: options.verbose,
      dryRun: options.dryRun
    });
    await this.taskManager.load();
  }

  /**
   * Get command defaults from configuration
   */
  protected getCommandDefaults(): CommandConfig {
    if (!this.xecConfig) {
      return {};
    }

    const commandKey = this.getCommandConfigKey();
    const defaults = this.xecConfig.commands?.[commandKey] || {};

    return defaults;
  }

  /**
   * Resolve a target from the configuration
   */
  protected async resolveTarget(targetSpec: string): Promise<ResolvedTarget> {
    if (!this.targetResolver) {
      throw new Error('Configuration not initialized');
    }

    return this.targetResolver.resolve(targetSpec);
  }

  /**
   * Find targets matching a pattern
   */
  protected async findTargets(pattern: string): Promise<ResolvedTarget[]> {
    if (!this.targetResolver) {
      throw new Error('Configuration not initialized');
    }

    return this.targetResolver.find(pattern);
  }

  /**
   * Create execution engine for a target
   */
  protected async createTargetEngine(target: ResolvedTarget): Promise<any> {
    const config = target.config as any;

    switch (target.type) {
      case 'local':
        // Return the global $ instance to preserve configuration
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
            passphrase: config.passphrase
          });
          
          // Apply environment variables from config
          if (config.env && Object.keys(config.env).length > 0) {
            return sshEngine.env(config.env);
          }
          
          return sshEngine;
        }

      case 'docker':
        {
          const dockerOptions: any = {
            container: config.container,
            image: config.image,
            user: config.user,
            workingDir: config.workdir,
            tty: config.tty,
            ...config
          };

          // Remove undefined values
          Object.keys(dockerOptions).forEach(key => {
            if (dockerOptions[key] === undefined) {
              delete dockerOptions[key];
            }
          });

          const dockerEngine = $.docker(dockerOptions);
          
          // Apply environment variables from config
          if (config.env && Object.keys(config.env).length > 0) {
            return (dockerEngine as any).env(config.env);
          }
          
          return dockerEngine;
        }

      case 'k8s':
        {
          const k8sOptions: any = {
            pod: config.pod,
            namespace: config.namespace || 'default',
            container: config.container,
            context: config.context,
            kubeconfig: config.kubeconfig,
            ...config
          };

          // Remove undefined values
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

  /**
   * Format target display name
   */
  protected formatTargetDisplay(target: ResolvedTarget): string {
    const name = chalk.cyan(target.name || target.id);
    const type = chalk.gray(`[${target.type}]`);

    let details = '';

    // eslint-disable-next-line default-case
    switch (target.type) {
      case 'ssh':
        {
          const sshConfig = target.config as any;
          const username = sshConfig.user || sshConfig.username || 'unknown';
          details = ` ${chalk.gray(`${username}@${sshConfig.host}`)}`;
          break;
        }

      case 'docker':
        {
          const dockerConfig = target.config as any;
          if (dockerConfig.image) {
            details = ` ${chalk.gray(`(${dockerConfig.image})`)}`;
          }
          break;
        }

      case 'k8s':
        {
          const k8sConfig = target.config as any;
          if (k8sConfig.namespace && k8sConfig.namespace !== 'default') {
            details = ` ${chalk.gray(`(ns: ${k8sConfig.namespace})`)}`;
          }
          if (k8sConfig.container) {
            details += ` ${chalk.gray(`[${k8sConfig.container}]`)}`;
          }
          break;
        }
    }

    return `${name}${details} ${type}`;
  }

  /**
   * Apply command defaults to options
   */
  protected applyDefaults<T extends Record<string, any>>(
    options: T,
    defaults: CommandConfig
  ): T & CommandConfig {
    // Start with config defaults, then apply command-line options
    const merged: any = { ...options };

    // Apply config defaults for any keys that weren't explicitly set on command line
    Object.keys(defaults).forEach(key => {
      // Check if this option was explicitly provided on command line
      // For now, we'll apply config defaults for all options from config
      if (defaults[key] !== undefined) {
        // If the option exists in command defaults but not explicitly overridden, use config
        // This is a simplified approach - in reality we'd need to track which options
        // were explicitly set vs defaulted by commander
        if (!this.wasOptionExplicitlySet(key, options)) {
          merged[key] = defaults[key];
        }
      }
    });

    return merged as T & CommandConfig;
  }

  /**
   * Check if an option was explicitly set (this is a simplified check)
   */
  private wasOptionExplicitlySet(key: string, options: any): boolean {
    // If the option exists in the options object and is not undefined,
    // we assume it was explicitly set (either by command line or by commander defaults).
    // This means command-line options will take precedence over config defaults.
    return options[key] !== undefined;
  }
}