import { Command } from 'commander';

import { ListCommand } from './list.js';
import { LintCommand } from './lint.js';
import { TestCommand } from './test.js';
import { WatchCommand } from './watch.js';
import { ValidateCommand } from './validate.js';
import { SubcommandBase } from '../../utils/command-base.js';

export class DevCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'dev',
      description: 'Development tools: validation, listing, watching, testing',
      examples: [
        {
          command: 'xec dev validate',
          description: 'Validate entire project',
        },
        {
          command: 'xec dev list --recipes',
          description: 'List all recipes',
        },
        {
          command: 'xec dev watch',
          description: 'Watch for file changes',
        },
        {
          command: 'xec dev test',
          description: 'Run tests',
        },
      ],
    });
  }

  protected setupSubcommands(command: Command): void {
    command.addCommand(new ValidateCommand().create());
    command.addCommand(new ListCommand().create());
    command.addCommand(new WatchCommand().create());
    command.addCommand(new LintCommand().create());
    command.addCommand(new TestCommand().create());
  }
}

export default function devCommand(program: any): void {
  program.addCommand(new DevCommand().create());
}
