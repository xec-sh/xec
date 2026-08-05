import type { Configuration, ResolvedTarget, CommandConfig as ConfigCommandConfig } from '@xec-sh/ops';

import { z } from 'zod';
import { $ } from '@xec-sh/core';
import * as jsYaml from 'js-yaml';
import { Command } from 'commander';
import { access } from 'node:fs/promises';
import { handleError , TaskManager , TargetResolver, OutputFormatter, validateOptions, ConfigurationManager } from '@xec-sh/ops';
import { log, prism, text as kitText, select as kitSelect, spinner as kitSpinner, confirm as kitConfirm, multiselect as kitMultiselect } from '@xec-sh/kit';

import { isPlainOutput } from './plain-mode.js';

export const OUTPUT_FORMATS = ['text', 'json', 'yaml', 'csv'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/**
 * Serialize data for machine consumption. One document, nothing else:
 * consumers run JSON.parse / yaml.load over the whole stdout.
 */
export function serializeOutput(data: unknown, format: Exclude<OutputFormat, 'text'>): string {
  switch (format) {
    case 'json':
      return JSON.stringify(data, null, 2);
    case 'yaml':
      return jsYaml.dump(data, { lineWidth: -1, noRefs: true }).trimEnd();
    case 'csv':
      return toCsv(data);
    default:
      // Unreachable: the parameter type excludes 'text' and the parser
      // rejects anything else. Present so the function has one exit for
      // every path a future format could take.
      throw new Error(`Unsupported output format: ${String(format)}`);
  }
}

// RFC 4180: quote a cell only when it needs it; nested structures become
// JSON inside their cell rather than exploding the column set.
function toCsv(data: unknown): string {
  const rows: Array<Record<string, unknown>> = Array.isArray(data)
    ? data.map(item =>
        item !== null && typeof item === 'object' && !Array.isArray(item)
          ? (item as Record<string, unknown>)
          : { value: item }
      )
    : data !== null && typeof data === 'object'
      ? [data as Record<string, unknown>]
      : [{ value: data }];

  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) columns.push(key);
    }
  }

  const cell = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    const text = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };

  return [
    columns.map(column => cell(column)).join(','),
    ...rows.map(row => columns.map(column => cell(row[column])).join(',')),
  ].join('\n');
}

/** Commander parse callback for options that may repeat: `-e A=1 -e B=2`. */
export function collect(value: string, previous: string[] = []): string[] {
  return [...previous, value];
}

export interface CommandOptions {
  verbose?: boolean;
  quiet?: boolean;
  output?: OutputFormat;
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
    /**
     * Commander parse callback. Required for options that repeat: without
     * it commander keeps only the last value, which then fails schemas
     * that validate an array. Pair with `collect` and a [] default.
     */
    parser?: (value: string, previous: any) => any;
  }>;
  examples?: Array<{
    command: string;
    description: string;
  }>;
  validateOptions?: (options: any) => void;
}

export interface ConfigAwareOptions {
  profile?: string;
  /** Where -c/--config lands after commander parsing. */
  config?: string;
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
      // Options bind positionally: what follows a subcommand name belongs to
      // that subcommand, so `secrets set KEY -v VALUE` reaches set's --value
      // instead of being swallowed as --verbose one level up.
      .enablePositionalOptions()
      // Long forms only: short -v/-q are left free for command-specific
      // meanings (logs uses -v for --invert). The root's -v/-q still apply
      // when given before the command word.
      .option('--verbose', 'Enable verbose output')
      .option('--quiet', 'Suppress non-essential output')
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
        if (opt.parser) {
          command.option(opt.flags, opt.description, opt.parser, opt.defaultValue);
        } else {
          command.option(opt.flags, opt.description, opt.defaultValue);
        }
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
        // Commander calls an action as (...positionalArgs, options, command).
        // Reading the last element as the options object picked up the
        // Command instance instead, and left the real options sitting in the
        // positional list — so `xec on host uptime` built the command
        // "uptime [object Object]". Both are taken from their true positions
        // here, and execute() receives the shape it has always assumed:
        // positional arguments followed by options.
        const invokedCommand = args[args.length - 1];
        const options = args.length > 1 ? args[args.length - 2] : {};
        const positionalArgs = args.slice(0, -2);
        const parentOptions = invokedCommand?.parent?.opts?.() || {};

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

        // -o is a contract: an unknown format must refuse loudly (exit 2),
        // not fall through to text as if nothing had been typed.
        BaseCommand.assertOutputFormat(this.options.output);

        // Validate options
        if (this.config.validateOptions) {
          this.config.validateOptions(options);
        }

        // Initialize formatter
        this.formatter.setFormat(this.options.output || 'text');
        this.formatter.setQuiet(this.options.quiet || false);
        this.formatter.setVerbose(this.options.verbose || false);

        // Execute command
        await this.execute([...positionalArgs, this.options]);
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

  private static assertOutputFormat(format: unknown): void {
    validateOptions(
      { output: format },
      z.object({
        output: z.custom<OutputFormat>(
          value => typeof value === 'string' && (OUTPUT_FORMATS as readonly string[]).includes(value),
          { message: `unknown format '${String(format)}'. Valid formats: ${OUTPUT_FORMATS.join(', ')}` }
        ),
      })
    );
  }

  /**
   * The machine format in effect, or null in text mode. In json/yaml/csv
   * mode stdout carries exactly one serialized document: chatter moves to
   * stderr, spinners and prompts are suppressed, emitResult is the only
   * stdout writer.
   */
  protected machineFormat(): Exclude<OutputFormat, 'text'> | null {
    const format = this.options.output;
    return format !== undefined && format !== 'text' ? format : null;
  }

