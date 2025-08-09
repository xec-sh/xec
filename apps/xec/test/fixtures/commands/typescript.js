export function command(program) {
    program
        .command('typescript-test')
        .description('A TypeScript test command')
        .option('-f, --format <type>', 'Output format', 'json')
        .action(async (options) => {
        const result = {
            message: 'TypeScript command executed',
            format: options.format,
            timestamp: new Date().toISOString()
        };
        if (options.format === 'json') {
            console.log(JSON.stringify(result, null, 2));
        }
        else {
            console.log(result.message);
        }
    });
}
//# sourceMappingURL=typescript.js.map