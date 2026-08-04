import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class LogsCommand extends ConfigAwareCommand {
    private streams;
    private running;
    constructor();
    protected getCommandConfigKey(): string;
    execute(args: any[]): Promise<void>;
    private viewSingleLog;
    private viewMultipleLogs;
    private aggregateLogs;
    private buildLogCommand;
    private streamLogs;
    private streamLogsWithPrefix;
    private displayLogs;
    private displayLogLine;
    private colorizeLogLine;
    private hasTimestamp;
    private convertTimeSpec;
    private convertK8sTimeSpec;
    private getSeconds;
    private getDefaultLogPath;
    private executeTask;
    private runInteractiveMode;
    private setupCleanupHandlers;
}
export default function command(program: Command): void;
