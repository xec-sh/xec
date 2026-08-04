import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class SecretsCommand extends ConfigAwareCommand {
    constructor();
    protected getCommandConfigKey(): string;
    create(): Command;
    private setupSubcommands;
    execute(args: any[]): Promise<void>;
    private runInteractiveMode;
    private handleInteractiveAction;
    private interactiveSetSecret;
    private interactiveGetSecret;
    private interactiveDeleteSecret;
    private interactiveGenerateSecret;
    private interactiveExportSecrets;
    private interactiveImportSecrets;
    private handleSubcommand;
    private getSecretManager;
    private setSecret;
    private getSecret;
    private listSecrets;
    private deleteSecret;
    private generateSecret;
    private exportSecrets;
    private importSecrets;
}
export default function command(program: Command): void;
