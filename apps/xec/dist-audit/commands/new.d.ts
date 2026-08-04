import { Command } from 'commander';
import { BaseCommand, CommandOptions } from '../utils/command-base.js';
interface NewOptions extends CommandOptions {
    force?: boolean;
    minimal?: boolean;
    skipGit?: boolean;
    name?: string;
    desc?: string;
    type?: string;
    advanced?: boolean;
    js?: boolean;
    profile?: string;
    from?: string;
    interactive?: boolean;
}
export declare class NewCommand extends BaseCommand {
    constructor();
    execute(args_: any[]): Promise<void>;
}
export declare function createArtifact(type?: string, name?: string, options?: NewOptions): Promise<void>;
export default function command(program: Command): void;
export {};
