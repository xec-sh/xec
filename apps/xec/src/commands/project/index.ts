import { Command } from 'commander';

import { EnvCommand } from './env.js';
import { ConfigCommand } from './config.js';
import { InventoryCommand } from './inventory.js';
import { SubcommandBase } from '../../utils/command-base.js';

export class ProjectCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'project',
      description: 'Manage project configuration, inventory, and environment',
      aliases: ['proj'],
      examples: [
        {
          command: 'xec project config get defaults.verbose',
          description: 'Get configuration value',
        },
        {
          command: 'xec project inventory add production 192.168.1.100',
          description: 'Add host to inventory',
        },
        {
          command: 'xec project env set NODE_ENV production',
          description: 'Set environment variable',
        },
      ],
    });
  }

  protected setupSubcommands(command: Command): void {
    command.addCommand(new ConfigCommand().create());
    command.addCommand(new InventoryCommand().create());
    command.addCommand(new EnvCommand().create());
  }
}

export default function projectCommand(program: any): void {
  program.addCommand(new ProjectCommand().create());
}
