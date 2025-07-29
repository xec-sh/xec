/**
 * test command
 * 
 * This command will be available as: xec test [arguments]
 */

import type { Command } from 'commander';

export function command(program: Command): void {
  program
    .command('test [args...]')
    .description('test command')
    .option('-v, --verbose', 'Enable verbose output')
    .option('-f, --format <type>', 'Output format', 'json')
    .action(async (args: string[], options: { verbose: boolean; format: string }) => {
      const { log } = await import('@clack/prompts');
      
      // Your command logic here
      log.info('Running test command...');
      
      if (options.verbose) {
        log.step('Verbose mode enabled');
        log.step(`Arguments: ${args.join(', ') || 'none'}`);
        log.step(`Format: ${options.format}`);
      }
      
      // Example: Use $ from @xec-sh/core with type safety
      const { $ } = await import('@xec-sh/core');
      const result = await $`echo "Command test executed successfully!"`;
      
      // Format output based on option
      if (options.format === 'json') {
        console.log(JSON.stringify({
          success: true,
          message: result.stdout.trim(),
          args
        }, null, 2));
      } else {
        log.success(result.stdout);
      }
    });
}