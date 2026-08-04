import type { ResolvedTarget } from '@xec-sh/ops';
import { ConfigurationManager } from '@xec-sh/ops';
export interface InteractiveOptions {
    interactive?: boolean;
}
export interface TargetSelectorOptions {
    message: string;
    type?: 'all' | 'ssh' | 'docker' | 'kubernetes' | 'local';
    allowMultiple?: boolean;
    allowCustom?: boolean;
}
export declare class InteractiveHelpers {
    private static cancelled;
    private static configManager;
    static getConfigManager(): Promise<ConfigurationManager>;
    static setupCancelHandlers(): void;
    static isCancelled(value: any): boolean;
    static selectTarget(options: TargetSelectorOptions): Promise<ResolvedTarget | ResolvedTarget[] | null>;
    static enterCustomTarget(): Promise<ResolvedTarget | null>;
    static getTargetIcon(type: string): string;
    static confirmAction(message: string, defaultValue?: boolean): Promise<boolean>;
    static selectFromList<T>(message: string, items: T[], getLabelFn: (item: T) => string, allowCustom?: boolean): Promise<T | null>;
    static inputText(message: string, options?: {
        placeholder?: string;
        initialValue?: string;
        validate?: (value: string | undefined) => string | undefined;
    }): Promise<string | null>;
    static selectMultiple<T>(message: string, items: T[], getLabelFn: (item: T) => string, required?: boolean): Promise<T[] | null>;
    static startInteractiveMode(title: string): void;
    static endInteractiveMode(message?: string): void;
    static showError(message: string): void;
    static showSuccess(message: string): void;
    static showInfo(message: string): void;
    static showWarning(message: string): void;
    static createSpinner(message: string): any;
}
