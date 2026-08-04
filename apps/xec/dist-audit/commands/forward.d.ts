import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class ForwardCommand extends ConfigAwareCommand {
    private sessions;
    constructor();
    protected getCommandConfigKey(): string;
    execute(args: any[]): Promise<void>;
    private parsePortMappings;
    private forwardPort;
    private forwardSSH;
    private forwardDocker;
    private forwardKubernetes;
    private findAvailablePort;
    private isPortAvailable;
    private setupCleanupHandlers;
    private runInteractiveMode;
}
export default function command(program: Command): void;
