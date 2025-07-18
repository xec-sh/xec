import { promisify } from 'util';
import { exec } from 'child_process';

import { BaseCommand } from '../../utils/command-base.js';

const execAsync = promisify(exec);

export class TestCommand extends BaseCommand {
  constructor() {
    super({
      name: 'test',
      description: 'Run tests',
      options: [
        {
          flags: '--watch',
          description: 'Watch mode',
        },
        {
          flags: '--coverage',
          description: 'Generate coverage report',
        },
        {
          flags: '--pattern <pattern>',
          description: 'Test pattern',
        },
      ],
      examples: [
        {
          command: 'xec dev test',
          description: 'Run all tests',
        },
        {
          command: 'xec dev test --watch',
          description: 'Run tests in watch mode',
        },
      ],
    });
  }

  async execute(args: any[]): Promise<void> {
    const options = args[args.length - 1] as { watch?: boolean; coverage?: boolean; pattern?: string };
    
    this.intro('Running Tests');
    
    let testCmd = 'npm test';
    
    if (options.watch) {
      testCmd += ' -- --watch';
    }
    
    if (options.coverage) {
      testCmd += ' -- --coverage';
    }
    
    if (options.pattern) {
      testCmd += ` -- --testNamePattern="${options.pattern}"`;
    }
    
    try {
      const { stdout, stderr } = await execAsync(testCmd);
      
      if (stdout) {
        console.log(stdout);
      }
      
      if (stderr) {
        console.error(stderr);
      }
      
      this.log('Tests completed successfully', 'success');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log(`Tests failed: ${errorMessage}`, 'error');
      throw error;
    }
    
    this.outro('Test execution completed');
  }
}
