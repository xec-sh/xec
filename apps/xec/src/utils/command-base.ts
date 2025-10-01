import * as path from 'path';
import { $ } from '@xec-sh/core';
import { Command } from 'commander';
import { log, prism, text as kitText, select as kitSelect, spinner as kitSpinner, confirm as kitConfirm, multiselect as kitMultiselect } from '@xec-sh/kit';

import { handleError } from './error-handler.js';
import { OutputFormatter } from './output-formatter.js';
import { TaskManager, TargetResolver, ConfigurationManager } from '../config/index.js';

import type { Configuration, ResolvedTarget, CommandConfig as ConfigCommandConfig } from '../config/types.js';

export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  output?: 'text' | 'json' | 'yaml' | 'csv';
  config?: string;
  dryRun?: boolean;
}

export interface CommandConfig {
  name: string;
  description: string;
  aliases?: string[];
  arguments?: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: any;
  }>;
  examples?: Array<{
    command: string;
    description: string;
  }>;
  validateOptions?: (options: any) => void;
}

export interface ConfigAwareOptions {
  profile?: string;
  configPath?: string;
  verbose?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

export abstract class BaseCommand {
  protected formatter: OutputFormatter;
  protected currentSpinner: any;
  protected options: CommandOptions = {
    verbose: false,
    quiet: false,
    output: 'text',
    dryRun: false
  };

  // Configuration-aware properties
  protected configManager!: ConfigurationManager;
  protected xecConfig: Configuration | null = null;
  protected targetResolver: TargetResolver | null = null;
  protected taskManager: TaskManager | null = null;

  constructor(protected config: CommandConfig) {
    this.formatter = new OutputFormatter();
  }

  /**
   * Create and configure the command
   */
  create(): Command {
    const command = new Command(this.config.name);

    command
      .description(this.config.description)
      // Don't add verbose/quiet options as they conflict with parent program options
      // These are inherited from the parent command
      .option('-o, --output <format>', 'Output format (text|json|yaml|csv)', 'text')
      .option('-c, --config <path>', 'Path to configuration file')
      .option('--dry-run', 'Perform a dry run without making changes');

    // Add arguments
    if (this.config.arguments) {
      command.arguments(this.config.arguments);
    }

    // Add aliases
    if (this.config.aliases) {
      this.config.aliases.forEach(alias => command.alias(alias));
    }

    // Add custom options
    if (this.config.options) {
      this.config.options.forEach(opt => {
        command.option(opt.flags, opt.description, opt.defaultValue);
      });
    }

    // Add examples to help
    if (this.config.examples) {
      const exampleText = this.config.examples
        .map(ex => `  ${prism.cyan(ex.command)}\n    ${ex.description}`)
        .join('\n\n');
      command.addHelpText('after', `\nExamples:\n\n${exampleText}`);
    }

    // Set up action handler
    command.action(async (...args) => {
      try {
        const options = args[args.length - 1];
        // Get verbose and quiet from parent command
        const parentOptions = options.parent?.opts() || {};

        // Extract command-specific options, excluding commander internals
        const commandOptions: any = {};
        for (const key in options) {
          // Skip commander internal properties
          if (!key.startsWith('_') && key !== 'parent' && key !== 'args' &&
            key !== 'commands' && key !== 'options' && typeof options[key] !== 'function') {
            commandOptions[key] = options[key];
          }
        }

        // Merge all options together, with defaults
        this.options = {
          ...commandOptions,  // Include all parsed command options
          verbose: parentOptions.verbose || options.verbose || false,
          quiet: parentOptions.quiet || options.quiet || false,
          output: options.output || 'text',
          config: options.config,
          dryRun: options.dryRun || false,
        };

        // Validate options
        if (this.config.validateOptions) {
          this.config.validateOptions(options);
        }

        // Initialize formatter
        this.formatter.setFormat(this.options.output || 'text');
        this.formatter.setQuiet(this.options.quiet || false);
        this.formatter.setVerbose(this.options.verbose || false);

        // Execute command
        await this.execute(args);
      } catch (error) {
        handleError(error, this.options);
      }
    });

    return command;
  }

  /**
   * Abstract method to be implemented by subclasses
   */
  abstract execute(args: any[]): Promise<void>;

