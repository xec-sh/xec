export function command(program) {
  program
    .command('simple-test')
    .description('A simple test command')
    .option('-v, --verbose', 'Enable verbose output')
    .action((options) => {
      console.log('Simple command executed');
      if (options.verbose) {
        console.log('Verbose mode enabled');
      }
    });
}