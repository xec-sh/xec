import { Command } from 'commander';
import { ConfigAwareCommand } from '../utils/command-base.js';
export declare class CopyCommand extends ConfigAwareCommand {
    constructor();
    protected getCommandConfigKey(): string;
    execute(args: any[]): Promise<void>;
    private parseCopyOperations;
    private parseTargetPath;
    private resolveTargetsFromSpec;
    private expandWildcard;
    private localGlob;
    private computeDestinationPath;
    private executeSingleCopy;
    private executeParallelCopy;
    private performCopy;
    private copyToTemp;
    private copyFromTemp;
    private copyDirectory;
    private checkFileExists;
    private isDirectory;
    private buildSshArgs;
    private buildSshTarget;
    private formatCopyPath;
    private runInteractiveMode;
}
export default function command(program: Command): void;
