import { Command } from 'commander';
export declare function createProgram(): Command;
export declare function loadCommands(program: Command): Promise<string[]>;
export declare function run(argv?: string[]): Promise<void>;
