export default function(program) {
  program
    .command('default-test')
    .description('Command with default export')
    .action(() => {
      console.log('Default export command executed');
    });
}