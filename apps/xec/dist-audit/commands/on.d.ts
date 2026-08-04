import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class OnCommand extends ConfigAwareCommand {
    constructor();
    protected getCommandConfigKey(): string;
    execute(args: any[]): Promise<void>;
    private executeCommand;
    private executeSingle;
    private executeParallel;
    private executeTask;
    private executeScript;
    private startRepl;
    private runInteractiveMode;
}
export default function command(program: Command): void;
