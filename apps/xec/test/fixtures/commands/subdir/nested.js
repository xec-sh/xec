export function command(program) {
  program
    .command('subdir:nested-test')
    .description('Nested command in subdirectory')
    .action(() => {
      console.log('Nested command executed');
    });
}