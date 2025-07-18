import { Command } from 'commander';

import { StateCommand } from './state.js';
import { EventsCommand } from './events.js';
import { SecretsCommand } from './secrets.js';
import { SubcommandBase } from '../../utils/command-base.js';

export class DataCommand extends SubcommandBase {
  constructor() {
    super({
      name: 'data',
      description: 'Manage application data: state, secrets, and events',
      examples: [
        {
          command: 'xec data state get app.version',
          description: 'Get state value',
        },
        {
          command: 'xec data secrets set db.password --interactive',
          description: 'Set secret interactively',
        },
        {
          command: 'xec data events list --filter type=deploy',
          description: 'List deployment events',
        },
        {
          command: 'xec data state export --format json',
          description: 'Export state as JSON',
        },
      ],
    });
  }

  protected setupSubcommands(command: Command): void {
    command.addCommand(new StateCommand().create());
    command.addCommand(new SecretsCommand().create());
    command.addCommand(new EventsCommand().create());
  }
}

export default function dataCommand(program: any): void {
  program.addCommand(new DataCommand().create());
}
