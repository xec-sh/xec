/**
 * Custom runtime examples for @xec-sh/loader
 *
 * This example demonstrates:
 * - ScriptRuntime utilities
 * - GlobalInjector for custom globals
 * - Runtime context management
 */

import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import {
  ScriptRuntime,
  GlobalInjector,
  ScriptExecutor,
} from '../src/index.js';

async function main() {
  console.log('=== @xec-sh/loader Custom Runtime Examples ===\n');

  // Example 1: Using ScriptRuntime utilities
  console.log('1. ScriptRuntime utilities:');
  const runtime = new ScriptRuntime();

  // Directory operations
  const originalDir = runtime.pwd();
  console.log(`   Current directory: ${originalDir}`);

  // Environment variables
  runtime.setEnv('EXAMPLE_VAR', 'example-value');
  console.log(`   Set env EXAMPLE_VAR: ${runtime.env('EXAMPLE_VAR')}`);

  // Temporary files
  const tmpFile = runtime.tmpfile('loader-', '.txt');
  console.log(`   Temporary file: ${tmpFile}`);
  console.log('');

  // Example 2: Using retry utility
  console.log('2. Retry utility:');
  let attempts = 0;
  try {
    const result = await runtime.retry(
      async () => {
        attempts++;
        console.log(`   Attempt ${attempts}...`);
        if (attempts < 3) {
          throw new Error('Retry needed');
        }
        return 'Success!';
      },
      {
        retries: 3,
        delay: 100,
        onRetry: (error, attempt) => {
          console.log(`   Retrying (${attempt})...`);
        },
      }
    );
    console.log(`   Final result: ${result}`);
  } catch (error) {
    console.error(`   Failed: ${(error as Error).message}`);
  }
  console.log('');

  // Example 3: Using within for scoped execution
  console.log('3. Scoped execution with within:');
  const tmpDir = runtime.tmpdir();
  const testDir = path.join(tmpDir, 'test-dir');
  await fs.mkdir(testDir, { recursive: true });

  await runtime.within(
    {
      cwd: testDir,
      env: { SCOPED_VAR: 'scoped-value' },
    },
    async () => {
      console.log(`   Inside scoped execution:`);
      console.log(`   - Current dir: ${runtime.pwd()}`);
      console.log(`   - SCOPED_VAR: ${runtime.env('SCOPED_VAR')}`);
    }
  );

  console.log(`   Outside scoped execution:`);
  console.log(`   - Current dir: ${runtime.pwd()}`);
  console.log(`   - SCOPED_VAR: ${runtime.env('SCOPED_VAR')}`);
  console.log('');

  // Example 4: Quote utility for shell arguments
  console.log('4. Shell argument quoting:');
  const simpleArg = 'simple';
  const complexArg = 'has spaces and "quotes"';
  console.log(`   Simple: ${runtime.quote(simpleArg)}`);
  console.log(`   Complex: ${runtime.quote(complexArg)}`);
  console.log('');

  // Example 5: GlobalInjector for custom globals
  console.log('5. GlobalInjector for custom globals:');
  const injector = new GlobalInjector({
    globals: {
      $runtime: runtime,
      $config: {
        name: 'MyApp',
        version: '1.0.0',
      },
    },
  });

  await injector.execute(async () => {
    console.log(`   Global $runtime available: ${typeof (globalThis as any).$runtime !== 'undefined'}`);
    console.log(`   Global $config.name: ${(globalThis as any).$config.name}`);
  });

  console.log(`   Globals cleaned up: ${typeof (globalThis as any).$runtime === 'undefined'}`);
  console.log('');

  // Example 6: Dynamic global injection
  console.log('6. Dynamic global injection:');
  const dynamicInjector = new GlobalInjector();

  dynamicInjector.addGlobal('dynamicVar', 'dynamic-value');
  dynamicInjector.addGlobal('dynamicFunc', () => 'Hello from function!');

  await dynamicInjector.execute(async () => {
    console.log(`   dynamicVar: ${(globalThis as any).dynamicVar}`);
    console.log(`   dynamicFunc(): ${(globalThis as any).dynamicFunc()}`);
  });
  console.log('');

  // Example 7: Combining runtime and injector
  console.log('7. Combining runtime utilities with script execution:');
  const executor = new ScriptExecutor();

  // Create a script that uses injected utilities
  const scriptDir = path.join(tmpDir, 'scripts');
  await fs.mkdir(scriptDir, { recursive: true });
  const scriptPath = path.join(scriptDir, 'with-runtime.js');

  await fs.writeFile(scriptPath, `
    console.log('   Script using runtime utilities:');
    console.log('   - Current dir:', $runtime.pwd());
    console.log('   - Temp file:', $runtime.tmpfile('script-', '.log'));
    console.log('   - Quote test:', $runtime.quote('test value'));
    export const complete = true;
  `);

  const runtimeInjector = new GlobalInjector({
    globals: { $runtime: runtime },
  });

  await runtimeInjector.execute(async () => {
    const result = await executor.executeScript(scriptPath);
    console.log(`   Script executed: ${result.success}`);
  });
  console.log('');

  // Example 8: Template utility
  console.log('8. Template utility:');
  const name = 'World';
  const version = '1.0';
  const greeting = runtime.template`Hello, ${name}! Version: ${version}`;
  console.log(`   Template result: ${greeting}`);
  console.log('');

  // Example 9: Sleep utility
  console.log('9. Sleep utility:');
  console.log('   Sleeping for 100ms...');
  const start = Date.now();
  await runtime.sleep(100);
  const elapsed = Date.now() - start;
  console.log(`   Slept for ${elapsed}ms`);
  console.log('');

  // Example 10: Reset environment
  console.log('10. Environment reset:');
  runtime.setEnv('TEMP_VAR', 'temporary');
  console.log(`   Before reset - TEMP_VAR: ${runtime.env('TEMP_VAR')}`);
  runtime.resetEnv();
  console.log(`   After reset - TEMP_VAR: ${runtime.env('TEMP_VAR')}`);
  console.log('');

  // Cleanup
  await fs.rm(scriptDir, { recursive: true, force: true });

  console.log('=== All custom runtime examples completed! ===');
}

// Run examples
main().catch(console.error);
