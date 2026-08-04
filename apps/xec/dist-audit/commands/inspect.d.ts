import { Command } from 'commander';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';
interface InspectOptions extends CommandOptions {
    filter?: string;
    format?: 'table' | 'json' | 'yaml' | 'tree';
    resolve?: boolean;
    validate?: boolean;
    explain?: boolean;
    profile?: string;
}
export declare class InspectCommand extends BaseCommand {
    constructor();
    execute(args: any[]): Promise<void>;
}
export declare function inspectProject(type?: string, name?: string, options?: InspectOptions): Promise<void>;
export default function command(program: Command): void;
export {};