  /**
   * Emit a command's result under the output contract: text mode renders
   * for humans, machine mode serializes the data. Deliberately not gated on
   * --quiet — quiet silences chatter, and the data is not chatter.
   */
  protected emitResult(data: unknown, renderText: () => void): void {
    const format = this.machineFormat();
    if (format === null) {
      renderText();
      return;
    }
    process.stdout.write(`${serializeOutput(data, format)}\n`);
  }

  /**
   * Resolve the file named by -c/--config (older callers pass configPath).
   * A named file that does not exist is refused here: proceeding into
   * discovery would answer from a configuration the caller never meant.
   */
  protected async requireConfigFile(options: ConfigAwareOptions): Promise<string | undefined> {
    const configFilePath = options.config ?? options.configPath;
    if (configFilePath === undefined) return undefined;
    try {
      await access(configFilePath);
    } catch (error) {
      (error as Error).message = `Config file not found: ${configFilePath}`;
      throw error;
    }
    return configFilePath;
  }

  /**
   * Initialize configuration for the command
   */
  protected async initializeConfig(options: ConfigAwareOptions): Promise<void> {
    // -c was parsed into options.config but read as options.configPath, so
    // the flag was dead in every config-aware command. An explicit file
    // replaces discovery entirely (ConfigurationManager's contract).
    const configFilePath = await this.requireConfigFile(options);
    this.configManager = new ConfigurationManager({
      projectRoot: process.cwd(),
      configFilePath,
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
            // Never print credential material, even under --verbose/XEC_DEBUG:
            // debug logs get pasted into issues and CI output is retained.
            console.log('SSH target config:', JSON.stringify({
              ...config,
              password: config.password && '[REDACTED]',
              passphrase: config.passphrase && '[REDACTED]',
              privateKey: config.privateKey && '[REDACTED]',
            }, null, 2));
          }

          const sshEngine = $.ssh({
            host: config.host,
            username: config.user || config.username,
            port: config.port,
            privateKey: config.privateKey,
            password: config.password,
            passphrase: config.passphrase,
            // Without these an explicitly configured target silently falls
            // back to the default host key policy.
            hostKeyChecking: config.hostKeyChecking,
            knownHostsPath: config.knownHostsPath
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
            ...config,
            // The adapter treats a present image as "run an ephemeral
            // container" even when a container name is configured. A target
            // that names a container means that container; image stays as
            // metadata (e.g. for auto-create), not as an instruction to spin
            // up a throwaway copy.
            runMode: config.runMode ?? (config.container ? 'exec' : 'run')
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
    // A spinner is an animation for a person watching. Into a pipe it
    // writes frames and cursor codes that a parser then has to survive —
    // and in machine mode it lands on stdout, in front of the document the
    // caller asked for.
    if (this.options.quiet || isPlainOutput() || this.machineFormat() !== null) {
      return;
    }
    this.currentSpinner = kitSpinner();
    this.currentSpinner.start(message);
  }

  protected stopSpinner(message?: string, code?: number): void {
    if (this.currentSpinner) {
      if (code === 0 || code === undefined) {
        this.currentSpinner.stop(message || 'Done');
      } else {
        this.currentSpinner.error(message || 'Failed');
      }
      this.currentSpinner = null;
    }
  }

  /**
   * Say something about the work, on the channel meant for saying things.
   *
   * stdout carries the answer; stderr carries everything said about
   * producing it. Every one of these levels is narration — "Executing on
   * web-1...", "Change detected", a warning, a failure — and none of them
   * is what `xec ... > file` was meant to capture. Writing them to stdout
   * put progress lines into redirected output and, under `-o json`, in
   * front of the document a parser was waiting for: a failed run wrote a
   * banner to stdout and its JSON error to stderr, so the file the caller
   * kept was neither valid JSON nor empty.
   *
   * The answer itself goes through {@link output} and `emitResult`.
   *
   * @param message - What to say.
   * @param level - Which symbol to say it with.
   */
  protected log(message: string, level: 'info' | 'success' | 'warn' | 'error' = 'info'): void {
    if (this.options.quiet) return;

    const opts = { output: process.stderr };

    switch (level) {
      case 'success':
        log.success(message, opts);
        break;
      case 'warn':
        log.warning(message, opts);
        break;
      case 'error':
        log.error(message, opts);
        break;
      default:
        log.info(message, opts);
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
    SubcommandBase.inheritCommonOptions(command);
    return command;
  }

  /**
   * Give every leaf subcommand the options its parent advertises.
   *
   * A subcommand is built by hand and starts with nothing, so
   * `xec docker service postgres --dry-run` — the natural spelling, and
   * the one the parent's help implies — was rejected as an unknown option
   * while `xec docker --dry-run service postgres` worked. The flags are
   * copied onto the leaves, skipping any the leaf defines itself.
   */
  private static inheritCommonOptions(command: Command): void {
    const inheritable = command.options.filter(option =>
      ['--dry-run', '--output', '--config', '--verbose', '--quiet'].includes(option.long ?? '')
    );

    const apply = (target: Command): void => {
      if (target.commands.length > 0) {
        for (const child of target.commands) apply(child);
        return;
      }

      for (const option of inheritable) {
        const taken = target.options.some(
          existing => existing.long === option.long || (option.short && existing.short === option.short)
        );
        if (!taken) target.addOption(option);
      }
    };

    for (const child of command.commands) apply(child);
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