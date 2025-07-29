export async function command(program) {
  program
    .command('import-test')
    .description('Test command with imports')
    .action(async () => {
      // Test local package import
      const { $ } = await import('@xec-sh/core');
      
      // Test that $ is available
      console.log('$ function available:', typeof $ === 'function');
      
      // Test CDN import through module context
      if (globalThis.__xecModuleContext) {
        try {
          const chalk = await globalThis.__xecModuleContext.import('chalk');
          console.log('chalk loaded:', !!chalk);
        } catch (e) {
          console.log('chalk load failed:', e.message);
        }
      } else {
        console.log('Module context not available');
      }
    });
}