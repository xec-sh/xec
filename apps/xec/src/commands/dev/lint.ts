import { promisify } from 'util';
import { exec } from 'child_process';

import { BaseCommand } from '../../utils/command-base.js';

const execAsync = promisify(exec);

export class LintCommand extends BaseCommand {
  constructor() {
    super({
      name: 'lint',
      description: 'Lint code and check for issues',
      options: [
        {
          flags: '--fix',
          description: 'Auto-fix linting issues',
        },
      ],
      examples: [
        {
          command: 'xec dev lint',
          description: 'Lint all code',
        },
        {
          command: 'xec dev lint --fix',
          description: 'Lint and fix issues',
        },
      ],
    });
  }

  async execute(args: any[]): Promise<void> {
    const options = args[args.length - 1] as { fix?: boolean };
    
    this.intro('Code Linting');
    
    try {
      // Run ESLint if available
      const eslintCmd = options.fix ? 'eslint . --fix' : 'eslint .';
      await execAsync(eslintCmd);
      this.log('ESLint passed', 'success');
    } catch (error) {
      this.log('ESLint not available or failed', 'warn');
    }
    
    try {
      // Run TypeScript compiler check
      await execAsync('tsc --noEmit');
      this.log('TypeScript check passed', 'success');
    } catch (error) {
      this.log('TypeScript check failed', 'error');
    }
    
    this.outro('Linting completed');
  }
}
