export async function command(program) {
    program
        .command('import-test')
        .description('Test command with imports')
        .action(async () => {
        const { $ } = await import('@xec-sh/core');
        console.log('$ function available:', typeof $ === 'function');
        if (globalThis.__xecModuleContext) {
            try {
                const chalk = await globalThis.__xecModuleContext.import('chalk');
                console.log('chalk loaded:', !!chalk);
            }
            catch (e) {
                console.log('chalk load failed:', e.message);
            }
        }
        else {
            console.log('Module context not available');
        }
    });
}
//# sourceMappingURL=with-imports.js.map