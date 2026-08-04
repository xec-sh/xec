import { Command } from 'commander';
import { BaseCommand } from '../utils/command-base.js';
export declare class RunCommand extends BaseCommand {
    private scriptLoader;
    constructor();
    create(): Command;
    execute(args: any[]): Promise<void>;
    private runScript;
    private evalCode;
    private startRepl;
    private runTask;
}
export declare function runScript(scriptPath: string, args: string[], options: any): Promise<void>;
export declare function evalCode(code: string, args: string[], options: any): Promise<void>;
export declare function startRepl(options: any): Promise<void>;
export declare function runTask(taskName: string, options: any): Promise<void>;
export default function command(program: Command): void;
