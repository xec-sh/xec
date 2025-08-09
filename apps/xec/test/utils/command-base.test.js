import { Command } from 'commander';
import { it, expect, describe, beforeEach } from '@jest/globals';
import { BaseCommand, SubcommandBase } from '../../src/utils/command-base.js';
class TestCommand extends BaseCommand {
    constructor() {
        super(...arguments);
        this.executeCallCount = 0;
        this.lastArgs = [];
        this.executedOptions = null;
    }
    async execute(args) {
        this.executeCallCount++;
        this.lastArgs = args;
        this.executedOptions = { ...this.options };
        if (process.env.DEBUG_TEST) {
            console.log('Execute called with args:', args);
            console.log('Options:', this.options);
        }
    }
}
class TestSubcommand extends SubcommandBase {
    setupSubcommands(command) {
        command
            .command('sub1')
            .description('Subcommand 1')
            .action(() => { });
        command
            .command('sub2')
            .description('Subcommand 2')
            .action(() => { });
    }
}
describe('BaseCommand (Real)', () => {
    let testCommand;
    beforeEach(() => {
        const config = {
            name: 'test',
            description: 'Test command',
            aliases: ['t'],
            arguments: '<input>',
            options: [
                { flags: '-f, --flag', description: 'Test flag' },
                { flags: '-n, --number <n>', description: 'Test number', defaultValue: 10 }
            ],
            examples: [
                { command: 'xec test file.txt', description: 'Test with file' },
                { command: 'xec test -f', description: 'Test with flag' }
            ]
        };
        testCommand = new TestCommand(config);
    });
    describe('create', () => {
        it('should create command with basic configuration', () => {
            const command = testCommand.create();
            expect(command.name()).toBe('test');
            expect(command.description()).toBe('Test command');
            expect(command.aliases()).toContain('t');
        });
        it('should add default options', () => {
            const command = testCommand.create();
            const options = command.options;
            expect(options.some(opt => opt.flags === '-o, --output <format>')).toBe(true);
            expect(options.some(opt => opt.flags === '-c, --config <path>')).toBe(true);
            expect(options.some(opt => opt.flags === '--dry-run')).toBe(true);
        });
        it('should add custom options', () => {
            const command = testCommand.create();
            const options = command.options;
            expect(options.some(opt => opt.flags === '-f, --flag')).toBe(true);
            expect(options.some(opt => opt.flags === '-n, --number <n>')).toBe(true);
        });
        it('should handle action execution', async () => {
            const command = testCommand.create();
            await command.parseAsync(['node', 'test', 'input.txt', '--flag', '-n', '42'], { from: 'node' });
            expect(testCommand.executeCallCount).toBe(1);
            expect(testCommand.lastArgs).toContain('input.txt');
            const parsedOpts = command.opts();
            expect(parsedOpts.flag).toBe(true);
            expect(parsedOpts.number).toBe('42');
            expect(parsedOpts.output).toBe('text');
        });
    });
    describe('option handling', () => {
        it('should merge parent and command options', async () => {
            const parentCommand = new Command('parent');
            parentCommand.option('-v, --verbose', 'Verbose output');
            const command = testCommand.create();
            parentCommand.addCommand(command);
            await parentCommand.parseAsync(['node', 'parent', '-v', 'test', 'arg'], { from: 'node' });
            expect(testCommand.executedOptions.verbose).toBe(true);
            expect(testCommand.executedOptions.output).toBe('text');
        });
        it('should handle validateOptions', async () => {
            let validatedOptions = null;
            let executeCount = 0;
            class ValidateTestCommand extends BaseCommand {
                async execute(args) {
                    executeCount++;
                }
            }
            const config = {
                name: 'validate-test',
                description: 'Test validation',
                arguments: '<arg>',
                validateOptions: (options) => {
                    validatedOptions = { ...options };
                }
            };
            const cmd = new ValidateTestCommand(config);
            const command = cmd.create();
            await command.parseAsync(['node', 'validate-test', 'testarg', '--output', 'json'], { from: 'node' });
            expect(executeCount).toBe(1);
            expect(validatedOptions).toBeDefined();
            const parsedOpts = command.opts();
            expect(parsedOpts.output).toBe('json');
        });
    });
});
describe('SubcommandBase (Real)', () => {
    let subcommand;
    beforeEach(() => {
        const config = {
            name: 'parent',
            description: 'Parent command'
        };
        subcommand = new TestSubcommand(config);
    });
    it('should create subcommands', () => {
        const command = subcommand.create();
        const subcommands = command.commands;
        expect(subcommands).toHaveLength(2);
        expect(subcommands[0].name()).toBe('sub1');
        expect(subcommands[1].name()).toBe('sub2');
    });
    it('should handle commands array properly', () => {
        const command = subcommand.create();
        const mockCommand = {
            args: [],
            help: () => command
        };
        expect(async () => {
            await subcommand.execute([mockCommand]);
        }).not.toThrow();
    });
});
//# sourceMappingURL=command-base.test.js.map