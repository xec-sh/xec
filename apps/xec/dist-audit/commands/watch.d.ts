import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class WatchCommand extends ConfigAwareCommand {
    private sessions;
    private running;
    constructor();
    protected getCommandConfigKey(): string;
    execute(args: any[]): Promise<void>;
    private startWatching;
    private watchLocal;
    private watchSSH;
    private watchDocker;
    private watchKubernetes;
    private buildRemoteWatchCommand;
    private parseWatchOutput;
    private shouldIgnoreFile;
    private scheduleExecution;
    private executeAction;
    private setupCleanupHandlers;
    private runInteractiveMode;
}
export default function command(program: Command): void;
