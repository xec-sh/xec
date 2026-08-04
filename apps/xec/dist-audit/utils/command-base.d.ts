import type { Configuration, ResolvedTarget, CommandConfig as ConfigCommandConfig } from '@xec-sh/ops';
import { Command } from 'commander';
import { TaskManager, TargetResolver, OutputFormatter, ConfigurationManager } from '@xec-sh/ops';
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
export declare abstract class BaseCommand {
    protected config: CommandConfig;
    protected formatter: OutputFormatter;
    protected currentSpinner: any;
    protected options: CommandOptions;
    protected configManager: ConfigurationManager;
    protected xecConfig: Configuration | null;
    protected targetResolver: TargetResolver | null;
    protected taskManager: TaskManager | null;
    constructor(config: CommandConfig);
    create(): Command;
    abstract execute(args: any[]): Promise<void>;
    protected getCommandConfigKey(): string;
    protected initializeConfig(options: ConfigAwareOptions): Promise<void>;
    protected getCommandDefaults(): ConfigCommandConfig;
    protected resolveTarget(targetSpec: string): Promise<ResolvedTarget>;
    protected findTargets(pattern: string): Promise<ResolvedTarget[]>;
    protected createTargetEngine(target: ResolvedTarget): Promise<any>;
    protected formatTargetDisplay(target: ResolvedTarget): string;
    protected applyDefaults<T extends Record<string, any>>(options: T, defaults: ConfigCommandConfig): T & ConfigCommandConfig;
    private wasOptionExplicitlySet;
    protected startSpinner(message: string): void;
    protected stopSpinner(message?: string, code?: number): void;
    protected log(message: string, level?: 'info' | 'success' | 'warn' | 'error'): void;
    protected output(data: any, title?: string): void;
    protected table(rows: any[], headers?: string[]): void;
    protected confirm(message: string, initial?: boolean): Promise<boolean>;
    protected prompt(message: string, initial?: string): Promise<string>;
    protected select(message: string, options: Array<{
        value: string;
        label: string;
        hint?: string;
    }>): Promise<string>;
    protected multiselect(message: string, options: Array<{
        value: string;
        label: string;
        hint?: string;
    }>): Promise<string[]>;
    protected intro(message: string): void;
    protected outro(message: string): void;
    protected isDryRun(): boolean;
    protected isVerbose(): boolean;
    protected isQuiet(): boolean;
}
export declare abstract class SubcommandBase extends BaseCommand {
    protected abstract setupSubcommands(command: Command): void;
    create(): Command;
    execute(args: any[]): Promise<void>;
}
export declare const ConfigAwareCommand: typeof BaseCommand;