  /**
   * The command name used to look up defaults in config
   * Override in subclasses if needed
   */
  protected getCommandConfigKey(): string {
    return this.config.name;
  }

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
  protected getCommandDefaults(): ConfigCommandConfig {
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

      case 'kubernetes':
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
    const name = prism.cyan(target.name || target.id);
    const type = prism.gray(`[${target.type}]`);

    let details = '';

    // eslint-disable-next-line default-case
    switch (target.type) {
      case 'ssh':
        {
          const sshConfig = target.config as any;
          const username = sshConfig.user || sshConfig.username || 'unknown';
          details = ` ${prism.gray(`${username}@${sshConfig.host}`)}`;
          break;
        }

      case 'docker':
        {
          const dockerConfig = target.config as any;
          if (dockerConfig.image) {
            details = ` ${prism.gray(`(${dockerConfig.image})`)}`;
          }
          break;
        }

      case 'kubernetes':
        {
          const k8sConfig = target.config as any;
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

  /**
   * Apply command defaults to options
   */
  protected applyDefaults<T extends Record<string, any>>(
    options: T,
    defaults: ConfigCommandConfig
  ): T & ConfigCommandConfig {
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

    return merged as T & ConfigCommandConfig;
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

  /**
   * Helper methods for common operations
   */
  protected startSpinner(message: string): void {
    if (!this.options.quiet) {
      this.currentSpinner = kitSpinner();
      this.currentSpinner.start(message);
    }
  }

  protected stopSpinner(message?: string, code?: number): void {
    if (this.currentSpinner) {
      if (code === 0 || code === undefined) {
        this.currentSpinner.success(message || 'Done');
      } else {
        this.currentSpinner.error(message || 'Failed');
      }
      this.currentSpinner = null;
    }
  }

  protected log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    if (this.options.quiet) return;

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

  protected output(data: any, title?: string): void {
    this.formatter.output(data, title);
  }

  protected table(rows: any[], headers?: string[]): void {
    const tableData = {
      columns: headers ? headers.map(h => ({ header: h })) : Object.keys(rows[0] || {}).map(k => ({ header: k })),
      rows: rows.map(row => {
        if (headers) {
          return headers.map(h => row[h] || '');
        } else {
          return Object.values(row);
        }
      })
    };
    this.formatter.table(tableData);
  }

  protected async confirm(message: string, initial = false): Promise<boolean> {
    if (this.options.quiet) return Promise.resolve(initial);

    const result = await kitConfirm({ message, initialValue: initial });

    if (typeof result === 'symbol') {
      // User cancelled, return initial value
      return initial;
    }
    return result;
  }

  protected async prompt(message: string, initial?: string): Promise<string> {
    if (this.options.quiet) return Promise.resolve(initial || '');

    const result = await kitText({ message, initialValue: initial });

    if (typeof result === 'symbol') {
      // User cancelled, return initial value or empty string
      return initial || '';
    }
    return result;
  }

  protected async select(message: string, options: Array<{ value: string; label: string; hint?: string }>): Promise<string> {
    if (this.options.quiet) return Promise.resolve(options[0]?.value || '');

    const result = await kitSelect({ message, options });

    if (typeof result === 'symbol') {
      // User cancelled, return first option or empty string
      return options[0]?.value || '';
    }
    return result;
  }

  protected async multiselect(message: string, options: Array<{ value: string; label: string; hint?: string }>): Promise<string[]> {
    if (this.options.quiet) return Promise.resolve([]);

    const result = await kitMultiselect({ message, options });

    if (typeof result === 'symbol') {
      // User cancelled, return empty array
      return [];
    }
    return result;
  }

  protected intro(message: string): void {
    if (!this.options.quiet) {
      console.log(prism.bold(message));
    }
  }

  protected outro(message: string): void {
    if (!this.options.quiet) {
      console.log(prism.dim(message));
    }
  }

  protected isDryRun(): boolean {
    return this.options.dryRun || false;
  }

  protected isVerbose(): boolean {
    return this.options.verbose || false;
  }

  protected isQuiet(): boolean {
    return this.options.quiet || false;
  }
}

export abstract class SubcommandBase extends BaseCommand {
  protected abstract setupSubcommands(command: Command): void;

  override create(): Command {
    const command = super.create();
    this.setupSubcommands(command);
    return command;
  }

  override async execute(args: any[]): Promise<void> {
    // Base subcommand shows help if no subcommand is provided
    const command = args[args.length - 1];
    if (!command.args.length) {
      command.help();
    }
  }
}

// Re-export as ConfigAwareCommand for backward compatibility (can be removed later)
export const ConfigAwareCommand = BaseCommand;