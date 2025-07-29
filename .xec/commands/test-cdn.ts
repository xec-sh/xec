/**
 * Test CDN module loading
 * This command tests if modules are loaded from CDN without local node_modules
 */

// Universal module loading support
const moduleContext = {
  import: (spec) => globalThis.__xecImport ? globalThis.__xecImport(spec) : import(spec),
  importJSR: (pkg) => globalThis.__xecImport ? globalThis.__xecImport('jsr:' + pkg) : import('https://jsr.io/' + pkg),
  importNPM: (pkg) => globalThis.__xecImport ? globalThis.__xecImport('npm:' + pkg) : import('https://esm.sh/' + pkg)
};

export async function command(program) {
  program
    .command('test-cdn')
    .description('Test CDN module loading')
    .option('-v, --verbose', 'Enable verbose output')
    .action(async (options) => {
      console.log('🧪 Testing CDN module loading...\n');
      
      try {
        // Test 1: Load a simple NPM package that's NOT in node_modules
        console.log('1️⃣ Loading dayjs from CDN (not in local dependencies)...');
        const dayjs = await moduleContext.importNPM('dayjs');
        const now = dayjs.default();
        console.log('✅ dayjs loaded successfully:', now.format('YYYY-MM-DD HH:mm:ss'));
        
        // Test 2: Load chalk (which IS in local dependencies, but should still work from CDN)
        console.log('\n2️⃣ Loading chalk from CDN...');
        const chalkModule = await moduleContext.import('chalk');
        const chalk = chalkModule.default || chalkModule;
        console.log(chalk.green('✅ chalk loaded successfully'));
        
        // Test 3: Load from JSR
        console.log('\n3️⃣ Loading from JSR.io...');
        try {
          const jsrModule = await moduleContext.importJSR('@std/encoding@0.224.0');
          console.log('✅ JSR module loaded successfully');
        } catch (e) {
          console.log('⚠️  JSR loading failed (expected if JSR is down):', e.message);
        }
        
        // Test 4: Load @xec-sh/core (should use local)
        console.log('\n4️⃣ Loading @xec-sh/core (local package)...');
        const xecCore = await moduleContext.import('@xec-sh/core');
        console.log('✅ @xec-sh/core loaded successfully, has $:', !!xecCore.$);
        
        // Test 5: Test caching
        console.log('\n5️⃣ Testing module cache...');
        const start = Date.now();
        const dayjs2 = await moduleContext.importNPM('dayjs');
        const loadTime = Date.now() - start;
        console.log(`✅ Second load took ${loadTime}ms (should be faster due to cache)`);
        
        console.log('\n✨ All tests completed!');
        
        if (options.verbose) {
          console.log('\n📊 Module context info:');
          console.log('- Context available:', !!globalThis.__xecModuleContext);
          console.log('- Universal loader:', !!globalThis.__xecUniversalLoader);
        }
        
      } catch (error) {
        console.error('❌ Test failed:', error.message);
        if (options.verbose) {
          console.error('Stack:', error.stack);
        }
        process.exit(1);
      }
    });
}