/**
 * Basic usage examples for @xec-sh/loader
 *
 * This example demonstrates:
 * - Script execution
 * - Code evaluation
 * - Context management
 */

import * as os from 'node:os';
import * as path from 'node:path';
import * as fs from 'node:fs/promises';

import { CodeEvaluator, ScriptExecutor, ExecutionContext } from '../src/index.js';

async function main() {
  console.log('=== @xec-sh/loader Basic Usage Examples ===\n');

  // Example 1: Execute a JavaScript script
  console.log('1. Executing a simple JavaScript script:');
  const executor = new ScriptExecutor();

  // Create a temporary script
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'loader-example-'));
  const scriptPath = path.join(tmpDir, 'hello.js');
  await fs.writeFile(scriptPath, `
    console.log('Hello from script!');
    export const message = 'Script executed successfully';
  `);

  const result1 = await executor.executeScript(scriptPath);
  console.log(`   Success: ${result1.success}`);
  console.log('');

  // Example 2: Execute a TypeScript script
  console.log('2. Executing a TypeScript script:');
  const tsScriptPath = path.join(tmpDir, 'hello.ts');
  await fs.writeFile(tsScriptPath, `
    const greet = (name: string): string => {
      return \`Hello, \${name}!\`;
    };

    console.log(greet('TypeScript'));
    export { greet };
  `);

  const result2 = await executor.executeScript(tsScriptPath);
  console.log(`   Success: ${result2.success}`);
  console.log('');

  // Example 3: Evaluate inline code
  console.log('3. Evaluating inline JavaScript code:');
  const evaluator = new CodeEvaluator();
  const result3 = await evaluator.evaluateCode('export const x = 2 + 2;');
  console.log(`   Success: ${result3.success}`);
  console.log('');

  // Example 4: Evaluate code with async operations
  console.log('4. Evaluating code with async operations:');
  const code = `
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    console.log('   Waiting 100ms...');
    await wait(100);
    console.log('   Done waiting!');
    export const done = true;
  `;
  const result4 = await evaluator.evaluateCode(code);
  console.log(`   Success: ${result4.success}`);
  console.log('');

  // Example 5: Using eval for quick results
  console.log('5. Using eval for quick calculations:');
  const sum = await evaluator.eval<number>('return 10 + 20 + 30');
  console.log(`   Sum: ${sum}`);
  console.log('');

  // Example 6: Execution context with custom globals
  console.log('6. Using execution context with custom globals:');
  const context = new ExecutionContext({
    customGlobals: {
      API_KEY: 'secret-key',
      API_URL: 'https://api.example.com',
    },
  });

  const scriptWithGlobals = path.join(tmpDir, 'with-globals.js');
  await fs.writeFile(scriptWithGlobals, `
    console.log('   API_KEY:', API_KEY);
    console.log('   API_URL:', API_URL);
    export const configured = true;
  `);

  await context.execute(async () => {
    await executor.executeScript(scriptWithGlobals);
  });

  // Verify globals are cleaned up
  console.log(`   Globals cleaned up: ${typeof (globalThis as any).API_KEY === 'undefined'}`);
  console.log('');

  // Example 7: Handle execution errors gracefully
  console.log('7. Handling execution errors:');
  const errorScript = path.join(tmpDir, 'error.js');
  await fs.writeFile(errorScript, `
    throw new Error('Intentional error');
  `);

  const result7 = await executor.executeScript(errorScript);
  console.log(`   Success: ${result7.success}`);
  console.log(`   Error caught: ${result7.error?.message}`);
  console.log('');

  // Example 8: Evaluation with top-level await
  console.log('8. Using top-level await in evaluation:');
  const result8 = await evaluator.eval<string>(`
    const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    await wait(50);
    return 'Async evaluation complete';
  `);
  console.log(`   Result: ${result8}`);
  console.log('');

  // Cleanup
  await fs.rm(tmpDir, { recursive: true, force: true });

  console.log('=== All examples completed successfully! ===');
}

// Run examples
main().catch(console.error);
